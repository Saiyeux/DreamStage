# 环境配置指南

## 前置要求

- Node.js >= 18
- Conda (Miniconda / Anaconda)
- Ollama 或 LM Studio (LLM 服务)
- ComfyUI (图像/视频生成)

## 前端环境

```bash
cd frontend
npm install
npm run dev  # 启动开发服务器 http://localhost:5173
```

### 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | 代码检查 |

## 后端环境

```bash
cd backend

# 创建并激活 conda 环境
conda env create -f environment.yaml
conda activate ai-drama-studio

# 或手动创建
conda create -n ai-drama-studio python=3.11
conda activate ai-drama-studio
pip install -r requirements.txt
```

## 本地服务

### Ollama (推荐)

```bash
# 安装后启动服务
ollama serve  # 默认端口 11434

# 下载模型
ollama pull qwen2.5:14b  # 或其他模型
```

### LM Studio

- 下载并启动 LM Studio
- 加载模型后启用 Local Server (默认端口 1234)

### ComfyUI

```bash
# 启动 ComfyUI
python main.py --listen  # 默认端口 8188
```

**所需模型**:
- FLUX.1-dev 或 FLUX.1-schnell (图像生成)
- LTX-Video-2B (视频生成)
- IPAdapter 相关模型 (角色一致性)

## 端口汇总

| 服务 | 端口 |
|------|------|
| Frontend (Vite) | 5173 |
| Backend (FastAPI) | 8000 |
| Ollama | 11434 |
| LM Studio | 1234 |
| ComfyUI | 8188 |
