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
    logger.info(f"Received generate_scene_image request: project_id={project_id}, scene_id={request.scene_id}, workflow_id={request.workflow_id}")
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
    logger.info(f"Received generate_scene_video request: project_id={project_id}, scene_id={request.scene_id}, workflow_id={request.workflow_id}")
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


    success = await generation_tasks.stop_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found or could not be stopped")
    return {"message": "Task stopped"}


@router.post("/{project_id}/sync-images")
async def sync_project_images(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    同步项目图片：检查本地是否存在，若不存在则尝试从 ComfyUI 下载恢复。
    用于解决 ComfyUI 重置后，前端无法显示旧图片的问题（前提是 ComfyUI 输出目录中仍有原图）。
    """
    logger.info(f"开始同步项目图片: project_id={project_id}")
    
    # 1. 获取所有关联的图片记录
    # 角色图
    char_images_result = await db.execute(
        select(CharacterImage)
        .join(Character)
        .where(Character.project_id == project_id)
    )
    char_images = char_images_result.scalars().all()
    
    # 场景图
    scene_images_result = await db.execute(
        select(SceneImage)
        .join(Scene)
        .where(Scene.project_id == project_id)
    )
    scene_images = scene_images_result.scalars().all()
    
    # 视频
    videos_result = await db.execute(
        select(VideoClip)
        .join(Scene)
        .where(Scene.project_id == project_id)
    )
    videos = videos_result.scalars().all()
    
    stats = {
        "total": len(char_images) + len(scene_images) + len(videos),
        "recovered": 0,
        "failed": 0,
        "skipped": 0,
    }
    
    async def process_item(item, path_attr):
        path = getattr(item, path_attr)
        if not path:
            return
            
        if await generation_tasks.recover_missing_file(path, project_id):
            stats["recovered"] += 1
        else:
            stats["failed"] += 1

    # 简单起见，这里串行处理，数量大时可改为并发
    for img in char_images:
        await process_item(img, "image_path")
        
    for img in scene_images:
        await process_item(img, "image_path")
        
    for vid in videos:
        await process_item(vid, "video_path")
        
    logger.info(f"同步完成: {stats}")
    return stats
