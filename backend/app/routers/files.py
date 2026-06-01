from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_file_token, decode_access_token, decode_file_token
from app.core.utils import new_id, to_dict
from app.deps import current_user, db_session, require_member, security
from app.models import FileAsset, User

router = APIRouter(prefix="/api/files", tags=["files"])

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".mp3", ".wav", ".m4a", ".mp4", ".docx", ".txt", ".csv"}


def _safe_suffix(filename: Optional[str]) -> str:
    suffix = Path(filename or "upload.bin").suffix.lower()
    if suffix and suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported file type: {suffix}")
    return suffix or ".bin"


def _asset_path(asset: FileAsset) -> Path:
    path = Path(asset.storage_path)
    if path.is_absolute():
        return path
    # Backward-compatible: older records may store paths like "uploads/...".
    # If the relative path already exists from the current working directory, use it directly.
    if path.exists():
        return path
    return settings.upload_path / path


def _user_from_credentials(credentials: Optional[HTTPAuthorizationCredentials], db: Session) -> Optional[User]:
    raw_token = credentials.credentials if credentials else None
    user_id = decode_access_token(raw_token) if raw_token else None
    return db.get(User, user_id) if user_id else None


def _ensure_file_access(db: Session, asset: FileAsset, user: User) -> None:
    if asset.owner_user_id == user.user_id:
        return
    if asset.choir_id:
        require_member(db, asset.choir_id, user)
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this file")


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    choir_id: Optional[str] = Form(default=None),
    purpose: str = Form(default="general"),
    db: Session = Depends(db_session),
    user: User = Depends(current_user),
):
    if choir_id:
        require_member(db, choir_id, user)

    root = settings.upload_path / (choir_id or "personal")
    root.mkdir(parents=True, exist_ok=True)
    suffix = _safe_suffix(file.filename)
    asset_id = new_id()
    stored_filename = f"{asset_id}{suffix}"
    path = root / stored_filename
    data = await file.read()
    path.write_bytes(data)

    asset = FileAsset(
        asset_id=asset_id,
        choir_id=choir_id,
        owner_user_id=user.user_id,
        original_filename=file.filename,
        stored_filename=stored_filename,
        storage_path=str(path),
        content_type=file.content_type,
        size_bytes=len(data),
        purpose=purpose,
        is_public=False,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    signed_token = create_file_token(asset.asset_id)
    return {
        "asset_id": asset.asset_id,
        "file_url": f"/api/files/{asset.asset_id}/download",
        "signed_url": f"/api/files/{asset.asset_id}/download?token={signed_token}",
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(data),
        "purpose": purpose,
    }


@router.get("/{asset_id}")
def get_file_asset(asset_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    asset = db.get(FileAsset, asset_id)
    if not asset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    _ensure_file_access(db, asset, user)
    return to_dict(asset)


@router.get("/{asset_id}/signed-url")
def get_signed_url(asset_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    asset = db.get(FileAsset, asset_id)
    if not asset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    _ensure_file_access(db, asset, user)
    token = create_file_token(asset.asset_id)
    return {"signed_url": f"/api/files/{asset.asset_id}/download?token={token}", "expires_in": settings.FILE_SIGNED_URL_EXPIRE_SECONDS}


@router.get("/{asset_id}/download")
def download_file(
    asset_id: str,
    token: Optional[str] = Query(default=None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(db_session),
):
    asset = db.get(FileAsset, asset_id)
    if not asset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")

    if token:
        token_asset_id = decode_file_token(token)
        if token_asset_id != asset.asset_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid or expired file token")
    else:
        user = _user_from_credentials(credentials, db)
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid token")
        _ensure_file_access(db, asset, user)

    path = _asset_path(asset)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stored file not found")
    return FileResponse(path, media_type=asset.content_type or "application/octet-stream", filename=asset.original_filename or asset.stored_filename)
