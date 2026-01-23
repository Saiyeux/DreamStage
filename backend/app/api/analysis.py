import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_db
from app.models import Project, ProjectStatus, Character, Scene
from app.schemas import (
    AnalysisResponse,
    CharacterResponse,
    CharacterUpdate,
    SceneResponse,
    SceneUpdate,
)
from app.services.llm_client import llm_client

router = APIRouter()


@router.post("/{project_id}/analyze/summary", response_model=AnalysisResponse)
async def analyze_summary(project_id: str, db: AsyncSession = Depends(get_db)):
    """生成剧情简介"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.script_text:
        raise HTTPException(status_code=400, detail="No script text available")

    # 调用 LLM 生成简介
    summary_data = await llm_client.analyze_summary(project.script_text)

    # 更新项目
    project.summary = summary_data.get("summary", "")
    await db.commit()

    return AnalysisResponse(
        success=True,
        message="Summary generated",
        data=summary_data,
    )


@router.post("/{project_id}/analyze/characters", response_model=AnalysisResponse)
async def analyze_characters(project_id: str, db: AsyncSession = Depends(get_db)):
    """分析角色信息"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.script_text:
        raise HTTPException(status_code=400, detail="No script text available")

    # 更新状态
    project.status = ProjectStatus.ANALYZING
    await db.commit()

    # 调用 LLM 分析角色
    characters_data = await llm_client.analyze_characters(project.script_text)

    # 删除旧角色数据
    await db.execute(
        select(Character).where(Character.project_id == project_id)
    )

    # 创建新角色记录
    for char_data in characters_data.get("characters", []):
        character = Character(
            id=str(uuid.uuid4()),
            project_id=project_id,
            name=char_data.get("name", ""),
            gender=char_data.get("gender"),
            age=char_data.get("age"),
            role_type=char_data.get("role_type"),
            hair=char_data.get("appearance", {}).get("hair"),
            face=char_data.get("appearance", {}).get("face"),
            body=char_data.get("appearance", {}).get("body"),
            skin=char_data.get("appearance", {}).get("skin"),
            personality=char_data.get("personality"),
            clothing_style=char_data.get("clothing_style"),
            scene_numbers=[],
        )
        db.add(character)

    await db.commit()

    return AnalysisResponse(
        success=True,
        message=f"Found {len(characters_data.get('characters', []))} characters",
        data=characters_data,
    )


@router.post("/{project_id}/analyze/scenes", response_model=AnalysisResponse)
async def analyze_scenes(project_id: str, db: AsyncSession = Depends(get_db)):
    """分析分镜信息"""
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.characters))
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.script_text:
        raise HTTPException(status_code=400, detail="No script text available")

    # 准备角色信息
    characters_info = [
        {"name": c.name, "role_type": c.role_type}
        for c in project.characters
    ]

    # 调用 LLM 分析分镜
    scenes_data = await llm_client.analyze_scenes(project.script_text, characters_info)

    # 创建场景记录
    for scene_data in scenes_data.get("scenes", []):
        scene = Scene(
            id=str(uuid.uuid4()),
            project_id=project_id,
            scene_number=scene_data.get("scene_number", 0),
            location=scene_data.get("location"),
            time_of_day=scene_data.get("time_of_day"),
            atmosphere=scene_data.get("atmosphere"),
            environment_desc=scene_data.get("environment", {}).get("description"),
            characters_data=scene_data.get("characters", []),
            dialogue=scene_data.get("dialogue"),
            shot_type=scene_data.get("camera", {}).get("shot_type"),
            camera_movement=scene_data.get("camera", {}).get("movement"),
            duration_seconds=scene_data.get("duration_seconds"),
        )
        db.add(scene)

    # 更新项目状态
    project.status = ProjectStatus.ANALYZED
    await db.commit()

    return AnalysisResponse(
        success=True,
        message=f"Found {len(scenes_data.get('scenes', []))} scenes",
        data=scenes_data,
    )


# ============ 角色管理 ============

@router.get("/{project_id}/characters", response_model=list[CharacterResponse])
async def list_characters(project_id: str, db: AsyncSession = Depends(get_db)):
    """获取项目所有角色"""
    result = await db.execute(
        select(Character)
        .options(selectinload(Character.images))
        .where(Character.project_id == project_id)
    )
    characters = result.scalars().all()
    return characters


@router.put("/{project_id}/characters/{character_id}", response_model=CharacterResponse)
async def update_character(
    project_id: str,
    character_id: str,
    update_data: CharacterUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新角色信息"""
    result = await db.execute(
        select(Character)
        .options(selectinload(Character.images))
        .where(Character.id == character_id, Character.project_id == project_id)
    )
    character = result.scalar_one_or_none()

    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(character, key, value)

    await db.commit()
    await db.refresh(character)

    return character


# ============ 分镜管理 ============

@router.get("/{project_id}/scenes", response_model=list[SceneResponse])
async def list_scenes(project_id: str, db: AsyncSession = Depends(get_db)):
    """获取项目所有场景"""
    result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.scene_image), selectinload(Scene.video_clip))
        .where(Scene.project_id == project_id)
        .order_by(Scene.scene_number)
    )
    scenes = result.scalars().all()
    return scenes


@router.put("/{project_id}/scenes/{scene_id}", response_model=SceneResponse)
async def update_scene(
    project_id: str,
    scene_id: str,
    update_data: SceneUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新场景信息"""
    result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.scene_image), selectinload(Scene.video_clip))
        .where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()

    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(scene, key, value)

    await db.commit()
    await db.refresh(scene)

    return scene
