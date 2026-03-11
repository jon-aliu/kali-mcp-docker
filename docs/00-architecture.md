<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Read this file first — it defines every service, data flow, and network boundary you must implement.
-->

# 00 — Architecture

## Overview

Kali MCP Docker is a seven-service distributed system. A Next.js browser application communicates with a FastAPI MCP server over HTTP, Server-Sent Events, and WebSockets. The MCP server speaks to OpenAI GPT-4o (or an Ollama/LLaMA3 fallback), a PostgreSQL database, a Redis cache, and a Kali sidecar API — a controlled REST interface that runs inside the Kali Linux container. The Kali container itself is isolated on a private internal Docker network, reachable only through the sidecar.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                          PUBLIC NETWORK                          │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              Next.js Frontend  :3000                    │   │
│   │           (React, Tailwind CSS, shadcn/ui)              │   │
│   └────────────────────┬────────────────────────────────────┘   │
│                        │ HTTP · SSE · WebSocket                  │
│   ┌────────────────────▼────────────────────────────────────┐   │
│   │              FastAPI MCP Server  :8000                  │   │
│   │   routers: auth · chat · tools · terminal               │   │
│   │   services: llm · kali · streaming · session            │   │
│   └──────┬──────────────────┬────────────────┬─────────────┘   │
│          │                  │                │                   │
│   ┌──────▼──────┐  ┌────────▼──────┐  ┌─────▼──────────┐       │
│   │ OpenAI GPT-4o│  │PostgreSQL:5432│  │  Redis  :6379  │       │
│   │ (external)  │  │  (users, chat)│  │(sessions, cache)│       │
│   └─────────────┘  └───────────────┘  └────────────────┘        │
│                                                                  │
│   ┌─────────────────────────── app-net ─────────────────────┐   │
│   │                                                         │   │
│   │  ┌──────────────────────── kali-net (internal) ──────┐  │   │
│   │  │                                                   │  │   │
│   │  │  ┌─────────────────────────────────────────────┐  │  │   │
│   │  │  │       Kali Sidecar API  :5000               │  │  │   │
│   │  │  │       (FastAPI, no external ports)          │  │  │   │
│   │  │  │   POST /execute · GET /tools · WS /terminal │  │  │   │
│   │  │  └───────────────────┬─────────────────────────┘  │  │   │
│   │  │                      │                            │  │   │
│   │  │  ┌───────────────────▼─────────────────────────┐  │  │   │
│   │  │  │       Kali Linux Container                  │  │  │   │
│   │  │  │       (kalilinux/kali-rolling)               │  │  │   │
│   │  │  │       UID 1001 · /home/kaliuser/results      │  │  │   │
│   │  │  └─────────────────────────────────────────────┘  │  │   │
│   │  └───────────────────────────────────────────────────┘  │   │
│   │                                                         │   │
│   │  ┌─────────────────────────────────────────────────┐    │   │
│   │  │       Ollama  :11434  (LLaMA3 fallback)         │    │   │
│   │  └─────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Service Responsibilities

| Service | Port | Protocol | Responsibility |
|---------|------|----------|----------------|
| Next.js Frontend | 3000 | HTTP / SSE / WebSocket | Serve React UI; stream LLM tokens; proxy WebSocket terminal |
| FastAPI MCP Server | 8000 | HTTP / SSE / WebSocket | Auth, LLM orchestration, tool routing, streaming |
| Kali Sidecar API | 5000 | HTTP / WebSocket | Expose Kali tools via REST; proxy interactive bash shell |
| Kali Linux Container | — | internal | Run Kali tools; store results in /home/kaliuser/results |
| PostgreSQL | 5432 | TCP | Persist users, conversations, messages, tool audit log |
| Redis | 6379 | TCP | JWT session revocation, rate limiting, message cache |
| Ollama | 11434 | HTTP | LLaMA3 inference fallback when OpenAI is unavailable |

---

## Port Map

| Container | Internal Port | Exposed on Host |
|-----------|--------------|-----------------|
| frontend | 3000 | 3000 |
| mcp-server | 8000 | 8000 |
| kali-sidecar | 5000 | none (internal only) |
| postgres | 5432 | 5432 (dev only) |
| redis | 6379 | 6379 (dev only) |
| ollama | 11434 | 11434 (optional) |
| kali | — | none |

---

## Data Flow 1 — Chat Message → LLM Streams Tokens via SSE

```
1. Browser sends POST /api/chat with {message, conversation_id}
   and Authorization: Bearer <JWT> header.

2. MCP Server middleware validates JWT against Redis (checks for revocation).

3. MCP Server loads last 50 messages from Redis cache
   (key: conversation:{id}:messages); falls back to PostgreSQL if cache miss.

4. MCP Server builds the OpenAI messages array:
   [system_prompt, ...history, {role: "user", content: message}]

5. MCP Server calls openai.chat.completions.create(..., stream=True)
   and wraps the async generator in a FastAPI StreamingResponse.

6. For each streamed chunk, the server emits an SSE event:
   data: {"type": "token", "content": "Hello"}

7. Browser's fetch-based SSE consumer (lib/sse.ts) reads the
   ReadableStream, parses each "data: {...}" line, and appends
   the token to the Zustand chat store.

8. When streaming ends, MCP Server:
   a. Persists the full assistant message to PostgreSQL (messages table).
   b. Updates Redis conversation cache.
   c. Emits: data: {"type": "done", "conversation_id": "...", "tokens_used": 142}
```

