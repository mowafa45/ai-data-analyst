"""
Application configuration — reads from environment variables.
All secrets come from env; never hardcoded.
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Environment
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "change-me-in-production"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://analyst:analyst_dev_pass@localhost:5432/dataanalyst"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_DATASET_TTL: int = 86400          # 24 hours in seconds
    REDIS_INSIGHT_TTL: int = 3600           # 1 hour

    # Anthropic / AgentRouter
    # For AgentRouter: set ANTHROPIC_BASE_URL=https://agentrouter.org/
    # The Anthropic SDK appends /v1/messages automatically — do NOT add /v1 here.
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_BASE_URL: str = "https://api.anthropic.com"
    CLAUDE_MODEL: str = "claude-opus-4-8"
    CLAUDE_MAX_TOKENS: int = 4096

    # File upload
    MAX_FILE_SIZE_MB: int = 100
    UPLOAD_TEMP_DIR: str = "/tmp/uploads"
    ALLOWED_EXTENSIONS: List[str] = [".csv", ".xlsx", ".xls"]

    # Sessions
    SESSION_TTL_HOURS: int = 24

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "https://your-app.vercel.app",
    ]

    # Forecasting
    FORECAST_HORIZON_DAYS: int = 180
    MIN_ROWS_FOR_FORECAST: int = 30

    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024


settings = Settings()
