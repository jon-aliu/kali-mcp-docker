"""
Async Redis client singleton.
Uses aioredis 2.x — compatible with Redis 7.
"""

import aioredis
from aioredis import Redis

from config import settings

_redis: Redis | None = None


async def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=False,
        )
    return _redis
