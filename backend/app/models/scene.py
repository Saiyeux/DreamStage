from typing import TYPE_CHECKING
from sqlalchemy import String, Text, Integer, Boolean, Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.project import Project


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False
    )
    scene_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # 场景基本信息
    location: Mapped[str | None] = mapped_column(String(255))
    time_of_day: Mapped[str | None] = mapped_column(String(50))
    atmosphere: Mapped[str | None] = mapped_column(String(100))
    environment_desc: Mapped[str | None] = mapped_column(Text)

    # 角色信息 (JSON)
    characters_data: Mapped[list[dict] | None] = mapped_column(JSON, default=list)
    dialogue: Mapped[str | None] = mapped_column(Text)

    # 镜头信息
    shot_type: Mapped[str | None] = mapped_column(String(50))
    camera_movement: Mapped[str | None] = mapped_column(String(100))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)

    # 生成的 Prompt
    scene_prompt: Mapped[str | None] = mapped_column(Text)
    action_prompt: Mapped[str | None] = mapped_column(Text)
    negative_prompt: Mapped[str | None] = mapped_column(Text)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="scenes")
    scene_image: Mapped["SceneImage | None"] = relationship(
        "SceneImage", back_populates="scene", uselist=False, cascade="all, delete-orphan"
    )
    video_clip: Mapped["VideoClip | None"] = relationship(
        "VideoClip", back_populates="scene", uselist=False, cascade="all, delete-orphan"
    )


class SceneCharacter:
    """场景角色数据结构 (非数据库表，用于 JSON 序列化)"""
    character_id: str
    character_name: str
    position: str
    action: str
    expression: str


class SceneImage(Base):
    __tablename__ = "scene_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scene_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scenes.id"), nullable=False
    )
    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    prompt_used: Mapped[str | None] = mapped_column(Text)
    seed: Mapped[int | None] = mapped_column(Integer)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    scene: Mapped["Scene"] = relationship("Scene", back_populates="scene_image")


class VideoClip(Base):
    __tablename__ = "video_clips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scene_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scenes.id"), nullable=False
    )
    video_path: Mapped[str] = mapped_column(String(500), nullable=False)
    duration: Mapped[float | None] = mapped_column(Float)
    fps: Mapped[int | None] = mapped_column(Integer)
    resolution: Mapped[str | None] = mapped_column(String(20))
    prompt_used: Mapped[str | None] = mapped_column(Text)
    seed: Mapped[int | None] = mapped_column(Integer)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    scene: Mapped["Scene"] = relationship("Scene", back_populates="video_clip")
