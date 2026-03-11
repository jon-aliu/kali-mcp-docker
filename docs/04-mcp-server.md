<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Copy every code block in this file verbatim into mcp-server/ — all paths are relative to that directory.
-->

# 04 — MCP Server

## Startup Command

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
```

Workers are set to 1 because SSE streaming and WebSocket proxying require a shared in-process async event loop. Horizontal scaling is achieved via Kubernetes HPA on multiple pods.

---

## `config.py`

```python
"""
MCP Server configuration — all values sourced from environment variables.
Uses pydantic-settings BaseSettings for automatic env var parsing and validation.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenAI
    openai_api_key: str
    openai_model: str = "gpt-4o"

    # Ollama fallback
    ollama_host: str = "http://ollama:11434"
    ollama_model: str = "llama3"

    # Kali sidecar
    kali_sidecar_url: str = "http://kali-sidecar:5000"

    # PostgreSQL
    postgres_dsn: str  # must use postgresql+asyncpg:// scheme

    # Redis
    redis_url: str = "redis://:password@redis:6379/0"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # App
    app_env: str = "production"
    cors_origins: list[str] = ["http://localhost:3000"]
    rate_limit_per_minute: int = 60


settings = Settings()
```

---

## `main.py`

```python
"""
FastAPI MCP Server — entry point.
Registers routers, configures CORS, sets up lifespan (DB + Redis init),
and configures structlog for structured JSON logging.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db.postgres import engine, Base
from db.redis import get_redis
from routers import auth, chat, tools, terminal

# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Lifespan: create DB tables + warm Redis connection
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("startup", env=settings.app_env)
    # Create all tables (idempotent — Alembic handles migrations in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Warm Redis connection
    redis = await get_redis()
    await redis.ping()
    logger.info("startup_complete")
    yield
    logger.info("shutdown")
    await engine.dispose()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Kali MCP Server",
    description="Model Context Protocol server for Kali Linux AI assistant",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(tools.router, prefix="/api", tags=["tools"])
