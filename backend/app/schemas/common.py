from pydantic import BaseModel


class LLMStatus(BaseModel):
    connected: bool
    type: str
    url: str


class ComfyUIStatus(BaseModel):
    connected: bool
    url: str


class ServiceStatus(BaseModel):
    llm: LLMStatus
    comfyui: ComfyUIStatus
    flux2_loaded: bool
    ltx2_loaded: bool


class HealthResponse(BaseModel):
    status: str
    services: ServiceStatus


class TaskResponse(BaseModel):
    task_id: str
    message: str = "Task started"


class AnalysisResponse(BaseModel):
    success: bool
    message: str
    data: dict | None = None
