"""
JWT authentication middleware.
Validates Bearer token, checks Redis for revocation, injects user into request.state.
"""

import structlog
from fastapi import HTTPException, Request, status
from jose import JWTError, jwt

from config import settings
from db.redis import get_redis

logger = structlog.get_logger()


async def require_auth(request: Request) -> None:
    """
    FastAPI dependency. Call as: `_: None = Depends(require_auth)`

    Validates the JWT and stores the decoded payload in request.state.user.
    Raises HTTP 401 on any validation failure.
    """
    # Extract Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header.removeprefix("Bearer ").strip()

    # Decode and verify JWT signature + expiry
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError as exc:
        logger.warning("jwt_invalid", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    jti = payload.get("jti")
    if not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing jti claim",
        )

    # Check Redis for revocation
    redis = await get_redis()
    session_status = await redis.get(f"session:{jti}")
    if session_status != b"valid":
        logger.info("jwt_revoked", jti=jti)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
        )

    # Inject user payload into request state
    request.state.user = payload
    logger.debug("auth_ok", user_id=payload.get("sub"), jti=jti)
