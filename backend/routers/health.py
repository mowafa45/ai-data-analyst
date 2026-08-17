"""Health check router — /api/health"""
from fastapi import APIRouter
from models.schemas import HealthResponse
from services.cache import cache_exists

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    db_ok = "ok"
    cache_ok = "ok"
    try:
        await cache_exists("__ping__")
    except Exception:
        cache_ok = "unavailable"

    return HealthResponse(
        status="ok" if cache_ok == "ok" else "degraded",
        db=db_ok,
        cache=cache_ok,
    )
