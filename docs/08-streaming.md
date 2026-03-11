<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: This file is the definitive reference for all real-time communication patterns — SSE server, SSE client, WebSocket proxy, xterm.js integration.
-->

# 08 — Streaming

## SSE Event Types

All events are emitted as `data: <JSON>\n\n` lines in an HTTP response with `Content-Type: text/event-stream`.

```
{"type": "token",       "content": "string"}
{"type": "tool_start",  "tool": "nmap", "args": "-sV 192.168.1.1"}
{"type": "tool_output", "stdout": "...", "stderr": "...", "exit_code": 0, "duration": 3.2}
{"type": "done",        "conversation_id": "uuid", "tokens_used": 142}
{"type": "error",       "message": "string", "code": "string"}
```

---

## FastAPI SSE StreamingResponse

```python
# routers/chat.py — complete StreamingResponse implementation
import json
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from middleware.auth import require_auth
from models.chat import ChatRequest
from services.llm import stream_chat
from services.session import get_conversation_messages

router = APIRouter()


@router.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    _: None = Depends(require_auth),
) -> StreamingResponse:
    user = request.state.user

    async def event_generator():
        history = await get_conversation_messages(body.conversation_id)
        async for event in stream_chat(
            body.message, history, user["sub"], body.conversation_id
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            # Prevent nginx from buffering the SSE stream
            "X-Accel-Buffering": "no",
            # Prevent client-side caching
            "Cache-Control": "no-cache",
            # Keep the HTTP connection alive
            "Connection": "keep-alive",
        },
    )
```

> **Important:** The `X-Accel-Buffering: no` header is required when running behind nginx. Without it, the proxy buffers the entire response before forwarding to the browser, breaking the streaming experience.

---

## Frontend Fetch-Based SSE Consumer

```typescript
// lib/sse.ts — complete implementation using ReadableStream
// EventSource is NOT used because the endpoint is a POST request.

import { getToken } from "@/lib/auth";

export interface SSEHandlers {
  onToken: (token: string) => void;
  onToolStart: (tool: string, args: string) => void;
  onToolOutput: (output: {
    stdout: string;
    stderr: string;
    exit_code: number;
    duration: number;
  }) => void;
  onDone: (conversationId: string, tokensUsed: number) => void;
  onError: (message: string) => void;
}

export async function streamChat(
  request: { message: string; conversation_id: string },
  handlers: SSEHandlers,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    handlers.onError(`HTTP ${response.status}: ${text}`);
    return;
  }

  if (!response.body) {
    handlers.onError("Response body is null");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on double-newline (SSE event boundary)
      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const json = trimmed.slice(6);
        if (!json) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(json);
        } catch {
          continue; // Ignore malformed JSON
        }

        switch (event.type) {
          case "token":
            handlers.onToken(event.content as string);
            break;
          case "tool_start":
            handlers.onToolStart(event.tool as string, event.args as string);
            break;
          case "tool_output":
            handlers.onToolOutput({
              stdout:    event.stdout    as string,
              stderr:    event.stderr    as string,
              exit_code: event.exit_code as number,
              duration:  event.duration  as number,
            });
            break;
          case "done":
            handlers.onDone(
              event.conversation_id as string,
              event.tokens_used     as number
            );
            break;
          case "error":
            handlers.onError(event.message as string);
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

---

## WebSocket Terminal Proxy (FastAPI)

```python
# routers/terminal.py — complete bidirectional proxy implementation

import asyncio
import structlog
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt

from config import settings
from db.redis import get_redis

router = APIRouter()
logger = structlog.get_logger()

HEARTBEAT_INTERVAL = 30  # seconds


