import base64
import json
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional

# Load .env before any local module imports so os.getenv() picks them up
from dotenv import load_dotenv
load_dotenv()

import aioboto3
from botocore.exceptions import ClientError
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from pydantic import BaseModel
from sqlalchemy import String, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.cors import CORSMiddleware

from auth import (
    _pending_verifications,
    _send_email,
    auth_backend,
    current_active_verified_user,
    current_admin_user,
    current_download_user,
    fastapi_users,
    get_user_manager,
)
from database import Base, async_session_maker, engine, get_async_session
from models import Folder, STLModel, User
from schemas import UserCreate, UserRead, UserUpdate

S3_BUCKET = os.getenv("S3_BUCKET_NAME", "")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "")  # Set for non-AWS S3 (e.g. Garage in dev)
STORAGE_QUOTA_BYTES = int(os.getenv("STORAGE_QUOTA_BYTES", str(5 * 1024 * 1024 * 1024)))
WEBUI_URL = os.getenv("WEBUI_URL", "http://localhost:8989")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").lower().strip()

# EXTRA_CORS_ORIGINS lets you add additional allowed origins (e.g. the Vite
# dev server) without changing the production value of WEBUI_URL.
# Set EXTRA_CORS_ORIGINS=http://localhost:5173 in your local .env or shell.
_extra = os.getenv("EXTRA_CORS_ORIGINS", "")
CORS_ORIGINS = [WEBUI_URL] + [o.strip() for o in _extra.split(",") if o.strip()]

def s3_client():
    from botocore.config import Config
    kwargs: dict = {"region_name": AWS_REGION}
    if S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = S3_ENDPOINT_URL
        kwargs["config"] = Config(s3={"addressing_style": "path"})
    return aioboto3.Session().client("s3", **kwargs)


async def s3_delete(key: str) -> None:
    """Delete an object from S3, ignoring 404s."""
    try:
        async with s3_client() as s3:
            await s3.delete_object(Bucket=S3_BUCKET, Key=key)
    except ClientError:
        pass


app = FastAPI(title="STLVault API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Auth routers ---
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/api/auth/jwt",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)


class VerifyCodeRequest(BaseModel):
    email: str
    code: str


@app.post("/api/auth/verify-code", tags=["auth"])
async def verify_email_code(
    body: VerifyCodeRequest,
    user_manager=Depends(get_user_manager),
):
    from fastapi_users.exceptions import InvalidVerifyToken, UserAlreadyVerified

    email = body.email.lower().strip()
    entry = _pending_verifications.get(email)

    if not entry:
        raise HTTPException(status_code=400, detail="VERIFY_CODE_INVALID")

    code, token, expires_at = entry

    if time.time() > expires_at:
        _pending_verifications.pop(email, None)
        raise HTTPException(status_code=400, detail="VERIFY_CODE_EXPIRED")

    if body.code != code:
        raise HTTPException(status_code=400, detail="VERIFY_CODE_INVALID")

    try:
        await user_manager.verify(token, None)
    except UserAlreadyVerified:
        pass  # treat as success
    except (InvalidVerifyToken, Exception):
        raise HTTPException(status_code=400, detail="VERIFY_CODE_INVALID")

    _pending_verifications.pop(email, None)
    return {"message": "Email verified successfully"}


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Safe column migrations — no-op if the column already exists
        await conn.execute(text(
            "ALTER TABLE models ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR"
        ))
        # dateAdded was originally INTEGER (32-bit) but needs BIGINT for ms timestamps
        await conn.execute(text(
            "ALTER TABLE models ALTER COLUMN \"dateAdded\" TYPE BIGINT"
        ))
        # Admin approval workflow columns
        await conn.execute(text(
            "ALTER TABLE models ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'approved'"
        ))
        await conn.execute(text(
            "ALTER TABLE models ADD COLUMN IF NOT EXISTS denial_reason TEXT"
        ))
        # Folder approval workflow columns
        await conn.execute(text(
            "ALTER TABLE folders ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'approved'"
        ))
        await conn.execute(text(
            "ALTER TABLE folders ADD COLUMN IF NOT EXISTS requested_by VARCHAR"
        ))
        # S3 storage key
        await conn.execute(text(
            "ALTER TABLE models ADD COLUMN IF NOT EXISTS storage_key VARCHAR"
        ))

    # Promote ADMIN_EMAIL to superuser on first boot (idempotent)
    if ADMIN_EMAIL:
        async with async_session_maker() as session:
            result = await session.execute(select(User).where(User.email == ADMIN_EMAIL))
            admin_user = result.scalar_one_or_none()
            if admin_user and not admin_user.is_superuser:
                await session.execute(
                    update(User).where(User.id == admin_user.id).values(is_superuser=True)
                )
                await session.commit()
                print(f"[ADMIN] Promoted {ADMIN_EMAIL} to superuser")

    # Seed initial folders if the table is empty
    async with async_session_maker() as session:
        result = await session.execute(select(func.count()).select_from(Folder))
        if result.scalar() == 0:
            session.add_all([
                Folder(id="1", name="Characters", parentId=None),
                Folder(id="2", name="Vehicles", parentId=None),
                Folder(id="3", name="Terrain", parentId=None),
                Folder(id="4", name="Tanks", parentId="2"),
            ])
            await session.commit()


def now_ms() -> int:
    return int(time.time() * 1000)


def folder_to_dict(f: Folder) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "parentId": f.parentId,
        "status": f.status or "approved",
        "requested_by": f.requested_by,
    }


