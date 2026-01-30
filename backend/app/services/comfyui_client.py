import json
import uuid
import httpx
import logging
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.schemas.common import ComfyUIStatus

logger = logging.getLogger(__name__)

# 工作流目录
WORKFLOW_DIR = settings.WORKFLOW_DIR


class ComfyUIClient:
    """ComfyUI API 客户端"""

    # 需要获取的模型类型及其对应的 ComfyUI 节点和输入字段
    MODEL_TYPES = {
        "checkpoints": ("CheckpointLoaderSimple", "ckpt_name"),
        "unet": ("UNETLoader", "unet_name"),
        "vae": ("VAELoader", "vae_name"),
        "loras": ("LoraLoader", "lora_name"),
        "clip": ("CLIPLoader", "clip_name"),
    }

    def __init__(self):
        self.base_url = settings.COMFYUI_URL
        self.client_id = str(uuid.uuid4())
        # 追踪每个项目的活跃任务: {project_id: [prompt_id, ...]}
        self._active_tasks: dict[str, list[str]] = {}

    async def _get_available_models(self) -> dict[str, list[str]]:
        """通过 ComfyUI API 获取所有可用模型"""
        models: dict[str, list[str]] = {}

        try:
            async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
                response = await client.get(f"{self.base_url}/object_info")
                if response.status_code != 200:
                    return models

                object_info = response.json()

                for model_type, (node_name, input_name) in self.MODEL_TYPES.items():
                    node_info = object_info.get(node_name, {})
                    model_list = (
                        node_info.get("input", {})
                        .get("required", {})
                        .get(input_name, [[]])[0]
                    )
                    if model_list:
                        models[model_type] = list(model_list)

        except Exception:
            pass

        return models

    async def check_connection(self) -> ComfyUIStatus:
        """检查 ComfyUI 连接状态并获取可用模型"""
        status = ComfyUIStatus(
            connected=False,
            url=self.base_url.replace("http://", ""),
            models={},
        )

        try:
            async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
                response = await client.get(f"{self.base_url}/system_stats")
                if response.status_code == 200:
                    status.connected = True

        except Exception:
            pass

        # 获取可用模型列表
        if status.connected:
            status.models = await self._get_available_models()

        return status

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
                # 尝试根据 node_id 或标题识别
                is_positive = "positive" in node_id.lower() or "positive" in node.get("_meta", {}).get("title", "").lower()
                is_negative = "negative" in node_id.lower() or "negative" in node.get("_meta", {}).get("title", "").lower()
                
                # 如果都没有，尝试根据 text 内容判断 (如果有占位符)
                text_content = inputs.get("text", "")
                if not is_positive and not is_negative:
                    if "{{positive_prompt}}" in text_content:
                        is_positive = True
                if not is_negative and not is_positive:
                    if "{{negative_prompt}}" in text_content:
                        is_negative = True

                if is_positive and "positive_prompt" in params:
                    inputs["text"] = params["positive_prompt"]
                elif is_negative and "negative_prompt" in params:
                    inputs["text"] = params["negative_prompt"]

            # 更新 KSampler 节点
            if class_type in ["KSampler", "KSamplerAdvanced"]:
                if "seed" in params:
                    inputs["seed"] = params["seed"]
                if "steps" in params:
                    inputs["steps"] = params["steps"]
                if "cfg" in params:
                    inputs["cfg"] = params["cfg"]

            # 更新 Model Sampling 节点 (AuraFlow 等)
            if class_type == "ModelSamplingAuraFlow":
                # AuraFlow 有时通过 shift 参数调整，目前保留默认
                pass

            # 更新 Empty Latent Image 节点
            if class_type in ["EmptyLatentImage", "EmptySD3LatentImage", "EmptyFlux2LatentImage"]:
                if "width" in params:
                    inputs["width"] = params["width"]
                if "height" in params:
                    inputs["height"] = params["height"]

            if class_type == "Flux2Scheduler":
                if "steps" in params:
                    inputs["steps"] = params["steps"]
                if "width" in params:
                    inputs["width"] = params["width"]
                if "height" in params:
                    inputs["height"] = params["height"]

            if class_type == "RandomNoise":
                if "seed" in params:
                    inputs["noise_seed"] = params["seed"]

            # 更新 FLUX2 子图节点 (text-to-image subgraph)
            # 子图节点的 class_type 是 UUID，但有 text/width/height 输入
            if "text" in inputs and "width" in inputs and "height" in inputs:
                if "positive_prompt" in params:
                    inputs["text"] = params["positive_prompt"]
                if "width" in params:
                    inputs["width"] = params["width"]
                if "height" in params:
                    inputs["height"] = params["height"]

            # 更新 Save Image 节点
            if class_type == "SaveImage":
                if "output_filename" in params:
                    inputs["filename_prefix"] = params["output_filename"]

            # === 视频生成相关节点 ===

            # 更新 LoadImage 节点 (输入图像)
            if class_type == "LoadImage":
                if "input_image" in params:
                    inputs["image"] = params["input_image"]

            # 更新 LTXVImgToVideo 节点
            if class_type == "LTXVImgToVideo":
                if "width" in params:
                    inputs["width"] = params["width"]
                if "height" in params:
                    inputs["height"] = params["height"]
                if "video_length" in params:
                    inputs["length"] = params["video_length"]

            # 更新 LTXVSampler 节点
            if class_type == "LTXVSampler":
                if "seed" in params:
                    inputs["seed"] = params["seed"]
                if "steps" in params:
                    inputs["steps"] = params["steps"]
                if "cfg" in params:
                    inputs["cfg"] = params["cfg"]

            # 更新 VHS_VideoCombine 节点
            if class_type == "VHS_VideoCombine":
                if "output_filename" in params:
                    inputs["filename_prefix"] = params["output_filename"]
                if "frame_rate" in params:
                    inputs["frame_rate"] = params["frame_rate"]

        return workflow

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        """提交 workflow 到 ComfyUI 队列"""
        # 显式禁用代理，避免 Clash 等系统代理干扰 localhost 请求
        async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
            response = await client.post(
                f"{self.base_url}/prompt",
                json={
                    "prompt": workflow,
                    "client_id": self.client_id,
                },
            )
            
            if response.status_code != 200:
                error_msg = response.text
                try:
                    if response.content.strip():
                        error_data = response.json()
                        error_msg = json.dumps(error_data, indent=2)
                except Exception:
                    pass
                logger.error(f"ComfyUI API Error ( {response.status_code} ): {error_msg}")
            
            response.raise_for_status()
            data = response.json()
            return data.get("prompt_id", "")

    async def get_history(self, prompt_id: str) -> dict[str, Any]:
        """获取任务历史"""
        async with httpx.AsyncClient(trust_env=False) as client:
            response = await client.get(f"{self.base_url}/history/{prompt_id}")
            response.raise_for_status()
            return response.json()

    async def get_system_stats(self) -> dict[str, Any]:
        """获取系统状态"""
        async with httpx.AsyncClient(trust_env=False) as client:
            response = await client.get(f"{self.base_url}/system_stats")
            response.raise_for_status()
            return response.json()

    async def interrupt(self) -> bool:
        """中断当前正在执行的任务"""
        try:
            async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
                response = await client.post(f"{self.base_url}/interrupt")
                return response.status_code == 200
        except Exception:
            return False

    async def delete_from_queue(self, prompt_id: str) -> bool:
        """从队列中删除指定任务"""
        try:
            async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
                response = await client.post(
                    f"{self.base_url}/queue",
                    json={"delete": [prompt_id]},
                )
                return response.status_code == 200
        except Exception:
            return False

    async def clear_queue(self) -> bool:
        """清空所有队列任务"""
        try:
            async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
                response = await client.post(
                    f"{self.base_url}/queue",
                    json={"clear": True},
                )
                return response.status_code == 200
        except Exception:
            return False

    def register_task(self, project_id: str, prompt_id: str):
        """注册项目任务"""
        if project_id not in self._active_tasks:
            self._active_tasks[project_id] = []
        self._active_tasks[project_id].append(prompt_id)

    def unregister_task(self, project_id: str, prompt_id: str):
        """取消注册项目任务"""
        if project_id in self._active_tasks:
            if prompt_id in self._active_tasks[project_id]:
                self._active_tasks[project_id].remove(prompt_id)

    async def stop_project_tasks(self, project_id: str) -> int:
        """停止指定项目的所有任务，返回停止的任务数"""
        stopped = 0
        if project_id not in self._active_tasks:
            return stopped

        # 先中断当前执行
        await self.interrupt()

        # 删除队列中的任务
        for prompt_id in self._active_tasks[project_id]:
            if await self.delete_from_queue(prompt_id):
                stopped += 1

        # 清理追踪记录
        del self._active_tasks[project_id]
        return stopped

    def get_project_tasks(self, project_id: str) -> list[str]:
        """获取项目的活跃任务列表"""
        return self._active_tasks.get(project_id, [])

    async def wait_for_completion(
        self,
        prompt_id: str,
        timeout: float = 1200.0,
        poll_interval: float = 2.0,
    ) -> dict[str, Any]:
        """等待任务完成"""
        import asyncio

        elapsed = 0.0
        logger.info(f"[等待完成] prompt_id={prompt_id}, timeout={timeout}s")
        while elapsed < timeout:
            try:
                history = await self.get_history(prompt_id)
                if prompt_id in history:
                    logger.info(f"[任务完成详情] prompt_id={prompt_id}, elapsed={elapsed}s")
                    return history[prompt_id]
            except Exception as e:
                logger.warning(f"[获取历史失败] prompt_id={prompt_id}, error={str(e)}")

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        logger.error(f"[任务超时] prompt_id={prompt_id}, timeout={timeout}s")
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
        project_id: str | None = None,
        reference_image: str | None = None,
    ) -> str:
        """生成图像的高级封装

        返回生成的图像路径
        """
        import random

        if seed == -1:
            seed = random.randint(0, 2**32 - 1)

        # 加载 workflow
        workflow_path = WORKFLOW_DIR / workflow_name
        workflow = await self.load_workflow(str(workflow_path))

        # 替换模板占位符
        workflow_str = json.dumps(workflow)
        workflow_str = workflow_str.replace("{{positive_prompt}}", positive_prompt)
        workflow_str = workflow_str.replace("{{negative_prompt}}", negative_prompt)
        workflow_str = workflow_str.replace("{{output_filename}}", output_filename)
        if reference_image:
            workflow_str = workflow_str.replace("{{reference_image}}", reference_image)
        workflow = json.loads(workflow_str)

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

        # 注册任务追踪
        if project_id:
            self.register_task(project_id, prompt_id)

        try:
            # 等待完成
            result = await self.wait_for_completion(prompt_id)

            # 返回输出图像路径
            outputs = result.get("outputs", {})
            for node_outputs in outputs.values():
                images = node_outputs.get("images", [])
                if images:
                    return images[0].get("filename", "")

            raise RuntimeError("No image output found")
        finally:
            # 完成后取消注册
            if project_id:
                self.unregister_task(project_id, prompt_id)


    async def generate_video(
        self,
        workflow_name: str,
        input_image: str,
        action_prompt: str,
        negative_prompt: str = "",
        seed: int = -1,
        width: int = 768,
        height: int = 1344,
        video_length: int = 97,
        steps: int = 30,
        cfg: float = 3.0,
        frame_rate: int = 24,
        output_filename: str = "output",
        project_id: str | None = None,
    ) -> str:
        """生成视频的高级封装

        Args:
            workflow_name: workflow 文件名
            input_image: 输入图像路径 (ComfyUI input 目录下的文件名)
            action_prompt: 动作描述 prompt
            negative_prompt: 负面 prompt
            seed: 随机种子 (-1 表示随机)
            width: 视频宽度
            height: 视频高度
            video_length: 视频帧数 (97帧 ≈ 4秒 @24fps)
            steps: 采样步数
            cfg: CFG 值
            frame_rate: 帧率
            output_filename: 输出文件名前缀
            project_id: 项目ID (用于任务追踪)

        返回生成的视频路径
        """
        import random

        if seed == -1:
            seed = random.randint(0, 2**32 - 1)

        # 加载 workflow
        workflow_path = WORKFLOW_DIR / workflow_name
        workflow = await self.load_workflow(str(workflow_path))

        # 更新 workflow 中的模板占位符
        workflow_str = json.dumps(workflow)
        workflow_str = workflow_str.replace("{{input_image}}", input_image)
        workflow_str = workflow_str.replace("{{action_prompt}}", action_prompt)
        workflow_str = workflow_str.replace("{{negative_prompt}}", negative_prompt)
        workflow_str = workflow_str.replace("{{output_filename}}", output_filename)
        workflow = json.loads(workflow_str)

        # 更新参数
        workflow = await self.update_workflow_params(
            workflow,
            {
                "input_image": input_image,
                "seed": seed,
                "width": width,
                "height": height,
                "video_length": video_length,
                "steps": steps,
                "cfg": cfg,
                "frame_rate": frame_rate,
                "output_filename": output_filename,
            },
        )

        # 提交任务
        prompt_id = await self.queue_prompt(workflow)

        # 注册任务追踪
        if project_id:
            self.register_task(project_id, prompt_id)

        try:
            # 等待完成 (视频生成时间较长，默认10分钟超时)
            result = await self.wait_for_completion(prompt_id, timeout=600.0)

            # 返回输出视频路径
            outputs = result.get("outputs", {})
            for node_outputs in outputs.values():
                # VHS_VideoCombine 输出格式
                gifs = node_outputs.get("gifs", [])
                if gifs:
                    return gifs[0].get("filename", "")
                # 其他可能的视频输出格式
                videos = node_outputs.get("videos", [])
                if videos:
                    return videos[0].get("filename", "")

            raise RuntimeError("No video output found")
        finally:
            # 完成后取消注册
            if project_id:
                self.unregister_task(project_id, prompt_id)


comfyui_client = ComfyUIClient()
