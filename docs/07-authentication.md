<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Copy middleware/auth.py and the withAuth HOC verbatim — tokens and Redis keys must match exactly.
-->

# 07 — Authentication

## Summary

| Aspect | Value |
|--------|-------|
| Library | `python-jose` |
| Algorithm | HS256 |
| Expiry | 24 hours |
| Password hashing | `passlib[bcrypt]`, rounds=12 |
| JTI revocation | Redis key `session:{jti}` |
| Frontend storage | `localStorage`, key `kali_mcp_token` |
| Header | `Authorization: Bearer <token>` |

---

## JWT Payload

```json
{
  "sub": "user-uuid-string",
  "jti": "unique-token-id-uuid",
  "iat": 1741651200,
  "exp": 1741737600
}
```

- **`sub`** — user ID (UUID string)
- **`jti`** — unique token identifier — stored in Redis to enable revocation
- **`iat`** — issued-at timestamp
- **`exp`** — expiry timestamp (iat + 24h)

---

## Login Flow (8 Steps)

```
1. Client sends POST /api/auth/login with Content-Type: application/x-www-form-urlencoded
   body: username=<user>&password=<pass>

2. Server fetches UserORM from PostgreSQL by username.
   If not found → HTTP 401 "Incorrect username or password".

3. Server calls passlib verify_password(plain, hashed).
   If mismatch → HTTP 401 "Incorrect username or password".
   (Same error for both cases — prevents username enumeration.)

4. Server generates jti = str(uuid4()).

5. Server encodes JWT:
   payload = {sub: user.id, jti: jti, iat: now, exp: now + 24h}
   token = jose.jwt.encode(payload, JWT_SECRET, algorithm="HS256")

6. Server writes to Redis:
   SET session:{jti} "valid" EX 86400

7. Server returns:
   {"access_token": "<token>", "token_type": "bearer"}

8. Client stores token in localStorage["kali_mcp_token"] and uses it
   in the Authorization header for all subsequent requests.
```

---

## Token Validation Middleware — `middleware/auth.py`

```python
"""
JWT authentication middleware.
Validates Bearer token, checks Redis for revocation, injects user into request.state.
"""

import structlog
from fastapi import HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import settings
from db.redis import get_redis

logger = structlog.get_logger()
bearer_scheme = HTTPBearer(auto_error=False)


async def require_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = None,
) -> None:
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
```

---

## Rate Limiting Middleware — `middleware/rate_limit.py`

```python
"""
Redis sliding-window rate limiter.
Limits each user to rate_limit_per_minute requests per 60-second window.
"""

import time

import structlog
from fastapi import HTTPException, Request, status

from config import settings
from db.redis import get_redis

logger = structlog.get_logger()


async def rate_limit(request: Request) -> None:
    """
    FastAPI dependency. Must be used AFTER require_auth so request.state.user exists.
    """
    user = getattr(request.state, "user", None)
    if not user:
        return  # Unauthenticated routes are not rate-limited here

    user_id = user.get("sub", "anonymous")
    redis = await get_redis()
    key = f"user:{user_id}:ratelimit"

    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, 60)

    if current > settings.rate_limit_per_minute:
        logger.warning("rate_limit_exceeded", user_id=user_id, count=current)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: {settings.rate_limit_per_minute} requests per minute",
        )
```

---

## Logout

To revoke a token, overwrite the Redis key:

```python
# Server-side logout endpoint (add to routers/auth.py)
@router.post("/logout")
async def logout(request: Request, _: None = Depends(require_auth)) -> dict:
    jti = request.state.user["jti"]
    redis = await get_redis()
    await redis.set(f"session:{jti}", "revoked", ex=86400)
    return {"message": "Logged out"}
```

The client deletes `localStorage["kali_mcp_token"]`.

---

## Frontend `withAuth` HOC — TypeScript

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

/**
 * Higher-order component that protects a page route.
 * Redirects to /login if no token is present in localStorage.
 *
 * Usage:
 *   export default withAuth(ChatPage);
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> {
  const ProtectedComponent: React.FC<P> = (props) => {
    const router = useRouter();

    useEffect(() => {
      if (!isAuthenticated()) {
        router.replace("/login");
      }
    }, [router]);

    if (!isAuthenticated()) {
      return null; // Render nothing while redirecting
    }

    return <Component {...props} />;
  };

  ProtectedComponent.displayName = `withAuth(${Component.displayName ?? Component.name})`;
  return ProtectedComponent;
}
```

---

## Registration Validation Rules

| Field | Rule |
|-------|------|
| `username` | 3–50 characters; only alphanumeric + underscore; no spaces |
| `email` | Valid RFC 5322 email address |
| `password` | Minimum 8 characters; at least one uppercase letter; at least one lowercase letter; at least one digit |

**Pydantic model — `models/user.py`:**

```python
import re
from pydantic import BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not (3 <= len(v) <= 50):
            raise ValueError("Username must be 3–50 characters")
        if not re.fullmatch(r"[a-zA-Z0-9_]+", v):
            raise ValueError("Username may only contain letters, digits, and underscores")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
```
