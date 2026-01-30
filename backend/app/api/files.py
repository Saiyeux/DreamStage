import httpx
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse

from app.core.config import settings

router = APIRouter()


def get_comfyui_output_dir() -> Path:
    """获取 ComfyUI 输出目录"""
    if settings.COMFYUI_OUTPUT_DIR:
        return Path(settings.COMFYUI_OUTPUT_DIR)
    # 默认使用 ComfyUI 安装目录下的 output
    if settings.COMFYUI_PATH:
        return Path(settings.COMFYUI_PATH) / "output"
    # 最后使用本地 data/output
    return settings.DATA_DIR / "output"


@router.get("/images/{filename:path}")
async def get_image(filename: str):
    """获取生成的图像文件"""
    output_dir = get_comfyui_output_dir()
    file_path = output_dir / filename

    # 尝试查找本地文件
    local_file_exists = False
    try:
        file_path = file_path.resolve()
        output_dir = output_dir.resolve()
        # 放宽检查，只要存在即可 (因为 resolve 可能解析出这里意想不到的路径)
        # 但为了安全，还是应该检查是否在 output 目录下。
        # 如果 ComfyUI 就在本机，我们可能无法知晓其 output 在哪，所以如果 settings 未设置 output dir，
        # 本地查找可能失败。
        if str(file_path).startswith(str(output_dir)) and file_path.exists():
            local_file_exists = True
    except Exception:
        pass

    if local_file_exists:
        # 确定 MIME 类型
        suffix = file_path.suffix.lower()
        media_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }
        media_type = media_types.get(suffix, "application/octet-stream")
        return FileResponse(file_path, media_type=media_type)

    # 如果本地未找到，尝试从 ComfyUI 代理
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 注意：如果 filename 包含子目录，ComfyUI API 需要 subfolder 参数
            # 但 generation_tasks 中通常拿到的是带 subfolder 的 filename 吗?
            # ComfyUI 返回的 filename 通常只是文件名，subfolder 是分开的。
            # 如果 comfyui_client.py 的 generate_image 返回的只是 filename，那这里直接传 filename 就行。
            # 如果 comfyui_client.py 返回的是 subfolder/filename，我们需要拆分。
            
            # 简单的尝试直接传 filename
            url = f"{settings.COMFYUI_URL}/view?filename={filename}&type=output"
            resp = await client.get(url)
            if resp.status_code == 200:
                return Response(content=resp.content, media_type=resp.headers.get("content-type"))
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="File not found")


@router.get("/videos/{filename:path}")
async def get_video(filename: str):
    """获取生成的视频文件"""
    output_dir = get_comfyui_output_dir()
    file_path = output_dir / filename

    # 安全检查
    try:
        file_path = file_path.resolve()
        output_dir = output_dir.resolve()
        if not str(file_path).startswith(str(output_dir)):
            raise HTTPException(status_code=403, detail="Access denied")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid path")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # 确定 MIME 类型
    suffix = file_path.suffix.lower()
    media_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
    }
    media_type = media_types.get(suffix, "video/mp4")

    return FileResponse(file_path, media_type=media_type)
