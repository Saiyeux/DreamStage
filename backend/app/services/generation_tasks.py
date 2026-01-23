"""后台生成任务"""
import asyncio
from typing import Any

from app.models import Character, Scene
from app.services.comfyui_client import comfyui_client


class GenerationTasks:
    """生成任务管理"""

    # 任务状态存储 (简化版，生产环境应使用 Redis)
    _task_status: dict[str, dict[str, Any]] = {}

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

    async def generate_character_images(
        self,
        task_id: str,
        character: Character,
        image_types: list[str],
    ):
        """生成角色图像"""
        self.update_task_status(task_id, "running", 0, "Starting generation...")

        try:
            total = len(image_types)
            for i, image_type in enumerate(image_types):
                progress = int((i / total) * 100)
                self.update_task_status(
                    task_id, "running", progress, f"Generating {image_type}..."
                )

                # 构建 prompt
                prompt = self._build_character_prompt(character, image_type)

                # TODO: 调用 ComfyUI 生成
                # output_path = await comfyui_client.generate_image(
                #     workflow_name="character_portrait_flux2.json",
                #     positive_prompt=prompt,
                #     ...
                # )

                # 模拟生成延迟
                await asyncio.sleep(2)

            self.update_task_status(task_id, "completed", 100, "Generation complete")

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_character_library(
        self,
        task_id: str,
        project_id: str,
        characters: list[Character],
    ):
        """批量生成角色库"""
        self.update_task_status(task_id, "running", 0, "Starting character library...")

        try:
            total = len(characters)
            image_types = ["front", "side", "smile", "surprised", "thinking"]

            for i, character in enumerate(characters):
                char_progress = int((i / total) * 100)
                self.update_task_status(
                    task_id, "running", char_progress, f"Processing {character.name}..."
                )

                for image_type in image_types:
                    # TODO: 实际生成逻辑
                    await asyncio.sleep(1)

            self.update_task_status(task_id, "completed", 100, "Library complete")

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_scene_image(
        self,
        task_id: str,
        scene: Scene,
    ):
        """生成场景图像"""
        self.update_task_status(task_id, "running", 0, "Starting scene generation...")

        try:
            # TODO: 构建场景 prompt 并调用 ComfyUI
            await asyncio.sleep(3)

            self.update_task_status(task_id, "completed", 100, "Scene image complete")

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_all_scene_images(
        self,
        task_id: str,
        project_id: str,
        scenes: list[Scene],
    ):
        """批量生成场景图像"""
        self.update_task_status(task_id, "running", 0, "Starting batch generation...")

        try:
            total = len(scenes)
            for i, scene in enumerate(scenes):
                progress = int((i / total) * 100)
                self.update_task_status(
                    task_id, "running", progress, f"Scene {scene.scene_number}..."
                )

                # TODO: 实际生成逻辑
                await asyncio.sleep(2)

            self.update_task_status(task_id, "completed", 100, "All scenes complete")

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_scene_video(
        self,
        task_id: str,
        scene: Scene,
    ):
        """生成场景视频"""
        self.update_task_status(task_id, "running", 0, "Starting video generation...")

        try:
            # TODO: 调用 LTX2 生成视频
            await asyncio.sleep(5)

            self.update_task_status(task_id, "completed", 100, "Video complete")

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    async def generate_all_videos(
        self,
        task_id: str,
        project_id: str,
        scenes: list[Scene],
    ):
        """批量生成视频"""
        self.update_task_status(task_id, "running", 0, "Starting video batch...")

        try:
            total = len(scenes)
            for i, scene in enumerate(scenes):
                progress = int((i / total) * 100)
                self.update_task_status(
                    task_id, "running", progress, f"Video {scene.scene_number}..."
                )

                # TODO: 实际生成逻辑
                await asyncio.sleep(3)

            self.update_task_status(task_id, "completed", 100, "All videos complete")

        except Exception as e:
            self.update_task_status(task_id, "failed", 0, "", error=str(e))

    def _build_character_prompt(self, character: Character, image_type: str) -> str:
        """构建角色图像 prompt"""
        base = character.base_prompt or ""

        if not base:
            # 根据角色信息构建基础 prompt
            parts = []
            if character.gender:
                parts.append(f"a {character.gender}")
            if character.age:
                parts.append(f"{character.age}")
            if character.hair:
                parts.append(character.hair)
            if character.face:
                parts.append(character.face)
            if character.body:
                parts.append(character.body)
            if character.skin:
                parts.append(f"{character.skin} skin")

            base = ", ".join(parts)

        # 根据图像类型添加修饰
        type_modifiers = {
            "front": "front view, portrait, looking at viewer",
            "side": "side view, profile portrait",
            "smile": "smiling, happy expression, gentle smile",
            "surprised": "surprised expression, wide eyes",
            "thinking": "thinking, contemplative expression",
        }

        modifier = type_modifiers.get(image_type, "")
        quality = "high quality, detailed, professional portrait, 8k"

        return f"{base}, {modifier}, {quality}"


generation_tasks = GenerationTasks()