---

## Data Flow 2 — LLM Detects TOOL_CALL → Sidecar Executes → Output Streams Back

```
1. As tokens stream from OpenAI, MCP Server's streaming.py buffers
   each line and checks for the pattern:
   TOOL_CALL: {"tool": "nmap", "args": "-sV 192.168.1.1"}

2. On detection, streaming pauses LLM output and emits:
   data: {"type": "tool_start", "tool": "nmap", "args": "-sV 192.168.1.1"}

3. services/kali.py sends POST http://kali-sidecar:5000/execute
   with body {"tool": "nmap", "args": "-sV 192.168.1.1"}.
   Retries up to 3 times with exponential backoff (1s, 2s, 4s).

4. Kali sidecar API validates tool against ALLOWED_TOOLS list,
   uses shlex.split to parse args safely, and runs the subprocess
   with asyncio.create_subprocess_exec (no shell=True).

5. Sidecar collects stdout, stderr, exit_code, and duration_seconds,
   returns JSON to MCP Server.

6. MCP Server emits:
   data: {"type": "tool_output", "stdout": "...", "stderr": "", "exit_code": 0, "duration": 3.2}

7. MCP Server appends the tool output as a "tool" role message and
   resumes LLM streaming for the assistant's interpretation.

8. Full exchange (user message + tool call + tool output + assistant
   interpretation) is persisted to PostgreSQL.
```

---

## Data Flow 3 — Live Terminal → WebSocket Proxied through MCP Server → Kali Bash

```
1. Browser opens WebSocket to ws://localhost:8000/api/terminal
   with JWT as query parameter: ?token=<JWT>.

2. MCP Server terminal router validates JWT; establishes a second
   WebSocket connection to ws://kali-sidecar:5000/terminal.

3. MCP Server acts as a transparent bidirectional proxy:
   - Browser keystrokes → mcp-server WS → kali-sidecar WS → bash stdin
   - bash stdout/stderr → kali-sidecar WS → mcp-server WS → browser

4. xterm.js in the browser renders the raw terminal data stream.

5. A heartbeat ping is sent every 30 seconds from the MCP Server
   to both connections to prevent idle disconnection.

6. On browser disconnect or JWT expiry, both WebSocket connections
   are closed and the bash session is terminated.
```

---

## Network Topology

| From | To | Allowed | Network |
|------|----|---------|---------|
| frontend | mcp-server | ✅ | app-net |
| mcp-server | postgres | ✅ | app-net |
| mcp-server | redis | ✅ | app-net |
| mcp-server | kali-sidecar | ✅ | app-net + kali-net |
| mcp-server | openai (external) | ✅ | host network |
| mcp-server | ollama | ✅ | app-net |
| kali-sidecar | kali | ✅ | kali-net |
| kali | internet | ❌ | kali-net (internal: true) |
| frontend | postgres | ❌ | not on same network |
| frontend | kali-sidecar | ❌ | not on same network |

The `kali-net` Docker network is declared `internal: true`, which means containers on that network cannot reach the internet directly. Only `kali-sidecar` bridges `kali-net` and `app-net`.

---

## Technology Justification

**FastAPI** was chosen for the MCP server because it has native `async`/`await` support throughout — critical for non-blocking LLM streaming, concurrent WebSocket proxying, and async PostgreSQL/Redis operations. Its automatic OpenAPI docs also help during development.

**Next.js 14 App Router** provides React Server Components for the layout, file-system routing for clean URL structure, and built-in support for streaming responses. Combined with Tailwind CSS and shadcn/ui, it enables a production-quality dark-themed terminal interface with minimal boilerplate.

**SSE (Server-Sent Events)** over HTTP is used for LLM token streaming because it is simpler than WebSocket for unidirectional push, works through standard HTTP/2 proxies, and supports automatic reconnection. A custom fetch-based consumer is required (not `EventSource`) because the chat endpoint is a `POST` request.

**PostgreSQL + Redis** are used together: PostgreSQL provides ACID-compliant persistence for users, conversations, and the tool audit log; Redis provides sub-millisecond session validation (JWT revocation) and caches the last 50 messages per conversation to avoid spamming the database on every chat turn.

**JWT HS256** with 24-hour expiry and per-token JTI revocation via Redis provides stateless authentication while still allowing immediate logout (by marking the JTI as "revoked" in Redis).

**Sidecar pattern** ensures the Kali Linux container never exposes its Docker socket or arbitrary command execution to the internet. All tool invocations pass through the sidecar's `ALLOWED_TOOLS` allowlist and `shlex.split` sanitization, and the Kali container has `internal: true` network isolation preventing direct outbound connections.
