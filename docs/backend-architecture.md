# AI Drama Studio 后端架构文档

> 生成日期: 2026-02-12
> 版本: 基于当前 main 分支 (commit 2f5ae9c)

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [数据流全景图](#2-数据流全景图)
3. [应用入口与初始化](#3-应用入口与初始化)
4. [核心配置层 (core/)](#4-核心配置层-core)
5. [数据库层 (db/)](#5-数据库层-db)
6. [数据模型层 (models/)](#6-数据模型层-models)
7. [请求/响应模式层 (schemas/)](#7-请求响应模式层-schemas)
8. [API路由层 (api/)](#8-api路由层-api)
9. [业务服务层 (services/)](#9-业务服务层-services)
10. [工具层 (utils/)](#10-工具层-utils)
11. [配置文件层 (config/)](#11-配置文件层-config)
12. [数据库迁移脚本](#12-数据库迁移脚本)
13. [核心业务流程详解](#13-核心业务流程详解)
14. [设计模式与约定](#14-设计模式与约定)

---

## 1. 整体架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│                      http://localhost:5173                       │
└────────────────────────────┬────────────────────────────────────┘
                             │  Vite Proxy /api → :8001
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Application (:8001)                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ API路由层 │→│ Schemas层 │→│ Services层 │→│   外部服务     │  │
│  │ (Routes) │  │(Pydantic) │  │(业务逻辑)  │  │ Ollama/ComfyUI│  │
│  └────┬─────┘  └──────────┘  └─────┬─────┘  └───────────────┘  │
│       │                            │                             │
│  ┌────▼─────────────────────────────▼────┐                      │
│  │          Models层 (SQLAlchemy)         │                      │
│  └────────────────┬──────────────────────┘                      │
│                   │                                              │
│  ┌────────────────▼──────────────────────┐                      │
│  │          Database层 (SQLite)           │                      │
│  └───────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                ┌──────────────────┐
│  Ollama/LM Studio│                │     ComfyUI      │
│   LLM服务(:11434)│                │  图像/视频(:8000) │
└─────────────────┘                └──────────────────┘
```

### 技术栈

| 组件 | 技术 | 版本要求 |
|------|------|----------|
| Web框架 | FastAPI | >= 0.115.0 |
| ASGI服务器 | Uvicorn | >= 0.32.0 |
| ORM | SQLAlchemy (async) | >= 2.0.0 |
| 数据库 | SQLite + aiosqlite | >= 0.20.0 |
| 数据验证 | Pydantic | >= 2.9.0 |
| HTTP客户端 | aiohttp + httpx | >= 3.10.0 / >= 0.27.0 |
| WebSocket | websockets | >= 13.0 |
| PDF解析 | pypdf | >= 4.0.0 |
| 环境变量 | python-dotenv | >= 1.0.0 |

### 目录结构

```
backend/
├── app/
│   ├── main.py                    # 应用入口
│   ├── api/                       # API路由
│   │   ├── __init__.py            # 路由注册
│   │   ├── health.py              # 健康检查
│   │   ├── projects.py            # 项目CRUD + 角色/场景管理
│   │   ├── analysis.py            # 剧本分析 (SSE流式)
│   │   ├── generation.py          # 图像/视频生成
│   │   ├── files.py               # 文件访问
│   │   └── config.py              # 配置管理
│   ├── core/
│   │   ├── config.py              # Settings配置类
│   │   ├── logging_config.py      # 日志配置
│   │   └── dependencies.py        # FastAPI依赖注入
│   ├── db/
│   │   └── database.py            # 数据库引擎与会话
│   ├── models/
│   │   ├── __init__.py            # 模型导出
│   │   ├── base.py                # 基类 + 公共字段
│   │   ├── project.py             # Project模型
│   │   ├── character.py           # Character + CharacterImage
│   │   ├── scene.py               # Scene + SceneImage + VideoClip
│   │   └── beat.py                # Beat模型
│   ├── schemas/
│   │   ├── common.py              # 基础Schema + 公共请求/响应
│   │   ├── project.py             # 项目Schema
│   │   ├── character.py           # 角色Schema
│   │   └── scene.py               # 场景Schema
│   ├── services/
│   │   ├── llm_client.py          # LLM客户端 (Ollama/LM Studio)
│   │   ├── comfyui_client.py      # ComfyUI客户端
│   │   ├── prompt_service.py      # Prompt模板管理
│   │   ├── script_parser.py       # 剧本解析 (PDF/TXT)
│   │   └── generation_tasks.py    # 生成任务管理
│   ├── config/
│   │   ├── character_image_templates.json
│   │   ├── workflow_config.json
│   │   └── prompts/
│   │       ├── text/              # 文本分析Prompt模板
│   │       ├── img/               # 图像生成Prompt模板
│   │       └── video/             # 视频生成Prompt模板
│   └── utils/
│       └── streaming_parser.py    # JSON流式解析器
├── data/                          # 运行时数据
│   ├── database.sqlite            # SQLite数据库
│   └── projects/{project_id}/     # 项目文件
├── logs/                          # 日志文件
├── .env                           # 环境变量
├── requirements.txt               # Python依赖
├── environment.yaml               # Conda环境定义
├── migrate_v2.py                  # 数据库迁移: 资产定角
├── migrate_script_content.py      # 数据库迁移: 场景剧本内容
├── migrate_act_analysis.py        # 数据库迁移: 幕分析
├── test_schema.py                 # Schema单元测试
├── test_generation_api.py         # 生成API集成测试
└── check_schema.py                # 数据库Schema检查工具
```

---

## 2. 数据流全景图

### 2.1 完整业务流程

```
用户上传剧本 ──→ 创建项目 ──→ 剧本分析 ──→ 图像生成 ──→ 视频生成 ──→ 资产定角 ──→ 剧幕编排
    │                │            │             │             │            │           │
    │                │            │             │             │            │           │
    ▼                ▼            ▼             ▼             ▼            ▼           ▼
  PDF/TXT      Project记录   Summary     Character    Scene Videos   Lock资产    Act工作台
  解析          + 目录创建   Characters   Images       生成          is_finalized  拖拽编排
                              Scenes     Scene Images
                              Acts
```

### 2.2 请求处理流程

```
HTTP Request
    │
    ▼
┌──────────┐    ┌───────────┐    ┌────────────┐    ┌──────────┐
│  FastAPI  │───→│  Pydantic │───→│  API Route │───→│ Service  │
│  Router   │    │  Schema   │    │  Handler   │    │  Layer   │
│           │    │  验证      │    │  业务调度   │    │  业务实现 │
└──────────┘    └───────────┘    └────────────┘    └────┬─────┘
                                                        │
                                      ┌─────────────────┼─────────────────┐
                                      ▼                 ▼                 ▼
                                ┌──────────┐    ┌────────────┐    ┌────────────┐
                                │ Database │    │   Ollama/   │    │  ComfyUI   │
                                │ (SQLite) │    │  LM Studio  │    │  (图像/视频)│
                                └──────────┘    └────────────┘    └────────────┘
```

### 2.3 流式分析数据流

```
Frontend (SSE EventSource)
    │
    │  GET /api/projects/{id}/analyze/{type}/stream
    ▼
┌──────────────┐
│ AnalysisTask │ ← 后台协程
│   .run()     │
└──────┬───────┘
       │
       │  1. 加载剧本文本
       │  2. 按配置分块 (split_script_by_acts / _split_by_size)
       ▼
┌──────────────┐
│ LLMClient    │
│ .chat_stream │ ← 逐chunk发送给LLM
└──────┬───────┘
       │  SSE chunks 实时返回
       ▼
┌──────────────────┐
│StreamingJSONParser│ ← 从流式文本中增量提取JSON对象
│    .feed()       │
└──────┬───────────┘
       │  解析出的item (角色/场景/幕)
       ▼
┌──────────────┐
│ 去重 + 合并  │ ← merge_characters / 重编号
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  持久化到DB  │ ← SQLAlchemy async session
└──────────────┘
```

### 2.4 图像/视频生成数据流

```
Frontend (轮询 task status)
    │
    │  POST /api/projects/{id}/generate/character-library
    ▼
┌──────────────┐
│ generation.py│ ← 创建 task_id, 启动后台任务
│  API Route   │
└──────┬───────┘
       │  BackgroundTask
       ▼
┌──────────────────┐
│ GenerationTasks  │
│ .generate_*()    │
└──────┬───────────┘
       │
       │  1. 从DB加载角色/场景数据
       │  2. 构建prompt (PromptService)
       │  3. 加载workflow模板
       ▼
┌──────────────────┐
│ ComfyUIClient    │
│ .generate_image()│
│ .generate_video()│
└──────┬───────────┘
       │
       │  1. load_workflow()     ← 加载JSON工作流
       │  2. update_workflow_params() ← 替换参数
       │  3. queue_prompt()      ← 提交到ComfyUI队列
       │  4. wait_for_completion() ← 轮询等待完成
       │  5. get_image_content() ← 下载生成文件
       ▼
┌──────────────────┐
│ 保存文件 + 更新DB │
│ data/projects/   │
│   {project_id}/  │
│     {filename}   │
└──────────────────┘
```

---

## 3. 应用入口与初始化

### `app/main.py` — FastAPI 应用入口

```python
# 职责: 创建FastAPI应用实例, 配置中间件, 注册路由, 管理生命周期
```

| 组件 | 说明 |
|------|------|
| `lifespan(app)` | 异步上下文管理器，启动时初始化数据库 (`init_db()`)，确保 `data/projects/` 目录存在 |
| `app = FastAPI(...)` | 应用实例，配置标题、版本、描述 |
| `CORSMiddleware` | 允许所有来源跨域 (`allow_origins=["*"]`) |
| `app.include_router(api_router, prefix="/api")` | 注册所有 API 路由，统一 `/api` 前缀 |
| `StaticFiles("/files")` | 静态文件服务，指向 `data/projects/` 目录 |
| `GET /` | 根路由，返回 API 元信息 (名称、版本、文档链接) |

**启动命令:**
```bash
python -m uvicorn app.main:app --reload --port 8001
```

**初始化流程:**
```
应用启动
  │
  ├─→ lifespan() 触发
  │     ├─→ init_db(): 创建所有数据库表
  │     └─→ os.makedirs("data/projects/"): 确保数据目录
  │
  ├─→ 注册 CORS 中间件
  ├─→ 挂载 /api 路由
  ├─→ 挂载 /files 静态文件服务
  └─→ 注册 / 根路由
```

---

## 4. 核心配置层 (core/)

### `app/core/config.py` — 应用配置

**类: `Settings(BaseSettings)`**

使用 `pydantic-settings` 管理环境变量，支持 `.env` 文件自动加载。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `LLM_TYPE` | str | `"ollama"` | LLM服务类型: `ollama` 或 `lmstudio` |
| `OLLAMA_URL` | str | `"http://localhost:11434"` | Ollama API地址 |
| `LMSTUDIO_URL` | str | `"http://localhost:1234"` | LM Studio API地址 |
| `LLM_MODEL` | str | `"qwen2.5:14b"` | 使用的LLM模型名 |
| `LLM_TIMEOUT` | float | `300.0` | LLM请求超时(秒) |
| `COMFYUI_URL` | str | `"http://localhost:8000"` | ComfyUI服务地址 |
| `COMFYUI_PATH` | str | `""` | ComfyUI本地安装路径 |
| `DATA_DIR` | str | `"./data"` | 数据存储目录 |
| `DATABASE_URL` | str | `"sqlite+aiosqlite:///..."` | 数据库连接串 |
| `HOST` | str | `"0.0.0.0"` | 服务器主机 |
| `PORT` | int | `8001` | 服务器端口 |

**全局单例:** `settings = Settings()`

---

### `app/core/logging_config.py` — 日志配置

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `setup_logging()` | 无 | `logging.Logger` | 配置日志格式和处理器 |

**日志配置:**
- **控制台**: INFO级别，简化格式
- **文件 `logs/error.log`**: ERROR级别，包含时间戳
- **文件 `logs/debug.log`**: DEBUG级别，完整信息

---

### `app/core/dependencies.py` — 依赖注入

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_db()` | 无 | `AsyncGenerator[AsyncSession]` | FastAPI依赖项，提供数据库会话，请求结束自动关闭 |

**使用方式:**
```python
@router.get("/...")
async def endpoint(db: AsyncSession = Depends(get_db)):
    ...
```

---

## 5. 数据库层 (db/)

### `app/db/database.py` — 数据库引擎与会话

| 组件 | 说明 |
|------|------|
| `engine` | `create_async_engine(DATABASE_URL)` — 异步SQLite引擎 |
| `async_session_maker` | `async_sessionmaker(engine)` — 会话工厂，`expire_on_commit=False` |
| `async init_db()` | 创建所有表 (`Base.metadata.create_all`) |
| `async get_session()` | 异步生成器，产出数据库会话 |

**连接池说明:** SQLite使用单文件，aiosqlite提供异步包装。

---

## 6. 数据模型层 (models/)

### `app/models/base.py` — 基类

| 组件 | 说明 |
|------|------|
| `Base` | SQLAlchemy `DeclarativeBase`，所有模型的基类 |
| `TimestampMixin` | Mixin类，提供 `created_at` 和 `updated_at` 自动时间戳字段 |

---

### `app/models/project.py` — 项目模型

**表名:** `projects`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String(36) | 主键 (UUID) |
| `name` | String(255) | 项目名称 |
| `script_path` | String(500) | 剧本文件路径 (可选) |
| `script_text` | Text | 剧本全文 |
| `summary` | Text | AI生成的剧情摘要 |
| `act_analysis` | JSON | 幕级分析结果 |
| `status` | String(50) | 项目状态 |
| `created_at` | DateTime | 创建时间 (自动) |
| `updated_at` | DateTime | 更新时间 (自动) |

**状态枚举值:** `draft` → `analyzing` → `analyzed` → `generating` → `completed`

**关联关系:**
| 关系 | 目标 | 类型 | 级联 |
|------|------|------|------|
| `characters` | Character | 一对多 | cascade delete-orphan |
| `scenes` | Scene | 一对多 | cascade delete-orphan |
| `beats` | Beat | 一对多 | cascade delete-orphan |

---

### `app/models/character.py` — 角色模型

**表名:** `characters`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String(36) | 主键 (UUID) |
| `project_id` | String(36) | 外键 → projects |
| `name` | String(100) | 角色名 |
| `english_name` | String(100) | 英文名 (用于prompt) |
| `gender` | String(20) | 性别 |
| `age` | String(50) | 年龄描述 |
| `role_type` | String(50) | 角色类型 (主角/配角) |
| `personality` | Text | 性格描述 |
| `appearance` | Text | 外貌特征 |
| `hair` | String(200) | 发型描述 |
| `face` | String(200) | 面部特征 |
| `body` | String(200) | 体型描述 |
| `skin` | String(100) | 肤色 |
| `clothing_style` | Text | 服装风格 |
| `character_prompt` | Text | 完整角色prompt |
| `negative_prompt` | Text | 负面prompt |
| `is_finalized` | Boolean | 是否已定角 |
| `finalized_metadata` | JSON | 定角时的快照数据 |

**关联关系:**
| 关系 | 目标 | 类型 | 级联 |
|------|------|------|------|
| `images` | CharacterImage | 一对多 | cascade delete-orphan |

---

**表名:** `character_images`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String(36) | 主键 |
| `character_id` | String(36) | 外键 → characters |
| `image_type` | String(50) | 图片类型 (front/side/back等) |
| `image_path` | String(500) | 文件路径 |
| `prompt_used` | Text | 使用的prompt |
| `seed` | Integer | 随机种子 |
| `is_selected` | Boolean | 是否被选中 |

---

### `app/models/scene.py` — 场景模型

**表名:** `scenes`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String(36) | 主键 |
| `project_id` | String(36) | 外键 → projects |
| `scene_number` | Integer | 场景序号 |
| `title` | String(255) | 场景标题 |
| `location` | String(255) | 场景地点 |
| `time_of_day` | String(50) | 时间段 (day/night等) |
| `atmosphere` | String(100) | 氛围/情绪 |
| `environment_desc` | Text | 环境视觉描述 |
| `characters_data` | JSON | 场景中的角色列表 |
| `dialogue` | Text | 对白/旁白 |
| `script_content` | Text | 对应的原始剧本文本 |
| `is_finalized` | Boolean | 是否已定景 |
| `finalized_metadata` | JSON | 定景快照数据 |
| `scene_prompt` | Text | 场景生成prompt |
| `action_prompt` | Text | 视频动作prompt |
| `negative_prompt` | Text | 负面prompt |

**关联关系:**
| 关系 | 目标 | 类型 | 级联 |
|------|------|------|------|
| `scene_image` | SceneImage | 一对一 | cascade delete |
| `video_clip` | VideoClip | 一对一 | cascade delete |

**数据类: `SceneCharacter`** (非DB，JSON嵌入 `characters_data`)
- `character_id`, `character_name`, `position`, `action`, `expression`

---

**表名:** `scene_images`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String(36) | 主键 |
| `scene_id` | String(36) | 外键 → scenes |
| `image_path` | String(500) | 图片路径 |
| `prompt_used` | Text | 使用的prompt |
| `seed` | Integer | 随机种子 |
| `is_approved` | Boolean | 是否通过审核 |

---

**表名:** `video_clips`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String(36) | 主键 |
| `scene_id` | String(36) | 外键 → scenes |
| `video_path` | String(500) | 视频路径 |
| `duration` | Float | 时长(秒) |
| `fps` | Integer | 帧率 |
| `resolution` | String(20) | 分辨率 (如 768x1344) |
| `prompt_used` | Text | 动作prompt |
| `seed` | Integer | 随机种子 |
| `is_approved` | Boolean | 是否通过审核 |

---

### `app/models/beat.py` — 拍/节奏模型

**表名:** `beats`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String(36) | 主键 |
| `project_id` | String(36) | 外键 → projects |
| `scene_number` | Integer | 所属场景编号 |
| `beat_type` | String(50) | 类型: `action` / `dialogue` |
| `description` | Text | 动作或对白内容 |
| `character_name` | String(100) | 发言/表演角色 |
| `camera` | JSON | 镜头运动信息 |
| `duration` | Integer | 时长(秒) |
| `order` | Integer | 在场景内的排序 |

---

### ER关系图

```
┌──────────┐       ┌────────────────┐       ┌──────────────────┐
│ projects │──1:N──│  characters    │──1:N──│ character_images  │
│          │       │                │       │                   │
│ id       │       │ id             │       │ id                │
│ name     │       │ project_id  FK │       │ character_id  FK  │
│ script.. │       │ name           │       │ image_type        │
│ summary  │       │ appearance..   │       │ image_path        │
│ status   │       │ is_finalized   │       │ seed              │
│ act_ana..│       │ finalized_meta │       │ is_selected       │
└──────────┘       └────────────────┘       └──────────────────┘
     │
     │──1:N──┌──────────┐──1:1──┌───────────────┐
     │       │  scenes  │       │ scene_images   │
     │       │          │       │                │
     │       │ id       │       │ id             │
     │       │ proj_id  │       │ scene_id    FK │
     │       │ scene_no │       │ image_path     │
     │       │ title    │       │ prompt_used    │
     │       │ location │       └───────────────┘
     │       │ is_final │
     │       │          │──1:1──┌───────────────┐
     │       │          │       │ video_clips    │
     │       └──────────┘       │                │
     │                          │ id             │
     │                          │ scene_id    FK │
     │                          │ video_path     │
     │                          │ duration       │
     │                          └───────────────┘
     │
     └──1:N──┌──────────┐
             │  beats   │
             │          │
             │ id       │
             │ proj_id  │
             │ scene_no │
             │ beat_type│
             │ order    │
             └──────────┘
```

---

## 7. 请求/响应模式层 (schemas/)

### `app/schemas/common.py` — 基础模式

| 组件 | 说明 |
|------|------|
| `to_camel(string: str) → str` | 工具函数: `snake_case` → `camelCase` 转换 |
| **`CamelModel(BaseModel)`** | 所有响应Schema的基类 |

**CamelModel 配置:**
```python
model_config = ConfigDict(
    alias_generator=to_camel,      # 自动生成camelCase别名
    populate_by_name=True,         # 支持snake_case和camelCase输入
    serialize_by_alias=True,       # 输出时使用camelCase
)
```

**公共Schema:**

| Schema | 字段 | 用途 |
|--------|------|------|
| `LLMStatus` | connected, type, url | LLM连接状态 |
| `ComfyUIStatus` | connected, url, models | ComfyUI连接状态 |
| `ServiceStatus` | llm, comfyui | 服务状态聚合 |
| `HealthResponse` | status, services | 健康检查响应 |
| `TaskResponse` | task_id, message | 异步任务创建响应 |
| `AnalysisResponse` | success, message, data | 分析结果响应 |
| `GenerateCharacterImagesRequest` | character_id, image_types, workflow_id, params | 单角色生成请求 |
| `GenerateCharacterLibraryRequest` | image_types, workflow_id, params | 全角色库生成请求 |
| `GenerateSceneRequest` | scene_id, workflow_id, params | 场景生成请求 |
| `GenerateSceneImageRequest` | scene_id, workflow_id, params | 场景图片生成请求 |
| `GenerateSceneVideoRequest` | scene_id, workflow_id, params | 场景视频生成请求 |
| `GenerateAllSceneImagesRequest` | workflow_id, params | 批量场景生成请求 |
| `GenerateAllVideosRequest` | workflow_id, params | 批量视频生成请求 |
| `GenerateBulkRequest` | workflow_id, params | 通用批量生成请求 |
| `AssetFinalizeRequest` | image_ids, main_image_id | 资产定角请求 |

---

### `app/schemas/project.py` — 项目模式

| Schema | 字段 | 用途 |
|--------|------|------|
| `ProjectCreate` | name | 创建项目 |
| `ProjectUpdate` | name?, summary?, status? | 更新项目 |
| `ProjectResponse` | id, name, script_path, script_text, summary, status, created_at, updated_at | 项目详情响应 |
| `ProjectListResponse` | projects[], total | 项目列表响应 |

---

### `app/schemas/character.py` — 角色模式

| Schema | 字段 | 用途 |
|--------|------|------|
| `CharacterImageResponse` | id, character_id, image_type, image_path, prompt_used, seed, is_selected | 角色图片响应 |
| `CharacterResponse` | 全部角色字段 + images[] | 角色详情 (含图片列表) |
| `CharacterUpdate` | 所有字段均可选 | 部分更新 |
| `CharacterCreate(CharacterUpdate)` | name为必填 | 创建角色 |

---

### `app/schemas/scene.py` — 场景模式

| Schema | 字段 | 用途 |
|--------|------|------|
| `SceneCharacterData` | character_id, character_name, position, action, expression | 场景中的角色数据 |
| `SceneImageResponse` | id, scene_id, image_path, prompt_used, seed, is_approved | 场景图片响应 |
| `VideoClipResponse` | id, scene_id, video_path, duration, fps, resolution, prompt_used, seed, is_approved | 视频响应 |
| `SceneResponse` | 全部场景字段 + scene_image + video_clip | 场景详情 |
| `SceneUpdate` | 所有字段均可选 | 部分更新 |
| `SceneCreate(SceneUpdate)` | scene_number为必填 | 创建场景 |

---

## 8. API路由层 (api/)

### `app/api/__init__.py` — 路由注册

```python
router = APIRouter()
router.include_router(health.router)                          # /api/health
router.include_router(projects.router, prefix="/projects")    # /api/projects
router.include_router(analysis.router, prefix="/projects")    # /api/projects/{id}/analyze/...
router.include_router(generation.router, prefix="/projects")  # /api/projects/{id}/generate/...
router.include_router(files.router, prefix="/files")          # /api/files/...
router.include_router(config.router, prefix="/config")        # /api/config/...
```

---

### `app/api/health.py` — 健康检查

| 端点 | 方法 | 响应 | 说明 |
|------|------|------|------|
| `/api/health` | GET | `HealthResponse` | 检查LLM和ComfyUI连接状态，返回可用模型列表 |

**内部流程:**
1. 调用 `llm_client.check_connection()` → 测试LLM连通性
2. 调用 `comfyui_client.check_connection()` → 测试ComfyUI连通性 + 获取模型列表
3. 汇总返回状态

---

### `app/api/projects.py` — 项目管理 + 角色/场景/Beat CRUD

#### 项目CRUD

| 端点 | 方法 | 请求 | 响应 | 说明 |
|------|------|------|------|------|
| `/api/projects` | POST | multipart (name, script_file?) | `ProjectResponse` | 创建项目，可选上传剧本文件 |
| `/api/projects` | GET | — | `ProjectListResponse` | 列出所有项目 (按更新时间降序) |
| `/api/projects/{project_id}` | GET | — | `ProjectResponse` | 获取项目详情 |
| `/api/projects/{project_id}` | PUT | `ProjectUpdate` | `ProjectResponse` | 更新项目信息 |
| `/api/projects/{project_id}` | DELETE | — | `{"message"}` | 删除项目 (级联删除所有数据+文件) |
| `/api/projects/{project_id}/stop` | POST | — | `{"message", "stopped"}` | 停止项目所有ComfyUI任务 |

**创建项目流程:**
```
POST /api/projects (multipart form)
    │
    ├─→ 创建 Project 记录 (status: draft)
    ├─→ 创建项目目录: data/projects/{project_id}/
    ├─→ 如果有上传文件:
    │     ├─→ 保存文件到项目目录
    │     ├─→ ScriptParser.parse() 解析文本
    │     └─→ 更新 project.script_text
    └─→ 返回 ProjectResponse
```

#### 角色管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/projects/{project_id}/characters` | GET | 获取项目所有角色 (含图片) |
| `/api/projects/{project_id}/characters` | POST | 手动创建角色 |
| `/api/projects/{project_id}/characters/{character_id}` | PUT | 更新角色信息 |
| `/api/projects/{project_id}/characters/{character_id}` | DELETE | 删除角色 |
| `/api/projects/{project_id}/characters/{character_id}/finalize` | POST | 定角 (锁定资产) |
| `/api/projects/{project_id}/characters/{character_id}/unfinalize` | POST | 解除定角 |
| `/api/projects/{project_id}/characters/images/{image_id}` | DELETE | 删除角色图片 |

**定角流程:**
```
POST .../characters/{id}/finalize
  body: { image_ids: ["img1", "img2"], main_image_id: "img1" }
    │
    ├─→ 设置 character.is_finalized = True
    ├─→ 保存快照到 character.finalized_metadata:
    │     { image_ids, main_image_id, finalized_at, character_snapshot }
    └─→ 返回 { success: true }
```

#### 场景管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/projects/{project_id}/scenes` | GET | 获取所有场景 (按序号排列，含图片和视频) |
| `/api/projects/{project_id}/scenes` | POST | 创建场景 |
| `/api/projects/{project_id}/scenes/{scene_id}` | PUT | 更新场景 |
| `/api/projects/{project_id}/scenes/{scene_id}` | DELETE | 删除场景 |
| `/api/projects/{project_id}/scenes/{scene_id}/finalize` | POST | 定景 |
| `/api/projects/{project_id}/scenes/{scene_id}/unfinalize` | POST | 解除定景 |
| `/api/projects/{project_id}/scenes/images/{image_id}` | DELETE | 删除场景图片 |
| `/api/projects/{project_id}/scenes/videos/{video_id}` | DELETE | 删除场景视频 |

#### Beat管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/projects/{project_id}/beats` | GET | 获取项目所有Beat |

---

### `app/api/analysis.py` — 剧本分析 (核心模块)

#### 内部类与辅助函数

**类: `AnalysisTask`**

管理长时间运行的分析任务，支持SSE流式输出。

| 属性 | 类型 | 说明 |
|------|------|------|
| `project_id` | str | 项目ID |
| `analysis_type` | str | 分析类型: summary/characters/scenes/acts |
| `mode` | str | 模式: quick/deep |
| `status` | str | 状态: init/running/completed/failed/cancelled |
| `events` | list | SSE事件缓冲区 |

| 方法 | 说明 |
|------|------|
| `cancel()` | 取消任务 |
| `add_event(data)` | 添加SSE事件 |
| `run()` | 异步执行分析 |

**全局:** `ANALYSIS_TASKS: Dict[str, AnalysisTask]` — 任务注册表

**辅助函数:**

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `split_script_into_chunks()` | script_text, chunk_size | list[str] | 按段落边界分块 |
| `merge_characters()` | existing, new_chars, mode | list[dict] | 角色去重合并。quick模式仅填充空字段，deep模式覆盖 |

#### 流式分析端点

| 端点 | 方法 | 响应 | 说明 |
|------|------|------|------|
| `/api/projects/{id}/analyze/{type}/stream` | GET | SSE (text/event-stream) | 流式分析，支持 summary/characters/scenes/acts |
| `/api/projects/{id}/analysis/status` | GET | JSON | 查询分析任务状态 |
| `/api/projects/{id}/analysis/stop` | POST | JSON | 停止运行中的分析任务 |

**SSE事件类型:**

| 事件 | 数据 | 时机 |
|------|------|------|
| `start` | `{type, mode, total_chunks}` | 分析开始 |
| `info` | `{message}` | 进度信息 |
| `chunk_start` | `{chunk_index, total_chunks}` | 开始处理某个chunk |
| `chunk` | `{text}` | LLM流式输出文本片段 |
| `item_generated` | `{item, index}` | 提取到一个完整item (角色/场景) |
| `chunk_done` | `{chunk_index, items_count}` | 完成处理某个chunk |
| `saved` | `{total_items}` | 数据持久化到DB |
| `done` | `{total_items, items}` | 分析完成 |
| `error` | `{message}` | 错误发生 |

**流式分析详细流程:**
```
GET /api/projects/{id}/analyze/characters/stream?mode=quick
    │
    ├─→ 1. 加载 project.script_text
    ├─→ 2. 调用 prompt_service.split_script_by_acts() 分块
    │       或 _split_by_size() 按大小分块
    ├─→ 3. 发送 SSE: start
    │
    ├─→ 4. FOR EACH chunk:
    │     ├─→ 发送 SSE: chunk_start
    │     ├─→ 构建prompt (prompt_service.get_characters_prompt)
    │     ├─→ llm_client.chat_stream(prompt) → 流式获取响应
    │     │     └─→ 每个token → 发送 SSE: chunk
    │     ├─→ StreamingJSONParser.feed() → 增量提取JSON对象
    │     │     └─→ 每个完整对象 → 发送 SSE: item_generated
    │     ├─→ merge_characters() → 去重合并
    │     └─→ 发送 SSE: chunk_done
    │
    ├─→ 5. 持久化到数据库 (创建/更新 Character 记录)
    ├─→ 6. 发送 SSE: saved
    └─→ 7. 发送 SSE: done
```

#### 非流式分析端点

| 端点 | 方法 | 响应 | 说明 |
|------|------|------|------|
| `/api/projects/{id}/analyze/summary` | POST | `AnalysisResponse` | 生成摘要 (使用前16000字符) |
| `/api/projects/{id}/analyze/characters` | POST | `AnalysisResponse` | 提取角色 (分块+去重) |
| `/api/projects/{id}/analyze/scenes` | POST | `AnalysisResponse` | 提取场景 (需要已有角色数据) |

---

### `app/api/generation.py` — 图像/视频生成

| 端点 | 方法 | 请求 | 响应 | 说明 |
|------|------|------|------|------|
| `POST .../generate/character-images` | POST | `GenerateCharacterImagesRequest` | `TaskResponse` | 单角色图片生成 |
| `POST .../generate/character-library` | POST | `GenerateCharacterLibraryRequest` | `TaskResponse` | 全角色库批量生成 |
| `POST .../generate/scene-image` | POST | `GenerateSceneRequest` | `TaskResponse` | 单场景图片生成 |
| `POST .../generate/all-scene-images` | POST | `GenerateBulkRequest` | `TaskResponse` | 全场景批量生成 |
| `POST .../generate/all-videos` | POST | `GenerateBulkRequest` | `TaskResponse` | 全视频批量生成 |
| `GET /api/tasks/{task_id}/status` | GET | — | JSON | 查询任务进度 |
| `GET .../tasks/active` | GET | — | JSON | 获取项目活跃任务 |
| `POST .../sync-images` | POST | — | JSON | 同步ComfyUI输出文件到本地 |

**生成任务流程 (以角色库为例):**
```
POST /api/projects/{id}/generate/character-library
  body: { image_types: ["front", "side"], workflow_id: "flux_portrait" }
    │
    ├─→ 1. 生成 task_id (UUID)
    ├─→ 2. 从DB加载项目所有角色
    ├─→ 3. 更新项目状态为 "generating"
    ├─→ 4. 启动 BackgroundTask:
    │       generation_tasks.generate_character_library(
    │           task_id, project_id, characters, image_types, workflow_id, params
    │       )
    └─→ 5. 立即返回 TaskResponse { task_id, message }

后台任务执行:
    │
    ├─→ FOR EACH character:
    │     ├─→ _build_character_prompt(character, image_types)
    │     │     → 组合角色属性 + 类型修饰符 → (positive_prompt, negative_prompt)
    │     ├─→ comfyui_client.generate_image(workflow, prompt, ...)
    │     │     ├─→ load_workflow() → 加载JSON模板
    │     │     ├─→ update_workflow_params() → 替换prompt/参数
    │     │     ├─→ queue_prompt() → 提交到ComfyUI
    │     │     ├─→ wait_for_completion() → 轮询等待 (最长20min)
    │     │     └─→ 返回生成的文件名
    │     ├─→ _save_generated_file() → 从ComfyUI下载并保存到本地
    │     ├─→ 创建 CharacterImage 记录到DB
    │     └─→ update_task_status() → 更新进度
    │
    └─→ 任务完成，更新状态为 "completed"
```

---

### `app/api/files.py` — 文件访问

| 端点 | 方法 | 响应 | 说明 |
|------|------|------|------|
| `/api/files/images/{filename}` | GET | FileResponse | 获取图片文件 |
| `/api/files/videos/{filename}` | GET | FileResponse | 获取视频文件 |

**辅助函数:**

| 函数 | 说明 |
|------|------|
| `get_comfyui_output_dir()` | 确定ComfyUI输出目录 (优先使用 `COMFYUI_PATH/output`) |

**文件查找优先级:**
```
请求: GET /api/files/images/abc.png
    │
    ├─→ 1. 查找 data/projects/ 下的本地文件
    ├─→ 2. 查找 ComfyUI输出目录
    └─→ 3. 代理请求到 ComfyUI HTTP API 下载
```

---

### `app/api/config.py` — 配置管理

#### 运行时LLM配置

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /api/config/llm` | GET | 获取LLM配置 (chunk_size, context_length) |
| `PUT /api/config/llm` | PUT | 更新运行时LLM配置 |
| `POST /api/config/llm/clear-cache` | POST | 清除缓存 (prompt缓存/输出文件/分析任务) |

**全局状态:** `_llm_runtime_config` — 内存中的LLM运行时配置

**辅助函数:**

| 函数 | 说明 |
|------|------|
| `get_llm_chunk_size() → int` | 获取当前chunk大小配置 |
| `get_llm_context_length() → int` | 获取当前上下文长度配置 |

#### 模板配置

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /api/config/character-image-templates` | GET | 获取角色图片类型模板 |
| `PUT /api/config/character-image-templates` | PUT | 更新角色图片类型模板 |

#### Prompt配置

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /api/config/prompts/analysis` | GET | 获取文本分析prompt |
| `PUT /api/config/prompts/analysis` | PUT | 更新文本分析prompt |
| `GET /api/config/prompts/character` | GET | 获取角色图像prompt |
| `PUT /api/config/prompts/character` | PUT | 更新角色图像prompt |
| `GET /api/config/prompts/scene` | GET | 获取场景prompt |
| `PUT /api/config/prompts/scene` | PUT | 更新场景prompt |
| `GET /api/config/prompts/action` | GET | 获取视频动作prompt |
| `PUT /api/config/prompts/action` | PUT | 更新视频动作prompt |

#### 分块与工作流配置

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /api/config/chunk` | GET | 获取剧本分块配置 |
| `PUT /api/config/chunk` | PUT | 更新分块配置 (同时清除prompt缓存) |
| `GET /api/config/workflows` | GET | 获取完整工作流配置 |
| `PUT /api/config/workflows` | PUT | 更新工作流配置 |
| `GET /api/config/workflows/{type}/default` | GET | 获取某类型的默认工作流 (character/scene/video) |

---

## 9. 业务服务层 (services/)

### `app/services/llm_client.py` — LLM客户端

**类: `LLMClient`**

封装与 Ollama / LM Studio 的通信，支持流式和非流式两种模式。

**构造函数:**
- 根据 `settings.LLM_TYPE` 确定API端点:
  - `ollama`: `{OLLAMA_URL}/api/chat`
  - `lmstudio`: `{LMSTUDIO_URL}/v1/chat/completions`

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `check_connection()` | — | `LLMStatus` | 测试连接 (ollama: GET /api/tags, lmstudio: GET /v1/models) |
| `chat(prompt, system_prompt)` | str, str? | `str` | 非流式对话，返回完整响应 |
| `chat_stream(prompt, system_prompt)` | str, str? | `AsyncGenerator[str]` | 流式对话，逐token yield |
| `chat_json(prompt, system_prompt)` | str, str? | `dict` | JSON模式对话，自动提取JSON |
| `analyze_summary(script_text)` | str | `dict` | 生成剧本摘要 (100-200字) |
| `analyze_characters(script_text)` | str | `dict` | 提取角色信息 (自动分块+去重) |
| `analyze_scenes(script_text, characters_info)` | str, str | `dict` | 提取场景信息 (需角色上下文) |

**内部方法:**

| 方法 | 说明 |
|------|------|
| `_split_script_into_chunks(script_text, chunk_size)` | 按段落边界分块 |
| `_merge_characters(existing, new_chars)` | 按角色名去重合并 |

**流式协议差异:**

| | Ollama | LM Studio |
|---|--------|-----------|
| 端点 | `/api/chat` | `/v1/chat/completions` |
| 请求格式 | `{model, messages, stream: true}` | `{model, messages, stream: true}` |
| 响应格式 | JSON行 `{message: {content}}` | SSE `data: {choices[0].delta.content}` |

**全局单例:** `llm_client = LLMClient()`

---

### `app/services/comfyui_client.py` — ComfyUI客户端

**类: `ComfyUIClient`**

封装与 ComfyUI 的 REST API 和 WebSocket 通信。

**模型类型映射:**
```python
MODEL_TYPES = {
    "checkpoints": ("CheckpointLoaderSimple", "ckpt_name"),
    "unet":        ("UNETLoader", "unet_name"),
    "vae":         ("VAELoader", "vae_name"),
    "loras":       ("LoraLoader", "lora_name"),
    "clip":        ("CLIPLoader", "clip_name"),
}
```

**构造函数:**
- 初始化 `base_url` (ComfyUI地址)
- 生成 `client_id` (UUID，用于WebSocket会话)
- 初始化 `_project_tasks: dict` (项目任务追踪)

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `check_connection()` | — | `ComfyUIStatus` | 测试连接 + 获取可用模型 |
| `_get_available_models()` | — | `dict[str, list[str]]` | 查询 /object_info 获取所有可用模型 |
| `load_workflow(workflow_path)` | str | `dict` | 加载JSON工作流模板 |
| `update_workflow_params(workflow, params)` | dict, dict | `dict` | 更新工作流节点参数 (prompt/sampler/尺寸等) |
| `queue_prompt(workflow)` | dict | `str` | 提交工作流到队列，返回 prompt_id |
| `get_history(prompt_id)` | str | `dict` | 获取执行历史 |
| `get_image_content(filename, subfolder, folder_type)` | str, str, str | `bytes` | 下载生成的文件内容 |
| `get_system_stats()` | — | `dict` | 获取系统信息 |
| `interrupt()` | — | `bool` | 中断当前执行 |
| `delete_from_queue(prompt_id)` | str | `bool` | 从队列移除任务 |
| `clear_queue()` | — | `bool` | 清空队列 |

**任务管理:**

| 方法 | 说明 |
|------|------|
| `register_task(project_id, prompt_id)` | 注册任务到项目 |
| `unregister_task(project_id, prompt_id)` | 取消注册 |
| `stop_project_tasks(project_id)` | 停止项目所有任务，返回停止数 |
| `get_project_tasks(project_id)` | 获取项目活跃任务列表 |

**等待完成:**

| 方法 | 说明 |
|------|------|
| `wait_for_completion(prompt_id, timeout=1200, poll_interval=2)` | 轮询历史直到完成 (默认超时20分钟) |

**高级生成方法:**

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `generate_image(...)` | workflow_name, positive_prompt, negative_prompt, seed, width, height, output_filename, project_id, reference_image? | `str` | 完整图片生成流程: 加载模板→替换参数→提交→等待→返回文件名 |
| `generate_video(...)` | workflow_name, input_image, action_prompt, negative_prompt, seed, width, height, video_length, steps, cfg, frame_rate, output_filename, project_id | `str` | 完整视频生成流程 (超时10分钟) |

**全局单例:** `comfyui_client = ComfyUIClient()`

---

### `app/services/prompt_service.py` — Prompt模板管理

**类: `PromptService`**

集中管理所有Prompt模板的加载、缓存、构建和更新。

**内部状态:**
- `_cache: dict` — 内存缓存，避免重复读取JSON文件

**文件操作:**

| 方法 | 说明 |
|------|------|
| `_load_json(relative_path)` | 从 `app/config/prompts/` 加载JSON，缓存结果，自动拼接模板列表为字符串 |
| `_save_json(relative_path, data)` | 保存JSON并更新缓存 |
| `clear_cache()` | 清空所有缓存 |

#### 文本分析Prompt

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_analysis_prompts()` | — | dict | 加载全部分析prompt配置 |
| `get_summary_prompt(script_text)` | str | str | 构建摘要prompt |
| `get_characters_prompt(script_text, chunk_index, total_chunks, existing_names, mode)` | str, int, int, list, str | str | 构建角色提取prompt (支持quick/deep模式) |
| `get_scenes_prompt(script_text, chunk_index, total_chunks, characters_json, scene_start_num)` | str, int, int, str, int | str | 构建场景提取prompt |
| `get_acts_prompt(script_text, chunk_index, total_chunks)` | str, int, int | str | 构建幕分析prompt |
| `update_analysis_prompts(data)` | dict | bool | 更新分析prompt配置 |

#### 图像生成Prompt

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_character_prompts_config()` | — | dict | 加载角色图像prompt配置 |
| `build_character_prompt(gender, age, hair, face, body, skin, clothing_style, personality, style_preset)` | 各属性 | `(str, str)` | 构建角色图像正/负prompt，使用性别映射和风格预设 |
| `update_character_prompts(data)` | dict | bool | 更新配置 |

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_scene_prompts_config()` | — | dict | 加载场景prompt配置 |
| `build_scene_prompt(location, time_of_day, atmosphere, environment_desc, characters_in_scene)` | 各属性 | `(str, str)` | 构建场景图像正/负prompt (含角色位置/动作) |
| `update_scene_prompts(data)` | dict | bool | 更新配置 |

#### 视频动作Prompt

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_action_prompts_config()` | — | dict | 加载视频动作prompt配置 |
| `build_action_prompt(character_actions)` | list | `(str, str)` | 构建运动/动作prompt |
| `update_action_prompts(data)` | dict | bool | 更新配置 |

#### 剧本分块

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_chunk_config()` | — | dict | 加载分块配置 |
| `split_script_by_acts(script_text)` | str | `list[dict]` | 按幕分割，返回 `[{act_number, script_content, start_line, end_line}]` |
| `split_script_by_chapters(script_text)` | str | `list[str]` | 按章节分割 |
| `split_script_by_scenes(script_text)` | str | `list[str]` | 按INT./EXT.标记分割 |
| `_split_by_size(text, chunk_size)` | str, int | `list[str]` | 按大小分割 (段落边界优先) |
| `update_chunk_config(data)` | dict | bool | 更新分块配置 |

#### 工作流配置

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_act_config()` | — | dict | 加载幕配置 |
| `update_act_config(data)` | dict | bool | 更新幕配置 |
| `get_workflow_config()` | — | dict | 加载工作流配置 |
| `update_workflow_config(data)` | dict | bool | 更新工作流配置 |
| `get_default_workflow(workflow_type)` | str | dict? | 获取默认工作流 (character/scene/video) |
| `get_workflow_by_id(workflow_type, workflow_id)` | str, str | dict? | 按ID获取工作流 |

**全局单例:** `prompt_service = PromptService()`

---

### `app/services/script_parser.py` — 剧本解析

**类: `ScriptParser`**

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `parse(file_path)` | str | `str` | 根据扩展名路由到对应解析器 |
| `_parse_txt(path)` | Path | `str` | UTF-8读取TXT文件 |
| `_parse_pdf(path)` | Path | `str` | 使用pypdf提取所有页面文本 |

**全局单例:** `script_parser = ScriptParser()`

---

### `app/services/generation_tasks.py` — 生成任务管理

**类: `GenerationTasks`**

管理所有图像/视频生成的后台任务。

**内部状态:**
- `_task_status: dict[str, dict]` — 内存中的任务状态追踪

#### 文件管理

| 方法 | 说明 |
|------|------|
| `_load_image_type_config()` | 从 `character_image_templates.json` 加载配置 |
| `_get_image_type_info(type_id)` | 获取指定图片类型的详情 |
| `_save_generated_file(filename, project_id)` | 从ComfyUI下载文件并保存到 `data/projects/{project_id}/` |
| `recover_missing_file(relative_path, project_id)` | 恢复缺失文件 (尝试从ComfyUI重新下载) |

#### 任务状态

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_task_status(task_id)` | str | dict | 获取任务状态 (status, progress, message, result, error) |
| `update_task_status(...)` | task_id, status, progress, message, result, error, project_id, target_id | None | 更新任务状态 |
| `stop_task(task_id)` | str | bool | 停止任务 |
| `get_active_tasks_for_project(project_id)` | str | dict | 获取项目活跃任务 |

#### Prompt构建

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `_build_character_prompt(character, image_types)` | Character, list[str] | `(str, str)` | 组合角色属性 + 图片类型修饰符 → (正prompt, 负prompt) |
| `_build_scene_prompt(scene)` | Scene | `(str, str)` | 委托给 prompt_service |
| `_build_action_prompt(scene)` | Scene | `(str, str)` | 委托给 prompt_service |

#### 生成方法

| 方法 | 参数 | 说明 |
|------|------|------|
| `generate_character_images(task_id, character, image_types, workflow_id, params)` | — | 生成单个角色图片 (所有选择的类型合并为一张) |
| `generate_character_library(task_id, project_id, characters, image_types, workflow_id, params)` | — | 批量生成所有角色图片 |
| `generate_scene_image(task_id, scene, reference_image, workflow_id, params)` | — | 生成单个场景图片 |
| `generate_all_scene_images(task_id, project_id, scenes, workflow_id, params)` | — | 批量生成所有场景图片 |
| `generate_scene_video(task_id, scene, workflow_id, params)` | — | 生成场景视频 (引用角色图片保持一致性) |
| `generate_all_videos(task_id, project_id, scenes, workflow_id, params)` | — | 批量生成所有视频 |

**全局单例:** `generation_tasks = GenerationTasks()`

---

## 10. 工具层 (utils/)

### `app/utils/streaming_parser.py` — JSON流式解析器

**类: `StreamingJSONParser`**

从LLM流式输出中增量提取完整的JSON对象。

**内部状态:**
| 属性 | 说明 |
|------|------|
| `buffer` | 累积的文本缓冲区 |
| `start_idx` | 当前JSON对象的起始位置 |

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `feed(chunk)` | str | `Generator[Any]` | 输入新文本片段，yield所有检测到的完整JSON对象 |

**解析逻辑:**
```
LLM输出: "...一些文字... {\"name\": \"张三\", \"age\": 30} ...更多文字... {\"name\": \"李四\"}"
                         │                            │                        │              │
                    检测到 '{'                    检测到 '}'                检测到 '{'     检测到 '}'
                    start_idx=N                  yield dict                start_idx=M    yield dict
```

**处理能力:**
- 平衡花括号计数
- 跳过字符串内的转义引号
- 处理Markdown代码块包裹的JSON
- 处理嵌套JSON对象

---

## 11. 配置文件层 (config/)

### `app/config/character_image_templates.json`
角色图片类型定义，包含:
- `default_types`: 默认生成的类型列表
- `templates`: 每种类型的名称、描述、prompt修饰符
- `available_types`: 可选的所有类型

### `app/config/workflow_config.json`
ComfyUI工作流配置:
- `character`: 角色肖像工作流列表
- `scene`: 场景生成工作流列表
- `video`: 视频生成工作流列表
- 每个工作流: `id`, `name`, `file`, `default_params`

### `app/config/prompts/text/`

| 文件 | 说明 |
|------|------|
| `analysis_prompts.json` | 分析prompt模板: summary, characters, characters_quick, scenes, acts |
| `chunk_config.json` | 分块配置: mode, delimiters, sizes |
| `act_config.json` | 幕检测配置: keywords, min_length |

### `app/config/prompts/img/`

| 文件 | 说明 |
|------|------|
| `character_prompts.json` | 角色肖像prompt: gender_mapping, style_presets, base_template |
| `scene_prompts.json` | 场景prompt: time_of_day映射, atmosphere映射, base_template |

### `app/config/prompts/video/`

| 文件 | 说明 |
|------|------|
| `action_prompts.json` | 动作prompt: action_keywords, motion_templates |

---

## 12. 数据库迁移脚本

位于 `backend/` 根目录，手动执行。

| 文件 | 说明 | 修改的表 | 添加的字段 |
|------|------|----------|------------|
| `migrate_v2.py` | 资产定角支持 | characters, scenes | `is_finalized` (Boolean), `finalized_metadata` (JSON) |
| `migrate_script_content.py` | 场景剧本原文 | scenes | `script_content` (Text) |
| `migrate_act_analysis.py` | 幕级分析结果 | projects | `act_analysis` (JSON) |

**运行方式:** `python migrate_v2.py` (从 backend/ 目录执行)

---

## 13. 核心业务流程详解

### 13.1 项目创建流程

```
用户操作: 填写项目名 + (可选)上传剧本PDF/TXT
    │
    ▼
POST /api/projects (multipart/form-data)
    │
    ├─ projects.py: create_project()
    │   ├─ 创建 Project(name=name, status="draft")
    │   ├─ db.add(project) → 获得 project.id
    │   ├─ os.makedirs(f"data/projects/{project.id}/")
    │   │
    │   ├─ [如有文件]:
    │   │   ├─ 保存文件到 data/projects/{id}/{filename}
    │   │   ├─ script_parser.parse(file_path)
    │   │   │   ├─ .txt → 直接UTF-8读取
    │   │   │   └─ .pdf → pypdf逐页提取文本
    │   │   └─ project.script_text = 解析结果
    │   │
    │   ├─ db.commit()
    │   └─ return ProjectResponse
    │
    ▼
前端收到响应，导航到项目详情页
```

### 13.2 剧本分析流程 (流式)

```
用户操作: 点击"分析角色"按钮
    │
    ▼
GET /api/projects/{id}/analyze/characters/stream?mode=quick
    │
    ├─ analysis.py: stream_analysis()
    │   ├─ 创建 AnalysisTask(project_id, "characters", "quick")
    │   ├─ 注册到 ANALYSIS_TASKS[project_id]
    │   ├─ 启动协程 task.run()
    │   └─ 返回 StreamingResponse(text/event-stream)
    │
    ▼
AnalysisTask.run() [后台协程]:
    │
    ├─ 1. 加载 project.script_text
    ├─ 2. prompt_service.split_script_by_acts(script_text)
    │      → [{act_number, script_content, start_line, end_line}, ...]
    ├─ 3. SSE: {event: "start", data: {type: "characters", mode: "quick", total_chunks: N}}
    │
    ├─ 4. FOR EACH chunk (i, text):
    │   ├─ SSE: {event: "chunk_start", data: {chunk_index: i}}
    │   │
    │   ├─ prompt = prompt_service.get_characters_prompt(
    │   │      text, i, total_chunks, existing_names, "quick"
    │   │  )
    │   │
    │   ├─ parser = StreamingJSONParser()
    │   ├─ full_response = ""
    │   │
    │   ├─ async for token in llm_client.chat_stream(prompt):
    │   │   ├─ full_response += token
    │   │   ├─ SSE: {event: "chunk", data: {text: token}}
    │   │   └─ for item in parser.feed(token):
    │   │       └─ SSE: {event: "item_generated", data: {item, index}}
    │   │
    │   ├─ merge_characters(all_characters, chunk_characters, "quick")
    │   └─ SSE: {event: "chunk_done", data: {chunk_index: i, items_count}}
    │
    ├─ 5. 持久化到数据库:
    │   ├─ FOR EACH character_data:
    │   │   ├─ 查找已存在的 Character (by name + project_id)
    │   │   ├─ [存在] → 更新字段
    │   │   └─ [不存在] → 创建新 Character 记录
    │   └─ db.commit()
    │
    ├─ 6. SSE: {event: "saved", data: {total_items}}
    └─ 7. SSE: {event: "done", data: {total_items, items: [...]}}
```

### 13.3 图像生成流程

```
用户操作: 点击"生成角色图片库"
    │
    ▼
POST /api/projects/{id}/generate/character-library
  body: { imageTypes: ["front", "side"], workflowId: "flux_portrait" }
    │
    ├─ generation.py: generate_character_library()
    │   ├─ 生成 task_id = uuid4()
    │   ├─ 从DB加载所有 characters (with images)
    │   ├─ 更新 project.status = "generating"
    │   ├─ BackgroundTask → generation_tasks.generate_character_library(...)
    │   └─ return TaskResponse(task_id=task_id)
    │
    ▼
前端开始轮询: GET /api/tasks/{task_id}/status
    │
    ▼
[后台] GenerationTasks.generate_character_library():
    │
    ├─ update_task_status(task_id, "running", progress=0)
    │
    ├─ FOR EACH character (i/total):
    │   │
    │   ├─ _build_character_prompt(character, image_types)
    │   │   ├─ 从 prompt_service 获取配置
    │   │   ├─ 组合: 基础模板 + 性别映射 + 年龄 + 发型 + 面部 + ...
    │   │   ├─ 添加图片类型修饰符 (front view, side view, ...)
    │   │   └─ return (positive_prompt, negative_prompt)
    │   │
    │   ├─ comfyui_client.generate_image(
    │   │       workflow_name, positive_prompt, negative_prompt,
    │   │       seed, width, height, output_filename, project_id
    │   │   )
    │   │   ├─ load_workflow(workflow_path)          → 加载JSON模板
    │   │   ├─ update_workflow_params(workflow, params) → 替换节点参数
    │   │   │   ├─ 更新正/负prompt节点
    │   │   │   ├─ 更新sampler参数 (steps, cfg, seed)
    │   │   │   ├─ 更新图片尺寸
    │   │   │   └─ 更新输出文件名
    │   │   ├─ queue_prompt(workflow)                 → POST /prompt → 获得prompt_id
    │   │   ├─ register_task(project_id, prompt_id)
    │   │   ├─ wait_for_completion(prompt_id, 1200s)  → 轮询 GET /history
    │   │   ├─ unregister_task(project_id, prompt_id)
    │   │   └─ return output_filename
    │   │
    │   ├─ _save_generated_file(filename, project_id)
    │   │   ├─ comfyui_client.get_image_content(filename)  → 下载bytes
    │   │   ├─ 保存到 data/projects/{project_id}/{filename}
    │   │   └─ return relative_path
    │   │
    │   ├─ 创建 CharacterImage 记录:
    │   │   CharacterImage(character_id, image_type, image_path, prompt_used, seed)
    │   │   db.add() + db.commit()
    │   │
    │   └─ update_task_status(task_id, "running", progress=(i+1)/total)
    │
    └─ update_task_status(task_id, "completed", progress=1.0)
```

### 13.4 视频生成流程

```
POST /api/projects/{id}/generate/all-videos
    │
    ├─ 加载所有场景 (必须已有scene_image)
    │
    ├─ FOR EACH scene:
    │   ├─ _build_action_prompt(scene)
    │   │   └─ prompt_service.build_action_prompt(scene.characters_data)
    │   │
    │   ├─ comfyui_client.generate_video(
    │   │       workflow_name="video_ltx2_i2v",
    │   │       input_image=scene.scene_image.image_path,
    │   │       action_prompt, negative_prompt,
    │   │       seed, width, height, video_length, steps, cfg, frame_rate
    │   │   )
    │   │   ├─ 加载视频工作流模板
    │   │   ├─ 替换: 输入图片路径, 动作prompt, 参数
    │   │   ├─ queue_prompt → wait_for_completion (600s超时)
    │   │   └─ return video_filename
    │   │
    │   ├─ 保存视频文件到本地
    │   └─ 创建 VideoClip 记录
    │
    └─ 任务完成
```

### 13.5 资产定角/定景流程

```
POST /api/projects/{id}/characters/{char_id}/finalize
  body: { imageIds: ["img1", "img2"], mainImageId: "img1" }
    │
    ├─ 查找 Character 记录
    ├─ character.is_finalized = True
    ├─ character.finalized_metadata = {
    │       "image_ids": ["img1", "img2"],
    │       "main_image_id": "img1",
    │       "finalized_at": "2026-02-12T...",
    │       "character_snapshot": { ...当前角色数据快照... }
    │   }
    ├─ db.commit()
    └─ return { success: true }

定角后:
  - 前端将该角色标记为不可编辑
  - 角色可被拖入剧幕工作台使用
  - 支持 unfinalize 解除锁定
```

---

## 14. 设计模式与约定

### 14.1 架构模式

| 模式 | 应用场景 | 说明 |
|------|----------|------|
| **全异步** | 所有I/O操作 | async/await + aiohttp + aiosqlite |
| **后台任务** | 图像/视频生成 | FastAPI BackgroundTask + 状态轮询 |
| **SSE流式** | 剧本分析 | Server-Sent Events 实时推送进度 |
| **单例模式** | 所有Service | 模块级全局实例 (llm_client, comfyui_client等) |
| **依赖注入** | 数据库会话 | FastAPI Depends(get_db) |
| **分层架构** | 整体设计 | Route → Schema → Service → Model → DB |

### 14.2 配置分层

```
优先级 (从高到低):
1. 运行时内存配置 (_llm_runtime_config)  ← API动态修改
2. JSON配置文件 (app/config/)            ← API可修改，带缓存
3. 环境变量 (.env)                       ← 启动时加载，不可热更新
4. 代码默认值 (Settings类)               ← 兜底
```

### 14.3 命名约定

| 约定 | 说明 |
|------|------|
| Python代码 | snake_case |
| API请求/响应 | camelCase (CamelModel自动转换) |
| 数据库字段 | snake_case |
| URL路径 | kebab-case (`/character-library`) |
| 文件名 | snake_case |

### 14.4 错误处理策略

```
Service层 → try/except + logging.error() → 返回错误状态
API层    → HTTPException(status_code, detail)
后台任务 → update_task_status(status="failed", error=str(e))
SSE流   → add_event({event: "error", data: {message}})
```

### 14.5 文件存储约定

```
data/
├── database.sqlite                     # 主数据库
└── projects/
    └── {project_id}/                   # 每项目一个目录
        ├── {原始剧本文件}               # 上传的PDF/TXT
        ├── char_{name}_{type}_{seed}.png   # 角色图片
        ├── scene_{number}_{seed}.png       # 场景图片
        └── video_{number}_{seed}.mp4       # 场景视频
```

### 14.6 外部服务通信

| 服务 | 协议 | 端点 | 用途 |
|------|------|------|------|
| Ollama | HTTP (JSON行) | `/api/chat`, `/api/tags` | LLM对话、模型列表 |
| LM Studio | HTTP (SSE) | `/v1/chat/completions`, `/v1/models` | LLM对话、模型列表 |
| ComfyUI | HTTP + WebSocket | `/prompt`, `/history`, `/object_info`, `/view` | 工作流提交、状态查询、文件下载 |

---

> 本文档完整描述了 AI Drama Studio 后端的架构设计、数据流转、每个文件的职责以及所有类和函数的功能。作为项目的技术参考手册，可指导开发、调试和功能扩展。
