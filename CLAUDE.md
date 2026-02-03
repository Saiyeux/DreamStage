# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述 (Project Overview)

AI Drama Studio（AI导演助手）- 一个将剧本转换为视觉故事板、角色设计和动态视频预览的AI视频制作助手。

## 常用命令 (Common Commands)

### 前端 (Frontend)
```bash
cd frontend
npm install          # 安装依赖
npm run dev          # 启动开发服务器 (http://localhost:5173)
npm run build        # TypeScript编译 + Vite生产构建
npm run lint         # ESLint代码检查
npm run preview      # 预览生产构建
```

### 后端 (Backend)
```bash
cd backend

# 环境设置
conda env create -f environment.yaml
conda activate ai-drama-studio
# 或手动: conda create -n ai-drama-studio python=3.11 && pip install -r requirements.txt

# 启动服务器
python -m uvicorn app.main:app --reload --port 8001

# 测试
python test_schema.py           # Pydantic schema验证测试
python test_generation_api.py   # 生成API端点测试
```

### 外部服务
```bash
ollama serve                    # LLM服务 (端口 11434)
# ComfyUI: python main.py --listen (端口 8000)
```

## 端口配置
| 服务 | 端口 |
|------|------|
| Frontend (Vite) | 5173 |
| Backend (FastAPI) | 8001 |
| Ollama | 11434 |
| LM Studio | 1234 |
| ComfyUI | 8000 |

## 架构概览 (Architecture)

### 技术栈
- **前端**: React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand (状态管理) + dnd-kit (拖拽)
- **后端**: Python 3.11 + FastAPI + SQLAlchemy 2.0 (async) + SQLite
- **AI服务**: Ollama/LM Studio (LLM) + ComfyUI (图像/视频生成)

### 前端结构 (`frontend/src/`)
```
api/          # API客户端模块 (使用fetch, 通过Vite代理到后端)
components/   # React UI组件
hooks/        # 自定义hooks (如 useLLMStream 处理SSE流)
pages/        # 页面组件
services/     # 业务逻辑服务
stores/       # Zustand状态管理 (projectStore, taskStore)
types/        # TypeScript类型定义
```

### 后端结构 (`backend/app/`)
```
api/          # FastAPI路由 (health, projects, analysis, generation, files, config)
core/         # 配置、日志、依赖注入
db/           # 数据库初始化和ORM设置
models/       # SQLAlchemy模型 (Project, Character, Scene, Beat)
schemas/      # Pydantic请求/响应模式
services/     # 业务服务 (LLMClient, ComfyUIClient, PromptService)
config/       # 配置文件和prompt模板 (JSON)
```

### 数据流
1. 前端通过 `/api` 代理与后端通信
2. 后端调用 Ollama/LM Studio 进行剧本分析 (SSE流式响应)
3. 后端调用 ComfyUI API 进行图像/视频生成 (WebSocket进度更新)
4. 生成的文件存储在 `data/projects/` 目录，通过 `/files` 静态服务访问

### API路由结构
- `GET /` - API元信息
- `/api/health` - 健康检查
- `/api/projects` - 项目CRUD
- `/api/projects/{id}/analysis` - 剧本分析 (LLM)
- `/api/projects/{id}/generation` - 图像/视频生成 (ComfyUI)
- `/api/files` - 文件上传
- `/api/config` - 配置管理
- `/files/{path}` - 静态文件服务

### ComfyUI工作流 (`comfyui_workflows/`)
- `character_portrait_flux2.json` - FLUX角色肖像生成
- `scene_generation_flux2.json` - FLUX场景生成
- `video_ltx2_i2v.json` - LTX-Video图生视频
- `video_ltx2_t2v.json` - LTX-Video文生视频

## 核心概念 (Core Concepts)

### 资产定角机制 (Asset Finalization)
- **定角/定景**: 用户选择满意的角色/场景图片后锁定，进入不可编辑状态
- **资产化**: 锁定后的资产可拖入剧幕工作台进行编排
- 相关字段: `is_finalized`, `finalized_images`

### 剧幕工作台 (Act Workbench)
- 资产驱动的拖拽编排界面
- 只有已定角/定景的资产才能进入工作台

## 环境变量 (`backend/.env`)
```
LLM_TYPE=ollama                 # 或 lmstudio
OLLAMA_URL=http://localhost:11434
LMSTUDIO_URL=http://localhost:1234
LLM_MODEL=qwen2.5:14b
COMFYUI_URL=http://localhost:8000
DATA_DIR=./data
DATABASE_URL=sqlite+aiosqlite:///./data/database.sqlite
HOST=0.0.0.0
PORT=8001
```

## 开发注意事项

### 前端
- 使用 `@/` 路径别名引用 `src/` 目录
- API请求通过 `frontend/src/api/client.ts` 的封装方法
- 状态管理使用Zustand stores
- TypeScript严格模式已启用

### 后端
- 全程使用async/await进行异步操作
- Pydantic模式支持snake_case/camelCase转换
- LLM prompt模板存储在 `app/config/prompts/` (JSON格式)
- 新增API路由需在 `app/api/__init__.py` 中注册
