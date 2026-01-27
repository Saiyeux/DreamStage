"""
日志配置模块
提供本地文件日志记录功能
"""

import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler
from datetime import datetime

# 日志目录
LOGS_DIR = Path(__file__).parent.parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

# 日志格式
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# 创建不同级别的日志处理器
def get_file_handler(level: int, filename: str) -> RotatingFileHandler:
    """
    创建文件处理器，自动轮转

    Args:
        level: 日志级别
        filename: 文件名

    Returns:
        RotatingFileHandler: 文件处理器
    """
    handler = RotatingFileHandler(
        LOGS_DIR / filename,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding="utf-8"
    )
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    return handler


def get_console_handler() -> logging.StreamHandler:
    """创建控制台处理器"""
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    return handler


def setup_logging():
    """配置应用日志系统"""

    # 获取根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # 清除已有处理器
    root_logger.handlers.clear()

    # 添加处理器
    # 1. 所有日志 -> app.log
    root_logger.addHandler(get_file_handler(logging.DEBUG, "app.log"))

    # 2. 错误日志 -> error.log
    root_logger.addHandler(get_file_handler(logging.ERROR, "error.log"))

    # 3. 调试日志 -> debug.log (包含DEBUG级别)
    root_logger.addHandler(get_file_handler(logging.DEBUG, "debug.log"))

    # 4. 控制台输出 (INFO及以上)
    root_logger.addHandler(get_console_handler())

    # 设置uvicorn日志
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    # 初始日志
    logging.info("=" * 80)
    logging.info(f"日志系统初始化完成 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logging.info(f"日志目录: {LOGS_DIR.absolute()}")
    logging.info("=" * 80)


def get_logger(name: str) -> logging.Logger:
    """
    获取指定名称的日志器

    Args:
        name: 日志器名称，通常使用 __name__

    Returns:
        logging.Logger: 日志器实例
    """
    return logging.getLogger(name)


# 导出日志记录器工厂函数
__all__ = ["setup_logging", "get_logger", "LOGS_DIR"]
