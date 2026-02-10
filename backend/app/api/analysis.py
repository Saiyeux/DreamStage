import uuid
import json
import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_db
from app.core.config import settings
from app.core.logging_config import get_logger
from app.db.database import async_session_maker
from app.models import Project, ProjectStatus, Character, CharacterImage, Scene, SceneImage, VideoClip, Beat
from app.schemas import (
    AnalysisResponse,
    CharacterResponse,
    CharacterUpdate,
    CharacterCreate,
    SceneResponse,
    SceneUpdate,
    SceneCreate,
    AssetFinalizeRequest,
)
from app.services.llm_client import llm_client
from app.services.prompt_service import prompt_service
from app.api.config import get_llm_chunk_size

router = APIRouter()
logger = get_logger(__name__)


def split_script_into_chunks(script_text: str, chunk_size: int) -> list[str]:
    """将剧本文本分割成多个块，尽量在段落边界处分割"""
    if len(script_text) <= chunk_size:
        return [script_text]

    chunks = []
    start = 0
    while start < len(script_text):
        end = start + chunk_size
        if end >= len(script_text):
            chunks.append(script_text[start:])
            break

        # 尝试在段落边界处分割（向前查找换行符）
        split_pos = script_text.rfind('\n\n', start, end)
        if split_pos == -1 or split_pos <= start:
            split_pos = script_text.rfind('\n', start, end)
        if split_pos == -1 or split_pos <= start:
            split_pos = end

        chunks.append(script_text[start:split_pos])
        start = split_pos
        # 跳过换行符
        while start < len(script_text) and script_text[start] in '\n':
            start += 1

    return chunks


def merge_characters(existing: list[dict], new_chars: list[dict], mode: str = "quick") -> list[dict]:
    """合并角色列表，根据名字去重
    
    Quick mode: 只填充未知字段，保留已有信息
    Deep mode: 每次找到角色都更新所有字段
    """
    char_dict = {c.get("name", ""): c for c in existing}
    
    def is_unknown(value):
        """判断值是否为未知/空"""
        if value is None:
            return True
        if isinstance(value, str):
            return value.strip() in ("", "未知", "Unknown", "unknown")
        if isinstance(value, dict):
            return all(is_unknown(v) for v in value.values())
        return False
    
    def merge_dict_quick(old: dict, new: dict) -> dict:
        """Quick模式：只用新值填充旧的未知值"""
        result = old.copy()
        for key, new_val in new.items():
            old_val = result.get(key)
            if isinstance(old_val, dict) and isinstance(new_val, dict):
                result[key] = merge_dict_quick(old_val, new_val)
            elif is_unknown(old_val) and not is_unknown(new_val):
                result[key] = new_val
        return result
    
    def merge_dict_deep(old: dict, new: dict) -> dict:
        """Deep模式：用新值覆盖所有非未知的旧值"""
        result = old.copy()
        for key, new_val in new.items():
            if isinstance(new_val, dict) and isinstance(result.get(key), dict):
                result[key] = merge_dict_deep(result[key], new_val)
            elif not is_unknown(new_val):
                result[key] = new_val
        return result
    
    for char in new_chars:
        name = char.get("name", "")
        if not name:
            continue
        if name in char_dict:
            if mode == "quick":
                # Quick: only fill unknown fields
                char_dict[name] = merge_dict_quick(char_dict[name], char)
            else:
                # Deep: update all fields with new values
                char_dict[name] = merge_dict_deep(char_dict[name], char)
        else:
            char_dict[name] = char
    
    return list(char_dict.values())


import asyncio
from typing import Dict, List, Optional

# ... imports ...


