"""文件服务 API"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
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

    # 安全检查：确保文件在输出目录内
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
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(file_path, media_type=media_type)


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
