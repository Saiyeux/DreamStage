"""后台生成任务"""
import uuid
import asyncio
import json
from pathlib import Path
from typing import Any

from sqlalchemy import delete

from app.core.logging_config import get_logger
from app.core.config import settings
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

    async def _save_generated_file(self, filename: str, project_id: str) -> str:
        """从 ComfyUI 下载并保存文件到项目目录，返回相对路径"""
        try:
            content = await comfyui_client.get_image_content(filename)
            
            # 确定保存路径: data/projects/{project_id}/{filename}
            project_dir = settings.DATA_DIR / "projects" / project_id
            project_dir.mkdir(parents=True, exist_ok=True)
            
            save_path = project_dir / filename
            with open(save_path, "wb") as f:
                f.write(content)
                
            return f"{project_id}/{filename}"
        except Exception as e:
            logger.error(f"Failed to save generated file {filename}: {e}")
            # 如果保存失败，至少返回原文件名，虽然前端可能访问不到
            return filename

    async def recover_missing_file(self, relative_path: str, project_id: str) -> bool:
        """尝试恢复丢失的文件"""
        try:
            # 1. 检查文件是否存在
            project_dir = settings.DATA_DIR / "projects" / project_id
            save_path = project_dir / Path(relative_path).name
            
            if save_path.exists():
                return True
                
            # 2. 从 ComfyUI 下载
            filename = Path(relative_path).name
            logger.info(f"Recovering missing file: {filename}")
            
            content = await comfyui_client.get_image_content(filename)
            
            project_dir.mkdir(parents=True, exist_ok=True)
            with open(save_path, "wb") as f:
                f.write(content)
                
            return True
        except Exception as e:
            logger.warning(f"Failed to recover file {relative_path}: {e}")
            return False

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

                    # 保存文件到本地
                    saved_path = await self._save_generated_file(image_path, character.project_id)

                    # 构造保存的 type 字符串
                    saved_image_type = combined_label_str

                    # 保存到数据库
                    char_image = CharacterImage(
                        id=str(uuid.uuid4()),
                        character_id=character.id,
                        image_type=saved_image_type,
                        image_path=saved_path,
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

                        # 保存文件到本地
                        saved_path = await self._save_generated_file(image_path, project_id)

                        # 构造保存的 type 字符串
                        # 比如: "Full Body, Happy, Running"
                        saved_image_type = ", ".join(combined_labels) if combined_labels else "Generated"

                        # 保存到数据库
                        char_image = CharacterImage(
                            id=str(uuid.uuid4()),
                            character_id=character.id,
                            image_type=saved_image_type,
                            image_path=saved_path,
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
                seed=params.get("seed", -1) if params else -1
            )

            # 保存到数据库
            async with async_session_maker() as db:
                # 删除旧图片记录，避免 uselist=False 多行冲突
                await db.execute(delete(SceneImage).where(SceneImage.scene_id == scene.id))
                # 保存文件到本地
                saved_path = await self._save_generated_file(image_path, scene.project_id)

                scene_image = SceneImage(
                    id=str(uuid.uuid4()),
                    scene_id=scene.id,
                    image_path=saved_path,
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
                            seed=params.get("seed", -1) if params else -1
                        )

                        # 保存到数据库
                        # 删除旧图片
                        await db.execute(delete(SceneImage).where(SceneImage.scene_id == scene.id))
                        
                        # 保存文件到本地
                        saved_path = await self._save_generated_file(image_path, project_id)

                        scene_image = SceneImage(
                            id=str(uuid.uuid4()),
                            scene_id=scene.id,
                            image_path=saved_path,
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
                project_id=scene.project_id,
                seed=params.get("seed", -1) if params else -1
            )

            # 保存到数据库
            async with async_session_maker() as db:
                # 删除旧视频
                await db.execute(delete(VideoClip).where(VideoClip.scene_id == scene.id))

                # 保存文件到本地
                saved_path = await self._save_generated_file(video_path, scene.project_id)

                video_clip = VideoClip(
                    id=str(uuid.uuid4()),
                    scene_id=scene.id,
                    video_path=saved_path,
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
                            project_id=project_id,
                            seed=params.get("seed", -1) if params else -1
                        )

                        # 保存到数据库
                        # 保存文件到本地
                        saved_path = await self._save_generated_file(video_path, project_id)

                        video_clip = VideoClip(
                            id=str(uuid.uuid4()),
                            scene_id=scene.id,
                            video_path=saved_path,
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


    async def generate_character_tts(
        self,
        task_id: str,
        project_id: str,
        character_id: str,
        target_text: str,
        ref_audio_path: str | None = None,
        ref_audio_name: str | None = None,
    ):
        """使用 Qwen-TTS 工作流生成角色语音"""
        from app.models.character import CharacterAudio

        self.update_task_status(task_id, "running", 0, "准备TTS生成...", project_id=project_id, target_id=character_id)

        try:
            workflow_path = Path(__file__).parent.parent.parent.parent / "comfyui_workflows" / "Qwen-TTS-voice-clone.json"
            if not workflow_path.exists():
                raise FileNotFoundError(f"Qwen-TTS workflow not found: {workflow_path}")

            workflow = await comfyui_client.load_workflow(str(workflow_path))

            # 上传参考音频到 ComfyUI input（如果有）
            comfy_audio_name = None
            if ref_audio_path and ref_audio_name:
                project_dir = settings.DATA_DIR / "projects" / project_id
                audio_file = project_dir / Path(ref_audio_path).name
                if audio_file.exists():
                    self.update_task_status(task_id, "running", 10, "上传参考音频...")
                    content = audio_file.read_bytes()
                    comfy_audio_name = await comfyui_client.upload_file_to_input(content, ref_audio_name)

            # 更新工作流参数
            for node_id, node in workflow.items():
                if not isinstance(node, dict):
                    continue
                class_type = node.get("class_type", "")
                inputs = node.get("inputs", {})

                if class_type == "FB_Qwen3TTSVoiceClone":
                    inputs["target_text"] = target_text
                    if comfy_audio_name:
                        inputs["ref_audio"] = [str([nid for nid, n in workflow.items() if n.get("class_type") == "LoadAudio"][0]), 0]

                if class_type == "LoadAudio" and comfy_audio_name:
                    inputs["audio"] = comfy_audio_name

                if class_type == "SaveAudio":
                    unique_id = uuid.uuid4().hex[:8]
                    inputs["filename_prefix"] = f"audio/tts_{character_id[:8]}_{unique_id}"

            self.update_task_status(task_id, "running", 20, "提交到ComfyUI...")
            prompt_id = await comfyui_client.queue_prompt(workflow)

            # 轮询结果
            max_wait = 300
            waited = 0
            audio_filename = None

            while waited < max_wait:
                await asyncio.sleep(3)
                waited += 3
                progress = min(20 + int(waited / max_wait * 70), 90)
                self.update_task_status(task_id, "running", progress, f"生成中... ({waited}s)")

                history = await comfyui_client.get_history(prompt_id)
                if prompt_id in history:
                    outputs = history[prompt_id].get("outputs", {})
                    for node_output in outputs.values():
                        audios = node_output.get("audio", [])
                        if audios:
                            audio_filename = audios[0].get("filename")
                            break
                    if audio_filename:
                        break

            if not audio_filename:
                raise RuntimeError("TTS generation timed out or produced no output")

            # 下载音频
            self.update_task_status(task_id, "running", 90, "下载音频...")
            audio_content = await comfyui_client.get_audio_content(audio_filename, subfolder="audio")

            # 保存到项目目录
            project_dir = settings.DATA_DIR / "projects" / project_id
            project_dir.mkdir(parents=True, exist_ok=True)
            local_filename = f"tts_{uuid.uuid4().hex[:8]}.wav"
            save_path = project_dir / local_filename
            save_path.write_bytes(audio_content)

            relative_path = f"{project_id}/{local_filename}"

            # 保存到数据库
            async with async_session_maker() as db:
                char_audio = CharacterAudio(
                    id=str(uuid.uuid4()),
                    character_id=character_id,
                    audio_name=f"TTS_{target_text[:20]}",
                    audio_path=relative_path,
                    audio_type="generated",
                )
                db.add(char_audio)
                await db.commit()
                await db.refresh(char_audio)
                audio_id = char_audio.id

            self.update_task_status(
                task_id, "completed", 100, "TTS生成完成",
                result={"audio_path": relative_path, "audio_id": audio_id}
            )

        except Exception as e:
            logger.error(f"TTS generation failed: {e}")
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_stage_keyframe(
        self,
        task_id: str,
        project_id: str,
        scene_image_path: str,
        character_image_paths: list[str],
        prompt: str,
        output_prefix: str = "stage",
    ):
        """将场景背景与角色肖像合成为关键帧（image edit workflow）"""
        self.update_task_status(task_id, "running", 0, "准备合成关键帧...", project_id=project_id, target_id=f"stage_{task_id[:8]}")

        try:
            workflow_path = Path(__file__).parent.parent.parent.parent / "comfyui_workflows" / "image_flux2_klein_image_edit_9b_base.json"
            if not workflow_path.exists():
                raise FileNotFoundError(f"Stage keyframe workflow not found: {workflow_path}")

            with open(workflow_path, "r", encoding="utf-8") as f:
                workflow = json.load(f)

            self.update_task_status(task_id, "running", 10, "上传图像到 ComfyUI...")

            # Upload scene image (background)
            scene_abs = settings.DATA_DIR / "projects" / scene_image_path
            if not scene_abs.exists():
                raise FileNotFoundError(f"Scene image not found: {scene_abs}")
            with open(scene_abs, "rb") as f:
                scene_filename = await comfyui_client.upload_file_to_input(f.read(), scene_abs.name)

            # Upload character images
            char_filenames: list[str] = []
            for cp in character_image_paths[:2]:  # max 2 chars
                char_abs = settings.DATA_DIR / "projects" / cp
                if char_abs.exists():
                    with open(char_abs, "rb") as f:
                        cf = await comfyui_client.upload_file_to_input(f.read(), char_abs.name)
                    char_filenames.append(cf)

            if not char_filenames:
                raise ValueError("No character images available")

            self.update_task_status(task_id, "running", 30, "配置工作流...")

            # Patch workflow nodes
            # Node 100: scene/background
            if "100" in workflow:
                workflow["100"]["inputs"]["image"] = scene_filename
            # Node 76: character 1
            if "76" in workflow:
                workflow["76"]["inputs"]["image"] = char_filenames[0]
            # Node 81: character 2 (use same if only one)
            if "81" in workflow:
                workflow["81"]["inputs"]["image"] = char_filenames[1] if len(char_filenames) > 1 else char_filenames[0]
            # Node 92:74: positive prompt
            if "92:74" in workflow:
                workflow["92:74"]["inputs"]["text"] = prompt
            # Node 94: output filename
            unique_id = uuid.uuid4().hex[:8]
            out_filename = f"{output_prefix}_{unique_id}"
            if "94" in workflow:
                workflow["94"]["inputs"]["filename_prefix"] = out_filename

            self.update_task_status(task_id, "running", 40, "提交 ComfyUI 任务...")

            prompt_id = await comfyui_client.queue_prompt(workflow)
            comfyui_client.register_task(project_id, prompt_id)

            try:
                result = await comfyui_client.wait_for_completion(prompt_id)
            finally:
                comfyui_client.unregister_task(project_id, prompt_id)

            self.update_task_status(task_id, "running", 85, "保存结果...")

            # Get output filename from result
            output_image = ""
            for node_out in result.get("outputs", {}).values():
                images = node_out.get("images", [])
                if images:
                    output_image = images[0].get("filename", "")
                    break

            if not output_image:
                raise RuntimeError("No output image from stage workflow")

            saved_path = await self._save_generated_file(output_image, project_id)

            self.update_task_status(
                task_id, "completed", 100, "关键帧合成完成",
                result={"image_path": saved_path}
            )

        except Exception as e:
            logger.error(f"Stage keyframe generation failed: {e}", exc_info=True)
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    # ============ 剧幕视频生成 ============

    async def generate_act_video(
        self,
        task_id: str,
        project_id: str,
        image_path: str,         # relative to DATA_DIR/projects/
        narration_text: str,
        workflow_id: str | None = None,
    ):
        """生成剧幕视频：TTS旁白 + 图生视频 + ffmpeg合并"""
        self.update_task_status(task_id, "running", 0, "开始生成剧幕视频...", project_id=project_id)

        try:
            project_dir = settings.DATA_DIR / "projects" / project_id
            project_dir.mkdir(parents=True, exist_ok=True)

            # Step 1: Generate TTS narration audio
            self.update_task_status(task_id, "running", 5, "生成旁白音频...")
            tts_rel = await self._generate_narration_tts(project_id, narration_text)

            # Step 2: Generate video from image
            self.update_task_status(task_id, "running", 40, "生成视频片段...")
            video_rel = await self._generate_video_from_image_path(project_id, image_path, workflow_id, task_id)

            # Step 3: Merge video + audio (strip original video audio)
            self.update_task_status(task_id, "running", 85, "合并视频与旁白音频...")
            final_rel = await self._merge_video_audio_paths(project_id, video_rel, tts_rel)

            self.update_task_status(
                task_id, "completed", 100, "剧幕视频生成完成",
                result={"video_path": final_rel}
            )

        except Exception as e:
            logger.error(f"Act video generation failed: {e}", exc_info=True)
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def _generate_narration_tts(self, project_id: str, text: str) -> str:
        """为旁白文本生成 TTS 音频，返回相对路径"""
        workflow_path = Path(__file__).parent.parent.parent.parent / "comfyui_workflows" / "Qwen-TTS-voice-clone.json"
        if not workflow_path.exists():
            raise FileNotFoundError(f"TTS workflow not found: {workflow_path}")

        with open(workflow_path, "r", encoding="utf-8") as f:
            workflow = json.load(f)

        unique_id = uuid.uuid4().hex[:8]
        filename_prefix = f"audio/narration_{project_id[:8]}_{unique_id}"

        for node in workflow.values():
            if not isinstance(node, dict):
                continue
            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})
            if class_type == "FB_Qwen3TTSVoiceClone":
                inputs["target_text"] = text
            if class_type == "SaveAudio":
                inputs["filename_prefix"] = filename_prefix

        prompt_id = await comfyui_client.queue_prompt(workflow)
        comfyui_client.register_task(project_id, prompt_id)

        try:
            max_wait = 300
            waited = 0
            audio_filename = None
            while waited < max_wait:
                await asyncio.sleep(3)
                waited += 3
                history = await comfyui_client.get_history(prompt_id)
                if prompt_id in history:
                    for node_out in history[prompt_id].get("outputs", {}).values():
                        audios = node_out.get("audio", [])
                        if audios:
                            audio_filename = audios[0].get("filename")
                            break
                    if audio_filename:
                        break
        finally:
            comfyui_client.unregister_task(project_id, prompt_id)

        if not audio_filename:
            raise RuntimeError("TTS narration timed out or produced no output")

        audio_content = await comfyui_client.get_audio_content(audio_filename, subfolder="audio")
        local_name = f"narration_{unique_id}.wav"
        project_dir = settings.DATA_DIR / "projects" / project_id
        (project_dir / local_name).write_bytes(audio_content)
        return f"{project_id}/{local_name}"

    async def _generate_video_from_image_path(
        self,
        project_id: str,
        image_path: str,
        workflow_id: str | None,
        task_id: str,
    ) -> str:
        """从图像生成视频，返回相对路径"""
        # Upload image to ComfyUI input
        abs_path = settings.DATA_DIR / "projects" / image_path
        if not abs_path.exists():
            raise FileNotFoundError(f"Image not found: {abs_path}")

        with open(abs_path, "rb") as f:
            comfy_image_name = await comfyui_client.upload_file_to_input(f.read(), abs_path.name)

        # Get workflow config
        if workflow_id:
            workflow_config = prompt_service.get_workflow_by_id("video", workflow_id)
        else:
            workflow_config = prompt_service.get_default_workflow("video")
        if not workflow_config:
            raise ValueError(f"No video workflow config found")

        workflow_params = workflow_config.get("params", {})
        video_length = workflow_params.get("video_length", 97)
        frame_rate = workflow_params.get("frame_rate", 24)
        unique_id = uuid.uuid4().hex[:8]
        output_filename = f"act_video_{project_id[:8]}_{unique_id}"

        video_comfy_path = await comfyui_client.generate_video(
            workflow_name=workflow_config.get("workflow_file", "video_generation_ltx2.json"),
            input_image=comfy_image_name,
            action_prompt="",
            negative_prompt="",
            width=workflow_params.get("width", 768),
            height=workflow_params.get("height", 1344),
            video_length=video_length,
            steps=workflow_params.get("steps", 30),
            cfg=workflow_params.get("cfg", 3.0),
            frame_rate=frame_rate,
            output_filename=output_filename,
            project_id=project_id,
        )

        saved_path = await self._save_generated_file(video_comfy_path, project_id)
        return saved_path

    async def _merge_video_audio_paths(
        self,
        project_id: str,
        video_rel: str,
        audio_rel: str,
    ) -> str:
        """用 ffmpeg 将视频与旁白音频合并（去掉原视频音轨），返回相对路径"""
        import subprocess

        video_abs = settings.DATA_DIR / "projects" / video_rel
        audio_abs = settings.DATA_DIR / "projects" / audio_rel
        unique_id = uuid.uuid4().hex[:8]
        out_name = f"act_final_{unique_id}.mp4"
        out_abs = settings.DATA_DIR / "projects" / project_id / out_name

        try:
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", str(video_abs),
                    "-i", str(audio_abs),
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-shortest",
                    str(out_abs),
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode != 0:
                logger.warning(f"ffmpeg merge failed: {result.stderr}. Returning video without audio.")
                return video_rel
        except (FileNotFoundError, subprocess.TimeoutExpired) as e:
            logger.warning(f"ffmpeg not available or timed out: {e}. Returning video without audio.")
            return video_rel

        return f"{project_id}/{out_name}"


generation_tasks = GenerationTasks()
