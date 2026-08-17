"""
AI Data Analyst — FastAPI Backend
Entry point: configures middleware, routers, startup/shutdown hooks.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from routers import upload, chat, analysis, forecast, export, health
from services.database import init_db, close_db
from services.cache import init_cache, close_cache
from utils.config import settings

# ── Structured logging ────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)
log = structlog.get_logger()


# ── Lifespan (startup / shutdown) ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting AI Data Analyst backend", env=settings.ENVIRONMENT)
    await init_db()
    await init_cache()
    log.info("Database and cache ready")
    yield
    log.info("Shutting down…")
    await close_db()
    await close_cache()


# ── App factory ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Data Analyst API",
    description="Conversational analytics platform powered by Claude AI",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router,   prefix="/api",          tags=["health"])
app.include_router(upload.router,   prefix="/api/upload",   tags=["upload"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(chat.router,     prefix="/api/chat",     tags=["chat"])
app.include_router(forecast.router, prefix="/api/forecast", tags=["forecast"])
app.include_router(export.router,   prefix="/api/export",   tags=["export"])


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development",
        log_level="info",
    )
