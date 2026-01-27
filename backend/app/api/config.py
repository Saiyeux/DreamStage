import json
import os
from pathlib import Path
from fastapi import APIRouter
from app.core.config import settings
from app.schemas.common import CamelModel

router = APIRouter()

CONFIG_DIR = Path(__file__).parent.parent / "config"


class LLMConfigResponse(CamelModel):
    chunk_size: int
    context_length: int


class LLMConfigUpdate(CamelModel):
    chunk_size: int | None = None
    context_length: int | None = None


# LLM 运行时配置（可动态修改）
_llm_runtime_config = {
    "chunk_size": settings.LLM_CHUNK_SIZE,
    "context_length": settings.LLM_CONTEXT_LENGTH,
}


def get_llm_chunk_size() -> int:
    """获取当前的文本分块长度"""
    return _llm_runtime_config["chunk_size"]


def get_llm_context_length() -> int:
    """获取当前的上下文长度"""
    return _llm_runtime_config["context_length"]


@router.get("/llm", response_model=LLMConfigResponse)
async def get_llm_config():
    """获取 LLM 配置"""
    return LLMConfigResponse(
        chunk_size=_llm_runtime_config["chunk_size"],
        context_length=_llm_runtime_config["context_length"],
    )


@router.put("/llm", response_model=LLMConfigResponse)
async def update_llm_config(config: LLMConfigUpdate):
    """更新 LLM 配置"""
    if config.chunk_size is not None:
        _llm_runtime_config["chunk_size"] = config.chunk_size
    if config.context_length is not None:
        _llm_runtime_config["context_length"] = config.context_length

    return LLMConfigResponse(
        chunk_size=_llm_runtime_config["chunk_size"],
        context_length=_llm_runtime_config["context_length"],
    )


@router.get("/character-image-templates")
async def get_character_image_templates():
    """获取角色图类型模板配置"""
    config_file = CONFIG_DIR / "character_image_templates.json"

    if not config_file.exists():
        return {
            "default_types": [
                {"id": "front", "label": "正面", "prompt_suffix": "front view"},
                {"id": "side", "label": "侧面", "prompt_suffix": "side view"},
                {"id": "back", "label": "背面", "prompt_suffix": "back view"},
            ],
            "templates": {},
            "available_types": [],
        }

    with open(config_file, "r", encoding="utf-8") as f:
        return json.load(f)
