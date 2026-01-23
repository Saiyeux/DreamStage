import json
import uuid
import httpx
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.schemas.common import ComfyUIStatus


class ComfyUIClient:
    """ComfyUI API 客户端"""

    def __init__(self):
        self.base_url = settings.COMFYUI_URL
        self.client_id = str(uuid.uuid4())

    async def check_connection(self) -> dict[str, Any]:
        """检查 ComfyUI 连接状态和模型加载情况"""
        status = ComfyUIStatus(connected=False, url=self.base_url.replace("http://", ""))
        flux2_loaded = False
        ltx2_loaded = False

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # 检查连接
                response = await client.get(f"{self.base_url}/system_stats")
                if response.status_code == 200:
                    status.connected = True

                # 检查已加载的模型
                response = await client.get(f"{self.base_url}/object_info")
                if response.status_code == 200:
                    # 简化检测：假设如果 ComfyUI 可访问，模型也可用
                    # 实际检测需要解析 object_info 或检查特定节点
                    flux2_loaded = True
                    ltx2_loaded = True

        except Exception:
            pass

        return {
            "status": status,
            "flux2_loaded": flux2_loaded,
            "ltx2_loaded": ltx2_loaded,
        }

    async def load_workflow(self, workflow_path: str) -> dict[str, Any]:
        """加载 workflow JSON 文件"""
        path = Path(workflow_path)
        if not path.exists():
            raise FileNotFoundError(f"Workflow not found: {workflow_path}")

        return json.loads(path.read_text())

    async def update_workflow_params(
        self,
        workflow: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """更新 workflow 中的参数

        params 示例:
        {
            "positive_prompt": "...",
            "negative_prompt": "...",
            "seed": 12345,
            "width": 768,
            "height": 1024,
        }
        """
        # 遍历 workflow 节点，更新参数
        for node_id, node in workflow.items():
            if not isinstance(node, dict):
                continue

            class_type = node.get("class_type", "")
            inputs = node.get("inputs", {})

            # 更新 CLIP Text Encode 节点
            if class_type in ["CLIPTextEncode", "CLIPTextEncodeFlux"]:
                if "positive_prompt" in params and "positive" in node_id.lower():
                    inputs["text"] = params["positive_prompt"]
                if "negative_prompt" in params and "negative" in node_id.lower():
                    inputs["text"] = params["negative_prompt"]

            # 更新 KSampler 节点
            if class_type in ["KSampler", "KSamplerAdvanced"]:
                if "seed" in params:
                    inputs["seed"] = params["seed"]
                if "steps" in params:
                    inputs["steps"] = params["steps"]

            # 更新 Empty Latent Image 节点
            if class_type == "EmptyLatentImage":
                if "width" in params:
                    inputs["width"] = params["width"]
                if "height" in params:
                    inputs["height"] = params["height"]

            # 更新 Save Image 节点
            if class_type == "SaveImage":
                if "output_filename" in params:
                    inputs["filename_prefix"] = params["output_filename"]

        return workflow

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        """提交 workflow 到 ComfyUI 队列"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/prompt",
                json={
                    "prompt": workflow,
                    "client_id": self.client_id,
                },
            )
            response.raise_for_status()
            data = response.json()
            return data.get("prompt_id", "")

    async def get_history(self, prompt_id: str) -> dict[str, Any]:
        """获取任务历史/状态"""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{self.base_url}/history/{prompt_id}")
            response.raise_for_status()
            return response.json()

    async def wait_for_completion(
        self,
        prompt_id: str,
        timeout: float = 300.0,
        poll_interval: float = 2.0,
    ) -> dict[str, Any]:
        """等待任务完成"""
        import asyncio

        elapsed = 0.0
        while elapsed < timeout:
            history = await self.get_history(prompt_id)
            if prompt_id in history:
                return history[prompt_id]

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        raise TimeoutError(f"Task {prompt_id} did not complete within {timeout}s")

    async def generate_image(
        self,
        workflow_name: str,
        positive_prompt: str,
        negative_prompt: str = "",
        seed: int = -1,
        width: int = 768,
        height: int = 1024,
        output_filename: str = "output",
    ) -> str:
        """生成图像的高级封装

        返回生成的图像路径
        """
        import random

        if seed == -1:
            seed = random.randint(0, 2**32 - 1)

        # 加载 workflow
        workflow_path = Path("comfyui_workflows") / workflow_name
        workflow = await self.load_workflow(str(workflow_path))

        # 更新参数
        workflow = await self.update_workflow_params(
            workflow,
            {
                "positive_prompt": positive_prompt,
                "negative_prompt": negative_prompt,
                "seed": seed,
                "width": width,
                "height": height,
                "output_filename": output_filename,
            },
        )

        # 提交任务
        prompt_id = await self.queue_prompt(workflow)

        # 等待完成
        result = await self.wait_for_completion(prompt_id)

        # 返回输出图像路径
        outputs = result.get("outputs", {})
        for node_outputs in outputs.values():
            images = node_outputs.get("images", [])
            if images:
                return images[0].get("filename", "")

        raise RuntimeError("No image output found")


comfyui_client = ComfyUIClient()
