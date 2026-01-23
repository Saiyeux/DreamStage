from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from sqlalchemy import String, Text, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.character import Character
    from app.models.scene import Scene


class ProjectStatus(str, Enum):
    DRAFT = "draft"
    ANALYZING = "analyzing"
    ANALYZED = "analyzed"
    GENERATING = "generating"
    COMPLETED = "completed"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    script_path: Mapped[str | None] = mapped_column(String(500))
    script_text: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProjectStatus] = mapped_column(
        SQLEnum(ProjectStatus), default=ProjectStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    characters: Mapped[list["Character"]] = relationship(
        "Character", back_populates="project", cascade="all, delete-orphan"
    )
    scenes: Mapped[list["Scene"]] = relationship(
        "Scene", back_populates="project", cascade="all, delete-orphan"
    )
