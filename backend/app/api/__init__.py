from fastapi import APIRouter

from app.api import health, projects, analysis, generation

router = APIRouter()

router.include_router(health.router, tags=["health"])
router.include_router(projects.router, prefix="/projects", tags=["projects"])
router.include_router(analysis.router, prefix="/projects", tags=["analysis"])
router.include_router(generation.router, prefix="/projects", tags=["generation"])
