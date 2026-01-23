# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

AI短剧制作系统 - 基于 ComfyUI + FLUX2 + LTX-Video 2.0 的可视化短剧制作流水线。

**核心流程**: 剧本上传 → LLM分析(角色/分镜) → FLUX2生成角色库 → FLUX2生成场景图 → LTX2生成视频片段 → FFmpeg合成最终视频

**当前状态**: 设计阶段，仅包含设计文档，尚未开始代码实现。

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端 | React + TypeScript + Tailwind + Vite + Zustand |
| 后端 | FastAPI + Python 3.10+ + SQLite |
| LLM | Ollama (localhost:11434) 或 LM Studio (localhost:1234) |
| 图像生成 | ComfyUI (localhost:8188) + FLUX.1-dev/schnell |
| 视频生成 | ComfyUI + LTX-Video-2B |
| 视频合成 | FFmpeg |

## 系统架构

```
Frontend (React :3000)
    │ HTTP/WebSocket
    ▼
Backend (FastAPI :8000)
    │
    ├── Ollama/LM Studio (:11434/:1234) - 剧本分析
    ├── ComfyUI (:8188) - FLUX2图像/LTX2视频
    └── SQLite + Filesystem - 数据存储
```

## 目录结构规范 (实现时遵循)

```
ai-drama-studio/
├── frontend/src/
│   ├── pages/          # HomePage, ScriptUploadPage, ScriptAnalysisPage, GenerationCenterPage
│   ├── components/     # 通用组件
│   ├── hooks/          # useProject, useWebSocket, useTaskProgress
│   ├── stores/         # Zustand: projectStore, taskStore
│   └── api/            # API调用封装
├── backend/app/
│   ├── api/            # 路由: health, projects, analysis, generation, export
│   ├── services/       # script_parser, llm_client, prompt_generator, comfyui_client, video_composer
│   ├── models/         # project, character, scene, task
│   └── prompts/        # LLM prompt模板
├── comfyui_workflows/  # JSON工作流文件
└── data/projects/      # 项目数据: {project_id}/script, characters/, scenes/, videos/, output/
```

## 关键API端点

- `GET /api/health` - 服务状态检测
- `POST /api/projects/{id}/analyze/summary|characters|scenes` - LLM分析
- `POST /api/projects/{id}/generate/character-library|scene-image|scene-video` - 生成任务
- `WS /ws/projects/{id}/tasks` - 实时进度推送

## ComfyUI Workflow参数

**角色图 (FLUX2)**:
- 分辨率: 768x1024 (竖版半身)
- Steps: 20, CFG: 1.0, Guidance: 3.5

**场景图 (FLUX2 + IPAdapter)**:
- 分辨率: 768x1344 (9:16竖屏)
- Steps: 25, IPAdapter权重: 0.5-0.7

**视频 (LTX2 Image-to-Video)**:
- 分辨率: 768x1344
- 帧数: 97 (≈4秒@24fps), CFG: 2.5-3.5, Steps: 25-35
- image_cond_noise_scale: 0.1-0.2

## 设计文档

完整设计规范见 `doc/ai-drama-studio-design.md`，包含:
- 详细页面UI设计 (ASCII mockups)
- 完整数据模型 (Python dataclasses)
- 6种LLM Prompt模板 (剧情简介/角色分析/分镜分析/角色图/场景图/动作)
- ComfyUI Workflow节点连接图
- API规范 (YAML格式)

## 实现注意事项

1. **角色一致性**: 使用IPAdapter/PuLID保持角色在不同场景中的外貌一致
2. **视频稳定性**: 控制动作幅度，单个片段4-8秒，避免画面崩坏
3. **异步任务**: 图像/视频生成耗时长，需WebSocket实时推送进度
4. **显存管理**: FLUX2推荐FP8量化(12GB+)，LTX2需16GB+
