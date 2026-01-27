from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.logging_config import setup_logging, get_logger
from app.db.database import init_db, close_db
from app.api import router as api_router

# 初始化日志系统
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("应用启动中...")
    await init_db()
    logger.info("数据库初始化完成")
    yield
    # 关闭时
    logger.info("应用关闭中...")
    await close_db()
    logger.info("数据库连接已关闭")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由
app.include_router(api_router, prefix=settings.API_PREFIX)

# 静态文件服务 (用于访问生成的图像/视频)
# 注意: 挂载静态文件会捕获所有匹配路径，需要放在路由之后
data_dir = settings.DATA_DIR / "projects"
data_dir.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(data_dir), check_dir=False), name="files")


@app.get("/")
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