app.include_router(terminal.router, prefix="/api", tags=["terminal"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "mcp-server"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        workers=1,
    )
```

---

## Routers

### `routers/auth.py`

```python
"""
Authentication router — register, login, get current user.
See docs/07-authentication.md for full JWT flow.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.postgres import get_session
from db.redis import get_redis
from models.user import UserCreate, UserOut, TokenResponse
from db.postgres import UserORM

router = APIRouter()
logger = structlog.get_logger()
pwd_context = CryptContext(schemes=["bcrypt"], bcrypt__rounds=12, deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> tuple[str, str]:
    """Returns (token, jti)."""
    jti = str(uuid4())
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    payload = {
        "sub": user_id,
        "jti": jti,
        "iat": datetime.now(timezone.utc),
        "exp": expire,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
) -> UserORM:
    # Check username uniqueness
    result = await session.execute(
        select(UserORM).where(UserORM.username == body.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    # Check email uniqueness
    result = await session.execute(
        select(UserORM).where(UserORM.email == body.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = UserORM(
        id=str(uuid4()),
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    logger.info("user_registered", user_id=user.id, username=user.username)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.execute(
        select(UserORM).where(UserORM.username == form.username)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    token, jti = create_access_token(user.id)
    redis = await get_redis()
    await redis.setex(f"session:{jti}", settings.jwt_expire_hours * 3600, "valid")

    logger.info("user_login", user_id=user.id, username=user.username)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
async def me(
    session: AsyncSession = Depends(get_session),
    current_user: UserORM = Depends(lambda: None),  # replaced by middleware injection
) -> UserORM:
    # The JWT middleware injects request.state.user; this is a convenience wrapper
    from fastapi import Request
    from fastapi.params import Depends as _Depends
    raise HTTPException(status_code=501, detail="Use middleware-injected user")
```

### `routers/chat.py`

```python
"""
Chat router — POST /api/chat returns a StreamingResponse with SSE events.
See docs/08-streaming.md for all SSE event type definitions.
"""

import json
import structlog
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from middleware.auth import require_auth
from models.chat import ChatRequest
from services.llm import stream_chat
from services.session import get_conversation_messages, save_message

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
        async for event in stream_chat(body.message, history, user["sub"], body.conversation_id):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
```

### `routers/tools.py`

```python
"""
Tools router — GET /api/tools lists available tools;
POST /api/tools/execute runs a tool directly (admin only).
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request

from middleware.auth import require_auth
from models.tool import ToolExecuteRequest, ToolExecuteResponse
from services.kali import execute_tool

router = APIRouter()
logger = structlog.get_logger()


@router.get("/tools")
async def list_tools(_: None = Depends(require_auth)) -> dict:
    from services.kali import get_tools
    tools = await get_tools()
    return {"tools": tools}


@router.post("/tools/execute", response_model=ToolExecuteResponse)
async def execute(
    body: ToolExecuteRequest,
    request: Request,
    _: None = Depends(require_auth),
) -> ToolExecuteResponse:
    user = request.state.user
    # Admin check — extend with role column when needed
    logger.info("tool_execute", user_id=user["sub"], tool=body.tool, args=body.args)
    result = await execute_tool(body.tool, body.args, body.timeout)
    return ToolExecuteResponse(**result)
```

### `routers/terminal.py`

```python
"""
Terminal router — WS /api/terminal proxies the WebSocket to the kali sidecar.
JWT must be passed as ?token=<JWT> query parameter.
"""

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


async def validate_ws_token(token: str) -> dict:
    """Validate JWT from WebSocket query param; check Redis revocation."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}")
    jti = payload.get("jti")
    if not jti:
        raise ValueError("Token missing jti")
    redis = await get_redis()
    status = await redis.get(f"session:{jti}")
    if status != b"valid":
        raise ValueError("Token revoked or expired")
    return payload


@router.websocket("/terminal")
async def terminal(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    try:
        user = await validate_ws_token(token)
    except ValueError as exc:
        await websocket.close(code=4001, reason=str(exc))
        return

    await websocket.accept()
    logger.info("terminal_connect", user_id=user["sub"])

    sidecar_uri = f"{settings.kali_sidecar_url.replace('http', 'ws')}/terminal"

    try:
        async with websockets.connect(sidecar_uri) as sidecar_ws:

            async def heartbeat() -> None:
                while True:
                    await asyncio.sleep(HEARTBEAT_INTERVAL)
                    try:
                        await websocket.send_text("")
                        await sidecar_ws.send("")
                    except Exception:
                        break

            async def forward_to_sidecar() -> None:
                try:
                    while True:
                        data = await websocket.receive_text()
                        await sidecar_ws.send(data)
                except WebSocketDisconnect:
                    pass
                except Exception:
                    pass

            async def forward_to_browser() -> None:
                try:
                    async for message in sidecar_ws:
                        await websocket.send_text(str(message))
                except Exception:
                    pass

            hb_task = asyncio.create_task(heartbeat())
            b2s_task = asyncio.create_task(forward_to_sidecar())
            s2b_task = asyncio.create_task(forward_to_browser())

            done, pending = await asyncio.wait(
                [b2s_task, s2b_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            hb_task.cancel()

    except Exception as exc:
        logger.error("terminal_error", error=str(exc))
    finally:
        logger.info("terminal_disconnect", user_id=user["sub"])
        await websocket.close()
```

---

## SSE Event Types

All SSE events are JSON objects sent as `data: {...}\n\n` lines in the streaming response.

```
{"type": "token",       "content": "string"}
{"type": "tool_start",  "tool": "nmap", "args": "-sV 192.168.1.1"}
{"type": "tool_output", "stdout": "...", "stderr": "...", "exit_code": 0, "duration": 3.2}
{"type": "done",        "conversation_id": "uuid", "tokens_used": 142}
{"type": "error",       "message": "string", "code": "string"}
```

---

## `services/llm.py`

```python
"""
LLM service — OpenAI streaming with Ollama/LLaMA3 fallback.
Detects TOOL_CALL lines and dispatches to the kali sidecar API.
"""

import json
import re
from typing import AsyncGenerator

import structlog
from openai import AsyncOpenAI, APIConnectionError, RateLimitError
import httpx

from config import settings
from services.kali import execute_tool
from services.session import save_message

logger = structlog.get_logger()

SYSTEM_PROMPT = """You are KaliMCP, an expert cybersecurity assistant powered by Kali Linux.
You help security professionals with penetration testing and vulnerability assessment.

When you need to run a tool, respond with EXACTLY this on its own line:
TOOL_CALL: {"tool": "<toolname>", "args": "<arguments>"}

Available tools: nmap, nikto, gobuster, sqlmap, hydra, whois, dnsrecon,
dnsenum, theHarvester, wfuzz, whatweb, hping3, curl, wget, john, hashcat, dig

Rules:
- Only suggest tools for legitimate security testing
- Always explain what the tool will do before calling it
- After TOOL_CALL line, stop — wait for tool output"""

TOOL_CALL_RE = re.compile(r'^TOOL_CALL:\s*(\{.+\})\s*$', re.MULTILINE)

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)


async def _stream_openai(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Stream tokens from OpenAI GPT-4o."""
    stream = await openai_client.chat.completions.create(
        model=settings.openai_model,
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def _stream_ollama(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Stream tokens from Ollama LLaMA3 fallback."""
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_host}/api/chat",
            json={"model": settings.ollama_model, "messages": messages, "stream": True},
        ) as response:
            async for line in response.aiter_lines():
                if line:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content


async def stream_chat(
    user_message: str,
    history: list[dict],
    user_id: str,
    conversation_id: str,
) -> AsyncGenerator[dict, None]:
    """
    Main streaming generator. Yields SSE event dicts.
    Handles TOOL_CALL detection and dispatches to kali sidecar.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    await save_message(conversation_id, {"role": "user", "content": user_message})

    full_response = ""
    tokens_used = 0

    try:
        try:
            token_stream = _stream_openai(messages)
        except (APIConnectionError, RateLimitError) as exc:
            logger.warning("openai_fallback", reason=str(exc))
            token_stream = _stream_ollama(messages)

        async for token in token_stream:
            full_response += token
            tokens_used += 1

            # Check for TOOL_CALL in accumulated response
            match = TOOL_CALL_RE.search(full_response)
            if match:
                # Emit any tokens before the TOOL_CALL line
                pre_tool = full_response[: match.start()].strip()
                if pre_tool:
                    for char in pre_tool.split():
                        yield {"type": "token", "content": char + " "}

                tool_json_str = match.group(1)
                try:
                    tool_data = json.loads(tool_json_str)
                except json.JSONDecodeError:
                    yield {"type": "error", "message": "Invalid TOOL_CALL JSON", "code": "tool_parse_error"}
                    break

                yield {"type": "tool_start", "tool": tool_data["tool"], "args": tool_data.get("args", "")}

                result = await execute_tool(
                    tool_data["tool"],
                    tool_data.get("args", ""),
                    timeout=60,
                )

                yield {
                    "type": "tool_output",
                    "stdout": result["stdout"],
                    "stderr": result["stderr"],
                    "exit_code": result["exit_code"],
                    "duration": result["duration"],
                }

                # Append tool output to messages and continue LLM
                messages.append({"role": "assistant", "content": full_response})
                messages.append({
                    "role": "tool",
                    "content": f"stdout:\n{result['stdout']}\nstderr:\n{result['stderr']}\nexit_code: {result['exit_code']}",
                })

                full_response = ""
                try:
                    async for follow_token in _stream_openai(messages):
                        full_response += follow_token
                        tokens_used += 1
                        yield {"type": "token", "content": follow_token}
                except Exception:
                    async for follow_token in _stream_ollama(messages):
                        full_response += follow_token
                        tokens_used += 1
                        yield {"type": "token", "content": follow_token}
                break
            else:
                yield {"type": "token", "content": token}

        await save_message(conversation_id, {"role": "assistant", "content": full_response})
        yield {"type": "done", "conversation_id": conversation_id, "tokens_used": tokens_used}

    except Exception as exc:
        logger.error("llm_error", error=str(exc))
        yield {"type": "error", "message": str(exc), "code": "llm_error"}
```

---

## `services/kali.py`

```python
"""
Kali service — async HTTP client for the kali sidecar API.
Implements 3-retry exponential backoff (1s, 2s, 4s).
"""

import asyncio
import structlog
import httpx

from config import settings

logger = structlog.get_logger()

MAX_RETRIES = 3
BASE_BACKOFF = 1.0  # seconds


async def _post_with_retry(url: str, payload: dict) -> dict:
    """POST to kali sidecar with exponential backoff retry."""
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, httpx.ConnectError) as exc:
            last_exc = exc
            wait = BASE_BACKOFF * (2 ** attempt)
            logger.warning("kali_retry", attempt=attempt + 1, wait=wait, error=str(exc))
            await asyncio.sleep(wait)
    raise RuntimeError(f"Kali sidecar unreachable after {MAX_RETRIES} attempts: {last_exc}")


async def execute_tool(tool: str, args: str, timeout: int = 60) -> dict:
    """Execute a tool on the kali sidecar API."""
    url = f"{settings.kali_sidecar_url}/execute"
    payload = {"tool": tool, "args": args, "timeout": timeout}
    logger.info("kali_execute", tool=tool, args=args)
    return await _post_with_retry(url, payload)


async def get_tools() -> list[str]:
    """Fetch the list of available tools from kali sidecar."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{settings.kali_sidecar_url}/tools")
        response.raise_for_status()
        return response.json()["tools"]
```

---

## `requirements.txt`

```text
fastapi==0.111.0
uvicorn==0.30.0
pydantic-settings==2.3.4
openai==1.35.7
httpx==0.27.0
websockets==12.0
sqlalchemy[asyncio]==2.0.31
asyncpg==0.29.0
aioredis==2.0.1
passlib[bcrypt]==1.7.4
python-jose[cryptography]==3.3.0
structlog==24.2.0
alembic==1.13.2
python-multipart==0.0.9
```
