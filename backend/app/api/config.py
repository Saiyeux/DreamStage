import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

CONFIG_DIR = Path(__file__).parent.parent / "config"


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
