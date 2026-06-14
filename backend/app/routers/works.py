from __future__ import annotations

import re
from typing import Optional
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_file_token
from app.core.utils import new_id, to_dict
from app.deps import current_user, db_session, require_member, require_role
from app.models import Resource, User, Work
from app.schemas import ResourceIn, WorkIn

router = APIRouter(prefix="/api", tags=["works"])

LOCAL_FILE_RE = re.compile(r"^/api/files/([^/]+)/download")


def _absolute_or_relative_url(url: str) -> str:
    if url.startswith("http://") or url.startswith("https://") or url.startswith("/"):
        return url
    return f"/{url}"


def _cos_key_from_url(file_url: str) -> str | None:
    if file_url.startswith("cos://"):
        return file_url.removeprefix("cos://").lstrip("/")
    parsed = urlparse(file_url)
    if parsed.scheme not in {"http", "https"}:
        return None

    public_base = settings.COS_PUBLIC_BASE.strip().rstrip("/")
    if public_base:
        base = urlparse(public_base)
        if parsed.netloc == base.netloc:
            path = parsed.path
            base_path = base.path.rstrip("/")
            if base_path and path.startswith(f"{base_path}/"):
                path = path[len(base_path) :]
            return unquote(path.lstrip("/"))

    default_host = f"{settings.COS_BUCKET}.cos.{settings.COS_REGION}.myqcloud.com"
    if settings.COS_BUCKET and parsed.netloc == default_host:
        return unquote(parsed.path.lstrip("/"))
    return None


def _cos_signed_url(key: str) -> str | None:
    secret_id = settings.COS_SECRET_ID or settings.TENCENTCLOUD_SECRET_ID
    secret_key = settings.COS_SECRET_KEY or settings.TENCENTCLOUD_SECRET_KEY
    if not settings.COS_BUCKET or not settings.COS_REGION or not secret_id or not secret_key:
        return None
    try:
        from qcloud_cos import CosConfig, CosS3Client
    except ImportError:
        return None

    config = CosConfig(Region=settings.COS_REGION, SecretId=secret_id, SecretKey=secret_key, Scheme="https")
    client = CosS3Client(config)
    return client.get_presigned_url(
        Method="GET",
        Bucket=settings.COS_BUCKET,
        Key=key,
        Expired=settings.FILE_SIGNED_URL_EXPIRE_SECONDS,
    )


@router.post("/choirs/{choir_id}/works")
def create_work(choir_id: str, payload: WorkIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    row = Work(work_id=new_id(), choir_id=choir_id, **payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/works")
def list_works(choir_id: str, keyword: Optional[str] = None, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    q = db.query(Work).filter_by(choir_id=choir_id)
    if keyword:
        q = q.filter(Work.title.contains(keyword))
    return [to_dict(x) for x in q.order_by(Work.created_at.desc()).all()]


@router.get("/works/{work_id}")
def get_work(work_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(Work, work_id)
    if not row:
        raise HTTPException(404, "Work not found")
    require_member(db, row.choir_id, user)
    data = to_dict(row)
    data["resources"] = list_resources(work_id, db, user)
    return data


@router.put("/works/{work_id}")
def update_work(work_id: str, payload: WorkIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(Work, work_id)
    if not row:
        raise HTTPException(404, "Work not found")
    require_role(db, row.choir_id, user, "admin")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.post("/works/{work_id}/resources")
def create_resource(work_id: str, payload: ResourceIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(404, "Work not found")
    require_role(db, work.choir_id, user, "admin")
    row = Resource(resource_id=new_id(), work_id=work_id, choir_id=work.choir_id, uploaded_by=user.user_id, **payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/works/{work_id}/resources")
def list_resources(work_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(404, "Work not found")
    me = require_member(db, work.choir_id, user)
    q = db.query(Resource).filter_by(work_id=work_id)
    if me.role == "member":
        q = q.filter((Resource.visibility == "all") | (Resource.section_id == me.section_id))
    return [to_dict(x) for x in q.order_by(Resource.created_at.desc()).all()]


@router.get("/resources/{resource_id}/signed-url")
def get_resource_signed_url(resource_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    resource = db.get(Resource, resource_id)
    if not resource:
        raise HTTPException(404, "Resource not found")
    me = require_member(db, resource.choir_id, user)
    if me.role == "member" and resource.visibility != "all" and resource.section_id != me.section_id:
        raise HTTPException(403, "No access to this resource")

    local_match = LOCAL_FILE_RE.match(resource.file_url)
    if local_match:
        asset_id = local_match.group(1)
        token = create_file_token(asset_id)
        return {
            "signed_url": f"/api/files/{asset_id}/download?token={token}",
            "expires_in": settings.FILE_SIGNED_URL_EXPIRE_SECONDS,
        }

    cos_key = _cos_key_from_url(resource.file_url)
    if cos_key:
        signed_url = _cos_signed_url(cos_key)
        if signed_url:
            return {"signed_url": signed_url, "expires_in": settings.FILE_SIGNED_URL_EXPIRE_SECONDS}

    return {
        "signed_url": _absolute_or_relative_url(resource.file_url),
        "expires_in": settings.FILE_SIGNED_URL_EXPIRE_SECONDS,
    }
