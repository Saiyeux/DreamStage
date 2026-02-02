# ScriptConverter 系统设计文档

## 1. 系统概述 (System Overview)

ScriptConverter 是一个基于 AI 的剧本可视化系统，旨在辅助影视创作者（导演、美术、摄影）将文本剧本转化为可视化的分镜、角色设定和动态预览。系统采用前后端分离架构，核心依赖 LLM (Ollama/LMStudio) 进行文本分析，以及 ComfyUI 进行图像生成。

## 2. 核心架构 (Core Architecture)

### 2.1 技术栈
- **Frontend**: React, TypeScript, TailwindCSS, Zustand (State Management)
- **Backend**: Python (FastAPI), SSE (Server-Sent Events) for streaming
- **AI Services**:
    - **LLM**: Ollama / LMStudio (用于剧本拆解、角色分析、场景描述)
    - **Image Gen**: ComfyUI (用于生成角色图、场景图、分镜)

### 2.2 数据流向
1.  **上传**: 用户上传 PDF/TXT 剧本。
2.  **分析 (Analysis)**: 后端调用 LLM 解析剧本结构。
3.  **流式传输 (Streaming)**: 解析结果通过 SSE 实时推送到前端，实现"逐条显示"的体验。
4.  **生成 (Generation)**: 用户确认分析结果后，通过 ComfyUI Workflow 生成可视化资产。
5.  **持久化 (Persistence)**: 任务状态和结果持久化存储，支持页面刷新后恢复进度。

---

## 3. 核心功能模块 (Core Modules)

### 3.1 角色分析 (Character Analysis)
*   **功能**: 从剧本中提取角色列表，分析外貌、性格、服装等特征。
*   **当前实现**:
    *   支持实时流式输出 (Streaming)。
    *   支持手动编辑角色属性。
    *   **生成**: 使用 ComfyUI 生成角色立绘，支持多角度/表情配置。
*   **优化计划 (Backend Modify)**:
    *   引入 **RAG (Retrieval-Augmented Generation)**: 目前主要是基于单次上下文分析。未来计划构建剧本向量库，LLM 查询角色所有出场片段后综合分析，提高准确性（解决角色多次出场特征不一致问题）。

### 3.2 场景分析 (Scene Analysis)
*   **功能**: 拆解剧本为分场表 (Scene Heading, Action, Dialogue)。
*   **当前实现**:
    *   识别场景号、地点、时间、气氛。
    *   显示场景对应的剧本原文 (Script Preview)。
    *   **生成**: 基于环境描述生成场景概念图 (Concept Art)。
*   **交互优化**:
    *   **流式加载**: 解析一个场景即显示一个，无需等待全部分析完成。
    *   **状态检测**: 自动检测 ComfyUI 连接状态，服务离线时禁用生成并提示。

### 3.3 剧幕分析 (Act Analysis) - 导演工作台
*   **功能**: 剧本的高层结构分析 (Act/Chapter)，辅助导演规划节奏和调度。
*   **设计目标**:
    *   **智能分幕**: 根据关键词 (Chapter, Scene, Act) 自动划分剧本结构。
    *   **可视化编排**: 提供拖拽式界面 (Drag & Drop)，将已定稿的角色 (Cast) 和场景 (Stage) 拖入时间轴。
    *   **视频生成**: 最终生成动态分镜或预览视频 (Video Generation)。
*   **当前状态**:
    *   UI 已实现分栏布局 (Library / Stage / Timeline)。
    *   支持筛选"已定稿" (Finalized) 的资产进行拖拽。

---

## 4. 用户体验设计 (UX Design)

### 4.1 实时反馈 (Real-time Feedback)
*   **流式分析**: 改变以往"转圈等待"的模式，采用 SSE 技术，分析过程像打字机一样实时呈现。
*   **控制台输出**: 底部 Terminal 实时显示后端处理日志，增加系统透明度。

### 4.2 鲁棒性与状态管理 (Robustness)
*   **健康检查**: 实时监控 LLM 和 ComfyUI 服务状态。
    *   **左侧栏**: LLM 离线时，自动禁用分析入口，并提示 "Please check LLM service"。
    *   **生成区**: ComfyUI 离线时，禁用生成按钮，提示 "Please check ComfyUI service"。
*   **断点恢复**:
    *   即便刷新页面或网络中断，后台生成任务仍在继续。
    *   重新打开页面时，前端会自动查询并恢复 "Generating..." 状态，避免任务丢失。

### 4.3 视觉规范
*   统一的卡片式设计 (Cards)。
*   清晰的状态颜色 (Green=Connected/Finalized, Red=Offline, Blue=Parsing)。

---

## 5. 后端优化路线图 (Backend Roadmap)

根据 `backend_modify.md` 的规划：

1.  **RAG 增强分析**:
    *   **现状**: 线性读取分析。
    *   **目标**: 上传文件 -> 建立索引 -> 针对特定实体 (角色/地点) 进行全文档检索 -> 生成更精准的画像。

2.  **增量更新与局部重算**:
    *   优化 `analyzeSummary` 和 `analyzeScene` 逻辑，支持只重新分析修改过的部分剧本，而非全量重跑。

3.  **剧幕 (Act) 深度集成**:
    *   完善 `Act` 数据结构，使其不仅是 UI 容器，而是包含完整的时间轴 (Timeline) 和调度 (Blocking) 信息的结构化数据，直接对接视频生成模型。
