from pydantic import BaseModel, ConfigDict


def to_camel(string: str) -> str:
    """Convert snake_case to camelCase"""
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class CamelModel(BaseModel):
    """Base model with camelCase aliases for JSON serialization"""
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,  # 序列化时使用 camelCase
    )


class LLMStatus(CamelModel):
    connected: bool
    type: str
    url: str


class ComfyUIStatus(CamelModel):
    connected: bool
    url: str
    models: dict[str, list[str]] = {}  # 按类型分组的模型列表


class ServiceStatus(CamelModel):
    llm: LLMStatus
    comfyui: ComfyUIStatus


class HealthResponse(CamelModel):
    status: str
    services: ServiceStatus


class TaskResponse(CamelModel):
    task_id: str
    message: str = "Task started"


class AnalysisResponse(CamelModel):
    success: bool
    message: str
    data: dict | None = None