class AnalysisTask:
    def __init__(self, project_id: str, analysis_type: str, mode: str = "deep"):
        self.project_id = project_id
        self.analysis_type = analysis_type
        self.mode = mode  # "quick" or "deep"
        self.status = "init"  # init, running, completed, failed
        self.events: List[str] = []
        self.new_event_event = asyncio.Event()
        self.task: Optional[asyncio.Task] = None
        self.error: Optional[str] = None
        self.cancelled = False
        
    def cancel(self):
        self.cancelled = True
        self.status = "cancelled"
        # Wake up subscribers so they can finish
        self.new_event_event.set()

    async def add_event(self, data: str):
        self.events.append(data)
        self.new_event_event.set()
        # Allow subscribers to wake up
        await asyncio.sleep(0)
        self.new_event_event.clear()

    async def run(self):
        self.status = "running"
        try:
            # Use a fresh session for the entire background task
            async with async_session_maker() as db:
                result = await db.execute(
                    select(Project)
                    .options(selectinload(Project.characters))
                    .where(Project.id == self.project_id)
                )
                project = result.scalar_one_or_none()

                if not project or not project.script_text:
                    await self.add_event(f"data: {json.dumps({'type': 'error', 'message': 'Project or script not found'})}\n\n")
                    self.status = "failed"
                    return

                # Send start event
                await self.add_event(f"data: {json.dumps({'type': 'start', 'analysis_type': self.analysis_type})}\n\n")

                # Split script
                if self.analysis_type == "scenes":
                    script_chunks = prompt_service.split_script_by_scenes(project.script_text)
                    logger.info(f"Project {self.project_id} - Scene Analysis: Using scene header split")
                elif self.analysis_type == "acts":
                    # For acts analysis, use act-based splitting
                    act_data = prompt_service.split_script_by_acts(project.script_text)
                    script_chunks = [act["script_content"] for act in act_data]
                    # Store act metadata for later use
                    self._act_metadata = act_data
                    logger.info(f"Project {self.project_id} - Act Analysis: Found {len(act_data)} acts")
                else:
                    chunk_config = prompt_service.get_chunk_config()
                    chunk_mode = chunk_config.get("chunk_mode", "chapter")
                    if chunk_mode == "chapter":
                        script_chunks = prompt_service.split_script_by_chapters(project.script_text)
                    else:
                        chunk_size = get_llm_chunk_size()
                        script_chunks = split_script_into_chunks(project.script_text, chunk_size)

                total_chunks = len(script_chunks)
                await self.add_event(f"data: {json.dumps({'type': 'info', 'total_chunks': total_chunks})}\n\n")

                # Character info for scene analysis
                characters_info = [
                    {"name": c.name, "role_type": c.role_type}
                    for c in project.characters
                ]
                characters_json = json.dumps(characters_info, ensure_ascii=False)

                all_characters = []
                all_scenes = []
                all_beats = []
                summary_data = {}

                from app.utils.streaming_parser import StreamingJSONParser

                for chunk_idx, script_chunk in enumerate(script_chunks, 1):
                    if self.cancelled:
                        logger.info(f"Task {self.project_id} cancelled")
                        await self.add_event(f"data: {json.dumps({'type': 'error', 'message': 'Analysis cancelled by user'})}\n\n")
                        return

                    await self.add_event(f"data: {json.dumps({'type': 'chunk_start', 'chunk': chunk_idx, 'total': total_chunks})}\n\n")

                    # Select prompt
                    if self.analysis_type == "summary":
                        prompt = prompt_service.get_summary_prompt(script_chunk)
                    elif self.analysis_type == "characters":
                        existing_names = [c.get("name", "") for c in all_characters]
                        prompt = prompt_service.get_characters_prompt(
                            script_text=script_chunk,
                            chunk_index=chunk_idx,
                            total_chunks=total_chunks,
                            existing_names=existing_names if existing_names else None,
                            mode=self.mode,
                        )
                    elif self.analysis_type == "scenes":
                        scene_start_num = len(all_scenes) + 1
                        prompt = prompt_service.get_scenes_prompt(
                            script_text=script_chunk,
                            chunk_index=chunk_idx,
                            total_chunks=total_chunks,
                            characters_json=characters_json,
                            scene_start_num=scene_start_num,
                        )
                    elif self.analysis_type == "acts":
                         prompt = prompt_service.get_acts_prompt(
                            script_text=script_chunk,
                            chunk_index=chunk_idx,
                            total_chunks=total_chunks,
                        )
                    else:
                        return

                    # LLM Call with Streaming Parser
                    parser = StreamingJSONParser()
                    
                    try:
                        async for chunk in llm_client.chat_stream(prompt):
                            if self.cancelled:
                                break

                            # Echo raw chunk if needed for debugging or terminal
                            await self.add_event(f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n")
                            
                            # Feed parser
                            for item in parser.feed(chunk):
                                # Process individual item
                                item_with_id = item.copy()
                                item_with_id["id"] = str(uuid.uuid4()) # Generate ID early for frontend
                                
                                # Add type-specific handling
                                if self.analysis_type == "characters":
                                    # Basic validation/enrichment
                                    if "name" in item:
                                        # Emit item event
                                        await self.add_event(f"data: {json.dumps({'type': 'item_generated', 'item': item_with_id})}\n\n")
                                        all_characters = merge_characters(all_characters, [item], mode=self.mode)
                                
                                elif self.analysis_type == "scenes":
                                    if "location" in item:
                                        # Enrich with script content if it's the first scene of chunk?
                                        # Or just pass it. For now simple.
                                        item["script_content"] = script_chunk # Attach chunk text to scenes found in it
                                        
                                        # Update scene number globally
                                        item["scene_number"] = len(all_scenes) + 1
                                        item_with_id["scene_number"] = item["scene_number"]
                                        
                                        await self.add_event(f"data: {json.dumps({'type': 'item_generated', 'item': item_with_id})}\n\n")
                                        all_scenes.append(item)

                                elif self.analysis_type == "acts":
                                    if "action" in item:
                                         # Track which chunk/act this beat belongs to
                                         item["_chunk_idx"] = chunk_idx
                                         await self.add_event(f"data: {json.dumps({'type': 'item_generated', 'item': item_with_id})}\n\n")
                                         all_beats.append(item)
                                         
                                elif self.analysis_type == "summary":
                                    # Summary usually returns one object, or string?
                                    # Parser expects objects. If it's a string, parser might fail unless we adjust prompt to return JSON.
                                    # Assuming JSON based on parser logic.
                                    summary_data = item
                                    await self.add_event(f"data: {json.dumps({'type': 'item_generated', 'item': item})}\n\n")

                        # End of stream for this chunk
                        
                        # Send chunk done event
                        count = 0
                        if self.analysis_type == "characters": count = len(all_characters)
                        elif self.analysis_type == "scenes": count = len(all_scenes)
                        elif self.analysis_type == "acts": count = len(all_beats)
                        
                        await self.add_event(f"data: {json.dumps({'type': 'chunk_done', 'chunk': chunk_idx, 'total_found': count})}\n\n")

                    except Exception as chunk_error:
                        logger.error(f"Chunk error: {chunk_error}", exc_info=True)
                        await self.add_event(f"data: {json.dumps({'type': 'chunk_error', 'chunk': chunk_idx, 'message': str(chunk_error)})}\n\n")

                # Save ALL data (Final Persistence)
                saved_count = 0
                
                if self.analysis_type == "characters":
                    await db.execute(delete(Character).where(Character.project_id == self.project_id))
                    for char_data in all_characters:
                        character = Character(
                            id=str(uuid.uuid4()),
                            project_id=self.project_id,
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
                        saved_count += 1
                    await db.commit()
                
                elif self.analysis_type == "scenes":
                    if not all_scenes:
                         await self.add_event(f"data: {json.dumps({'type': 'error', 'message': 'No scenes found'})}\n\n")
                         return

                    await db.execute(delete(Scene).where(Scene.project_id == self.project_id))
                    for idx, scene_data in enumerate(all_scenes, 1):
                        scene = Scene(
                            id=str(uuid.uuid4()),
                            project_id=self.project_id,
                            scene_number=idx,
                            location=scene_data.get("location"),
                            time_of_day=scene_data.get("time_of_day"),
                            atmosphere=scene_data.get("atmosphere"),
                            environment_desc=scene_data.get("environment", {}).get("description"),
                            characters_data=scene_data.get("characters", []),
                            dialogue=scene_data.get("dialogue"),
                            duration_seconds=scene_data.get("duration_seconds"),
                            script_content=scene_data.get("script_content"),
                        )
                        db.add(scene)
                        saved_count += 1
                    
                    # Update project status
                    proj_update = await db.execute(select(Project).where(Project.id == self.project_id))
                    project = proj_update.scalar_one()
                    project.status = ProjectStatus.ANALYZED
                    await db.commit()

                elif self.analysis_type == "acts":
                    if not all_beats:
                         await self.add_event(f"data: {json.dumps({'type': 'error', 'message': 'No beats found'})}\n\n")
                         return

                    await db.execute(delete(Beat).where(Beat.project_id == self.project_id))
                    
                    for idx, beat_data in enumerate(all_beats, 1):
                        beat = Beat(
                            id=str(uuid.uuid4()),
                            project_id=self.project_id,
                            scene_number=beat_data.get("scene_number", 0), # Assuming scene info passed or inferred
                            beat_type=beat_data.get("type", "action"),
                            description=beat_data.get("action") or beat_data.get("dialogue") or "",
                            character_name=beat_data.get("characterName"),
                            camera=beat_data.get("camera"),
                            order=idx
                        )
                        db.add(beat)
                        saved_count += 1
                    
                    await db.commit()
                    if p := proj_update.scalar_one_or_none():
                        p.status = ProjectStatus.ANALYZED
                    await db.commit()



                await self.add_event(f"data: {json.dumps({'type': 'saved', 'count': saved_count})}\n\n")
                await self.add_event(f"data: {json.dumps({'type': 'done', 'saved_count': saved_count})}\n\n")
                self.status = "completed"

        except Exception as e:
            logger.error(f"Task failed: {e}", exc_info=True)
            self.error = str(e)
            self.status = "failed"
            await self.add_event(f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n")

ANALYSIS_TASKS: Dict[str, AnalysisTask] = {}

async def sse_generator(project_id: str, analysis_type: str, db: AsyncSession, mode: str = "deep"):
    task_key = f"{project_id}_{analysis_type}_{mode}"
    
    # Check for existing task
    if task_key not in ANALYSIS_TASKS or ANALYSIS_TASKS[task_key].status in ["completed", "failed", "cancelled"]:
        # Start new task
        task = AnalysisTask(project_id, analysis_type, mode=mode)
        ANALYSIS_TASKS[task_key] = task
        # Run in background
        asyncio.create_task(task.run())
    
    task = ANALYSIS_TASKS[task_key]
    
    # Send history first
    for event in task.events:
        yield event
        
    # Stream new events
    last_event_index = len(task.events)
    
    while task.status == "running" or last_event_index < len(task.events):
        if last_event_index < len(task.events):
            yield task.events[last_event_index]
            last_event_index += 1
        else:
            try:
                await asyncio.wait_for(task.new_event_event.wait(), timeout=1.0)
                task.new_event_event.clear()
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"

    # Cleanup if done? Maybe keep for a bit?
    # For now keep it so user can see 'done' message if they come late.


@router.get("/{project_id}/analyze/{analysis_type}/stream")
async def analyze_stream(
    project_id: str,
    analysis_type: str,
    mode: str = "deep",
    db: AsyncSession = Depends(get_db),
):
    """流式分析 (持久化任务版)
    
    Args:
        mode: 'quick' for fast shallow analysis, 'deep' for detailed analysis
    """
    if analysis_type not in ["summary", "characters", "scenes", "acts"]:
        raise HTTPException(status_code=400, detail="Invalid analysis type")
    if mode not in ["quick", "deep"]:
        mode = "deep"

    return StreamingResponse(
        sse_generator(project_id, analysis_type, db, mode=mode),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no", # Nginx no buffering
        },
    )


@router.get("/{project_id}/analysis/status")
async def get_analysis_status(project_id: str):
    """获取当前项目的分析状态"""
    # Check memory for active tasks
    for key, task in ANALYSIS_TASKS.items():
        if task.project_id == project_id and task.status in ["init", "running"]:
             return {
                 "status": "running",
                 "analysis_type": task.analysis_type,
                 "progress": f"{len(task.events)} events" 
             }
    
    return {"status": "idle", "analysis_type": None}


@router.post("/{project_id}/analysis/stop")
async def stop_analysis(project_id: str):
    """停止项目的当前分析任务"""
    stopped_any = False
    for key, task in ANALYSIS_TASKS.items():
        if task.project_id == project_id and task.status in ["init", "running"]:
            logger.info(f"Stopping analysis task for project {project_id}")
            task.cancel()
            stopped_any = True
            
    if not stopped_any:
        return {"message": "No active analysis task found"}
        
    return {"message": "Analysis stopped"}


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

    # 结果修正
    if isinstance(summary_data, str):
        summary_text = summary_data
    elif isinstance(summary_data, dict):
        summary_text = summary_data.get("summary", "")
    elif isinstance(summary_data, list) and len(summary_data) > 0:
        first = summary_data[0]
        summary_text = first.get("summary", str(first)) if isinstance(first, dict) else str(first)
    else:
        summary_text = ""

    # 更新项目
    project.summary = summary_text
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

    # 更新状态为分析中
    project.status = ProjectStatus.ANALYZING
    await db.commit()

    try:
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

        # 分析完成，恢复状态为草稿
        project.status = ProjectStatus.DRAFT
        await db.commit()

        return AnalysisResponse(
            success=True,
            message=f"Found {len(characters_data.get('characters', []))} characters",
            data=characters_data,
        )
    except Exception as e:
        # 发生错误，恢复状态
        project.status = ProjectStatus.DRAFT
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))


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
            # Merge visual style into description if present
            environment_desc=(
                f"{scene_data.get('environment', {}).get('description', '')}\n\n[Visual Style]: {scene_data.get('environment', {}).get('visual_style', '')}"
                if scene_data.get("environment", {}).get("visual_style")
                else scene_data.get("environment", {}).get("description")
            ),
            characters_data=scene_data.get("characters", []),
            dialogue=scene_data.get("dialogue"),

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


