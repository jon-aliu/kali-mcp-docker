"""
Authentication router — register, login, get current user, logout.
See docs/07-authentication.md for full JWT flow.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.postgres import get_session, UserORM
from db.redis import get_redis
from middleware.auth import require_auth
from models.user import UserCreate, UserOut, TokenResponse

router = APIRouter()
logger = structlog.get_logger()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


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
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    logger.info("user_registered", user_id=str(user.id), username=user.username)
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

    token, jti = create_access_token(str(user.id))
    redis = await get_redis()
    await redis.setex(f"session:{jti}", settings.jwt_expire_hours * 3600, "valid")

    logger.info("user_login", user_id=str(user.id), username=user.username)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
async def me(
    request: Request,
    _: None = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> UserORM:
    user_id = request.state.user["sub"]
    result = await session.execute(
        select(UserORM).where(UserORM.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/logout")
async def logout(
    request: Request,
    _: None = Depends(require_auth),
) -> dict:
    jti = request.state.user["jti"]
    redis = await get_redis()
    await redis.set(f"session:{jti}", "revoked", ex=86400)
    logger.info("user_logout", jti=jti)
    return {"message": "Logged out"}
