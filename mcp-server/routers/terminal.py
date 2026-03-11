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
