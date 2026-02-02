import json
import os
from pathlib import Path
from typing import Any
from fastapi import APIRouter, HTTPException
from app.core.config import settings
from app.schemas.common import CamelModel
from app.services.prompt_service import prompt_service

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


class ClearCacheRequest(CamelModel):
    clear_prompt_cache: bool = True
    clear_output_files: bool = False
    clear_analysis_tasks: bool = True


class ClearCacheResponse(CamelModel):
    success: bool
    message: str
    cleared_items: dict[str, int]


@router.post("/llm/clear-cache", response_model=ClearCacheResponse)
async def clear_llm_cache(request: ClearCacheRequest | None = None):
    """
    清除 LLM 相关缓存
    
    - clear_prompt_cache: 清除提示词配置缓存
    - clear_output_files: 清除 ComfyUI output 目录中的生成文件
    - clear_analysis_tasks: 清除内存中的分析任务记录
    """
    if request is None:
        request = ClearCacheRequest()
    
    cleared = {
        "prompt_cache": 0,
        "output_files": 0,
        "analysis_tasks": 0,
    }
    
    # 1. 清除提示词配置缓存
    if request.clear_prompt_cache:
        cache_size = len(prompt_service._cache)
        prompt_service.clear_cache()
        cleared["prompt_cache"] = cache_size
    
    # 2. 清除 output 文件
    if request.clear_output_files:
        output_dir = settings.DATA_DIR / "output"
        if output_dir.exists():
            import shutil
            file_count = sum(1 for f in output_dir.iterdir() if f.is_file())
            # 只删除文件，保留目录结构
            for f in output_dir.iterdir():
                if f.is_file():
                    f.unlink()
            cleared["output_files"] = file_count
    
    # 3. 清除分析任务记录
    if request.clear_analysis_tasks:
        from app.api.analysis import ANALYSIS_TASKS
        task_count = len(ANALYSIS_TASKS)
        # 取消所有进行中的任务
        for task in ANALYSIS_TASKS.values():
            if task.status in ["init", "running"]:
                task.cancel()
        ANALYSIS_TASKS.clear()
        cleared["analysis_tasks"] = task_count
    
    total_cleared = sum(cleared.values())
    return ClearCacheResponse(
        success=True,
        message=f"已清除 {total_cleared} 项缓存",
        cleared_items=cleared,
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


@router.put("/character-image-templates")
async def update_character_image_templates(data: dict[str, Any]):
    """更新角色图类型模板配置"""
    config_file = CONFIG_DIR / "character_image_templates.json"
    
    try:
        # Ensure the directory exists (it should, but safety first)
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(config_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        return {"success": True, "message": "角色图类型模板配置已更新"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新配置失败: {str(e)}")


# ============ 提示词配置 API ============

@router.get("/prompts/analysis")
async def get_analysis_prompts():
    """获取 LLM 分析提示词配置"""
    return prompt_service.get_analysis_prompts()


@router.put("/prompts/analysis")
async def update_analysis_prompts(data: dict[str, Any]):
    """更新 LLM 分析提示词配置"""
    if prompt_service.update_analysis_prompts(data):
        return {"success": True, "message": "分析提示词配置已更新"}
    raise HTTPException(status_code=500, detail="更新失败")


@router.get("/prompts/character")
async def get_character_prompts():
    """获取角色图提示词配置"""
    return prompt_service.get_character_prompts_config()


@router.put("/prompts/character")
async def update_character_prompts(data: dict[str, Any]):
    """更新角色图提示词配置"""
    if prompt_service.update_character_prompts(data):
        return {"success": True, "message": "角色图提示词配置已更新"}
    raise HTTPException(status_code=500, detail="更新失败")


@router.get("/prompts/scene")
async def get_scene_prompts():
    """获取场景图提示词配置"""
    return prompt_service.get_scene_prompts_config()


@router.put("/prompts/scene")
async def update_scene_prompts(data: dict[str, Any]):
    """更新场景图提示词配置"""
    if prompt_service.update_scene_prompts(data):
        return {"success": True, "message": "场景图提示词配置已更新"}
    raise HTTPException(status_code=500, detail="更新失败")


@router.get("/prompts/action")
async def get_action_prompts():
    """获取视频动作提示词配置"""
    return prompt_service.get_action_prompts_config()


@router.put("/prompts/action")
async def update_action_prompts(data: dict[str, Any]):
    """更新视频动作提示词配置"""
    if prompt_service.update_action_prompts(data):
        return {"success": True, "message": "视频动作提示词配置已更新"}
    raise HTTPException(status_code=500, detail="更新失败")


# ============ 分块配置 API ============

@router.get("/chunk")
async def get_chunk_config():
    """获取剧本分块配置"""
    return prompt_service.get_chunk_config()


@router.put("/chunk")
async def update_chunk_config(data: dict[str, Any]):
    """更新剧本分块配置"""
    if prompt_service.update_chunk_config(data):
        # 清除缓存使新配置生效
        prompt_service.clear_cache()
        return {"success": True, "message": "分块配置已更新"}
    raise HTTPException(status_code=500, detail="更新失败")


# ============ 工作流配置 API ============

@router.get("/workflows")
async def get_workflow_config():
    """获取工作流配置"""
    return prompt_service.get_workflow_config()


@router.put("/workflows")
async def update_workflow_config(data: dict[str, Any]):
    """更新工作流配置"""
    if prompt_service.update_workflow_config(data):
        return {"success": True, "message": "工作流配置已更新"}
    raise HTTPException(status_code=500, detail="更新失败")


@router.get("/workflows/{workflow_type}/default")
async def get_default_workflow(workflow_type: str):
    """获取指定类型的默认工作流"""
    if workflow_type not in ["character", "scene", "video"]:
        raise HTTPException(status_code=400, detail="无效的工作流类型")

    workflow = prompt_service.get_default_workflow(workflow_type)
    if not workflow:
        raise HTTPException(status_code=404, detail="未找到默认工作流")

    return workflow