async def _validate_ws_token(token: str) -> dict:
    """Decode JWT and verify it is not revoked in Redis."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        raise ValueError(f"Invalid JWT: {exc}")

    jti = payload.get("jti")
    if not jti:
        raise ValueError("Token missing jti")

    redis = await get_redis()
    status = await redis.get(f"session:{jti}")
    if status != b"valid":
        raise ValueError("Token revoked or not found")

    return payload


@router.websocket("/terminal")
async def terminal(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
) -> None:
    # Validate JWT before accepting the WebSocket
    try:
        user = await _validate_ws_token(token)
    except ValueError as exc:
        await websocket.close(code=4001, reason=str(exc))
        return

    await websocket.accept()
    logger.info("terminal_connected", user_id=user.get("sub"))

    sidecar_ws_url = settings.kali_sidecar_url.replace("http://", "ws://").replace("https://", "wss://")
    sidecar_ws_url = f"{sidecar_ws_url}/terminal"

    try:
        async with websockets.connect(sidecar_ws_url) as sidecar_ws:

            async def heartbeat() -> None:
                """Send an empty frame every 30 s to keep both ends alive."""
                while True:
                    await asyncio.sleep(HEARTBEAT_INTERVAL)
                    try:
                        await websocket.send_text("")
                        await sidecar_ws.ping()
                    except Exception:
                        break

            async def browser_to_sidecar() -> None:
                try:
                    while True:
                        data = await websocket.receive_text()
                        await sidecar_ws.send(data)
                except WebSocketDisconnect:
                    pass

            async def sidecar_to_browser() -> None:
                try:
                    async for message in sidecar_ws:
                        text = message if isinstance(message, str) else message.decode("utf-8", errors="replace")
                        await websocket.send_text(text)
                except Exception:
                    pass

            hb   = asyncio.create_task(heartbeat())
            b2s  = asyncio.create_task(browser_to_sidecar())
            s2b  = asyncio.create_task(sidecar_to_browser())

            _done, pending = await asyncio.wait(
                [b2s, s2b],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            hb.cancel()

    except Exception as exc:
        logger.error("terminal_proxy_error", error=str(exc))
    finally:
        logger.info("terminal_disconnected", user_id=user.get("sub"))
        try:
            await websocket.close()
        except Exception:
            pass
```

---

## xterm.js Frontend Integration

```typescript
// components/terminal/LiveTerminal.tsx — complete implementation

"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getToken } from "@/lib/auth";

import "xterm/css/xterm.css";

interface LiveTerminalProps {
  open: boolean;
  onClose: () => void;
}

export function LiveTerminal({ open, onClose }: LiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<Terminal | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);
  const fitAddonRef  = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!open) return;

    // Small delay to ensure the dialog DOM is mounted before xterm attaches
    const timer = setTimeout(() => {
      if (!containerRef.current) return;

      // Initialise terminal
      const term = new Terminal({
        theme: {
          background: "#0d0d0d",
          foreground: "#e0e0e0",
          cursor:     "#00ff88",
        },
        fontFamily: "JetBrains Mono, Fira Code, monospace",
        fontSize:   14,
        cursorBlink: true,
        scrollback: 1000,
      });

      const fitAddon      = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current     = term;
      fitAddonRef.current = fitAddon;

      // Connect WebSocket
      const token = getToken();
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsHost     = window.location.host;
      const ws = new WebSocket(`${wsProtocol}://${wsHost}/api/terminal?token=${token}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (event.data) term.write(event.data);
      };

      ws.onclose = (event) => {
        term.write(`\r\n\x1b[31m[Connection closed: ${event.reason || "disconnected"}]\x1b[0m\r\n`);
      };

      ws.onerror = () => {
        term.write("\r\n\x1b[31m[WebSocket error]\x1b[0m\r\n");
      };

      // Terminal input → WebSocket
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Resize handler
      const handleResize = () => fitAddon.fit();
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [open]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      wsRef.current?.close();
      termRef.current?.dispose();
      wsRef.current    = null;
      termRef.current  = null;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col bg-background border-border p-0">
        <DialogHeader className="px-4 py-2 border-b border-border">
          <DialogTitle className="text-accent font-mono text-sm">
            Kali Linux Terminal
          </DialogTitle>
        </DialogHeader>
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden p-2"
          style={{ backgroundColor: "#0d0d0d" }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

---

## Heartbeat Ping/Pong

Both the WebSocket proxy (server-side) and xterm.js (client-side) implement keep-alive:

**Server side:** Every 30 seconds, the FastAPI terminal router sends an empty text frame to the browser WebSocket and a WebSocket ping frame to the kali sidecar. This prevents cloud load balancers (and nginx) from closing idle WebSocket connections.

**Client side:** xterm.js's underlying WebSocket API automatically responds to server ping frames with pong frames — no additional client code needed.

If the JWT expires during an active terminal session, the next heartbeat's empty frame will trigger a `receive_text()` with an empty string, which is forwarded harmlessly to the sidecar. However, the token validation only occurs at connection establishment — the session stays open until the browser disconnects or the server closes it.