@router.post("/{project_id}/characters", response_model=CharacterResponse)
async def create_character(
    project_id: str,
    character_data: CharacterCreate,
    db: AsyncSession = Depends(get_db),
):
    """手动创建角色"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    character = Character(
        id=str(uuid.uuid4()),
        project_id=project_id,
        **character_data.model_dump(exclude_unset=True)
    )

    db.add(character)
    await db.commit()
    await db.refresh(character)

    return character


@router.delete("/{project_id}/characters/{character_id}")
async def delete_character(
    project_id: str,
    character_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除角色"""
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.project_id == project_id)
    )
    character = result.scalar_one_or_none()

    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    await db.delete(character)
    await db.commit()

    return {"success": True, "message": "Character deleted"}



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


@router.post("/{project_id}/characters/{character_id}/finalize")
async def finalize_character(
    project_id: str,
    character_id: str,
    request: AssetFinalizeRequest,
    db: AsyncSession = Depends(get_db),
):
    """定角：锁定角色并保存快照"""
    result = await db.execute(
        select(Character)
        .options(selectinload(Character.images))
        .where(Character.id == character_id, Character.project_id == project_id)
    )
    character = result.scalar_one_or_none()

    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # 创建快照
    snapshot = {
        "name": character.name,
        "age": character.age,
        "role_type": character.role_type,
        "gender": character.gender,
        "appearance": {
            "hair": character.hair,
            "face": character.face,
            "body": character.body,
            "skin": character.skin,
            "clothing_style": character.clothing_style,
        },
        "personality": character.personality,
        "base_prompt": character.base_prompt,
        "selected_image_ids": request.image_ids,
        "main_image_id": request.main_image_id or (request.image_ids[0] if request.image_ids else None)
    }

    character.is_finalized = True
    character.finalized_metadata = snapshot
    
    # 更新主图
    if request.main_image_id:
        character.main_image_id = request.main_image_id
    elif request.image_ids:
        character.main_image_id = request.image_ids[0]

    await db.commit()
    return {"success": True}


