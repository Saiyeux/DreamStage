import uuid
import json
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_db
from app.core.logging_config import get_logger
from app.db.database import async_session_maker
from app.models import Project, ProjectStatus, Character, CharacterImage, Scene, SceneImage, VideoClip
from app.schemas import (
    AnalysisResponse,
    CharacterResponse,
    CharacterUpdate,
    SceneResponse,
    SceneUpdate,
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


def merge_characters(existing: list[dict], new_chars: list[dict]) -> list[dict]:
    """合并角色列表，根据名字去重"""
    char_dict = {c.get("name", ""): c for c in existing}
    for char in new_chars:
        name = char.get("name", "")
        if name and name not in char_dict:
            char_dict[name] = char
    return list(char_dict.values())


# SSE 流式分析端点
async def sse_generator(project_id: str, analysis_type: str, db: AsyncSession):
    """SSE 事件生成器 - 流式输出并在完成后保存数据，支持多块文本处理"""
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.characters))
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project or not project.script_text:
        yield f"data: {json.dumps({'type': 'error', 'message': 'Project or script not found'})}\n\n"
        return

    # 发送开始事件
    yield f"data: {json.dumps({'type': 'start', 'analysis_type': analysis_type})}\n\n"

    # 分割剧本为多个块（优先使用章节分块，回退到字符数分块）
    chunk_config = prompt_service.get_chunk_config()
    chunk_mode = chunk_config.get("chunk_mode", "chapter")

    if chunk_mode == "chapter":
        script_chunks = prompt_service.split_script_by_chapters(project.script_text)
        logger.info(f"项目 {project_id} - 使用章节分块模式")
    else:
        chunk_size = get_llm_chunk_size()
        script_chunks = split_script_into_chunks(project.script_text, chunk_size)
        logger.info(f"项目 {project_id} - 使用字符数分块模式，分块大小: {chunk_size}")

    total_chunks = len(script_chunks)

    # 调试：记录分块信息
    logger.info(f"项目 {project_id} - 剧本长度: {len(project.script_text)} 字符，总块数: {total_chunks}")
    for i, chunk in enumerate(script_chunks, 1):
        logger.debug(f"块 {i}/{total_chunks} 长度: {len(chunk)} 字符，前80字符: {chunk[:80].replace(chr(10), ' ')}")

    # 通知前端总块数
    yield f"data: {json.dumps({'type': 'info', 'total_chunks': total_chunks})}\n\n"

    # 角色信息（用于场景分析）
    characters_info = [
        {"name": c.name, "role_type": c.role_type}
        for c in project.characters
    ]
    characters_json = json.dumps(characters_info, ensure_ascii=False)

    # 收集所有块的结果
    all_characters = []
    all_scenes = []
    summary_data = {}

    try:
        for chunk_idx, script_chunk in enumerate(script_chunks, 1):
            # 通知当前处理的块
            yield f"data: {json.dumps({'type': 'chunk_start', 'chunk': chunk_idx, 'total': total_chunks})}\n\n"

            # 根据类型选择 prompt（使用配置文件中的提示词模板）
            if analysis_type == "summary":
                prompt = prompt_service.get_summary_prompt(script_chunk)
            elif analysis_type == "characters":
                existing_names = [c.get("name", "") for c in all_characters]
                prompt = prompt_service.get_characters_prompt(
                    script_text=script_chunk,
                    chunk_index=chunk_idx,
                    total_chunks=total_chunks,
                    existing_names=existing_names if existing_names else None,
                )
            elif analysis_type == "scenes":
                scene_start_num = len(all_scenes) + 1
                prompt = prompt_service.get_scenes_prompt(
                    script_text=script_chunk,
                    chunk_index=chunk_idx,
                    total_chunks=total_chunks,
                    characters_json=characters_json,
                    scene_start_num=scene_start_num,
                )
            else:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Unknown analysis type'})}\n\n"
                return

            # 处理当前块（包含 LLM 调用和解析，单独 try/except）
            try:
                # 流式输出 LLM 响应
                full_response = ""
                async for chunk in llm_client.chat_stream(prompt):
                    full_response += chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

                # 调试：记录LLM返回的完整内容
                logger.debug(f"块 {chunk_idx}/{total_chunks} - LLM返回内容长度: {len(full_response)} 字符")
                logger.debug(f"块 {chunk_idx}/{total_chunks} - LLM返回内容前500字符: {full_response[:500]}")

                # 解析当前块的结果
                json_match = re.search(r'```json\s*([\s\S]*?)\s*```', full_response)
                if json_match:
                    json_str = json_match.group(1)
                    logger.debug(f"块 {chunk_idx}/{total_chunks} - 从markdown代码块中提取JSON")
                else:
                    # 尝试直接查找 JSON 对象
                    json_match = re.search(r'(\{[\s\S]*\})', full_response)
                    json_str = json_match.group(1) if json_match else full_response
                    logger.debug(f"块 {chunk_idx}/{total_chunks} - 直接提取JSON对象，是否找到: {json_match is not None}")

                logger.debug(f"块 {chunk_idx}/{total_chunks} - 提取的JSON字符串前300字符: {json_str[:300]}")
                parsed_data = json.loads(json_str)
                logger.debug(f"块 {chunk_idx}/{total_chunks} - JSON解析成功，顶级keys: {list(parsed_data.keys())}")

                if analysis_type == "characters":
                    new_chars = parsed_data.get("characters", [])
                    all_characters = merge_characters(all_characters, new_chars)
                    yield f"data: {json.dumps({'type': 'chunk_done', 'chunk': chunk_idx, 'found': len(new_chars), 'total_found': len(all_characters)})}\n\n"
                elif analysis_type == "scenes":
                    new_scenes = parsed_data.get("scenes", [])
                    # 调试：输出每个块返回的场景信息
                    scene_numbers = [s.get("scene_number", "?") for s in new_scenes]
                    logger.debug(f"块 {chunk_idx}/{total_chunks} 返回 {len(new_scenes)} 个场景，编号: {scene_numbers}")
                    all_scenes.extend(new_scenes)
                    yield f"data: {json.dumps({'type': 'chunk_done', 'chunk': chunk_idx, 'found': len(new_scenes), 'total_found': len(all_scenes)})}\n\n"
                elif analysis_type == "summary":
                    summary_data = parsed_data
                    yield f"data: {json.dumps({'type': 'chunk_done', 'chunk': chunk_idx})}\n\n"
                    break  # 摘要只需要第一块

            except Exception as chunk_error:
                # 捕获 LLM 调用或 JSON 解析错误，但继续处理下一块
                logger.error(f"块 {chunk_idx}/{total_chunks} 处理失败: {str(chunk_error)}", exc_info=True)
                logger.error(f"块 {chunk_idx}/{total_chunks} 错误类型: {type(chunk_error).__name__}")

                # 尝试记录LLM响应内容（如果有）
                try:
                    if 'full_response' in locals():
                        logger.error(f"块 {chunk_idx}/{total_chunks} - 出错时的LLM响应内容: {full_response[:1000]}")
                except:
                    pass

                yield f"data: {json.dumps({'type': 'chunk_error', 'chunk': chunk_idx, 'message': str(chunk_error)})}\n\n"
                # 如果已有部分数据，保存并退出
                if all_characters or all_scenes or summary_data:
                    logger.info(f"块 {chunk_idx}/{total_chunks} 出错，但已有部分数据，准备保存")
                    yield f"data: {json.dumps({'type': 'partial_save', 'message': '部分数据将被保存'})}\n\n"
                    break
                logger.warning(f"块 {chunk_idx}/{total_chunks} 出错且无部分数据，继续下一块")
                continue

        # 保存所有数据到数据库
        saved_count = 0
        try:
            async with async_session_maker() as save_db:
                if analysis_type == "characters":
                    await save_db.execute(
                        delete(Character).where(Character.project_id == project_id)
                    )
                    for char_data in all_characters:
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
                        save_db.add(character)
                        saved_count += 1
                    await save_db.commit()

                elif analysis_type == "scenes":
                    # 检查是否有场景数据
                    if not all_scenes:
                        logger.warning(f"项目 {project_id} 未识别到任何场景")
                        yield f"data: {json.dumps({'type': 'error', 'message': '未识别到任何场景，请检查剧本格式或重新分析'})}\n\n"
                        return

                    # 调试：输出所有场景的原始编号
                    original_numbers = [s.get("scene_number", "?") for s in all_scenes]
                    logger.info(f"项目 {project_id} - 合并后共 {len(all_scenes)} 个场景")
                    logger.debug(f"原始编号列表: {original_numbers}")

                    await save_db.execute(
                        delete(Scene).where(Scene.project_id == project_id)
                    )

                    logger.info(f"开始保存 {len(all_scenes)} 个场景到数据库...")
                    for idx, scene_data in enumerate(all_scenes, 1):
                        # 调试：输出每个场景的编号映射
                        original_num = scene_data.get("scene_number", "?")
                        location = scene_data.get('location', 'N/A')
                        logger.debug(f"保存场景 {idx}/{len(all_scenes)}: 原编号 {original_num} -> 新编号 {idx}, 地点: {location}")

                        scene = Scene(
                            id=str(uuid.uuid4()),
                            project_id=project_id,
                            scene_number=idx,  # 重新编号确保连续
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
                        save_db.add(scene)
                        saved_count += 1

                    # 只有在成功保存场景后才更新项目状态
                    result = await save_db.execute(select(Project).where(Project.id == project_id))
                    project_to_update = result.scalar_one_or_none()
                    if project_to_update:
                        project_to_update.status = ProjectStatus.ANALYZED
                    await save_db.commit()
                    logger.info(f"项目 {project_id} - 成功保存 {saved_count} 个场景，状态已更新为 ANALYZED")

                elif analysis_type == "summary":
                    result = await save_db.execute(select(Project).where(Project.id == project_id))
                    project_to_update = result.scalar_one_or_none()
                    if project_to_update:
                        project_to_update.summary = summary_data.get("summary", "")
                    await save_db.commit()
                    saved_count = 1

            logger.info(f"分析完成 - 类型: {analysis_type}, 保存条目: {saved_count}")
            yield f"data: {json.dumps({'type': 'saved', 'count': saved_count})}\n\n"

        except (json.JSONDecodeError, Exception) as parse_error:
            logger.error(f"解析错误: {str(parse_error)}", exc_info=True)
            yield f"data: {json.dumps({'type': 'parse_error', 'message': str(parse_error)})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'saved_count': saved_count})}\n\n"
    except Exception as e:
        logger.error(f"分析过程出错: {str(e)}", exc_info=True)
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


@router.get("/{project_id}/analyze/{analysis_type}/stream")
async def analyze_stream(
    project_id: str,
    analysis_type: str,
    db: AsyncSession = Depends(get_db),
):
    """流式分析端点 (SSE)"""
    if analysis_type not in ["summary", "characters", "scenes"]:
        raise HTTPException(status_code=400, detail="Invalid analysis type")

    return StreamingResponse(
        sse_generator(project_id, analysis_type, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


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
    try:
        from app.api.files import get_comfyui_output_dir
        output_dir = get_comfyui_output_dir()
        file_path = output_dir / image.image_path
        if file_path.exists():
            file_path.unlink()
            logger.info(f"已删除物理文件: {file_path}")
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
        from app.api.files import get_comfyui_output_dir
        output_dir = get_comfyui_output_dir()
        file_path = output_dir / image.image_path
        if file_path.exists():
            file_path.unlink()
            logger.info(f"已删除物理文件: {file_path}")
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
        from app.api.files import get_comfyui_output_dir
        output_dir = get_comfyui_output_dir()
        file_path = output_dir / video.video_path
        if file_path.exists():
            file_path.unlink()
            logger.info(f"已删除物理文件: {file_path}")
    except Exception as e:
        logger.error(f"删除物理文件失败: {str(e)}")

    await db.delete(video)
    await db.commit()

    return {"success": True, "message": "Video clip deleted"}


