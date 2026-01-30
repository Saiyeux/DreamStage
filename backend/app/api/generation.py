import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_db
from app.core.logging_config import get_logger
from app.models import Project, ProjectStatus, Character, Scene
from app.schemas import TaskResponse, GenerateCharacterImagesRequest, GenerateCharacterLibraryRequest, GenerateSceneRequest, GenerateBulkRequest
from app.services.comfyui_client import comfyui_client
from app.services.generation_tasks import generation_tasks

router = APIRouter()
logger = get_logger(__name__)


# ============ 角色图生成 ============

@router.post("/{project_id}/generate/character-images", response_model=TaskResponse)
async def generate_character_images(
    project_id: str,
    request: GenerateCharacterImagesRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """为指定角色生成图像"""
    logger.info(f"角色图像生成请求: project={project_id}, character={request.character_id}, types={request.image_types}")
    
    result = await db.execute(
        select(Character).where(
            Character.id == request.character_id,
            Character.project_id == project_id,
        )
    )
    character = result.scalar_one_or_none()

    if not character:
        logger.warning(f"角色未找到: character_id={request.character_id}, project_id={project_id}")
        raise HTTPException(status_code=404, detail="Character not found")

    task_id = str(uuid.uuid4())
    logger.info(f"创建角色图像生成任务: task_id={task_id}, character={character.name}")

    # 后台执行生成任务
    background_tasks.add_task(
        generation_tasks.generate_character_images,
        task_id=task_id,
        character=character,
        image_types=request.image_types,
        workflow_id=request.workflow_id,
        params=request.params,
    )

    return TaskResponse(task_id=task_id, message="Character image generation started")


@router.post("/{project_id}/generate/character-library", response_model=TaskResponse)
async def generate_character_library(
    project_id: str,
    request: GenerateCharacterLibraryRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """批量生成所有角色图像"""
    logger.info(f"角色库生成请求: project={project_id}, image_types={request.image_types}")
    
    result = await db.execute(
        select(Character).where(Character.project_id == project_id)
    )
    characters = result.scalars().all()

    if not characters:
        logger.warning(f"项目无角色: project_id={project_id}")
        raise HTTPException(status_code=404, detail="No characters found")

    task_id = str(uuid.uuid4())
    logger.info(f"创建角色库生成任务: task_id={task_id}, characters={len(characters)}, types={request.image_types}")

    # 后台执行批量生成
    background_tasks.add_task(
        generation_tasks.generate_character_library,
        task_id=task_id,
        project_id=project_id,
        characters=list(characters),
        image_types=request.image_types,
        workflow_id=request.workflow_id,
        params=request.params,
    )

    # 更新项目状态
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if project:
        project.status = ProjectStatus.GENERATING
        await db.commit()
        logger.info(f"项目状态更新为GENERATING: project_id={project_id}")

    return TaskResponse(task_id=task_id, message="Character library generation started")


# ============ 场景图生成 ============

@router.post("/{project_id}/generate/scene-image", response_model=TaskResponse)
async def generate_scene_image(
    project_id: str,
    request: GenerateSceneRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """为指定场景生成图像"""
    result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.scene_image))
        .where(Scene.id == request.scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()

    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    task_id = str(uuid.uuid4())

    background_tasks.add_task(
        generation_tasks.generate_scene_image,
        task_id=task_id,
        scene=scene,
        workflow_id=request.workflow_id,
        params=request.params,
    )

    return TaskResponse(task_id=task_id, message="Scene image generation started")


@router.post("/{project_id}/generate/all-scene-images", response_model=TaskResponse)
async def generate_all_scene_images(
    project_id: str,
    request: GenerateBulkRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """批量生成所有场景图像"""
    result = await db.execute(
        select(Scene)
        .where(Scene.project_id == project_id)
        .order_by(Scene.scene_number)
    )
    scenes = result.scalars().all()

    if not scenes:
        raise HTTPException(status_code=404, detail="No scenes found")

    task_id = str(uuid.uuid4())

    background_tasks.add_task(
        generation_tasks.generate_all_scene_images,
        task_id=task_id,
        project_id=project_id,
        scenes=list(scenes),
        workflow_id=request.workflow_id,
        params=request.params,
    )

    return TaskResponse(task_id=task_id, message="Scene images generation started")


# ============ 视频生成 ============

@router.post("/{project_id}/generate/scene-video", response_model=TaskResponse)
async def generate_scene_video(
    project_id: str,
    request: GenerateSceneRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """为指定场景生成视频"""
    result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.scene_image), selectinload(Scene.video_clip))
        .where(Scene.id == request.scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()

    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    if not scene.scene_image:
        raise HTTPException(status_code=400, detail="Scene image must be generated first")

    task_id = str(uuid.uuid4())

    background_tasks.add_task(
        generation_tasks.generate_scene_video,
        task_id=task_id,
        scene=scene,
        workflow_id=request.workflow_id,
        params=request.params,
    )

    return TaskResponse(task_id=task_id, message="Scene video generation started")


@router.post("/{project_id}/generate/all-videos", response_model=TaskResponse)
async def generate_all_videos(
    project_id: str,
    request: GenerateBulkRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """批量生成所有场景视频"""
    result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.scene_image), selectinload(Scene.video_clip))
        .where(Scene.project_id == project_id)
        .order_by(Scene.scene_number)
    )
    scenes = result.scalars().all()

    # 过滤出有场景图的场景
    scenes_with_images = [s for s in scenes if s.scene_image]

    if not scenes_with_images:
        raise HTTPException(status_code=400, detail="No scenes with images found")

    task_id = str(uuid.uuid4())

    background_tasks.add_task(
        generation_tasks.generate_all_videos,
        task_id=task_id,
        project_id=project_id,
        scenes=scenes_with_images,
        workflow_id=request.workflow_id,
        params=request.params,
    )

    return TaskResponse(task_id=task_id, message="Video generation started")


# ============ 任务状态查询 ============

@router.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str):
    """获取任务状态"""
    status = generation_tasks.get_task_status(task_id)
    return status


@router.get("/{project_id}/tasks/active")
async def get_active_tasks(project_id: str):
    """获取项目中的活跃任务"""
    return generation_tasks.get_active_tasks_for_project(project_id)


@router.post("/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    """停止任务"""
    success = await generation_tasks.stop_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found or could not be stopped")
    return {"message": "Task stopped"}
