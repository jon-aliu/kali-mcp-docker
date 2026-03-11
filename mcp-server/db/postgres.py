# mcp-server/db/postgres.py

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

    conversations   = relationship("ConversationORM", back_populates="user", cascade="all, delete-orphan")
    tool_executions = relationship("ToolExecutionORM", back_populates="user", cascade="all, delete-orphan")


class ConversationORM(Base):
    __tablename__ = "conversations"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = Column(String(255))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user            = relationship("UserORM", back_populates="conversations")
    messages        = relationship("MessageORM", back_populates="conversation", cascade="all, delete-orphan")
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
