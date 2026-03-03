import os
import uuid
from email.message import EmailMessage
from typing import Optional

import aiosmtplib
from fastapi import Depends, HTTPException, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_async_session
from models import User

JWT_SECRET = os.getenv("JWT_SECRET", "INSECURE_CHANGE_IN_PRODUCTION")
# 8-hour tokens — one working day
JWT_LIFETIME_SECONDS = 8 * 3600

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@stlvault.mil")
APP_URL = os.getenv("WEBUI_URL", "http://localhost:5173")


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)


async def _send_email(to: str, subject: str, body: str) -> None:
    if not SMTP_HOST:
        print(f"[AUTH] No SMTP configured. Email to {to}:")
        print(f"[AUTH] Subject: {subject}")
        print(f"[AUTH] Body:\n{body}")
        return

    message = EmailMessage()
    message["From"] = SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    await aiosmtplib.send(
        message,
        hostname=SMTP_HOST,
        port=SMTP_PORT,
        username=SMTP_USER or None,
        password=SMTP_PASSWORD or None,
        start_tls=True,
    )


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = JWT_SECRET
    verification_token_secret = JWT_SECRET

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"[AUTH] User registered: {user.email}")
        # Automatically trigger email verification on registration
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        verify_url = f"{APP_URL}/verify?token={token}"
        body = (
            f"Welcome to STLVault,\n\n"
            f"Please verify your .mil email address by visiting:\n\n"
            f"  {verify_url}\n\n"
            f"This link expires in 24 hours.\n\n"
            f"If you did not register for STLVault, please disregard this message."
        )
        await _send_email(user.email, "STLVault — Verify Your Email", body)

    async def on_after_verify(self, user: User, request: Optional[Request] = None):
        print(f"[AUTH] User verified: {user.email}")

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        reset_url = f"{APP_URL}/reset-password?token={token}"
        body = (
            f"A password reset was requested for your STLVault account.\n\n"
            f"Reset your password here:\n\n"
            f"  {reset_url}\n\n"
            f"This link expires in 1 hour.\n\n"
            f"If you did not request this, please disregard this message."
        )
        await _send_email(user.email, "STLVault — Password Reset", body)


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl="/api/auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=JWT_SECRET, lifetime_seconds=JWT_LIFETIME_SECONDS)


async def current_download_user(
    request: Request,
    user_manager: UserManager = Depends(get_user_manager),
) -> User:
    """
    Auth dependency for file download endpoints.
    Accepts the JWT via the standard Authorization: Bearer header OR
    as a ?token= query parameter so slicers and direct browser links work.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ").strip()
    else:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    strategy = get_jwt_strategy()
    user = await strategy.read_token(token, user_manager)

    if user is None or not user.is_active or not user.is_verified:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return user


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

# Requires active + email-verified user
current_active_verified_user = fastapi_users.current_user(active=True, verified=True)

# Requires active + email-verified + superuser
current_admin_user = fastapi_users.current_user(active=True, verified=True, superuser=True)