@router.post("/{project_id}/characters/{character_id}/unfinalize")
async def unfinalize_character(
    project_id: str,
    character_id: str,
    db: AsyncSession = Depends(get_db),
):
    """解除定角"""
    result = await db.execute(
        select(Character).where(Character.id == character_id, Character.project_id == project_id)
    )
    character = result.scalar_one_or_none()

    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    character.is_finalized = False
    character.finalized_metadata = None
    await db.commit()
    return {"success": True}


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


@router.post("/{project_id}/scenes", response_model=SceneResponse)
async def create_scene(
    project_id: str,
    scene_data: SceneCreate,
    db: AsyncSession = Depends(get_db),
):
    """手动创建场景"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    scene = Scene(
        id=str(uuid.uuid4()),
        project_id=project_id,
        **scene_data.model_dump(exclude_unset=True)
    )

    db.add(scene)
    await db.commit()
    await db.refresh(scene)

    return scene


@router.delete("/{project_id}/scenes/{scene_id}")
async def delete_scene(
    project_id: str,
    scene_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除场景"""
    result = await db.execute(
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()

    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    await db.delete(scene)
    await db.commit()

    return {"success": True, "message": "Scene deleted"}



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


@router.post("/{project_id}/scenes/{scene_id}/finalize")
async def finalize_scene(
    project_id: str,
    scene_id: str,
    request: AssetFinalizeRequest,
    db: AsyncSession = Depends(get_db),
):
    """定景：锁定场景并保存快照"""
    result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.scene_image))
        .where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()

    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    # 创建快照
    snapshot = {
        "scene_number": scene.scene_number,
        "location": scene.location,
        "time_of_day": scene.time_of_day,
        "atmosphere": scene.atmosphere,
    }
    scene.finalized_metadata = snapshot
    scene.is_finalized = True

    await db.commit()
    await db.refresh(scene)

    return {"success": True}


