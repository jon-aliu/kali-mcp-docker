import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator, field_serializer


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
    id: UUID
    username: str
    email: str
    is_active: bool
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("id")
    def serialize_id(self, v: UUID) -> str:
        return str(v)

    @field_serializer("created_at")
    def serialize_created_at(self, v: datetime) -> str:
        return v.isoformat()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
