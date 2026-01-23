from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # 项目信息
    PROJECT_NAME: str = "AI Drama Studio"
    VERSION: str = "0.1.0"
    API_PREFIX: str = "/api"

    # LLM 配置
    LLM_TYPE: str = "ollama"  # ollama 或 lmstudio
    OLLAMA_URL: str = "http://localhost:11434"
    LMSTUDIO_URL: str = "http://localhost:1234"
    LLM_MODEL: str = "qwen2.5:14b"

    # ComfyUI 配置
    COMFYUI_URL: str = "http://localhost:8000"
    COMFYUI_PATH: str = ""  # ComfyUI 安装目录，用于检测本地模型

    # 存储配置
    DATA_DIR: Path = Path("./data")
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/database.sqlite"

    # 服务配置
    HOST: str = "0.0.0.0"
    PORT: int = 8001

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# 确保数据目录存在
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
(settings.DATA_DIR / "projects").mkdir(parents=True, exist_ok=True)
