"""后台生成任务"""
import uuid
import asyncio
import json
from pathlib import Path
from typing import Any

from app.db.database import async_session_maker
from app.models import Character, Scene, CharacterImage, SceneImage, VideoClip
from app.services.comfyui_client import comfyui_client


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

    def update_task_status(
        self,
        task_id: str,
        status: str,
        progress: int = 0,
        message: str = "",
        result: Any = None,
        error: str | None = None,
    ):
        """更新任务状态"""
        self._task_status[task_id] = {
            "status": status,
            "progress": progress,
            "message": message,
            "result": result,
            "error": error,
        }

    def _build_character_prompt(self, character: Character, image_type: str) -> str:
        """构建角色图像 prompt"""
        parts = []

        # 基础描述
        if character.gender:
            gender_en = "woman" if "女" in character.gender else "man"
            parts.append(f"a {gender_en}")
        if character.age:
            parts.append(f"{character.age} years old")
        if character.hair:
            parts.append(character.hair)
        if character.face:
            parts.append(character.face)
        if character.body:
            parts.append(character.body)
        if character.skin:
            parts.append(f"{character.skin} skin")
        if character.clothing_style:
            parts.append(character.clothing_style)

        base = ", ".join(parts) if parts else "a person"

        # 从配置文件获取类型修饰
        type_info = self._get_image_type_info(image_type)
        modifier = type_info.get("prompt_suffix", "portrait")
        quality = "high quality, detailed, professional portrait, 8k, sharp focus, studio lighting"

        return f"{base}, {modifier}, {quality}"

    def _build_scene_prompt(self, scene: Scene) -> str:
        """构建场景图 prompt"""
        parts = []

        if scene.location:
            parts.append(scene.location)
        if scene.time_of_day:
            parts.append(scene.time_of_day)
        if scene.atmosphere:
            parts.append(scene.atmosphere)
        if scene.environment_desc:
            parts.append(scene.environment_desc)

        # 添加角色信息
        if scene.characters_data:
            for char in scene.characters_data:
                char_desc = []
                if char.get("character_name"):
                    char_desc.append(char["character_name"])
                if char.get("position"):
                    char_desc.append(f"at {char['position']}")
                if char.get("action"):
                    char_desc.append(char["action"])
                if char.get("expression"):
                    char_desc.append(char["expression"])
                if char_desc:
                    parts.append(", ".join(char_desc))

        base = ", ".join(parts) if parts else "a scene"
        quality = "cinematic, high quality, detailed environment, professional cinematography, 9:16 aspect ratio"

        return f"{base}, {quality}"

    def _build_action_prompt(self, scene: Scene) -> str:
        """构建视频动作 prompt"""
        parts = []

        # 角色动作
        if scene.characters_data:
            for char in scene.characters_data:
                if char.get("action"):
                    parts.append(char["action"])

        # 镜头运动
        if scene.camera_movement:
            camera_map = {
                "固定": "static camera",
                "推进": "camera push in, zoom in slowly",
                "拉远": "camera pull out, zoom out slowly",
                "平移": "camera pan, horizontal movement",
            }
            parts.append(camera_map.get(scene.camera_movement, scene.camera_movement))

        if not parts:
            parts.append("subtle movement, gentle motion")

        return ", ".join(parts) + ", smooth motion, cinematic"

    async def generate_character_images(
        self,
        task_id: str,
        character: Character,
        image_types: list[str],
    ):
        """生成角色图像"""
        self.update_task_status(task_id, "running", 0, "准备生成...")

        try:
            total = len(image_types)
            generated_images = []
            negative_prompt = "blurry, low quality, distorted, deformed"

            async with async_session_maker() as db:
                for i, image_type in enumerate(image_types):
                    progress = int((i / total) * 100)
                    type_label = self.IMAGE_TYPE_LABELS.get(image_type, image_type)
                    self.update_task_status(
                        task_id, "running", progress, f"生成 {character.name} {type_label}..."
                    )

                    # 构建 prompt
                    prompt = self._build_character_prompt(character, image_type)
                    output_filename = f"character_{character.id}_{image_type}"

                    try:
                        # 调用 ComfyUI 生成
                        image_path = await comfyui_client.generate_image(
                            workflow_name="character_portrait_flux2.json",
                            positive_prompt=prompt,
                            negative_prompt=negative_prompt,
                            width=768,
                            height=1024,
                            output_filename=output_filename,
                            project_id=character.project_id,
                        )

                        # 保存到数据库
                        char_image = CharacterImage(
                            id=str(uuid.uuid4()),
                            character_id=character.id,
                            image_type=image_type,
                            image_path=image_path,
                            prompt_used=prompt,
                            negative_prompt=negative_prompt,
                            is_selected=False,
                        )
                        db.add(char_image)
                        await db.commit()

                        generated_images.append({
                            "type": image_type,
                            "path": image_path,
                            "id": char_image.id,
                        })
                    except Exception as e:
                        # 单张图片失败不中断整个任务
                        print(f"Generate {image_type} failed: {e}")
                        continue

            self.update_task_status(
                task_id, "completed", 100,
                f"完成 {len(generated_images)}/{total} 张",
                result=generated_images
            )

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_character_library(
        self,
        task_id: str,
        project_id: str,
        characters: list[Character],
        image_types: list[str] | None = None,
    ):
        """批量生成角色库

        Args:
            task_id: 任务ID
            project_id: 项目ID
            characters: 角色列表
            image_types: 要生成的图片类型列表，为None时使用默认配置
        """
        self.update_task_status(task_id, "running", 0, "开始生成角色库...")

        try:
            # 获取要生成的图片类型
            if image_types is None:
                config = self._load_image_type_config()
                types_to_generate = [t["id"] for t in config.get("default_types", [])]
            else:
                types_to_generate = image_types

            if not types_to_generate:
                types_to_generate = ["front", "side", "back"]  # 最终回退

            total_chars = len(characters)
            total_images = total_chars * len(types_to_generate)
            completed = 0
            negative_prompt = "blurry, low quality, distorted, deformed"

            async with async_session_maker() as db:
                for i, character in enumerate(characters):
                    for j, image_type in enumerate(types_to_generate):
                        progress = int((completed / total_images) * 100)
                        type_info = self._get_image_type_info(image_type)
                        type_label = type_info.get("label", image_type)
                        self.update_task_status(
                            task_id, "running", progress,
                            f"{character.name} - {type_label}"
                        )

                        # 构建 prompt
                        prompt = self._build_character_prompt(character, image_type)
                        output_filename = f"char_{character.id[:8]}_{image_type}"

                        try:
                            image_path = await comfyui_client.generate_image(
                                workflow_name="character_portrait_flux2.json",
                                positive_prompt=prompt,
                                negative_prompt=negative_prompt,
                                width=768,
                                height=1024,
                                output_filename=output_filename,
                                project_id=project_id,
                            )

                            # 保存到数据库
                            char_image = CharacterImage(
                                id=str(uuid.uuid4()),
                                character_id=character.id,
                                image_type=image_type,
                                image_path=image_path,
                                prompt_used=prompt,
                                negative_prompt=negative_prompt,
                                is_selected=(j == 0),  # 第一个类型作为默认选择
                            )
                            db.add(char_image)
                            await db.commit()
                        except Exception as e:
                            print(f"Generate {character.name} {image_type} failed: {e}")

                        completed += 1

            self.update_task_status(task_id, "completed", 100, "角色库生成完成")

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_scene_image(
        self,
        task_id: str,
        scene: Scene,
        reference_image: str | None = None,
    ):
        """生成场景图像

        Args:
            task_id: 任务ID
            scene: 场景对象
            reference_image: 参考图像 (角色图) 用于保持角色一致性
        """
        self.update_task_status(task_id, "running", 0, f"生成场景 #{scene.scene_number}...")

        try:
            prompt = self._build_scene_prompt(scene)
            negative_prompt = "blurry, low quality, distorted, ugly"
            output_filename = f"scene_{scene.project_id[:8]}_{scene.scene_number}"

            # 调用 ComfyUI (scene workflow 使用 IPAdapter 保持角色一致性)
            image_path = await comfyui_client.generate_image(
                workflow_name="scene_generation_flux2.json",
                positive_prompt=prompt,
                negative_prompt=negative_prompt,
                width=768,
                height=1344,
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
    ):
        """批量生成场景图像"""
        self.update_task_status(task_id, "running", 0, "开始批量生成场景图...")

        try:
            total = len(scenes)
            generated = 0
            negative_prompt = "blurry, low quality, distorted, ugly"

            async with async_session_maker() as db:
                for i, scene in enumerate(scenes):
                    progress = int((i / total) * 100)
                    self.update_task_status(
                        task_id, "running", progress, f"场景 #{scene.scene_number}"
                    )

                    prompt = self._build_scene_prompt(scene)
                    output_filename = f"scene_{project_id[:8]}_{scene.scene_number}"

                    try:
                        image_path = await comfyui_client.generate_image(
                            workflow_name="scene_generation_flux2.json",
                            positive_prompt=prompt,
                            negative_prompt=negative_prompt,
                            width=768,
                            height=1344,
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
    ):
        """生成场景视频

        Args:
            task_id: 任务ID
            scene: 场景对象
            input_image: 输入图像文件名 (ComfyUI input 目录下)
        """
        self.update_task_status(task_id, "running", 0, f"生成视频 #{scene.scene_number}...")

        try:
            # 如果没有提供输入图像，使用默认文件名
            if not input_image:
                input_image = f"scene_{scene.project_id[:8]}_{scene.scene_number}.png"

            action_prompt = self._build_action_prompt(scene)
            negative_prompt = "blurry, low quality, distorted, jittery, unstable"
            output_filename = f"video_{scene.project_id[:8]}_{scene.scene_number}"
            video_length = 97  # ~4秒 @24fps
            frame_rate = 24

            self.update_task_status(task_id, "running", 10, "准备视频生成...")

            # 调用 ComfyUI 生成视频
            video_path = await comfyui_client.generate_video(
                workflow_name="video_generation_ltx2.json",
                input_image=input_image,
                action_prompt=action_prompt,
                negative_prompt=negative_prompt,
                width=768,
                height=1344,
                video_length=video_length,
                steps=30,
                cfg=3.0,
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
                    duration=video_length / frame_rate,  # ~4秒
                    fps=frame_rate,
                    resolution="768x1344",
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

    async def generate_all_videos(
        self,
        task_id: str,
        project_id: str,
        scenes: list[Scene],
    ):
        """批量生成视频"""
        self.update_task_status(task_id, "running", 0, "开始批量生成视频...")

        try:
            total = len(scenes)
            generated = 0
            negative_prompt = "blurry, low quality, distorted, jittery, unstable"
            video_length = 97
            frame_rate = 24

            async with async_session_maker() as db:
                for i, scene in enumerate(scenes):
                    progress = int((i / total) * 100)
                    self.update_task_status(
                        task_id, "running", progress, f"视频 #{scene.scene_number}"
                    )

                    # 输入图像为之前生成的场景图
                    input_image = f"scene_{project_id[:8]}_{scene.scene_number}.png"
                    action_prompt = self._build_action_prompt(scene)
                    output_filename = f"video_{project_id[:8]}_{scene.scene_number}"

                    try:
                        video_path = await comfyui_client.generate_video(
                            workflow_name="video_generation_ltx2.json",
                            input_image=input_image,
                            action_prompt=action_prompt,
                            negative_prompt=negative_prompt,
                            width=768,
                            height=1344,
                            video_length=video_length,
                            steps=30,
                            cfg=3.0,
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
                            resolution="768x1344",
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
