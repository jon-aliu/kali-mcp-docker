"""
Async Redis client singleton.
Uses redis-py 5.x asyncio — compatible with Redis 7 and Python 3.12+.
"""

from redis.asyncio import Redis, from_url

from config import settings

_redis: Redis | None = None


async def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = await from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=False,
        )
    return _redis
