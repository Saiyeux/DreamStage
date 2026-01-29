# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Drama Studio - A visual AI drama production pipeline based on ComfyUI + FLUX2 + LTX-Video 2.0.

**Core Workflow**: Script Upload → LLM Analysis (Characters/Scenes) → FLUX2 Character Generation → FLUX2 Scene Images → LTX2 Video Clips → FFmpeg Video Composition

## Tech Stack

| Module | Technology |
|--------|-----------|
| Frontend | React 19 + TypeScript + Tailwind 4 + Vite 7 + Zustand |
| Backend | FastAPI + SQLAlchemy + SQLite (async with aiosqlite) |
| LLM | Ollama (localhost:11434) or LM Studio (localhost:1234) |
| Image Gen | ComfyUI (localhost:8000) + FLUX.1-dev/FLUX2 |
| Video Gen | ComfyUI + LTX-Video-2B |
| Video Merge | FFmpeg (planned) |

## Development Commands

### Frontend (Port 5173)
```bash
cd frontend
npm install              # Install dependencies
npm run dev              # Start dev server
npm run build            # Build for production
npm run lint             # Run ESLint
npm run preview          # Preview production build
```

### Backend (Port 8001)
```bash
cd backend

# Setup environment
conda env create -f environment.yaml  # Or manually create
conda activate ai-drama-studio
pip install -r requirements.txt

# Configure .env (copy from .env.example)
# Set LLM_TYPE, OLLAMA_URL/LMSTUDIO_URL, COMFYUI_URL, etc.

# Run server
python -m uvicorn app.main:app --reload --port 8001

# Or directly
python app/main.py
```

### Required External Services
- **Ollama**: `ollama serve` (port 11434), then `ollama pull qwen2.5:14b`
- **LM Studio**: Start local server (port 1234)
- **ComfyUI**: `python main.py --listen` (port 8000)
  - Required models: FLUX.1-dev/schnell, LTX-Video-2B, IPAdapter models

## Architecture

### System Flow
```
Frontend (Vite :5173)
    │ HTTP + Server-Sent Events (SSE)
    ▼
Backend (FastAPI :8001)
    │
    ├── Ollama/LM Studio (:11434/:1234) - Script analysis
    ├── ComfyUI (:8000) - FLUX2 images / LTX2 videos
    └── SQLite + Filesystem - Data storage
```

### Key Directories
```
frontend/src/
├── pages/           # HomePage, ScriptUploadPage, ScriptAnalysisPage, GenerationCenterPage
├── components/      # CharacterShowcase, SceneShowcase, etc.
├── stores/          # Zustand: projectStore (persisted to sessionStorage)
├── api/             # API client with typed calls
└── types/           # TypeScript interfaces

backend/app/
├── api/             # Routes: health, projects, analysis, generation, files
├── services/        # script_parser, llm_client, comfyui_client, generation_tasks, prompt_service
├── models/          # SQLAlchemy: Project, Character, Scene, CharacterImage, SceneImage, VideoClip
├── schemas/         # Pydantic with camelCase serialization
├── config/          # JSON configs: workflow_config, prompts (text/img/video)
├── core/            # Config, dependencies, logging
└── db/              # Database initialization

comfyui_workflows/   # JSON workflow files
data/projects/{id}/  # Per-project: script.{pdf,txt}, characters/, scenes/, videos/
```

## Critical Implementation Details

### LLM Analysis with Chunking
- Long scripts split into chunks (~8000 chars) at paragraph boundaries
- Characters: Deduplicated across chunks by name, merged into unified list
- Scenes: Cumulative across chunks with automatic renumbering for continuity
- Streaming: Server-Sent Events (SSE) with event types: `chunk_start`, `chunk_done`, `chunk_error`, `partial_save`
- Timeout: 300s for LLM reads to handle slow responses
- On chunk failure, successful data is preserved (partial saves)

### Configurable Prompt System
All prompts stored in `backend/app/config/prompts/`:
- `text/analysis_prompts.json` - Summary, character, scene analysis
- `img/character_prompts.json` - Character image generation
- `img/scene_prompts.json` - Scene image generation
- `video/action_prompts.json` - Video motion prompts

