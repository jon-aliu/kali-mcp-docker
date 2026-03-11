"""
Chat router — POST /api/chat returns a StreamingResponse with SSE events.
See docs/08-streaming.md for all SSE event type definitions.
"""

import structlog
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from middleware.auth import require_auth
from models.chat import ChatRequest
from services.llm import stream_chat
from services.session import get_conversation_messages
from services.streaming import iter_sse

router = APIRouter()
logger = structlog.get_logger()


@router.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    _: None = Depends(require_auth),
) -> StreamingResponse:
    user = request.state.user
    logger.info("chat_request", user_id=user["sub"], conversation_id=body.conversation_id)

    async def event_generator():
        history = await get_conversation_messages(body.conversation_id)
        async for chunk in iter_sse(
            stream_chat(
                body.message,
                history,
                user["sub"],
                body.conversation_id,
                provider=body.provider,
                api_key=body.api_key,
            )
        ):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
