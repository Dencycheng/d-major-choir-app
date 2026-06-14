from __future__ import annotations

import mimetypes
import os
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.utils import new_id
from app.models import Choir, ChoirMember, FileAsset, Resource, User, Work

RESTORE_WORK_TITLE = "历史谱库恢复"
SUPPORTED_SUFFIXES = {".pdf", ".mp3", ".m4a", ".wav", ".mp4"}


def first_admin_member(db: Session, choir_id: str) -> ChoirMember | None:
    return (
        db.query(ChoirMember)
        .filter(
            ChoirMember.choir_id == choir_id,
            ChoirMember.member_status == "active",
            ChoirMember.role.in_(["super_admin", "admin", "leader"]),
        )
        .order_by(ChoirMember.created_at.asc())
        .first()
    )


def resource_type_for(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return "score"
    if path.suffix.lower() in {".mp3", ".m4a", ".wav"}:
        return "audio"
    if path.suffix.lower() == ".mp4":
        return "video"
    return "file"


def main() -> None:
    Base.metadata.create_all(bind=engine)
    upload_root = settings.upload_path
    db = SessionLocal()
    try:
        choir_id = os.getenv("RESTORE_CHOIR_ID")
        choir = db.get(Choir, choir_id) if choir_id else db.query(Choir).order_by(Choir.created_at.asc()).first()
        if not choir:
            raise SystemExit("No choir found. Please create a choir in the admin console first.")

        admin = first_admin_member(db, choir.choir_id)
        if not admin:
            raise SystemExit("No active admin member found for this choir.")

        owner = db.get(User, admin.user_id)
        if not owner:
            raise SystemExit("Admin user not found.")

        work = db.query(Work).filter_by(choir_id=choir.choir_id, title=RESTORE_WORK_TITLE).first()
        if not work:
            work = Work(
                work_id=new_id(),
                choir_id=choir.choir_id,
                title=RESTORE_WORK_TITLE,
                composer="历史上传文件",
                language="mixed",
                style="archive",
                difficulty="unknown",
                copyright_status="internal",
                status="practicing",
            )
            db.add(work)
            db.flush()

        restored_assets = 0
        restored_resources = 0
        for path in sorted(upload_root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_SUFFIXES:
                continue
            if path.stat().st_size <= 16:
                continue

            storage_path = str(path)
            asset = db.query(FileAsset).filter_by(storage_path=storage_path).first()
            if not asset:
                asset = FileAsset(
                    asset_id=new_id(),
                    choir_id=choir.choir_id,
                    owner_user_id=owner.user_id,
                    original_filename=path.name,
                    stored_filename=path.name,
                    storage_path=storage_path,
                    content_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream",
                    size_bytes=path.stat().st_size,
                    purpose="resource",
                    is_public=False,
                )
                db.add(asset)
                db.flush()
                restored_assets += 1

            file_url = f"/api/files/{asset.asset_id}/download"
            existing_resource = db.query(Resource).filter_by(work_id=work.work_id, file_url=file_url).first()
            if not existing_resource:
                resource = Resource(
                    resource_id=new_id(),
                    work_id=work.work_id,
                    choir_id=choir.choir_id,
                    resource_name=path.stem,
                    resource_type=resource_type_for(path),
                    file_url=file_url,
                    file_format=path.suffix.lower().lstrip("."),
                    visibility="all",
                    uploaded_by=owner.user_id,
                )
                db.add(resource)
                restored_resources += 1

        db.commit()
        print(
            f"Restored uploads for choir={choir.choir_name} "
            f"assets={restored_assets} resources={restored_resources} work={RESTORE_WORK_TITLE}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
