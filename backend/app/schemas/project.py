from datetime import datetime
from pydantic import BaseModel
from app.models.project import ProjectStatus
from app.schemas.common import CamelModel


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: str | None = None
    summary: str | None = None
    status: ProjectStatus | None = None


class ProjectResponse(CamelModel):
    id: str
    name: str
    script_path: str | None = None
    script_text: str | None = None
    summary: str | None = None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(CamelModel):
    projects: list[ProjectResponse]
    total: int
