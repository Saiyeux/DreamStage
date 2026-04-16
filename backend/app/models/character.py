from typing import TYPE_CHECKING
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.project import Project


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    gender: Mapped[str | None] = mapped_column(String(10))
    age: Mapped[str | None] = mapped_column(String(50))
    role_type: Mapped[str | None] = mapped_column(String(50))

    # 外貌特征
    hair: Mapped[str | None] = mapped_column(Text)
    face: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    skin: Mapped[str | None] = mapped_column(Text)

    personality: Mapped[str | None] = mapped_column(Text)
    clothing_style: Mapped[str | None] = mapped_column(Text)
    scene_numbers: Mapped[list[int] | None] = mapped_column(JSON, default=list)

    # 生成的 Prompt
    base_prompt: Mapped[str | None] = mapped_column(Text)

    # 主参考图 ID
    main_image_id: Mapped[str | None] = mapped_column(String(36))

    # 定角状态
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False)
    finalized_metadata: Mapped[dict | None] = mapped_column(JSON)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="characters")
    images: Mapped[list["CharacterImage"]] = relationship(
        "CharacterImage", back_populates="character", cascade="all, delete-orphan"
    )
    audios: Mapped[list["CharacterAudio"]] = relationship(
        "CharacterAudio", back_populates="character", cascade="all, delete-orphan"
    )


class CharacterImage(Base):
    __tablename__ = "character_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    character_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("characters.id"), nullable=False
    )
    image_type: Mapped[str] = mapped_column(String(50), nullable=False)
    image_path: Mapped[str] = mapped_column(String(500), nullable=False)
    prompt_used: Mapped[str | None] = mapped_column(Text)
    negative_prompt: Mapped[str | None] = mapped_column(Text)
    seed: Mapped[int | None] = mapped_column(Integer)
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    character: Mapped["Character"] = relationship("Character", back_populates="images")


class CharacterAudio(Base):
    __tablename__ = "character_audios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    character_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("characters.id"), nullable=False
    )
    audio_name: Mapped[str] = mapped_column(String(200), nullable=False)  # 原始文件名
    audio_path: Mapped[str] = mapped_column(String(500), nullable=False)  # 相对路径
    audio_type: Mapped[str] = mapped_column(String(20), default="reference")  # reference | generated
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    character: Mapped["Character"] = relationship("Character", back_populates="audios")