# ============ Beats Management ============

@router.get("/{project_id}/beats", response_model=list[dict])
async def list_beats(project_id: str, db: AsyncSession = Depends(get_db)):
    """获取项目所有Beats"""
    result = await db.execute(
        select(Beat)
        .where(Beat.project_id == project_id)
        .order_by(Beat.id) # Or order by scene_number/order
    )
    beats = result.scalars().all()
    # Manual conversion to dict/response model if needed, or rely on FastAPI
    # Simple dict return for now matching Frontend expectations
    return beats



@router.post("/{project_id}/scenes/{scene_id}/unfinalize")
async def unfinalize_scene(
    project_id: str,
    scene_id: str,
    db: AsyncSession = Depends(get_db),
):
    """解除定景"""
    result = await db.execute(
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()

    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    scene.is_finalized = False
    scene.finalized_metadata = None
    await db.commit()
    return {"success": True}
# ============ 图像管理 ============

@router.delete("/{project_id}/characters/images/{image_id}")
async def delete_character_image(
    project_id: str,
    image_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除角色图像"""
    # 验证权限并获取图片
    result = await db.execute(
        select(CharacterImage)
        .join(Character)
        .where(
            CharacterImage.id == image_id,
            Character.project_id == project_id
        )
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # 1. 从磁盘删除文件 (可选，建议做)
    # 1. 从磁盘删除文件
    try:
        # 文件存储在 projects/{project_id}/{filename}
        project_dir = settings.DATA_DIR / "projects" / project_id
        file_path = project_dir / Path(image.image_path).name
        if file_path.exists():
            file_path.unlink()
            logger.info(f"已删除物理文件: {file_path}")
        else:
            logger.warning(f"文件不存在，跳过删除: {file_path}")
    except Exception as e:
        logger.error(f"删除物理文件失败: {str(e)}")
        # 继续删除数据库记录，即使文件删除失败

    # 2. 从数据库删除
    await db.delete(image)
    await db.commit()

    return {"success": True, "message": "Image deleted"}

@router.delete("/{project_id}/scenes/images/{image_id}")
async def delete_scene_image(
    project_id: str,
    image_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除场景图像"""
    result = await db.execute(
        select(SceneImage)
        .join(Scene)
        .where(
            SceneImage.id == image_id,
            Scene.project_id == project_id
        )
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        project_dir = settings.DATA_DIR / "projects" / project_id
        file_path = project_dir / Path(image.image_path).name
        if file_path.exists():
            file_path.unlink()
            logger.info(f"已删除物理文件: {file_path}")
        else:
            logger.warning(f"文件不存在，跳过删除: {file_path}")
    except Exception as e:
        logger.error(f"删除物理文件失败: {str(e)}")

    await db.delete(image)
    await db.commit()

    return {"success": True, "message": "Scene image deleted"}

@router.delete("/{project_id}/scenes/videos/{video_id}")
async def delete_video_clip(
    project_id: str,
    video_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除场景视频"""
    result = await db.execute(
        select(VideoClip)
        .join(Scene)
        .where(
            VideoClip.id == video_id,
            Scene.project_id == project_id
        )
    )
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        project_dir = settings.DATA_DIR / "projects" / project_id
        file_path = project_dir / Path(video.video_path).name
        if file_path.exists():
            file_path.unlink()
            logger.info(f"已删除物理文件: {file_path}")
        else:
            logger.warning(f"文件不存在，跳过删除: {file_path}")
    except Exception as e:
        logger.error(f"删除物理文件失败: {str(e)}")

    await db.delete(video)
    await db.commit()

    return {"success": True, "message": "Video clip deleted"}


