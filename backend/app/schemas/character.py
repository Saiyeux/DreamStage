from pydantic import BaseModel
from app.schemas.common import CamelModel


class CharacterImageResponse(CamelModel):
    id: str
    character_id: str
    image_type: str
    image_path: str
    prompt_used: str | None = None
    seed: int | None = None
    is_selected: bool = False


class CharacterResponse(CamelModel):
    id: str
    project_id: str
    name: str
    gender: str | None = None
    age: str | None = None
    role_type: str | None = None
    hair: str | None = None
    face: str | None = None
    body: str | None = None
    skin: str | None = None
    personality: str | None = None
    clothing_style: str | None = None
    scene_numbers: list[int] = []
    base_prompt: str | None = None
    main_image_id: str | None = None
    images: list[CharacterImageResponse] = []


class CharacterUpdate(BaseModel):
    name: str | None = None
    gender: str | None = None
    age: str | None = None
    role_type: str | None = None
    hair: str | None = None
    face: str | None = None
    body: str | None = None
    skin: str | None = None
    personality: str | None = None
    clothing_style: str | None = None
    base_prompt: str | None = None
    main_image_id: str | None = None
