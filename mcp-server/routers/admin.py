"""
Admin router — user management + system config (admin-only endpoints).
GET  /api/admin/users        - list all users
POST /api/admin/users        - create a new user
PATCH /api/admin/users/{id}  - toggle is_active / is_admin
DELETE /api/admin/users/{id} - hard-delete a user
GET  /api/admin/config       - get system config
PATCH /api/admin/config      - update system config
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from pydantic import BaseModel as PydanticBaseModel
from typing import Optional

from db.postgres import get_session, UserORM
from db.redis import get_redis
from middleware.auth import require_auth
from models.user import UserCreate, UserOut
from routers.auth import hash_password


class SystemConfig(PydanticBaseModel):
    sudo_mode: bool = False


class SystemConfigUpdate(PydanticBaseModel):
    sudo_mode: Optional[bool] = None

router = APIRouter()
logger = structlog.get_logger()


async def require_admin(request: Request, _: None = Depends(require_auth)) -> None:
    """Dependency: raises 403 if the caller is not an admin."""
    user_id = request.state.user["sub"]
    async with AsyncSession(bind=None) as _dummy:
        pass  # just for type checking — we use the session dep below


async def _get_admin_user(request: Request, session: AsyncSession) -> UserORM:
    user_id = request.state.user["sub"]
    result = await session.execute(select(UserORM).where(UserORM.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


@router.get("/users", response_model=list[UserOut])
async def list_users(
    request: Request,
    _: None = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> list[UserORM]:
    await _get_admin_user(request, session)
    result = await session.execute(select(UserORM).order_by(UserORM.created_at.desc()))
    return list(result.scalars().all())


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    request: Request,
    _: None = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> UserORM:
    await _get_admin_user(request, session)

    # Check uniqueness
    result = await session.execute(select(UserORM).where(UserORM.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    result = await session.execute(select(UserORM).where(UserORM.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = UserORM(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    logger.info("admin_created_user", admin_id=request.state.user["sub"], new_user=body.username)
    return new_user


class UserPatch:
    pass


from pydantic import BaseModel
from typing import Optional


class UserPatchBody(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    body: UserPatchBody,
    request: Request,
    _: None = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> UserORM:
    await _get_admin_user(request, session)

    result = await session.execute(select(UserORM).where(UserORM.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.is_active is not None:
        target.is_active = body.is_active
    if body.is_admin is not None:
        target.is_admin = body.is_admin

    await session.commit()
    await session.refresh(target)
    logger.info("admin_updated_user", admin_id=request.state.user["sub"], target_id=str(user_id))
    return target


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    request: Request,
    _: None = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> None:
    admin = await _get_admin_user(request, session)

    if str(admin.id) == str(user_id):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    result = await session.execute(select(UserORM).where(UserORM.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    await session.delete(target)
    await session.commit()
    logger.info("admin_deleted_user", admin_id=request.state.user["sub"], target_id=str(user_id))


# ---------------------------------------------------------------------------
# System config (sudo_mode, etc.) — stored in Redis
# ---------------------------------------------------------------------------

@router.get("/config", response_model=SystemConfig)
async def get_config(
    request: Request,
    _: None = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> SystemConfig:
    await _get_admin_user(request, session)
    redis = await get_redis()
    sudo_raw = await redis.get("config:sudo_mode")
    sudo_mode = sudo_raw in (b"1", "1")
    return SystemConfig(sudo_mode=sudo_mode)


@router.patch("/config", response_model=SystemConfig)
async def update_config(
    body: SystemConfigUpdate,
    request: Request,
    _: None = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> SystemConfig:
    await _get_admin_user(request, session)
    redis = await get_redis()
    if body.sudo_mode is not None:
        await redis.set("config:sudo_mode", "1" if body.sudo_mode else "0")
        logger.info("admin_config_update", admin_id=request.state.user["sub"], sudo_mode=body.sudo_mode)
    sudo_raw = await redis.get("config:sudo_mode")
    return SystemConfig(sudo_mode=sudo_raw in (b"1", "1"))