def model_to_dict(m: STLModel) -> dict:
    tags = []
    if m.tags:
        try:
            tags = json.loads(m.tags)
        except Exception:
            tags = []
    return {
        "id": m.id,
        "name": m.name,
        "folderId": m.folderId,
        "url": m.url,
        "size": m.size,
        "dateAdded": m.dateAdded,
        "tags": tags,
        "description": m.description or "",
        "thumbnail": m.thumbnail,
        "status": m.status or "approved",
        "denial_reason": m.denial_reason,
        "uploaded_by": m.uploaded_by,
        "uploaded_by_email": None,
        "storage_key": m.storage_key,
    }


# --- Request body models ---

class FolderData(BaseModel):
    name: str
    parentId: Optional[str] = None


class ModelUpdate(BaseModel):
    name: Optional[str] = None
    folderId: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None
    thumbnail: Optional[str] = None


class BulkDeletePayload(BaseModel):
    ids: List[str]


class BulkMovePayload(BaseModel):
    ids: List[str]
    folderId: str


class BulkTagPayload(BaseModel):
    ids: List[str]
    tags: List[str]


class DenyPayload(BaseModel):
    reason: str = ""


class ApproveFolderPayload(BaseModel):
    name: Optional[str] = None


class ApproveModelPayload(BaseModel):
    folder_id: Optional[str] = None   # Move to this existing approved folder instead
    folder_name: Optional[str] = None  # Rename the pending folder on approval


# --- Folder endpoints ---

@app.get("/api/folders")
async def get_folders(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_verified_user),
):
    if user.is_superuser:
        result = await session.execute(select(Folder))
    else:
        result = await session.execute(select(Folder).where(Folder.status == "approved"))
    return [folder_to_dict(f) for f in result.scalars().all()]


@app.post("/api/folders")
async def create_folder(
    item: FolderData,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_verified_user),
):
    fid = str(uuid.uuid4())
    status = "approved" if user.is_superuser else "pending"
    requested_by = None if user.is_superuser else str(user.id)
    folder = Folder(id=fid, name=item.name, parentId=item.parentId,
                    status=status, requested_by=requested_by)
    session.add(folder)
    await session.commit()
    return folder_to_dict(folder)


