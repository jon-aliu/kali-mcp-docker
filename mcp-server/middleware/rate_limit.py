"""
Redis sliding-window rate limiter.
Limits each user to rate_limit_per_minute requests per 60-second window.
"""

import structlog
from fastapi import HTTPException, Request, status

from config import settings
from db.redis import get_redis

logger = structlog.get_logger()


async def rate_limit(request: Request) -> None:
    """
    FastAPI dependency. Must be used AFTER require_auth so request.state.user exists.
    """
    user = getattr(request.state, "user", None)
    if not user:
        return  # Unauthenticated routes are not rate-limited here

    user_id = user.get("sub", "anonymous")
    redis = await get_redis()
    key = f"user:{user_id}:ratelimit"

    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, 60)

    if current > settings.rate_limit_per_minute:
        logger.warning("rate_limit_exceeded", user_id=user_id, count=current)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: {settings.rate_limit_per_minute} requests per minute",
        )
