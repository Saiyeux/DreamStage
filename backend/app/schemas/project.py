from datetime import datetime
from pydantic import BaseModel
from app.models.project import ProjectStatus


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: str | None = None
    summary: str | None = None
    status: ProjectStatus | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    script_path: str | None
    summary: str | None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int
