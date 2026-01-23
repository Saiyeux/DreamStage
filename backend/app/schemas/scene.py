from pydantic import BaseModel


class SceneCharacterData(BaseModel):
    character_id: str
    character_name: str
    position: str
    action: str
    expression: str


class SceneImageResponse(BaseModel):
    id: str
    scene_id: str
    image_path: str
    prompt_used: str | None
    seed: int | None
    is_approved: bool

    class Config:
        from_attributes = True


class VideoClipResponse(BaseModel):
    id: str
    scene_id: str
    video_path: str
    duration: float | None
    fps: int | None
    resolution: str | None
    prompt_used: str | None
    seed: int | None
    is_approved: bool

    class Config:
        from_attributes = True


class SceneResponse(BaseModel):
    id: str
    project_id: str
    scene_number: int
    location: str | None
    time_of_day: str | None
    atmosphere: str | None
    environment_desc: str | None
    characters_data: list[SceneCharacterData]
    dialogue: str | None
    shot_type: str | None
    camera_movement: str | None
    duration_seconds: int | None
    scene_prompt: str | None
    action_prompt: str | None
    scene_image: SceneImageResponse | None
    video_clip: VideoClipResponse | None

    class Config:
        from_attributes = True


class SceneUpdate(BaseModel):
    location: str | None = None
    time_of_day: str | None = None
    atmosphere: str | None = None
    environment_desc: str | None = None
    characters_data: list[SceneCharacterData] | None = None
    dialogue: str | None = None
    shot_type: str | None = None
    camera_movement: str | None = None
    duration_seconds: int | None = None
    scene_prompt: str | None = None
    action_prompt: str | None = None
