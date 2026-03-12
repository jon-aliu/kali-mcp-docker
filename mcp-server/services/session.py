"""
Conversation session service — Redis cache (hot) + PostgreSQL (persistent).
Redis stores the last 50 messages for fast LLM context retrieval (TTL 1h).
PostgreSQL is the source of truth; Redis is populated from it on cache miss.
"""

import json
from typing import Any
from uuid import UUID

import structlog

from db.redis import get_redis

logger = structlog.get_logger()

MAX_MESSAGES = 50
CONVERSATION_TTL = 3600  # 1 hour


def _key(conversation_id: str) -> str:
    return f"conversation:{conversation_id}:messages"


async def _ensure_conversation(session, conversation_id: str, user_id: str, title: str = "New conversation"):
    """Create a ConversationORM row if it doesn't already exist."""
    from db.postgres import ConversationORM
    conv_uuid = UUID(conversation_id)
    conv = await session.get(ConversationORM, conv_uuid)
    if not conv:
        conv = ConversationORM(id=conv_uuid, user_id=UUID(user_id), title=title)
        session.add(conv)
    return conv


async def get_conversation_messages(conversation_id: str) -> list[dict[str, Any]]:
    """Return the last MAX_MESSAGES messages. Tries Redis first, falls back to PostgreSQL."""
    redis = await get_redis()
    raw_messages = await redis.lrange(_key(conversation_id), -MAX_MESSAGES, -1)
    if raw_messages:
        return [json.loads(m) for m in raw_messages]

    # Cache miss — load from PostgreSQL and warm the cache
    try:
        from db.postgres import AsyncSessionLocal, MessageORM
        from sqlalchemy import select
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(MessageORM)
                .where(MessageORM.conversation_id == UUID(conversation_id))
                .order_by(MessageORM.created_at)
                .limit(MAX_MESSAGES)
            )
            msgs = result.scalars().all()
            if msgs:
                key = _key(conversation_id)
                pipe = redis.pipeline()
                for m in msgs:
                    pipe.rpush(key, json.dumps({"role": m.role, "content": m.content}))
                pipe.expire(key, CONVERSATION_TTL)
                await pipe.execute()
                return [{"role": m.role, "content": m.content} for m in msgs]
    except Exception as exc:
        logger.warning("postgres_cache_warm_failed", error=str(exc))

    return []


async def save_message(conversation_id: str, message: dict[str, Any], user_id: str | None = None) -> None:
    """Append a message to Redis and persist to PostgreSQL."""
    # ── Redis (hot cache for LLM context) ──────────────────────────────────
    redis = await get_redis()
    key = _key(conversation_id)
    await redis.rpush(key, json.dumps(message))
    await redis.expire(key, CONVERSATION_TTL)
    await redis.ltrim(key, -MAX_MESSAGES, -1)

    # ── PostgreSQL (persistent storage) ────────────────────────────────────
    if not user_id:
        return
    try:
        from db.postgres import AsyncSessionLocal, MessageORM
        from sqlalchemy import func, update
        from db.postgres import ConversationORM
        async with AsyncSessionLocal() as session:
            await _ensure_conversation(session, conversation_id, user_id)
            msg = MessageORM(
                conversation_id=UUID(conversation_id),
                role=message["role"],
                content=message["content"],
            )
            session.add(msg)
            # bump conversation updated_at
            await session.execute(
                update(ConversationORM)
                .where(ConversationORM.id == UUID(conversation_id))
                .values(updated_at=func.now())
            )
            await session.commit()
    except Exception as exc:
        logger.error("postgres_save_message_failed", error=str(exc))


async def update_conversation_title(conversation_id: str, title: str) -> None:
    """Update the title of a conversation in PostgreSQL."""
    try:
        from db.postgres import AsyncSessionLocal, ConversationORM
        async with AsyncSessionLocal() as session:
            conv = await session.get(ConversationORM, UUID(conversation_id))
            if conv:
                conv.title = title
                await session.commit()
    except Exception as exc:
        logger.error("postgres_update_title_failed", error=str(exc))
