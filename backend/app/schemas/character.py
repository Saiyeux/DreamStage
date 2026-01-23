from pydantic import BaseModel


class CharacterImageResponse(BaseModel):
    id: str
    character_id: str
    image_type: str
    image_path: str
    prompt_used: str | None
    seed: int | None
    is_selected: bool

    class Config:
        from_attributes = True


class CharacterResponse(BaseModel):
    id: str
    project_id: str
    name: str
    gender: str | None
    age: str | None
    role_type: str | None
    hair: str | None
    face: str | None
    body: str | None
    skin: str | None
    personality: str | None
    clothing_style: str | None
    scene_numbers: list[int]
    base_prompt: str | None
    main_image_id: str | None
    images: list[CharacterImageResponse]

    class Config:
        from_attributes = True


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
