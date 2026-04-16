import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_db
from app.core.logging_config import get_logger
from app.models import Project, ProjectStatus, Character, Scene
from app.models.character import CharacterAudio
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


# ============ TTS 生成 ============

class TTSGenerateRequest(BaseModel):
    text: str
    ref_audio_id: str | None = None  # CharacterAudio id（参考音频）


@router.post("/{project_id}/characters/{character_id}/tts/generate", response_model=TaskResponse)
async def generate_character_tts(
    project_id: str,
    character_id: str,
    request: TTSGenerateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """为角色生成 TTS 语音片段"""
    # 验证角色
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.project_id == project_id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    # 查询参考音频
    ref_audio_path = None
    ref_audio_name = None
    if request.ref_audio_id:
        audio_result = await db.execute(
            select(CharacterAudio).where(
                CharacterAudio.id == request.ref_audio_id,
                CharacterAudio.character_id == character_id,
                CharacterAudio.audio_type == "reference",
            )
        )
        ref_audio = audio_result.scalar_one_or_none()
        if ref_audio:
            ref_audio_path = ref_audio.audio_path
            ref_audio_name = ref_audio.audio_name

    task_id = str(uuid.uuid4())
    background_tasks.add_task(
        generation_tasks.generate_character_tts,
        task_id=task_id,
        project_id=project_id,
        character_id=character_id,
        target_text=request.text,
        ref_audio_path=ref_audio_path,
        ref_audio_name=ref_audio_name,
    )

    return TaskResponse(task_id=task_id, message=f"TTS generation started")


# ============ Stage 关键帧合成 ============

class GenerateActVideoRequest(BaseModel):
    image_path: str          # relative path to keyframe or scene image
    narration_text: str
    workflow_id: str | None = None


@router.post("/{project_id}/acts/generate-video", response_model=TaskResponse)
async def generate_act_video(
    project_id: str,
    request: GenerateActVideoRequest,
    background_tasks: BackgroundTasks,
):
    """生成剧幕视频：TTS旁白 + 图生视频 + ffmpeg合并"""
    if not request.image_path:
        raise HTTPException(status_code=400, detail="image_path is required")
    if not request.narration_text.strip():
        raise HTTPException(status_code=400, detail="narration_text cannot be empty")

    task_id = str(uuid.uuid4())
    background_tasks.add_task(
        generation_tasks.generate_act_video,
        task_id=task_id,
        project_id=project_id,
        image_path=request.image_path,
        narration_text=request.narration_text,
        workflow_id=request.workflow_id,
    )
    return TaskResponse(task_id=task_id, message="Act video generation started")


class StageKeyframeRequest(BaseModel):
    scene_id: str
    character_ids: list[str]
    prompt: str


@router.post("/{project_id}/acts/generate-stage", response_model=TaskResponse)
async def generate_stage_keyframe(
    project_id: str,
    request: StageKeyframeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """合成 Stage 关键帧：场景背景 + 角色肖像"""
    # 获取场景图
    scene_result = await db.execute(
        select(Scene).options(selectinload(Scene.scene_image))
        .where(Scene.id == request.scene_id, Scene.project_id == project_id)
    )
    scene = scene_result.scalar_one_or_none()
    if not scene or not scene.scene_image:
        raise HTTPException(status_code=400, detail="Scene has no image")

    # 获取角色图
    char_image_paths: list[str] = []
    for char_id in request.character_ids[:2]:
        char_result = await db.execute(
            select(Character).options(selectinload(Character.images))
            .where(Character.id == char_id, Character.project_id == project_id)
        )
        char = char_result.scalar_one_or_none()
        if char:
            main_img = next((img for img in char.images if img.id == char.main_image_id), None) or (char.images[0] if char.images else None)
            if main_img:
                char_image_paths.append(main_img.image_path)

    if not char_image_paths:
        raise HTTPException(status_code=400, detail="No character images available")

    task_id = str(uuid.uuid4())
    background_tasks.add_task(
        generation_tasks.generate_stage_keyframe,
        task_id=task_id,
        project_id=project_id,
        scene_id=request.scene_id,
        scene_image_path=scene.scene_image.image_path,
        character_image_paths=char_image_paths,
        prompt=request.prompt,
        output_prefix=f"stage_{project_id[:8]}",
    )
    return TaskResponse(task_id=task_id, message="Stage keyframe generation started")
