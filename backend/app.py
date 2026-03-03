import base64
import json
import os
import time
import uuid
from pathlib import Path
from typing import List, Optional

# Load .env before any local module imports so os.getenv() picks them up
from dotenv import load_dotenv
load_dotenv()

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import String, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.cors import CORSMiddleware

from auth import (
    _send_email,
    auth_backend,
    current_active_verified_user,
    current_admin_user,
    current_download_user,
    fastapi_users,
    get_user_manager,
)
from database import Base, async_session_maker, engine, get_async_session
from importers import printables
from models import Folder, STLModel, User
from schemas import UserCreate, UserRead, UserUpdate

UPLOAD_DIR = Path(os.getenv("FILE_STORAGE", "./app/uploads"))
WEBUI_URL = os.getenv("WEBUI_URL", "http://localhost:8989")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").lower().strip()

# EXTRA_CORS_ORIGINS lets you add additional allowed origins (e.g. the Vite
# dev server) without changing the production value of WEBUI_URL.
# Set EXTRA_CORS_ORIGINS=http://localhost:5173 in your local .env or shell.
_extra = os.getenv("EXTRA_CORS_ORIGINS", "")
CORS_ORIGINS = [WEBUI_URL] + [o.strip() for o in _extra.split(",") if o.strip()]

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


@app.on_event("startup")
async def startup():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

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
    return {"id": f.id, "name": f.name, "parentId": f.parentId}


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


# --- Folder endpoints ---

@app.get("/api/folders")
async def get_folders(
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    result = await session.execute(select(Folder))
    return [folder_to_dict(f) for f in result.scalars().all()]


@app.post("/api/folders")
async def create_folder(
    item: FolderData,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    fid = str(uuid.uuid4())
    folder = Folder(id=fid, name=item.name, parentId=item.parentId)
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
    return [model_to_dict(m) for m in result.scalars().all()]


@app.post("/api/models/upload")
async def upload_model(
    file: UploadFile = File(...),
    folderId: str = Form("1"),
    thumbnail: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_verified_user),
):
    mid = str(uuid.uuid4())
    filename_str = file.filename or ".stl"
    ext = os.path.splitext(filename_str)[1] or ".stl"
    dest = os.path.join(UPLOAD_DIR, f"{mid}{ext}")

    with open(dest, "wb") as f:
        import shutil
        shutil.copyfileobj(file.file, f)
    size = os.path.getsize(dest)

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
        description="",
        thumbnail=thumbnail,
        uploaded_by=str(user.id),
        status="pending",
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
    return [model_to_dict(m) for m in result.scalars().all()]


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
    _user: User = Depends(current_active_verified_user),
):
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Model not found")

    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(model_id):
            try:
                os.remove(os.path.join(UPLOAD_DIR, fname))
            except Exception:
                pass

    await session.execute(delete(STLModel).where(STLModel.id == model_id))
    await session.commit()
    return {"ok": True}


@app.get("/api/models/{model_id}/download")
async def download_model(
    model_id: str,
    token: Optional[str] = None,
    _user: User = Depends(current_download_user),
):
    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(model_id):
            return FileResponse(
                os.path.join(UPLOAD_DIR, fname),
                media_type="application/octet-stream",
                filename=fname,
            )
    raise HTTPException(status_code=404, detail="File not found")


@app.post("/api/models/bulk-delete")
async def bulk_delete(
    payload: BulkDeletePayload,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_active_verified_user),
):
    for mid in payload.ids:
        for fname in os.listdir(UPLOAD_DIR):
            if fname.startswith(mid):
                try:
                    os.remove(os.path.join(UPLOAD_DIR, fname))
                except Exception:
                    pass
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
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Model not found")

    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(model_id):
            try:
                os.remove(os.path.join(UPLOAD_DIR, fname))
            except Exception:
                pass

    ext = os.path.splitext(file.filename or ".stl")[-1] or ".stl"
    dest = os.path.join(UPLOAD_DIR, f"{model_id}{ext}")
    with open(dest, "wb") as f:
        import shutil
        shutil.copyfileobj(file.file, f)
    size = os.path.getsize(dest)

    await session.execute(
        update(STLModel)
        .where(STLModel.id == model_id)
        .values(url=f"/api/models/{model_id}/download", size=size, thumbnail=thumbnail)
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
    _user: User = Depends(current_active_verified_user),
):
    used = sum(
        os.path.getsize(os.path.join(UPLOAD_DIR, f))
        for f in os.listdir(UPLOAD_DIR)
        if os.path.isfile(os.path.join(UPLOAD_DIR, f))
    )
    return {"used": used, "total": 5 * 1024 * 1024 * 1024}


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
        enriched.append(d)
    return enriched


@app.post("/api/admin/models/{model_id}/approve")
async def admin_approve_model(
    model_id: str,
    session: AsyncSession = Depends(get_async_session),
    _user: User = Depends(current_admin_user),
):
    result = await session.execute(select(STLModel).where(STLModel.id == model_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")
    await session.execute(
        update(STLModel).where(STLModel.id == model_id).values(status="approved")
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

    # Delete physical file
    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(model_id):
            try:
                os.remove(os.path.join(UPLOAD_DIR, fname))
            except Exception:
                pass

    # Mark record as denied (keep for in-app notification)
    await session.execute(
        update(STLModel)
        .where(STLModel.id == model_id)
        .values(status="denied", denial_reason=payload.reason or None)
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


# --- Printables import ---

@app.post("/api/printables/importid")
async def import_model_by_id(
    payload: dict,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_verified_user),
):
    importer = printables.PrintablesImporter()
    model_id = payload.get("id")
    model_name = payload.get("name")
    parent_id = payload.get("parentId")
    preview_path = payload.get("previewPath")
    folder_id = payload.get("folderId", "1")
    type_name = payload.get("typeName")

    mid = str(uuid.uuid4())
    ext = type_name if type_name is not None else ".stl"
    dest = os.path.join(UPLOAD_DIR, f"{mid}.{ext}")

    if model_id is None:
        raise HTTPException(status_code=400, detail="id is required")

    file, thumbnail = importer.importfromId(model_id, parent_id, preview_path)
    if file is None:
        raise HTTPException(status_code=500, detail="File is empty")

    with open(dest, "wb") as fh:
        fh.write(file.content)
    size = os.path.getsize(dest)

    m = STLModel(
        id=mid,
        name=model_name,
        folderId=folder_id if folder_id != "all" else "1",
        url=f"/api/models/{mid}/download",
        size=size,
        dateAdded=now_ms(),
        tags=json.dumps(["imported"]),
        description="Imported from Printables",
        thumbnail=thumbnail,
        uploaded_by=str(user.id),
        status="pending",
    )
    session.add(m)
    await session.commit()
    return model_to_dict(m)


@app.post("/api/printables/options")
async def import_model_options(
    payload: dict,
    _user: User = Depends(current_active_verified_user),
):
    importer = printables.PrintablesImporter()
    url = payload.get("url")
    if url is None:
        raise HTTPException(status_code=400, detail="url is required")

    model_data = importer.getModelOptions(url)
    if model_data is None:
        raise HTTPException(status_code=500, detail="Collection is empty")
    return model_data


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True, log_level="info")