@app.patch("/api/folders/{folder_id}")
async def update_folder(
    folder_id: str,
    item: FolderData,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    result = await session.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    await session.execute(
        update(Folder).where(Folder.id == folder_id).values(name=item.name)
    )
    await session.commit()
    folder.name = item.name
    return folder_to_dict(folder)


@app.delete("/api/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    has_models = await session.execute(
        select(func.count()).select_from(STLModel).where(STLModel.folderId == folder_id)
    )
    if has_models.scalar():
        raise HTTPException(status_code=400, detail="Folder must be empty to delete")

    has_children = await session.execute(
        select(func.count()).select_from(Folder).where(Folder.parentId == folder_id)
    )
    if has_children.scalar():
        raise HTTPException(status_code=400, detail="Folder must be empty to delete")

    await session.execute(delete(Folder).where(Folder.id == folder_id))
    await session.commit()
    return {"ok": True}


# --- Model endpoints ---

@app.get("/api/models")
async def get_models(
    folderId: Optional[str] = None,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    if folderId and folderId != "all":
        result = await session.execute(
            select(STLModel)
            .where(STLModel.folderId == folderId)
            .where(STLModel.status == "approved")
        )
    else:
        result = await session.execute(
            select(STLModel).where(STLModel.status == "approved")
        )
    models_list = result.scalars().all()

    uploader_ids = [m.uploaded_by for m in models_list if m.uploaded_by]
    users_map: dict = {}
    if uploader_ids:
        users_result = await session.execute(select(User))
        for u in users_result.scalars().all():
            users_map[str(u.id)] = u.email

    enriched = []
    for m in models_list:
        d = model_to_dict(m)
        d["uploaded_by_email"] = users_map.get(m.uploaded_by or "")
        enriched.append(d)
    return enriched


@app.post("/api/models/upload")
async def upload_model(
    file: UploadFile = File(...),
    folderId: str = Form("1"),
    thumbnail: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_verified_user),
):
    mid = str(uuid.uuid4())
    filename_str = file.filename or ".stl"
    ext = os.path.splitext(filename_str)[1] or ".stl"
    key = f"{mid}{ext}"

    file_data = await file.read()
    size = len(file_data)

    async with s3_client() as s3:
        import io
        await s3.upload_fileobj(io.BytesIO(file_data), S3_BUCKET, key)

    tag_list: List[str] = []
    if tags:
        try:
            tag_list = json.loads(tags)
        except Exception:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    m = STLModel(
        id=mid,
        name=file.filename,
        folderId=folderId if folderId != "all" else "1",
        url=f"/api/models/{mid}/download",
        size=size,
        dateAdded=now_ms(),
        tags=json.dumps(tag_list),
        description=description or "",
        thumbnail=thumbnail,
        uploaded_by=str(user.id),
        status="pending",
        storage_key=key,
    )
    session.add(m)
    await session.commit()
    return model_to_dict(m)


@app.get("/api/my-models")
async def get_my_models(
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_verified_user),
):
    result = await session.execute(
        select(STLModel)
        .where(STLModel.uploaded_by == str(user.id))
        .order_by(STLModel.dateAdded.desc())
    )
    models_list = result.scalars().all()
    enriched = []
    for m in models_list:
        d = model_to_dict(m)
        d["uploaded_by_email"] = user.email
        enriched.append(d)
    return enriched


@app.patch("/api/models/{model_id}")
async def update_model(
    model_id: str,
    updates: ModelUpdate,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")

    values = {}
    if updates.name is not None:
        values["name"] = updates.name
    if updates.folderId is not None:
        values["folderId"] = updates.folderId
    if updates.tags is not None:
        values["tags"] = json.dumps(updates.tags)
    if updates.description is not None:
        values["description"] = updates.description
    if updates.thumbnail is not None:
        values["thumbnail"] = updates.thumbnail

    if values:
        await session.execute(update(STLModel).where(STLModel.id == model_id).values(**values))
        await session.commit()

    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    return model_to_dict(result.scalar_one())


@app.delete("/api/models/{model_id}")
async def delete_model(
    model_id: str,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_verified_user),
):
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    if not user.is_superuser and m.uploaded_by != str(user.id):
        raise HTTPException(status_code=403, detail="Not authorized to delete this model")

    if m.storage_key:
        await s3_delete(m.storage_key)

    await session.execute(delete(STLModel).where(STLModel.id == model_id))
    await session.commit()
    return {"ok": True}


