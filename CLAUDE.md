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
```

### 后端 (Backend)
```bash
cd backend

# 环境设置
conda env create -f environment.yaml
conda activate ai-drama-studio

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

### 数据流
1. 前端通过 `/api` 代理与后端通信（Vite代理配置：`/api`, `/ws`, `/files` → `localhost:8001`）
2. 后端调用 Ollama/LM Studio 进行剧本分析（SSE流式响应）
3. 后端调用 ComfyUI API 进行图像/视频生成，返回 `task_id`，前端**轮询**任务状态
4. 生成的文件存储在 `data/projects/` 目录，通过 `/files` 静态服务访问

### 生成任务状态追踪
- 任务状态存储在 `GenerationTasks._task_status`（内存字典，重启后丢失）
- 前端轮询 `GET /api/projects/tasks/{taskId}/status`
- 状态字段：`pending` → `running` → `completed` / `failed`

### SSE流式分析
- `frontend/src/services/analysisService.ts` 是单例 EventSource 管理器，独立于组件生命周期
- URL 模式：`/api/projects/{id}/analyze/{type}/stream?mode={quick|deep}`
- 消息类型：`start` | `chunk` | `item_generated` | `saved` | `parse_error` | `done` | `error`
- 剧本分块处理（默认4000字符/块）以适应LLM上下文限制

### 页面路由
- 单一主页面 `ScriptAnalysisPage`，通过URL query参数切换状态：
  - `?project={projectId}&tab={characters|scenes|act}`
- 无多页面路由，所有 `*` 路径都指向同一页面

## 核心概念 (Core Concepts)

### 资产定角机制 (Asset Finalization)
- **定角/定景**：用户锁定满意的角色/场景图片，`is_finalized=true` 后不可重新生成
- **资产化**：只有已定角/定景的资产才能拖入剧幕工作台
- 相关端点：`POST /projects/{id}/characters/{charId}/finalize` 和 `/unfinalize`

### 剧幕工作台 (Act Workbench)
- `ActContent.tsx` 使用 dnd-kit 实现拖拽，碰撞检测：`pointerWithin` → `rectIntersection`
- 台词行、场景关联、舞台角色均在此管理

## 关键模式 (Key Patterns)

### snake_case ↔ camelCase 自动转换
后端所有 Pydantic schema 继承 `CamelModel`（`app/schemas/common.py`），自动转换字段名。前端只使用 camelCase。

### 新增 API 路由流程
1. `backend/app/api/{module}.py` — 添加路由，用 `AsyncSession = Depends(get_db)` 和 `CamelModel` 返回
2. `backend/app/schemas/{module}.py` — 新建 Pydantic schema（继承 `CamelModel`）
3. `backend/app/api/__init__.py` — 注册路由 `router.include_router(...)`
4. `frontend/src/api/{module}.ts` — 添加前端 API 调用
5. `frontend/src/stores/projectStore.ts` — 更新 Zustand store 状态和 actions

### Zustand Store 更新模式
```typescript
// 不可变更新
updateCharacter: (id, updates) => set(state => ({
  characters: state.characters.map(c => c.id === id ? {...c, ...updates} : c)
}))

// SSE流追加终端输出
updateLastTerminalLine: (content) => // 修改 terminalOutput 数组末尾元素
```
Store 通过 `localStorage` 持久化关键状态（key: `"project-storage"`）。

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
- 无前端测试框架（无 Jest/Vitest）
- `LLMTerminal.tsx` 的 `LLMTerminalManual` 变体通过 `window.__llmTerminal` 暴露方法

### 后端
- 全程使用 async/await 进行异步操作
- LLM prompt 模板存储在 `app/config/prompts/`（JSON格式）
- `Scene` 模型中 `characters_data` 存储为 JSON 字段（非关联表）
- `Beat` 模型与 `Project` 是单向关系（无 `back_populates`）
