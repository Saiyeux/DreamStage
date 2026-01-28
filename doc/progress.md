# 开发进度

> 最后更新: 2026-01-27

## 已完成

### 前端
- [x] 项目框架 (React + Vite + TypeScript)
- [x] Tailwind CSS 配置
- [x] 路由配置 (react-router-dom)
- [x] 状态管理 (Zustand stores)
- [x] 页面结构
  - [x] 首页 - 服务状态检测
  - [x] 剧本上传页
  - [x] 剧本分析页 (角色/分镜 tabs)
  - [x] 生成中心页 (角色库/场景图/视频 tabs)
- [x] API 封装层 (client, health, projects, analysis, generation)
- [x] 首页对接后端 API

### 后端
- [x] 项目框架 (FastAPI + SQLAlchemy)
- [x] 数据库模型 (Project, Character, Scene, etc.)
- [x] Pydantic schemas
- [x] API 路由骨架
  - [x] GET /api/health
  - [x] CRUD /api/projects
  - [x] POST /api/projects/{id}/analyze/*
  - [x] POST /api/projects/{id}/generate/*
- [x] 服务层骨架
  - [x] LLM 客户端 (Ollama/LM Studio)
  - [x] ComfyUI 客户端
  - [x] 剧本解析器 (PDF/TXT)
  - [x] 后台生成任务

### 文档
- [x] CLAUDE.md - 项目指南
- [x] 设计文档 (ai-drama-studio-design.md)
- [x] 环境配置文档 (setup-guide.md)

## 进行中

- [ ] 原神风格 UI 美化

## 已完成（本次）

### Bug 修复 (01-27)
- [x] **文本分块只分析第一块** - 实现完整多块分析
  - 添加 `split_script_into_chunks()` 在段落边界分割文本
  - 角色分析：跨块去重合并，使用 `merge_characters()` 按名字去重
  - 分镜分析：跨块累计场景，自动重新编号保证连续
  - 错误处理增强：LLM 调用和 JSON 解析单独 try/except
  - 支持部分保存：出错时保存已成功分析的数据
  - LLM 读取超时从 120s 增至 300s，防止慢响应断连
  - 新增 SSE 事件类型：`chunk_start`, `chunk_done`, `chunk_error`, `partial_save`

### Bug 修复 (01-24)
- [x] 首页状态显示 bug - SSE 流式端点直接解析保存数据，避免重复 LLM 调用
- [x] 页面切换状态丢失 - 分析状态 (terminalOutput, isStreaming) 迁移到 Zustand store 持久化

### 之前完成

### ComfyUI 生成功能
- [x] ComfyUI Workflow JSON 文件
  - [x] character_portrait_flux2.json - 角色肖像生成
  - [x] scene_generation_flux2.json - 场景图生成 (支持 IPAdapter)
  - [x] video_generation_ltx2.json - LTX-Video 2.0 视频生成
- [x] comfyui_client 增强
  - [x] generate_video 方法 (LTX2 视频生成)
  - [x] 模板占位符替换
  - [x] 视频相关节点参数更新
- [x] generation_tasks 实现
  - [x] _build_character_prompt 角色图 prompt 构建
  - [x] _build_scene_prompt 场景图 prompt 构建
  - [x] _build_action_prompt 视频动作 prompt 构建
  - [x] 生成结果保存到数据库 (CharacterImage, SceneImage, VideoClip)
- [x] 文件服务 API (GET /api/files/images/*, GET /api/files/videos/*)
- [x] 前端生成完成后自动刷新数据
- [x] 前端显示已生成的角色图、场景图和视频

### 之前完成
- [x] ComfyUI 模型目录检测（动态获取可用模型列表）
- [x] 剧本上传页对接 API
- [x] 剧本分析页对接 API
- [x] 生成中心页对接 API
- [x] 移除前端模拟数据，改为空状态提示
- [x] Zustand store 集成，解决页面切换状态丢失
- [x] Layout 显示当前项目，导航自动携带 project ID
- [x] 上传剧本自动从文件名生成项目名
- [x] HomePage 添加项目删除/停止按钮
- [x] 后端 schemas 统一 camelCase 序列化
- [x] ComfyUI client 任务追踪机制
- [x] DELETE /projects/{id} 先停止任务再清理资源
- [x] LLM 流式输出终端显示
- [x] 页面状态刷新机制
- [x] 角色头像性别区分

## 待完成

### 优先级高
- [ ] 前端处理新 SSE 事件 (`chunk_start`, `chunk_done`, `chunk_error`) 显示分块进度
- [ ] 测试长剧本多块分析是否正常工作
- [ ] 停止任务功能完善（目前可用删除替代）
- [ ] 配置 COMFYUI_OUTPUT_DIR 指向 ComfyUI 输出目录

### 前端
- [ ] WebSocket 实时进度推送 (替代轮询)
- [ ] 多块分析进度条显示 (第 N/M 块)

### 后端完善
- [ ] 视频合成/导出功能 (FFmpeg)
- [ ] 角色一致性控制 (自动选择参考图)

### 其他
- [ ] 前端 UI 美化 (参考原神风格)
- [ ] 错误处理优化
- [ ] 测试用例

## 端口配置

| 服务 | 端口 |
|------|------|
| Frontend (Vite) | 5173 |
| Backend (FastAPI) | 8001 |
| Ollama | 11434 |
| LM Studio | 1234 |
| ComfyUI | 8000 |
