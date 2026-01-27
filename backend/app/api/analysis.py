import uuid
import json
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_db
from app.db.database import async_session_maker
from app.models import Project, ProjectStatus, Character, Scene
from app.schemas import (
    AnalysisResponse,
    CharacterResponse,
    CharacterUpdate,
    SceneResponse,
    SceneUpdate,
)
from app.services.llm_client import llm_client
from app.api.config import get_llm_chunk_size

router = APIRouter()


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

    # 分割剧本为多个块
    chunk_size = get_llm_chunk_size()
    script_chunks = split_script_into_chunks(project.script_text, chunk_size)
    total_chunks = len(script_chunks)

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

            # 根据类型选择 prompt
            if analysis_type == "summary":
                prompt = f"""你是一位专业的剧本分析师。请阅读以下剧本内容，生成一段简洁的剧情简介。

## 剧本内容
{script_chunk}

## 输出要求
请以JSON格式输出：
```json
{{
  "summary": "100-200字的剧情简介，包含主要人物和核心冲突",
  "main_conflict": "主要冲突点（一句话）",
  "tone": "故事基调（如：甜宠、虐恋、悬疑、喜剧等）",
  "estimated_duration_minutes": 预估时长（分钟，数字）
}}
```"""
            elif analysis_type == "characters":
                existing_names = [c.get("name", "") for c in all_characters]
                existing_hint = ""
                if existing_names:
                    existing_hint = f"\n\n## 已识别的角色（请勿重复）\n{', '.join(existing_names)}"
                prompt = f"""你是一位专业的剧本分析师和角色设计师。请从以下剧本片段中提取所有角色的详细信息。

## 剧本内容（第{chunk_idx}部分，共{total_chunks}部分）
{script_chunk}{existing_hint}

## 输出要求
请以JSON格式输出本片段中出现的所有角色（不要重复已识别的角色）：
```json
{{
  "characters": [
    {{
      "name": "角色姓名",
      "gender": "男/女",
      "age": "具体年龄或年龄段",
      "role_type": "主角/配角/龙套",
      "appearance": {{
        "hair": "发型和发色描述",
        "face": "脸型和五官特征",
        "body": "身材特征",
        "skin": "肤色"
      }},
      "personality": "性格特点",
      "clothing_style": "服装风格"
    }}
  ]
}}
```
如果本片段没有新角色，返回空数组。"""
            elif analysis_type == "scenes":
                scene_start_num = len(all_scenes) + 1
                prompt = f"""你是一位专业的分镜设计师。请根据以下剧本片段和角色信息，设计详细的分镜方案。

## 剧本内容（第{chunk_idx}部分，共{total_chunks}部分）
{script_chunk}

## 角色列表
{characters_json}

## 输出要求
请以JSON格式输出本片段的所有场景（场景序号从{scene_start_num}开始）：
```json
{{
  "scenes": [
    {{
      "scene_number": {scene_start_num},
      "location": "场景地点",
      "time_of_day": "时间（白天/黄昏/夜晚等）",
      "atmosphere": "氛围描述",
      "environment": {{
        "description": "环境详细描述"
      }},
      "characters": [
        {{
          "character_name": "角色名",
          "position": "位置",
          "action": "动作",
          "expression": "表情"
        }}
      ],
      "dialogue": "对白内容",
      "camera": {{
        "shot_type": "镜头类型（近景/中景/远景等）",
        "movement": "镜头运动（固定/推/拉/摇等）"
      }},
      "duration_seconds": 预估时长秒数
    }}
  ]
}}
```"""
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

                # 解析当前块的结果
                json_match = re.search(r'```json\s*([\s\S]*?)\s*```', full_response)
                if json_match:
                    json_str = json_match.group(1)
                else:
                    # 尝试直接查找 JSON 对象
                    json_match = re.search(r'(\{[\s\S]*\})', full_response)
                    json_str = json_match.group(1) if json_match else full_response
                parsed_data = json.loads(json_str)

                if analysis_type == "characters":
                    new_chars = parsed_data.get("characters", [])
                    all_characters = merge_characters(all_characters, new_chars)
                    yield f"data: {json.dumps({'type': 'chunk_done', 'chunk': chunk_idx, 'found': len(new_chars), 'total_found': len(all_characters)})}\n\n"
                elif analysis_type == "scenes":
                    new_scenes = parsed_data.get("scenes", [])
                    # 调试：输出每个块返回的场景信息
                    scene_numbers = [s.get("scene_number", "?") for s in new_scenes]
                    print(f"[DEBUG] 块 {chunk_idx} 返回 {len(new_scenes)} 个场景，编号: {scene_numbers}")
                    all_scenes.extend(new_scenes)
                    yield f"data: {json.dumps({'type': 'chunk_done', 'chunk': chunk_idx, 'found': len(new_scenes), 'total_found': len(all_scenes)})}\n\n"
                elif analysis_type == "summary":
                    summary_data = parsed_data
                    yield f"data: {json.dumps({'type': 'chunk_done', 'chunk': chunk_idx})}\n\n"
                    break  # 摘要只需要第一块

            except Exception as chunk_error:
                # 捕获 LLM 调用或 JSON 解析错误，但继续处理下一块
                yield f"data: {json.dumps({'type': 'chunk_error', 'chunk': chunk_idx, 'message': str(chunk_error)})}\n\n"
                # 如果已有部分数据，保存并退出
                if all_characters or all_scenes or summary_data:
                    yield f"data: {json.dumps({'type': 'partial_save', 'message': '部分数据将被保存'})}\n\n"
                    break
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
                        yield f"data: {json.dumps({'type': 'error', 'message': '未识别到任何场景，请检查剧本格式或重新分析'})}\n\n"
                        return

                    # 调试：输出所有场景的原始编号
                    original_numbers = [s.get("scene_number", "?") for s in all_scenes]
                    print(f"[DEBUG] 合并后共 {len(all_scenes)} 个场景")
                    print(f"[DEBUG] 原始编号: {original_numbers}")

                    await save_db.execute(
                        delete(Scene).where(Scene.project_id == project_id)
                    )
                    for idx, scene_data in enumerate(all_scenes, 1):
                        # 调试：输出每个场景的编号映射
                        original_num = scene_data.get("scene_number", "?")
                        print(f"[DEBUG] 保存场景: 原编号 {original_num} -> 新编号 {idx}, 地点: {scene_data.get('location', 'N/A')}")

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

                elif analysis_type == "summary":
                    result = await save_db.execute(select(Project).where(Project.id == project_id))
                    project_to_update = result.scalar_one_or_none()
                    if project_to_update:
                        project_to_update.summary = summary_data.get("summary", "")
                    await save_db.commit()
                    saved_count = 1

            yield f"data: {json.dumps({'type': 'saved', 'count': saved_count})}\n\n"

        except (json.JSONDecodeError, Exception) as parse_error:
            yield f"data: {json.dumps({'type': 'parse_error', 'message': str(parse_error)})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'saved_count': saved_count})}\n\n"
    except Exception as e:
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