@app.get("/api/models/{model_id}/download")
async def download_model(
    model_id: str,
    session: AsyncSession = Depends(get_async_session),
    token: Optional[str] = None,
    _user: User = Depends(current_download_user),
):
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    m = result.scalar_one_or_none()
    if not m or not m.storage_key:
        raise HTTPException(status_code=404, detail="File not found")

    async def stream_s3():
        async with s3_client() as s3:
            try:
                response = await s3.get_object(Bucket=S3_BUCKET, Key=m.storage_key)
                async for chunk in response["Body"].iter_chunks():
                    yield chunk
            except ClientError:
                raise HTTPException(status_code=404, detail="File not found")

    return StreamingResponse(
        stream_s3(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{m.name}"'},
    )


@app.post("/api/models/bulk-delete")
async def bulk_delete(
    payload: BulkDeletePayload,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_verified_user),
):
    for mid in payload.ids:
        result = await session.execute(select(STLModel).where(STLModel.id == mid))
        m = result.scalar_one_or_none()
        if not m:
            continue
        if not user.is_superuser and m.uploaded_by != str(user.id):
            continue
        if m.storage_key:
            await s3_delete(m.storage_key)
        await session.execute(delete(STLModel).where(STLModel.id == mid))
    await session.commit()
    return {"ok": True}


