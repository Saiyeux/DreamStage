"""
日志配置模块
提供本地文件日志记录功能，优化后减少刷屏，保留关键错误信息
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
# 控制台格式：简洁，只显示关键信息
CONSOLE_FORMAT = "%(levelname)s | %(name)s | %(message)s"
# 文件格式：详细，包含时间和行号
FILE_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


class NoiseFilter(logging.Filter):
    """过滤掉噪音日志"""
    
    # 需要过滤的日志模式
    NOISE_PATTERNS = [
        "GET /api/health",  # 健康检查
        "GET /api/projects/tasks/",  # 任务状态轮询
        "HTTP/1.1\" 200",  # 成功的HTTP请求
        "HTTP/1.1\" 304",  # 未修改的请求
    ]
    
    def filter(self, record):
        """过滤日志记录"""
        message = record.getMessage()
        # 如果是噪音日志，不显示在控制台
        for pattern in self.NOISE_PATTERNS:
            if pattern in message:
                return False
        return True


class ErrorOnlyFilter(logging.Filter):
    """只允许ERROR及以上级别的日志"""
    
    def filter(self, record):
        return record.levelno >= logging.ERROR


# 创建不同级别的日志处理器
def get_file_handler(level: int, filename: str, use_filter: bool = False) -> RotatingFileHandler:
    """
    创建文件处理器，自动轮转

    Args:
        level: 日志级别
        filename: 文件名
        use_filter: 是否使用错误过滤器

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
    handler.setFormatter(logging.Formatter(FILE_FORMAT, DATE_FORMAT))
    
    if use_filter:
        handler.addFilter(ErrorOnlyFilter())
    
    return handler


def get_console_handler() -> logging.StreamHandler:
    """创建控制台处理器，使用简洁格式和噪音过滤"""
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter(CONSOLE_FORMAT, DATE_FORMAT))
    # 添加噪音过滤器
    handler.addFilter(NoiseFilter())
    return handler


def setup_logging():
    """配置应用日志系统"""

    # 获取根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # 清除已有处理器
    root_logger.handlers.clear()

    # 添加处理器
    # 1. 错误日志 -> error.log (只记录ERROR及以上)
    root_logger.addHandler(get_file_handler(logging.ERROR, "error.log", use_filter=True))

    # 2. 完整日志 -> app.log (记录INFO及以上，用于问题排查)
    root_logger.addHandler(get_file_handler(logging.INFO, "app.log"))

    # 3. 控制台输出 (INFO及以上，过滤噪音)
    root_logger.addHandler(get_console_handler())

    # 设置第三方库日志级别，减少噪音
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.ERROR)  # 只记录访问错误
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)

    # 初始日志
    logging.info("=" * 60)
    logging.info(f"日志系统初始化 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logging.info(f"日志目录: {LOGS_DIR.absolute()}")
    logging.info("=" * 60)


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
