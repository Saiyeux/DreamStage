import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_db
from app.models import Project, ProjectStatus
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse
from app.services.script_parser import script_parser
from app.services.comfyui_client import comfyui_client

router = APIRouter()


@router.post("", response_model=ProjectResponse)
async def create_project(
    name: str = Form(...),
    script_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """创建新项目并上传剧本文件"""
    project_id = str(uuid.uuid4())

    # 创建项目目录
    project_dir = settings.DATA_DIR / "projects" / project_id
    project_dir.mkdir(parents=True, exist_ok=True)

    # 保存上传的文件
    file_ext = Path(script_file.filename).suffix.lower()
    if file_ext not in [".pdf", ".txt"]:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported")

    script_path = project_dir / f"script{file_ext}"
    content = await script_file.read()
    script_path.write_bytes(content)

    # 解析剧本文本
    script_text = await script_parser.parse(str(script_path))

    # 创建项目记录
    project = Project(
        id=project_id,
        name=name,
        script_path=str(script_path),
        script_text=script_text,
        status=ProjectStatus.DRAFT,
    )

    db.add(project)
    await db.commit()
    await db.refresh(project)

    return project


@router.get("", response_model=ProjectListResponse)
async def list_projects(db: AsyncSession = Depends(get_db)):
    """获取所有项目列表"""
    result = await db.execute(
        select(Project).order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()

    return ProjectListResponse(
        projects=[ProjectResponse.model_validate(p) for p in projects],
        total=len(projects),
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """获取项目详情"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    update_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新项目信息"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(project, key, value)

    await db.commit()
    await db.refresh(project)

    return project


@router.post("/{project_id}/stop")
async def stop_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """停止项目的所有正在运行的任务"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 停止 ComfyUI 任务
    stopped_count = await comfyui_client.stop_project_tasks(project_id)

    # 更新项目状态（如果在分析中或生成中）
    if project.status in [ProjectStatus.ANALYZING, ProjectStatus.GENERATING]:
        project.status = ProjectStatus.ANALYZED if project.characters else ProjectStatus.DRAFT
        await db.commit()

    return {"message": f"Stopped {stopped_count} tasks", "stopped": stopped_count}


@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """删除项目"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # 先停止所有正在运行的任务
    await comfyui_client.stop_project_tasks(project_id)

    # 删除项目目录
    project_dir = settings.DATA_DIR / "projects" / project_id
    if project_dir.exists():
        import shutil
        shutil.rmtree(project_dir)

    await db.delete(project)
    await db.commit()

    return {"message": "Project deleted"}
