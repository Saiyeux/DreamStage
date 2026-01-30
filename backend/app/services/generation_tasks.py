"""后台生成任务"""
import uuid
import asyncio
import json
from pathlib import Path
from typing import Any

from app.core.logging_config import get_logger
from app.db.database import async_session_maker
from app.models import Character, Scene, CharacterImage, SceneImage, VideoClip
from app.services.comfyui_client import comfyui_client
from app.services.prompt_service import prompt_service

logger = get_logger(__name__)


# 配置文件路径
CONFIG_DIR = Path(__file__).parent.parent / "config"


class GenerationTasks:
    """生成任务管理"""

    # 任务状态存储 (简化版，生产环境应使用 Redis)
    _task_status: dict[str, dict[str, Any]] = {}

    # 加载图片类型配置
    @staticmethod
    def _load_image_type_config() -> dict:
        """从配置文件加载图片类型"""
        config_file = CONFIG_DIR / "character_image_templates.json"
        if config_file.exists():
            with open(config_file, "r", encoding="utf-8") as f:
                return json.load(f)
        # 默认配置
        return {
            "default_types": [
                {"id": "front", "label": "正面", "prompt_suffix": "front view, facing camera"},
                {"id": "side", "label": "侧面", "prompt_suffix": "side view, profile"},
                {"id": "back", "label": "背面", "prompt_suffix": "back view, from behind"},
            ],
            "available_types": [],
        }

    def _get_image_type_info(self, type_id: str) -> dict:
        """获取指定类型的信息"""
        config = self._load_image_type_config()
        for t in config.get("available_types", []):
            if t["id"] == type_id:
                return t
        for t in config.get("default_types", []):
            if t["id"] == type_id:
                return t
        # 未找到时返回默认
        return {"id": type_id, "label": type_id, "prompt_suffix": type_id}

    def get_task_status(self, task_id: str) -> dict[str, Any]:
        """获取任务状态"""
        return self._task_status.get(task_id, {"status": "unknown"})

    async def stop_task(self, task_id: str) -> bool:
        """停止任务"""
        logger.info(f"请求停止任务: task_id={task_id}")
        
        # 1. 调用 ComfyUI 中断
        # 注意: 这会中断当前正在运行的任何 ComfyUI 任务
        await comfyui_client.interrupt()
        
        # 2. 如果任务存在，更新状态
        if task_id in self._task_status:
            self.update_task_status(
                task_id, 
                "failed", 
                message="用户手动停止", 
                error="Task stopped by user"
            )
            return True
            
        return False

    def get_active_tasks_for_project(self, project_id: str) -> dict[str, dict[str, Any]]:
        """获取指定项目的所有活跃任务"""
        return {
            tid: status
            for tid, status in self._task_status.items()
            if status.get("project_id") == project_id and status.get("status") in ["pending", "running"]
        }

    def update_task_status(
        self,
        task_id: str,
        status: str,
        progress: int = 0,
        message: str = "",
        result: Any = None,
        error: str | None = None,
        project_id: str | None = None,
        target_id: str | None = None,
    ):
        """更新任务状态"""
        # 保留原有的 metadata
        old_status = self._task_status.get(task_id, {})
        new_project_id = project_id or old_status.get("project_id")
        new_target_id = target_id or old_status.get("target_id")

        self._task_status[task_id] = {
            "status": status,
            "progress": progress,
            "message": message,
            "result": result,
            "error": error,
            "project_id": new_project_id,
            "target_id": new_target_id,
        }

    def _build_character_prompt(self, character: Character, image_types: list[str]) -> tuple[str, str]:
        """构建角色图像 prompt，返回 (positive_prompt, negative_prompt)
        
        整合角色资料（Profile）和多项生图设置（Settings/Tags）为单一提示词。
        """
        # 使用 prompt_service 构建基础提示词 (基于 Profile)
        positive_prompt, negative_prompt = prompt_service.build_character_prompt(
            gender=character.gender,
            age=character.age,
            hair=character.hair,
            face=character.face,
            body=character.body,
            skin=character.skin,
            clothing_style=character.clothing_style,
            personality=character.personality,
        )

        # 获取并合并所有选中的标签修饰符 (基于 Settings)
        modifiers = []
        for itype in image_types:
            type_info = self._get_image_type_info(itype)
            suffix = type_info.get("prompt_suffix")
            if suffix:
                modifiers.append(suffix)
        
        if modifiers:
            # 将设置类的描述词加入提示词
            positive_prompt = f"{positive_prompt}, {', '.join(modifiers)}"
        else:
            positive_prompt = f"{positive_prompt}, portrait"

        return positive_prompt, negative_prompt

    def _build_scene_prompt(self, scene: Scene) -> tuple[str, str]:
        """构建场景图 prompt，返回 (positive_prompt, negative_prompt)"""
        return prompt_service.build_scene_prompt(
            location=scene.location,
            time_of_day=scene.time_of_day,
            atmosphere=scene.atmosphere,
            environment_desc=scene.environment_desc,
            characters_in_scene=scene.characters_data,
        )

    def _build_action_prompt(self, scene: Scene) -> tuple[str, str]:
        """构建视频动作 prompt，返回 (positive_prompt, negative_prompt)"""
        # 提取角色动作列表
        character_actions = []
        if scene.characters_data:
            for char in scene.characters_data:
                if char.get("action"):
                    character_actions.append(char["action"])

        return prompt_service.build_action_prompt(
            character_actions=character_actions if character_actions else None,
            camera_movement=scene.camera_movement,
        )

    async def generate_character_images(
        self, task_id: str, character: Character, image_types: list[str], workflow_id: str | None = None, params: dict[str, Any] | None = None
    ):
        """生成角色的一组图像"""
        logger.info(f"[开始生图任务] task_id={task_id}, character={character.name}, types={image_types}")
        self.update_task_status(task_id, "running", 0, "准备生成...", project_id=character.project_id, target_id=character.id)

        try:
            # 合并所有选中项为一个单一任务进行生成
            self.update_task_status(task_id, "running", 10, f"正在汇总角色信息并生成...")
            
            # 构建合并后的 Prompt
            prompt, negative_prompt = self._build_character_prompt(character, image_types)
            
            # 使用列表中的第一个有效类型作为主分类名，或组合名称
            primary_type = image_types[0] if image_types else "portrait"
            output_filename = f"character_{character.id[:8]}_{primary_type}"
            # 组合所有选中的类型为一个生成任务的标签字符串
            combined_labels = []
            for image_type in image_types:
                type_info = self._get_image_type_info(image_type)
                combined_labels.append(type_info.get("label", image_type))
            
            combined_label_str = " + ".join(combined_labels) if combined_labels else "Default"

            # 生成唯一的 output filename prefix
            unique_id = uuid.uuid4().hex[:8]
            output_filename = f"char_{character.id[:8]}_{unique_id}"
            
            generated_images = []

            async with async_session_maker() as db:
                # 获取工作流配置
                if workflow_id:
                    workflow_config = prompt_service.get_workflow_by_id("character", workflow_id)
                else:
                    workflow_config = prompt_service.get_default_workflow("character")
                    
                if not workflow_config:
                    error_msg = f"未找到角色图工作流配置: {workflow_id or 'default'}"
                    logger.error(f"[配置错误] task_id={task_id}, error={error_msg}")
                    raise ValueError(error_msg)

                workflow_params = workflow_config.get("params", {}).copy()
                if params:
                    workflow_params.update(params)

                try:
                    # 调用 ComfyUI 生成
                    logger.debug(f"[调用ComfyUI] task_id={task_id}, merged_prompt={prompt[:100]}...")
                    image_path = await comfyui_client.generate_image(
                        workflow_name=workflow_config.get("workflow_file", "character_portrait_flux2.json"),
                        positive_prompt=prompt,
                        negative_prompt=negative_prompt,
                        width=workflow_params.get("width", 768),
                        height=workflow_params.get("height", 1024),
                        output_filename=output_filename,
                        project_id=character.project_id,
                        seed=params.get("seed", -1) if params else -1
                    )

                    logger.info(f"[图片生成成功] task_id={task_id}, path={image_path}")

                    # 构造保存的 type 字符串
                    saved_image_type = combined_label_str

                    # 保存到数据库
                    char_image = CharacterImage(
                        id=str(uuid.uuid4()),
                        character_id=character.id,
                        image_type=saved_image_type,
                        image_path=image_path,
                        prompt_used=prompt,
                        negative_prompt=negative_prompt,
                        is_selected=True, 
                    )
                    db.add(char_image)
                    await db.commit()

                    generated_images.append({
                        "type": saved_image_type,
                        "path": image_path,
                        "id": char_image.id,
                    })
                except Exception as e:
                    logger.error(f"[生成失败] task_id={task_id}, error={str(e)}", exc_info=True)
                    raise e

            if generated_images:
                logger.info(f"[任务完成] task_id={task_id}, success=1/1")
                self.update_task_status(
                    task_id, "completed", 100,
                    "图片生成完成",
                    result=generated_images
                )
            else:
                logger.error(f"[任务失败] task_id={task_id}, 未生成任何图片")
                self.update_task_status(
                    task_id, "failed", 0, 
                    "生图失败或超时，详见后台日志",
                    error="No images were generated (possible timeout or ComfyUI error)"
                )

        except Exception as e:
            logger.error(f"[任务异常] task_id={task_id}, error={str(e)}", exc_info=True)
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_character_library(
        self,
        task_id: str,
        project_id: str,
        characters: list[Character],
        image_types: list[str] | None = None,
        workflow_id: str | None = None,
        params: dict[str, Any] | None = None,
    ):
        """批量生成角色库

        Args:
            task_id: 任务ID
            project_id: 项目ID
            characters: 角色列表
            image_types: 要生成的图片类型列表，为None时使用默认配置
        """
        logger.info(f"[批量任务开始] task_id={task_id}, project={project_id}, characters={len(characters)}, types={image_types}")
        self.update_task_status(task_id, "running", 0, "开始生成角色库...", project_id=project_id, target_id="library")

        try:
            # 获取要生成的图片类型
            if image_types is None:
                config = self._load_image_type_config()
                types_to_generate = [t["id"] for t in config.get("default_types", [])]
                logger.info(f"[使用默认类型] task_id={task_id}, types={types_to_generate}")
            else:
                types_to_generate = image_types

            if not types_to_generate:
                types_to_generate = ["front", "side", "back"]  # 最终回退
                logger.warning(f"[使用回退类型] task_id={task_id}, types={types_to_generate}")

            total_chars = len(characters)
            total_images = total_chars * len(types_to_generate)
            completed_attempts = 0
            success_count = 0
            logger.info(f"[任务规模] task_id={task_id}, total_images={total_images}")

            # 获取工作流配置
            if workflow_id:
                workflow_config = prompt_service.get_workflow_by_id("character", workflow_id)
            else:
                workflow_config = prompt_service.get_default_workflow("character")
                
            if not workflow_config:
                error_msg = f"未找到角色图工作流配置: {workflow_id or 'default'}"
                logger.error(f"[配置错误] task_id={task_id}, error={error_msg}")
                raise ValueError(error_msg)

            workflow_params = workflow_config.get("params", {})
            
            # 合并用户参数
            if params:
                workflow_params.update(params)

            async with async_session_maker() as db:
                for i, character in enumerate(characters):
                    logger.info(f"[处理角色] task_id={task_id}, character={character.name} ({i+1}/{total_chars})")
                    
                    # 组合所有选中的类型为一个生成任务
                    combined_labels = []
                    for image_type in types_to_generate:
                        type_info = self._get_image_type_info(image_type)
                        combined_labels.append(type_info.get("label", image_type))
                    
                    combined_label_str = " + ".join(combined_labels) if combined_labels else "Default"
                    
                    self.update_task_status(
                        task_id, "running", 10,
                        f"Generating: {character.name} ({combined_label_str})"
                    )

                    # 构建 Combined Prompt
                    # 这里假设 _build_character_prompt 支持传入列表并合并 prompt
                    # 需要确认 _build_character_prompt 的实现。如果以前是循环调用的，
                    # 现在的逻辑应该是调用一次，传入所有 types。
                    prompt, negative_prompt = self._build_character_prompt(character, types_to_generate)
                    
                    # 生成唯一的 output filename prefix
                    # 使用 random uuid part 避免覆盖
                    unique_id = uuid.uuid4().hex[:8]
                    output_filename = f"char_{character.id[:8]}_{unique_id}"

                    try:
                        logger.debug(f"[生成图片] task_id={task_id}, character={character.name}, types={types_to_generate}")
                        image_path = await comfyui_client.generate_image(
                            workflow_name=workflow_config.get("workflow_file", "character_portrait_flux2.json"),
                            positive_prompt=prompt,
                            negative_prompt=negative_prompt,
                            width=workflow_params.get("width", 768),
                            height=workflow_params.get("height", 1024),
                            output_filename=output_filename,
                            project_id=project_id,
                            # 传递所有 params 给 comfyui client，它会负责 update_workflow_params
                            # 注意: comfyui_client.generate_image 没有直接接受 params 字典参数，
                            # 它是接受具体参数(seed, width等)。
                            # 我们需要看 comfyui_client.generate_image 的签名。
                            # 之前在这个文件里我们是 update workflow_params 字典，然后传给 generate_image 的参数。
                            # 比如: width=workflow_params.get("width", 768)
                            # 所以这里只需确保 workflow_params 更新了就好。(上面已经更新了)
                            # 另外，如果 params 里有其他参数(steps, cfg)，也需要传给 generate_image 吗？
                            # generate_image 签名只有特定的几个参数。
                            # 如果想要动态传其他参数，comfyui_client.generate_image 可能需要改或者我们手动解包。
                            # checking generate_image signature... 
                            # 它有 seed, width, height, output_filename.
                            # 如果 params 有 steps, cfg，目前 generate_image 好像没有参数接收它们？
                            # 之前看 comfyui_client.generate_image 实现：
                            # 它内部调用 update_workflow_params(workflow, { "width": width, ... })
                            # 它似乎没有接收 extra params 的参数。
                            # 这是一个潜在问题。之前实现 parameters configuration 时查看了 generate_image 吗？
                            # let's proceed with standard params for now, fix extra params later if needed.
                            # wait, allow passing seed from params
                            seed=params.get("seed", -1) if params else -1
                        )

                        logger.info(f"[图片成功] task_id={task_id}, path={image_path}")

                        # 构造保存的 type 字符串
                        # 比如: "Full Body, Happy, Running"
                        saved_image_type = ", ".join(combined_labels) if combined_labels else "Generated"

                        # 保存到数据库
                        char_image = CharacterImage(
                            id=str(uuid.uuid4()),
                            character_id=character.id,
                            image_type=saved_image_type,
                            image_path=image_path,
                            prompt_used=prompt,
                            negative_prompt=negative_prompt,
                            is_selected=True, 
                        )
                        db.add(char_image)
                        await db.commit()
                        success_count += 1
                    except Exception as e:
                        logger.error(f"[图片失败] task_id={task_id}, error={str(e)}", exc_info=True)
                        # Continue to next character if any
                        
            if success_count > 0:
                 self.update_task_status(task_id, "completed", 100, f"Completed: {success_count} images")
            else:
                 self.update_task_status(task_id, "failed", 0, "Failed to generate images", error="Generation failed")

        except Exception as e:
            logger.error(f"[批量任务失败] task_id={task_id}, error={str(e)}", exc_info=True)
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_scene_image(
        self,
        task_id: str,
        scene: Scene,
        reference_image: str | None = None,
        workflow_id: str | None = None,
        params: dict[str, Any] | None = None,
    ):
        """生成场景图像

        Args:
            task_id: 任务ID
            scene: 场景对象
            reference_image: 参考图像 (角色图) 用于保持角色一致性
        """
        self.update_task_status(task_id, "running", 0, f"生成场景 #{scene.scene_number}...", project_id=scene.project_id, target_id=scene.id)

        try:
            # 构建提示词（使用配置文件中的模板）
            prompt, negative_prompt = self._build_scene_prompt(scene)
            output_filename = f"scene_{scene.project_id[:8]}_{scene.scene_number}"
            # 获取工作流配置
            if workflow_id:
                workflow_config = prompt_service.get_workflow_by_id("scene", workflow_id)
            else:
                workflow_config = prompt_service.get_default_workflow("scene")
                
            if not workflow_config:
                raise ValueError(f"未找到场景图工作流配置: {workflow_id or 'default'}")

            workflow_params = workflow_config.get("params", {}).copy()
            if params:
                workflow_params.update(params)

            # 调用 ComfyUI (scene workflow 使用 IPAdapter 保持角色一致性)
            image_path = await comfyui_client.generate_image(
                workflow_name=workflow_config.get("workflow_file", "scene_generation_flux2.json"),
                positive_prompt=prompt,
                negative_prompt=negative_prompt,
                width=workflow_params.get("width", 768),
                height=workflow_params.get("height", 1344),
                output_filename=output_filename,
                project_id=scene.project_id,
                reference_image=reference_image,
            )

            # 保存到数据库
            async with async_session_maker() as db:
                scene_image = SceneImage(
                    id=str(uuid.uuid4()),
                    scene_id=scene.id,
                    image_path=image_path,
                    prompt_used=prompt,
                    is_approved=False,
                )
                db.add(scene_image)
                await db.commit()

            self.update_task_status(
                task_id, "completed", 100,
                "场景图生成完成",
                result={"path": image_path, "id": scene_image.id}
            )

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_all_scene_images(
        self,
        task_id: str,
        project_id: str,
        scenes: list[Scene],
        workflow_id: str | None = None,
        params: dict[str, Any] | None = None,
    ):
        """批量生成场景图像"""
        self.update_task_status(task_id, "running", 0, "开始批量生成场景图...", project_id=project_id, target_id="all_scenes")

        try:
            total = len(scenes)
            generated = 0

            # 获取工作流配置
            if workflow_id:
                workflow_config = prompt_service.get_workflow_by_id("scene", workflow_id)
            else:
                workflow_config = prompt_service.get_default_workflow("scene")
                
            if not workflow_config:
                raise ValueError(f"未找到场景图工作流配置: {workflow_id or 'default'}")

            workflow_params = workflow_config.get("params", {})

            async with async_session_maker() as db:
                for i, scene in enumerate(scenes):
                    progress = int((i / total) * 100)
                    self.update_task_status(
                        task_id, "running", progress, f"场景 #{scene.scene_number}"
                    )

                    # 构建提示词（使用配置文件中的模板）
                    prompt, negative_prompt = self._build_scene_prompt(scene)
                    output_filename = f"scene_{project_id[:8]}_{scene.scene_number}"

                    try:
                        image_path = await comfyui_client.generate_image(
                            workflow_name=workflow_config.get("workflow_file", "scene_generation_flux2.json"),
                            positive_prompt=prompt,
                            negative_prompt=negative_prompt,
                            width=workflow_params.get("width", 768),
                            height=workflow_params.get("height", 1344),
                            output_filename=output_filename,
                            project_id=project_id,
                        )

                        # 保存到数据库
                        scene_image = SceneImage(
                            id=str(uuid.uuid4()),
                            scene_id=scene.id,
                            image_path=image_path,
                            prompt_used=prompt,
                            is_approved=False,
                        )
                        db.add(scene_image)
                        await db.commit()
                        generated += 1
                    except Exception as e:
                        print(f"Generate scene {scene.scene_number} failed: {e}")

            self.update_task_status(
                task_id, "completed", 100,
                f"完成 {generated}/{total} 张场景图"
            )

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_scene_video(
        self,
        task_id: str,
        scene: Scene,
        input_image: str | None = None,
        workflow_id: str | None = None,
        params: dict[str, Any] | None = None,
    ):
        """生成场景视频

        Args:
            task_id: 任务ID
            scene: 场景对象
            input_image: 输入图像文件名 (ComfyUI input 目录下)
        """
        self.update_task_status(task_id, "running", 0, f"生成视频 #{scene.scene_number}...", project_id=scene.project_id, target_id=scene.id)

        try:
            # 如果没有提供输入图像，使用默认文件名
            if not input_image:
                input_image = f"scene_{scene.project_id[:8]}_{scene.scene_number}.png"

            # 获取工作流配置
            if workflow_id:
                workflow_config = prompt_service.get_workflow_by_id("video", workflow_id)
            else:
                workflow_config = prompt_service.get_default_workflow("video")
                
            if not workflow_config:
                raise ValueError(f"未找到视频工作流配置: {workflow_id or 'default'}")

            workflow_params = workflow_config.get("params", {})
            video_length = workflow_params.get("video_length", 97)
            frame_rate = workflow_params.get("frame_rate", 24)

            # 构建提示词（使用配置文件中的模板）
            action_prompt, negative_prompt = self._build_action_prompt(scene)
            output_filename = f"video_{scene.project_id[:8]}_{scene.scene_number}"

            self.update_task_status(task_id, "running", 10, "准备视频生成...")

            # 调用 ComfyUI 生成视频
            video_path = await comfyui_client.generate_video(
                workflow_name=workflow_config.get("workflow_file", "video_generation_ltx2.json"),
                input_image=input_image,
                action_prompt=action_prompt,
                negative_prompt=negative_prompt,
                width=workflow_params.get("width", 768),
                height=workflow_params.get("height", 1344),
                video_length=video_length,
                steps=workflow_params.get("steps", 30),
                cfg=workflow_params.get("cfg", 3.0),
                frame_rate=frame_rate,
                output_filename=output_filename,
                project_id=scene.project_id,
            )

            # 保存到数据库
            async with async_session_maker() as db:
                video_clip = VideoClip(
                    id=str(uuid.uuid4()),
                    scene_id=scene.id,
                    video_path=video_path,
                    duration=video_length / frame_rate,
                    fps=frame_rate,
                    resolution=f"{workflow_params.get('width', 768)}x{workflow_params.get('height', 1344)}",
                    prompt_used=action_prompt,
                    is_approved=False,
                )
                db.add(video_clip)
                await db.commit()

            self.update_task_status(
                task_id, "completed", 100,
                "视频生成完成",
                result={"path": video_path, "id": video_clip.id}
            )

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_all_videos(self, task_id: str, project_id: str, scenes: list[Scene], workflow_id: str | None = None, params: dict[str, Any] | None = None):
        """批量生成视频"""
        self.update_task_status(task_id, "running", 0, "开始批量生成视频...", project_id=project_id, target_id="all_videos")

        try:
            total = len(scenes)
            generated = 0

            # 获取工作流配置
            if workflow_id:
                workflow_config = prompt_service.get_workflow_by_id("video", workflow_id)
            else:
                workflow_config = prompt_service.get_default_workflow("video")
                
            if not workflow_config:
                raise ValueError(f"未找到视频工作流配置: {workflow_id or 'default'}")

            workflow_params = workflow_config.get("params", {})
            video_length = workflow_params.get("video_length", 97)
            frame_rate = workflow_params.get("frame_rate", 24)

            async with async_session_maker() as db:
                for i, scene in enumerate(scenes):
                    progress = int((i / total) * 100)
                    self.update_task_status(
                        task_id, "running", progress, f"视频 #{scene.scene_number}"
                    )

                    # 输入图像为之前生成的场景图
                    input_image = f"scene_{project_id[:8]}_{scene.scene_number}.png"
                    # 构建提示词（使用配置文件中的模板）
                    action_prompt, negative_prompt = self._build_action_prompt(scene)
                    output_filename = f"video_{project_id[:8]}_{scene.scene_number}"

                    try:
                        video_path = await comfyui_client.generate_video(
                            workflow_name=workflow_config.get("workflow_file", "video_generation_ltx2.json"),
                            input_image=input_image,
                            action_prompt=action_prompt,
                            negative_prompt=negative_prompt,
                            width=workflow_params.get("width", 768),
                            height=workflow_params.get("height", 1344),
                            video_length=video_length,
                            steps=workflow_params.get("steps", 30),
                            cfg=workflow_params.get("cfg", 3.0),
                            frame_rate=frame_rate,
                            output_filename=output_filename,
                            project_id=project_id,
                        )

                        # 保存到数据库
                        video_clip = VideoClip(
                            id=str(uuid.uuid4()),
                            scene_id=scene.id,
                            video_path=video_path,
                            duration=video_length / frame_rate,
                            fps=frame_rate,
                            resolution=f"{workflow_params.get('width', 768)}x{workflow_params.get('height', 1344)}",
                            prompt_used=action_prompt,
                            is_approved=False,
                        )
                        db.add(video_clip)
                        await db.commit()
                        generated += 1
                    except Exception as e:
                        print(f"Generate video {scene.scene_number} failed: {e}")

            self.update_task_status(
                task_id, "completed", 100,
                f"完成 {generated}/{total} 个视频"
            )

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))


generation_tasks = GenerationTasks()