`PromptService` loads/caches prompts from JSON, supports template variables like `{character_name}`, `{scene_description}`. **Restart backend to reload prompt changes.**

### ComfyUI Integration
- Workflow JSON files in `comfyui_workflows/` use placeholder syntax: `{{variable_name}}`
- `ComfyUIClient` handles workflow submission, progress polling, output retrieval
- Three workflow types: character (FLUX2), scene (FLUX2 + IPAdapter), video (LTX2)
- Output files copied from ComfyUI output dir to project directories
- FLUX2 requires subgraph format compliance

### Frontend State Management
- Zustand store (`projectStore`) persists to `sessionStorage`
- Preserves analysis state (terminal output, streaming status) across page navigation
- Characters and scenes cached to avoid refetching
- UI uses Tailwind 4 with custom classes: `glass-effect`, `scrollbar-hide`
- Animation timing: 300-700ms transitions, use `isAnimating` state to prevent race conditions

## Configuration

### Environment Variables (.env)
```bash
# LLM Configuration
LLM_TYPE=ollama                           # or "lmstudio"
OLLAMA_URL=http://localhost:11434
LLM_MODEL=qwen2.5:14b
LLM_CHUNK_SIZE=8000                       # Characters per chunk
LLM_CONTEXT_LENGTH=32000

# ComfyUI Configuration
COMFYUI_URL=http://localhost:8000
COMFYUI_PATH=                             # Path to ComfyUI install (for model detection)
COMFYUI_OUTPUT_DIR=                       # Output dir to copy files from

# Storage
DATA_DIR=./data
DATABASE_URL=sqlite+aiosqlite:///./data/database.sqlite

# Server
HOST=0.0.0.0
PORT=8001
```

### Workflow Parameters (workflow_config.json)
- **Character Image (FLUX2)**: 1008x1024, Steps: 20, Guidance: 4.0
- **Scene Image (FLUX2 + IPAdapter)**: 768x1344 (9:16), Steps: 25, Guidance: 3.5, IPAdapter weight: 0.6
- **Video (LTX2)**: 768x1344, Frames: 97 (~4 sec @ 24fps), Steps: 30, CFG: 3.0

## API Endpoints

```
GET  /api/health                                    # Check service status
POST /api/projects                                  # Create project, upload script
GET  /api/projects/{id}                             # Get project details
GET  /api/projects/{id}/characters                  # List characters
GET  /api/projects/{id}/scenes                      # List scenes
POST /api/projects/{id}/analyze/summary             # Generate script summary (SSE)
POST /api/projects/{id}/analyze/characters          # Extract characters (SSE)
POST /api/projects/{id}/analyze/scenes              # Extract scene breakdown (SSE)
POST /api/projects/{id}/generate/character-library  # Batch generate character images
POST /api/projects/{id}/generate/scene-image/{sid}  # Generate scene image
POST /api/projects/{id}/generate/scene-video/{sid}  # Generate scene video
GET  /api/files/images/{project_id}/*               # Serve generated images
GET  /api/files/videos/{project_id}/*               # Serve generated videos
```

## Debugging

### Backend Logs
Local file logging in `backend/logs/`:
- `app.log` - Application logs
- `debug.log` - Detailed debug output
- Scene analysis debug output shows block-by-block processing and scene number mapping

### Frontend Debugging
- Scene loading debug logs in browser console
- Check `sessionStorage` for persisted Zustand state

## Known Issues / TODOs

- SSE chunk progress events (`chunk_start`, `chunk_done`) not yet displayed in frontend
- Video composition/export (FFmpeg) not yet implemented
- Task stop/cancel functionality incomplete (use delete project as workaround)
- `COMFYUI_OUTPUT_DIR` configuration recommended for file serving

## Memory Requirements

- FLUX2: 12GB+ VRAM (FP8 quantized)
- LTX2: 16GB+ VRAM

## Documentation

- `doc/ai-drama-studio-design.md` - Complete system design specification
- `doc/setup-guide.md` - Environment setup instructions
- `doc/progress.md` - Development progress tracker
- `doc/bugfix.md` - Bug fix history and known issues
- `frontend/UI_FEATURES.md` - Interactive UI features and keyboard shortcuts