@app.post("/api/models/bulk-move")
async def bulk_move(
    payload: BulkMovePayload,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    for mid in payload.ids:
        await session.execute(
            update(STLModel).where(STLModel.id == mid).values(folderId=payload.folderId)
        )
    await session.commit()
    return {"ok": True}


@app.post("/api/models/bulk-tag")
async def bulk_tag(
    payload: BulkTagPayload,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    for mid in payload.ids:
        result = await session.execute(select(STLModel).where(STLModel.id == mid))
        m = result.scalar_one_or_none()
        if not m:
            continue
        existing: List[str] = []
        if m.tags:
            try:
                existing = json.loads(m.tags)
            except Exception:
                pass
        merged = list(dict.fromkeys(existing + payload.tags))
        await session.execute(
            update(STLModel).where(STLModel.id == mid).values(tags=json.dumps(merged))
        )
    await session.commit()
    return {"ok": True}


@app.put("/api/models/{model_id}/file")
async def replace_model_file(
    model_id: str,
    file: UploadFile = File(...),
    thumbnail: Optional[str] = Form(None),
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    existing = result.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Model not found")

    if existing.storage_key:
        await s3_delete(existing.storage_key)

    ext = os.path.splitext(file.filename or ".stl")[-1] or ".stl"
    key = f"{model_id}{ext}"

    import io
    file_data = await file.read()
    size = len(file_data)
    async with s3_client() as s3:
        await s3.upload_fileobj(io.BytesIO(file_data), S3_BUCKET, key)

    await session.execute(
        update(STLModel)
        .where(STLModel.id == model_id)
        .values(url=f"/api/models/{model_id}/download", size=size, thumbnail=thumbnail, storage_key=key)
    )
    await session.commit()
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    return model_to_dict(result.scalar_one())


@app.put("/api/models/{model_id}/thumbnail")
async def replace_model_thumbnail(
    model_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    ext = os.path.splitext(file.filename or "")[-1]
    if not ext:
        raise HTTPException(status_code=400, detail="File must have an extension")

    file_bytes = file.file.read()
    encoded = base64.b64encode(file_bytes).decode()
    thumbnail = f"data:image/{ext[1:]};base64,{encoded}"

    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Model not found")

    await session.execute(
        update(STLModel).where(STLModel.id == model_id).values(thumbnail=thumbnail)
    )
    await session.commit()
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    return model_to_dict(result.scalar_one())


@app.get("/api/storage-stats")
async def storage_stats(
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    result = await session.execute(select(func.coalesce(func.sum(STLModel.size), 0)))
    used = result.scalar()
    return {"used": used, "total": STORAGE_QUOTA_BYTES}


# --- Admin endpoints ---

@app.get("/api/admin/pending")
async def admin_get_pending(
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_admin_user),
):
    result = await session.execute(
        select(STLModel)
        .where(STLModel.status == "pending")
        .order_by(STLModel.dateAdded.asc())
    )
    models_list = result.scalars().all()

    # Fetch uploader emails in one query
    uploader_ids = [m.uploaded_by for m in models_list if m.uploaded_by]
    users_map: dict = {}
    if uploader_ids:
        users_result = await session.execute(
            select(User).where(User.email.isnot(None))
        )
        for u in users_result.scalars().all():
            users_map[str(u.id)] = u.email

    enriched = []
    for m in models_list:
        d = model_to_dict(m)
        d["uploaded_by_email"] = users_map.get(m.uploaded_by or "")
        d["pending_folder"] = None
        if m.folderId:
            pf_result = await session.execute(
                select(Folder).where(Folder.id == m.folderId, Folder.status == "pending")
            )
            pf = pf_result.scalar_one_or_none()
            if pf:
                pf_dict = folder_to_dict(pf)
                if pf.parentId:
                    parent_result = await session.execute(select(Folder).where(Folder.id == pf.parentId))
                    parent = parent_result.scalar_one_or_none()
                    pf_dict["parent_name"] = parent.name if parent else None
                else:
                    pf_dict["parent_name"] = None
                d["pending_folder"] = pf_dict
        enriched.append(d)
    return enriched


@app.post("/api/admin/models/{model_id}/approve")
async def admin_approve_model(
    model_id: str,
    payload: ApproveModelPayload,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_admin_user),
):
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")

    model_values: dict = {"status": "approved"}

    if m.folderId:
        pf_result = await session.execute(
            select(Folder).where(Folder.id == m.folderId, Folder.status == "pending")
        )
        pending_folder = pf_result.scalar_one_or_none()
        if pending_folder:
            if payload.folder_id:
                # Admin chose an existing folder — move model there, discard pending folder
                model_values["folderId"] = payload.folder_id
                await session.execute(delete(Folder).where(Folder.id == pending_folder.id))
            else:
                # Approve the pending folder, optionally with a new name
                folder_values: dict = {"status": "approved"}
                if payload.folder_name and payload.folder_name.strip():
                    folder_values["name"] = payload.folder_name.strip()
                await session.execute(
                    update(Folder).where(Folder.id == pending_folder.id).values(**folder_values)
                )

    await session.execute(
        update(STLModel).where(STLModel.id == model_id).values(**model_values)
    )
    await session.commit()
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    return model_to_dict(result.scalar_one())


@app.post("/api/admin/models/{model_id}/deny")
async def admin_deny_model(
    model_id: str,
    payload: DenyPayload,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_admin_user),
):
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")

    # Delete from S3
    if m.storage_key:
        await s3_delete(m.storage_key)

    # Mark record as denied (keep for in-app notification)
    await session.execute(
        update(STLModel)
        .where(STLModel.id == model_id)
        .values(status="denied", denial_reason=payload.reason or None, folderId="")
    )
    await session.commit()

    # Email the uploader
    if m.uploaded_by:
        user_result = await session.execute(
            select(User).where(User.id.cast(String) == m.uploaded_by)
        )
        uploader = user_result.scalar_one_or_none()
        if uploader:
            reason_text = f"\n\nReason provided: {payload.reason}" if payload.reason else ""
            await _send_email(
                uploader.email,
                "STLVault — Upload Denied",
                f"Your upload '{m.name}' has been reviewed and denied.{reason_text}\n\n"
                f"If you have questions, please contact your vault administrator.",
            )

    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    return model_to_dict(result.scalar_one())


@app.get("/api/admin/pending-folders")
async def admin_get_pending_folders(
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_admin_user),
):
    result = await session.execute(
        select(Folder).where(Folder.status == "pending").order_by(Folder.id)
    )
    folders_list = result.scalars().all()

    # Exclude pending folders that already appear alongside a pending model upload
    pending_model_folders_result = await session.execute(
        select(STLModel.folderId)
        .where(STLModel.status == "pending")
        .where(STLModel.folderId.isnot(None))
    )
    folders_with_pending_models = {row[0] for row in pending_model_folders_result}
    folders_list = [f for f in folders_list if f.id not in folders_with_pending_models]

    users_result = await session.execute(select(User))
    users_map = {str(u.id): u.email for u in users_result.scalars().all()}

    enriched = []
    for f in folders_list:
        d = folder_to_dict(f)
        d["requested_by_email"] = users_map.get(f.requested_by or "")
        if f.parentId:
            parent_result = await session.execute(select(Folder).where(Folder.id == f.parentId))
            parent = parent_result.scalar_one_or_none()
            d["parent_name"] = parent.name if parent else None
        else:
            d["parent_name"] = None
        enriched.append(d)
    return enriched


@app.post("/api/admin/folders/{folder_id}/approve")
async def admin_approve_folder(
    folder_id: str,
    payload: ApproveFolderPayload,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_admin_user),
):
    result = await session.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    values: dict = {"status": "approved"}
    if payload.name and payload.name.strip():
        values["name"] = payload.name.strip()

    await session.execute(update(Folder).where(Folder.id == folder_id).values(**values))
    await session.commit()
    result = await session.execute(select(Folder).where(Folder.id == folder_id))
    return folder_to_dict(result.scalar_one())


