from pydantic import BaseModel, Field
from app.schemas.common import CamelModel


class SceneCharacterData(CamelModel):
    character_id: str | None = None
    character_name: str
    position: str | None = None
    action: str | None = None
    expression: str | None = None


class SceneImageResponse(CamelModel):
    id: str
    scene_id: str
    image_path: str
    prompt_used: str | None = None
    seed: int | None = None
    is_approved: bool = False


class VideoClipResponse(CamelModel):
    id: str
    scene_id: str
    video_path: str
    duration: float | None = None
    fps: int | None = None
    resolution: str | None = None
    prompt_used: str | None = None
    seed: int | None = None
    is_approved: bool = False


class SceneResponse(CamelModel):
    id: str
    project_id: str
    scene_number: int
    location: str | None = None
    time_of_day: str | None = None
    atmosphere: str | None = None
    environment_desc: str | None = None
    # Allow list of strings or dicts/objects to handle mixed data
    characters_data: list[SceneCharacterData] | list[str] | list[dict] = Field(default=[], alias="characters")
    dialogue: str | None = None


    scene_prompt: str | None = None
    action_prompt: str | None = None
    stage_prompt: str | None = None
    narration: str | None = None
    scene_image: SceneImageResponse | None = None
    video_clip: VideoClipResponse | None = None
    is_finalized: bool = False
    finalized_metadata: dict | None = None


class SceneUpdate(BaseModel):
    location: str | None = None
    time_of_day: str | None = None
    atmosphere: str | None = None
    environment_desc: str | None = None
    characters_data: list[SceneCharacterData] | list[str] | list[dict] | None = None
    dialogue: str | None = None
    narration: str | None = None


    scene_prompt: str | None = None
    action_prompt: str | None = None


class SceneCreate(SceneUpdate):
    scene_number: int # Required

