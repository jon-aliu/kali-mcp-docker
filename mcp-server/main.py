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
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.JSONRenderer(),
    ],
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
