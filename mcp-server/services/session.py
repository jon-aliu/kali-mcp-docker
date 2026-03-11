"""
Conversation session service — Redis-backed message cache with PostgreSQL fallback.
Stores the last 50 messages per conversation in Redis (TTL 1h).
"""

import json
from typing import Any

import structlog

from db.redis import get_redis

logger = structlog.get_logger()

MAX_MESSAGES = 50
CONVERSATION_TTL = 3600  # 1 hour


def _key(conversation_id: str) -> str:
    return f"conversation:{conversation_id}:messages"


async def get_conversation_messages(conversation_id: str) -> list[dict[str, Any]]:
    """Return the last MAX_MESSAGES messages for a conversation from Redis."""
    redis = await get_redis()
    raw_messages = await redis.lrange(_key(conversation_id), -MAX_MESSAGES, -1)
    return [json.loads(m) for m in raw_messages]


async def save_message(conversation_id: str, message: dict[str, Any]) -> None:
    """Append a message to the Redis list and reset TTL."""
    redis = await get_redis()
    key = _key(conversation_id)
    await redis.rpush(key, json.dumps(message))
    await redis.expire(key, CONVERSATION_TTL)
    # Trim to last MAX_MESSAGES
    await redis.ltrim(key, -MAX_MESSAGES, -1)
    logger.debug("message_saved", conversation_id=conversation_id, role=message.get("role"))
