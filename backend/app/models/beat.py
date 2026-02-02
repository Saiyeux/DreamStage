from typing import TYPE_CHECKING
from sqlalchemy import String, Text, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.project import Project


class Beat(Base):
    __tablename__ = "beats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False
    )
    
    # 幕/场次信息
    scene_number: Mapped[int] = mapped_column(Integer, default=0)
    beat_type: Mapped[str] = mapped_column(String(50), default="action") # action / dialogue
    description: Mapped[str] = mapped_column(Text, nullable=True) # action description or dialogue content
    
    # 角色信息
    character_name: Mapped[str | None] = mapped_column(String(100))
    
    # 镜头信息 (JSON)
    camera: Mapped[dict | None] = mapped_column(JSON)
    
    # 其他
    duration: Mapped[int] = mapped_column(Integer, default=0)
    order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    project: Mapped["Project"] = relationship("Project") # No back_populates needed on project side for now unless we add it
