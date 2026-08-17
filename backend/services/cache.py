"""
Cache Service — async Redis wrapper for dataset and insight storage.
"""
from typing import Optional
import redis.asyncio as aioredis
import structlog

from utils.config import settings

log = structlog.get_logger()
_redis: Optional[aioredis.Redis] = None


async def init_cache() -> None:
    global _redis
    _redis = await aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=False,   # raw bytes for Parquet blobs
        max_connections=20,
    )
    await _redis.ping()
    log.info("Redis connected", url=settings.REDIS_URL)


async def close_cache() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


async def cache_set(key: str, value, ttl: int = 3600, raw: bool = False) -> None:
    if _redis is None:
        raise RuntimeError("Cache not initialised")
    if isinstance(value, str) and not raw:
        value = value.encode("utf-8")
    await _redis.setex(key, ttl, value)


async def cache_get(key: str, raw: bool = False) -> Optional[bytes | str]:
    if _redis is None:
        raise RuntimeError("Cache not initialised")
    val = await _redis.get(key)
    if val is None:
        return None
    if raw:
        return val
    return val.decode("utf-8")


async def cache_delete(key: str) -> None:
    if _redis is None:
        return
    await _redis.delete(key)


async def cache_exists(key: str) -> bool:
    if _redis is None:
        return False
    return bool(await _redis.exists(key))
