from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import async_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
