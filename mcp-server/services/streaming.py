"""
SSE event formatters and async generator helpers.

All SSE events follow the format:
    data: <JSON>\n\n

Event types:
    {"type": "token",       "content": "string"}
    {"type": "tool_start",  "tool": "nmap", "args": "-sV 192.168.1.1"}
    {"type": "tool_output", "stdout": "...", "stderr": "...", "exit_code": 0, "duration": 3.2}
    {"type": "done",        "conversation_id": "uuid", "tokens_used": 142}
    {"type": "error",       "message": "string", "code": "string"}
"""

import json
from typing import Any, AsyncGenerator


# ---------------------------------------------------------------------------
# SSE line formatter
# ---------------------------------------------------------------------------


def format_sse(data: dict[str, Any]) -> str:
    """Serialize *data* as a single SSE data line (ends with double newline)."""
    return f"data: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Event constructors
# ---------------------------------------------------------------------------


def token_event(content: str) -> dict[str, Any]:
    """A single streaming token from the LLM."""
    return {"type": "token", "content": content}


def tool_start_event(tool: str, args: str) -> dict[str, Any]:
    """Signals that the LLM requested a tool call."""
    return {"type": "tool_start", "tool": tool, "args": args}


def tool_output_event(
    stdout: str,
    stderr: str,
    exit_code: int,
    duration: float,
) -> dict[str, Any]:
    """The result of executing a tool on the Kali sidecar."""
    return {
        "type": "tool_output",
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "duration": duration,
    }


def done_event(conversation_id: str, tokens_used: int) -> dict[str, Any]:
    """Signals that the LLM has finished generating the response."""
    return {
        "type": "done",
        "conversation_id": conversation_id,
        "tokens_used": tokens_used,
    }


def error_event(message: str, code: str = "error") -> dict[str, Any]:
    """Signals an error during inference or tool execution."""
    return {"type": "error", "message": message, "code": code}


# ---------------------------------------------------------------------------
# Async generator helpers
# ---------------------------------------------------------------------------


async def iter_sse(
    source: AsyncGenerator[dict[str, Any], None],
) -> AsyncGenerator[str, None]:
    """
    Wrap an async generator that yields event dicts and re-yield each one
    as a properly formatted SSE data line.

    Usage in a FastAPI route::

        return StreamingResponse(
            iter_sse(stream_chat(...)),
            media_type="text/event-stream",
        )
    """
    async for event in source:
        yield format_sse(event)
