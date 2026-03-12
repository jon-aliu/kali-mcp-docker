"""
Conversations router — CRUD for chat conversations stored in PostgreSQL.

Endpoints:
  GET    /api/conversations                  — list user's conversations
  POST   /api/conversations                  — create/upsert a conversation (client supplies ID)
  GET    /api/conversations/{id}/messages    — messages for a conversation
  PATCH  /api/conversations/{id}             — rename a conversation
  DELETE /api/conversations/{id}             — delete a conversation + its messages
"""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from typing import Optional

from db.postgres import AsyncSessionLocal, ConversationORM, MessageORM
from middleware.auth import require_auth

router = APIRouter()
logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ConversationOut(BaseModel):
    id: str
    title: str
    provider: Optional[str] = None
    model: Optional[str] = None
    created_at: str
    updated_at: str


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class CreateConversationBody(BaseModel):
    id: str           # client-generated UUID
    title: str = "New conversation"
    provider: Optional[str] = None
    model: Optional[str] = None


class RenameConversationBody(BaseModel):
    title: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_user_conversation(conv_id: str, user_id: UUID, session):
    conv = await session.get(ConversationORM, UUID(conv_id))
    if not conv or conv.user_id != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[ConversationOut])
async def list_conversations(request: Request, _=Depends(require_auth)):
    user_id = UUID(request.state.user["sub"])
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ConversationORM)
            .where(ConversationORM.user_id == user_id)
            .order_by(ConversationORM.updated_at.desc())
        )
        convs = result.scalars().all()
        return [
            ConversationOut(
                id=str(c.id),
                title=c.title or "New conversation",
                created_at=c.created_at.isoformat(),
                updated_at=c.updated_at.isoformat(),
            )
            for c in convs
        ]


@router.post("/", response_model=ConversationOut, status_code=201)
async def create_conversation(body: CreateConversationBody, request: Request, _=Depends(require_auth)):
    user_id = UUID(request.state.user["sub"])
    async with AsyncSessionLocal() as session:
        try:
            conv_id = UUID(body.id)
        except ValueError:
            raise HTTPException(status_code=422, detail="id must be a valid UUID")

        # Upsert: if already exists (created by save_message), just update title
        existing = await session.get(ConversationORM, conv_id)
        if existing:
            if existing.user_id != user_id:
                raise HTTPException(status_code=403, detail="Forbidden")
            existing.title = body.title
            await session.commit()
            return ConversationOut(
                id=str(existing.id),
                title=existing.title or "New conversation",
                created_at=existing.created_at.isoformat(),
                updated_at=existing.updated_at.isoformat(),
            )

        conv = ConversationORM(id=conv_id, user_id=user_id, title=body.title)
        session.add(conv)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(status_code=409, detail="Conversation already exists")
        await session.refresh(conv)
        return ConversationOut(
            id=str(conv.id),
            title=conv.title or "New conversation",
            created_at=conv.created_at.isoformat(),
            updated_at=conv.updated_at.isoformat(),
        )


@router.get("/{conv_id}/messages", response_model=list[MessageOut])
async def get_messages(conv_id: str, request: Request, _=Depends(require_auth)):
    user_id = UUID(request.state.user["sub"])
    async with AsyncSessionLocal() as session:
        await _get_user_conversation(conv_id, user_id, session)
        result = await session.execute(
            select(MessageORM)
            .where(MessageORM.conversation_id == UUID(conv_id))
            .order_by(MessageORM.created_at)
        )
        msgs = result.scalars().all()
        return [
            MessageOut(
                id=str(m.id),
                role=m.role,
                content=m.content,
                created_at=m.created_at.isoformat(),
            )
            for m in msgs
        ]


@router.patch("/{conv_id}", response_model=ConversationOut)
async def rename_conversation(conv_id: str, body: RenameConversationBody, request: Request, _=Depends(require_auth)):
    user_id = UUID(request.state.user["sub"])
    async with AsyncSessionLocal() as session:
        conv = await _get_user_conversation(conv_id, user_id, session)
        conv.title = body.title.strip() or "New conversation"
        await session.commit()
        return ConversationOut(
            id=str(conv.id),
            title=conv.title,
            created_at=conv.created_at.isoformat(),
            updated_at=conv.updated_at.isoformat(),
        )


@router.delete("/{conv_id}", status_code=204)
async def delete_conversation(conv_id: str, request: Request, _=Depends(require_auth)):
    user_id = UUID(request.state.user["sub"])
    async with AsyncSessionLocal() as session:
        conv = await _get_user_conversation(conv_id, user_id, session)
        await session.delete(conv)
        await session.commit()
