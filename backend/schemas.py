import uuid
from typing import Optional
from fastapi_users import schemas
from pydantic import field_validator


class UserRead(schemas.BaseUser[uuid.UUID]):
    display_name: Optional[str] = None


class UserCreate(schemas.BaseUserCreate):
    @field_validator("email")
    @classmethod
    def require_mil_email(cls, v: str) -> str:
        if not v.lower().endswith(".mil"):
            raise ValueError("Registration requires a .mil email address.")
        return v.lower()


class UserUpdate(schemas.BaseUserUpdate):
    display_name: Optional[str] = None