@app.post("/api/admin/folders/{folder_id}/deny")
async def admin_deny_folder(
    folder_id: str,
    payload: DenyPayload,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_admin_user),
):
    result = await session.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    denial_reason = f"Folder '{folder.name}' was not approved"
    if payload.reason:
        denial_reason += f": {payload.reason}"

    # Deny all models in the folder and delete their files
    models_result = await session.execute(
        select(STLModel).where(STLModel.folderId == folder_id)
    )
    for m in models_result.scalars().all():
        if m.storage_key:
            await s3_delete(m.storage_key)
        await session.execute(
            update(STLModel)
            .where(STLModel.id == m.id)
            .values(status="denied", denial_reason=denial_reason)
        )

    await session.execute(delete(Folder).where(Folder.id == folder_id))
    await session.commit()
    return {"ok": True}



@app.get("/api/admin/users")
async def admin_list_users(
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_admin_user),
):
    result = await session.execute(select(User).order_by(User.email))
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "display_name": u.display_name,
            "is_active": u.is_active,
            "is_verified": u.is_verified,
            "is_superuser": u.is_superuser,
        }
        for u in users
    ]


class AdminUserPatch(BaseModel):
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None
    is_superuser: Optional[bool] = None


@app.patch("/api/admin/users/{user_id}")
async def admin_patch_user(
    user_id: str,
    payload: AdminUserPatch,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(current_admin_user),
):
    result = await session.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    updates = payload.model_dump(exclude_none=True)
    if updates:
        await session.execute(update(User).where(User.id == user_id).values(**updates))
        await session.commit()
        result = await session.execute(select(User).where(User.id == user_id))
        u = result.scalar_one()
    return {
        "id": str(u.id),
        "email": u.email,
        "display_name": u.display_name,
        "is_active": u.is_active,
        "is_verified": u.is_verified,
        "is_superuser": u.is_superuser,
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True, log_level="info")
