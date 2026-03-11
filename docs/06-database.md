<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Copy the SQL schema, SQLAlchemy models, and Alembic migration verbatim — field names must match exactly everywhere.
-->

# 06 — Database

## PostgreSQL Schema

```sql
-- Full schema for Kali MCP Docker
-- Run via Alembic: alembic upgrade head

-- -----------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    is_admin        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email    ON users (email);

-- -----------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------
CREATE TABLE conversations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations (user_id);

-- -----------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content         TEXT        NOT NULL,
    tokens_used     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_created_at      ON messages (created_at);

-- -----------------------------------------------------------------------
-- tool_executions  (audit log)
-- -----------------------------------------------------------------------
CREATE TABLE tool_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID        REFERENCES conversations(id) ON DELETE SET NULL,
    tool            VARCHAR(50) NOT NULL,
    args            TEXT        NOT NULL,
    stdout          TEXT,
    stderr          TEXT,
    exit_code       INTEGER,
    duration        NUMERIC(8, 3),
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_executions_user_id         ON tool_executions (user_id);
CREATE INDEX idx_tool_executions_executed_at     ON tool_executions (executed_at);
CREATE INDEX idx_tool_executions_tool            ON tool_executions (tool);
```

---

## SQLAlchemy ORM Models

```python
# mcp-server/db/postgres.py

from datetime import datetime
from uuid import uuid4
from typing import AsyncGenerator

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer,
    Numeric, String, Text, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship

from config import settings


# ---------------------------------------------------------------------------
# Engine — must use postgresql+asyncpg:// DSN
# ---------------------------------------------------------------------------

engine = create_async_engine(
    settings.postgres_dsn,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=settings.app_env == "development",
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class UserORM(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    username        = Column(String(50),  nullable=False, unique=True)
    email           = Column(String(255), nullable=False, unique=True)
    hashed_password = Column(String(255), nullable=False)
    is_active       = Column(Boolean, nullable=False, default=True)
    is_admin        = Column(Boolean, nullable=False, default=False)
    created_at      = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    conversations = relationship("ConversationORM", back_populates="user", cascade="all, delete-orphan")
    tool_executions = relationship("ToolExecutionORM", back_populates="user", cascade="all, delete-orphan")


class ConversationORM(Base):
    __tablename__ = "conversations"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = Column(String(255))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user     = relationship("UserORM", back_populates="conversations")
    messages = relationship("MessageORM", back_populates="conversation", cascade="all, delete-orphan")
    tool_executions = relationship("ToolExecutionORM", back_populates="conversation")


class MessageORM(Base):
    __tablename__ = "messages"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role            = Column(String(20), nullable=False)
    content         = Column(Text, nullable=False)
    tokens_used     = Column(Integer)
    created_at      = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    conversation = relationship("ConversationORM", back_populates="messages")


class ToolExecutionORM(Base):
    __tablename__ = "tool_executions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id",         ondelete="CASCADE"),  nullable=False)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True)
    tool            = Column(String(50), nullable=False)
    args            = Column(Text,       nullable=False)
    stdout          = Column(Text)
    stderr          = Column(Text)
    exit_code       = Column(Integer)
    duration        = Column(Numeric(8, 3))
    executed_at     = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user         = relationship("UserORM",         back_populates="tool_executions")
    conversation = relationship("ConversationORM", back_populates="tool_executions")
```

---

## Redis Key Patterns

| Key | Type | TTL | Content |
|-----|------|-----|---------|
| `session:{jti}` | String | 24h (86400s) | `"valid"` or `"revoked"` |
| `user:{id}:ratelimit` | String | 60s | request count (integer string) |
| `conversation:{id}:messages` | List | 1h (3600s) | JSON-encoded message objects, capped at last 50 |
| `tools:list` | String | 5min (300s) | JSON array of tool name strings |

---

## Redis Client — `db/redis.py`

```python
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
```

---

## Session Service — `services/session.py`

```python
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
```

---

## Alembic Setup

```bash
# From the mcp-server/ directory:
pip install alembic
alembic init migrations
# Edit migrations/env.py to use async engine (see below)
alembic revision --autogenerate -m "initial"
alembic upgrade head
```

---

## `migrations/env.py`

```python
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import all ORM models so Alembic can detect them
from db.postgres import Base, UserORM, ConversationORM, MessageORM, ToolExecutionORM  # noqa: F401
from config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.postgres_dsn)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

---

## `migrations/versions/0001_initial.py`

```python
"""initial

Revision ID: 0001
Revises:
Create Date: 2026-03-11 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username",        sa.String(50),  nullable=False, unique=True),
        sa.Column("email",           sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active",       sa.Boolean(),   nullable=False, server_default="true"),
        sa.Column("is_admin",        sa.Boolean(),   nullable=False, server_default="false"),
        sa.Column("created_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_users_username", "users", ["username"])
    op.create_index("idx_users_email",    "users", ["email"])

    op.create_table(
        "conversations",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",    postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title",      sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_conversations_user_id", "conversations", ["user_id"])

    op.create_table(
        "messages",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role",            sa.String(20), nullable=False),
        sa.Column("content",         sa.Text(),     nullable=False),
        sa.Column("tokens_used",     sa.Integer()),
        sa.Column("created_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("idx_messages_created_at",      "messages", ["created_at"])

    op.create_table(
        "tool_executions",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",         postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id",         ondelete="CASCADE"),  nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tool",            sa.String(50), nullable=False),
        sa.Column("args",            sa.Text(),     nullable=False),
        sa.Column("stdout",          sa.Text()),
        sa.Column("stderr",          sa.Text()),
        sa.Column("exit_code",       sa.Integer()),
        sa.Column("duration",        sa.Numeric(8, 3)),
        sa.Column("executed_at",     sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_tool_executions_user_id",     "tool_executions", ["user_id"])
    op.create_index("idx_tool_executions_executed_at", "tool_executions", ["executed_at"])
    op.create_index("idx_tool_executions_tool",        "tool_executions", ["tool"])


def downgrade() -> None:
    op.drop_table("tool_executions")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("users")
```
