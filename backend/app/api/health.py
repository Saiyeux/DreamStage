from fastapi import APIRouter

from app.schemas import HealthResponse, ServiceStatus
from app.services.llm_client import llm_client
from app.services.comfyui_client import comfyui_client

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """检查所有服务状态"""
    llm_status = await llm_client.check_connection()
    comfyui_status = await comfyui_client.check_connection()

    return HealthResponse(
        status="ok",
        services=ServiceStatus(
            llm=llm_status,
            comfyui=comfyui_status["status"],
            flux2_loaded=comfyui_status["flux2_loaded"],
            ltx2_loaded=comfyui_status["ltx2_loaded"],
        ),
    )
