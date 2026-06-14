from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.utils import new_id
from app.models import Choir, ChoirMember, Resource, User, Work

IGNORED_FILENAMES = {".ds_store", "thumbs.db"}


@dataclass(frozen=True)
class CosObject:
    key: str
    size: int


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


def normalized_prefix(prefix: str) -> str:
    return prefix.strip("/")


def relative_key(key: str, prefix: str) -> str:
    clean_prefix = normalized_prefix(prefix)
    if clean_prefix and key.startswith(f"{clean_prefix}/"):
        return key[len(clean_prefix) + 1 :]
    return key


def public_url_for(key: str, bucket: str, region: str, public_base: str) -> str:
    base = public_base.strip().rstrip("/") or f"https://{bucket}.cos.{region}.myqcloud.com"
    return f"{base}/{quote(key, safe='/~')}"


def resource_type_for(suffix: str) -> str:
    if suffix == ".pdf":
        return "score"
    if suffix in {".mp3", ".m4a", ".wav"}:
        return "audio"
    if suffix in {".mp4", ".mov", ".m4v"}:
        return "video"
    if suffix in {".doc", ".docx"}:
        return "document"
    if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        return "image"
    return "file"


def work_title_for(key: str, prefix: str, fallback_title: str) -> str:
    rel = relative_key(key, prefix).strip("/")
    parts = [part for part in rel.split("/") if part]
    if len(parts) >= 2:
        return parts[0][:200]
    if parts:
        return PurePosixPath(parts[0]).stem[:200]
    return fallback_title


def resource_name_for(key: str, prefix: str) -> str:
    rel = relative_key(key, prefix).strip("/")
    return PurePosixPath(rel).stem[:200] or PurePosixPath(key).stem[:200]


def list_cos_objects(bucket: str, region: str, prefix: str, secret_id: str, secret_key: str) -> list[CosObject]:
    try:
        from qcloud_cos import CosConfig, CosS3Client
    except ImportError as exc:
        raise SystemExit("Missing dependency cos-python-sdk-v5. Rebuild the backend image first.") from exc

    config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key, Scheme="https")
    client = CosS3Client(config)

    objects: list[CosObject] = []
    marker = ""
    clean_prefix = normalized_prefix(prefix)
    while True:
        response = client.list_objects(
            Bucket=bucket,
            Prefix=clean_prefix,
            Marker=marker,
            MaxKeys=1000,
        )
        contents = response.get("Contents") or []
        for item in contents:
            key = item.get("Key", "")
            if key and not key.endswith("/"):
                objects.append(CosObject(key=key, size=int(item.get("Size") or 0)))

        is_truncated = str(response.get("IsTruncated", "false")).lower() == "true"
        if not is_truncated:
            break
        marker = response.get("NextMarker") or (contents[-1].get("Key") if contents else "")
        if not marker:
            break

    return objects


def target_choir(db: Session) -> Choir:
    choir_id = os.getenv("COS_SYNC_CHOIR_ID") or os.getenv("RESTORE_CHOIR_ID")
    choir = db.get(Choir, choir_id) if choir_id else db.query(Choir).order_by(Choir.created_at.asc()).first()
    if not choir:
        raise SystemExit("No choir found. Please create a choir in the admin console first.")
    return choir


def get_or_create_work(db: Session, choir: Choir, title: str) -> tuple[Work, bool]:
    work = db.query(Work).filter_by(choir_id=choir.choir_id, title=title).first()
    if work:
        return work, False
    work = Work(
        work_id=new_id(),
        choir_id=choir.choir_id,
        title=title,
        composer="COS导入",
        language="mixed",
        style="archive",
        difficulty="unknown",
        copyright_status="internal",
        status="practicing",
    )
    db.add(work)
    db.flush()
    return work, True


def sync_objects(db: Session, objects: list[CosObject], args: argparse.Namespace) -> dict[str, int | str]:
    choir = target_choir(db)
    admin = first_admin_member(db, choir.choir_id)
    if not admin:
        raise SystemExit("No active admin member found for this choir.")
    owner = db.get(User, admin.user_id)
    if not owner:
        raise SystemExit("Admin user not found.")

    created_works = 0
    created_resources = 0
    skipped_existing = 0
    skipped_empty = 0
    work_cache: dict[str, Work] = {}

    for item in objects:
        path = PurePosixPath(item.key)
        suffix = path.suffix.lower()
        if path.name.lower() in IGNORED_FILENAMES:
            continue
        if item.size <= 0:
            skipped_empty += 1
            continue

        file_url = public_url_for(item.key, args.bucket, args.region, args.public_base)
        existing = db.query(Resource).filter_by(choir_id=choir.choir_id, file_url=file_url).first()
        if existing:
            skipped_existing += 1
            continue

        title = work_title_for(item.key, args.prefix, args.work_title)
        work = work_cache.get(title)
        if not work:
            work, was_created = get_or_create_work(db, choir, title)
            work_cache[title] = work
            if was_created:
                created_works += 1

        db.add(
            Resource(
                resource_id=new_id(),
                work_id=work.work_id,
                choir_id=choir.choir_id,
                resource_name=resource_name_for(item.key, args.prefix),
                resource_type=resource_type_for(suffix),
                file_url=file_url,
                file_format=suffix.lstrip("."),
                visibility="all",
                uploaded_by=owner.user_id,
                version="cos",
            )
        )
        created_resources += 1

    if args.dry_run:
        db.rollback()
    else:
        db.commit()

    return {
        "choir": choir.choir_name,
        "listed": len(objects),
        "created_works": created_works,
        "created_resources": created_resources,
        "skipped_existing": skipped_existing,
        "skipped_empty": skipped_empty,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Tencent COS score library files into backend resources.")
    parser.add_argument("--bucket", default=settings.COS_BUCKET)
    parser.add_argument("--region", default=settings.COS_REGION)
    parser.add_argument("--prefix", default=settings.COS_PREFIX)
    parser.add_argument("--public-base", default=settings.COS_PUBLIC_BASE)
    parser.add_argument("--work-title", default=settings.COS_SYNC_WORK_TITLE)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    secret_id = settings.COS_SECRET_ID or settings.TENCENTCLOUD_SECRET_ID
    secret_key = settings.COS_SECRET_KEY or settings.TENCENTCLOUD_SECRET_KEY
    if not args.bucket:
        raise SystemExit("Missing COS_BUCKET.")
    if not args.region:
        raise SystemExit("Missing COS_REGION.")
    if not secret_id or not secret_key:
        raise SystemExit("Missing COS_SECRET_ID/COS_SECRET_KEY or TENCENTCLOUD_SECRET_ID/TENCENTCLOUD_SECRET_KEY.")

    Base.metadata.create_all(bind=engine)
    objects = list_cos_objects(args.bucket, args.region, args.prefix, secret_id, secret_key)
    db = SessionLocal()
    try:
        result = sync_objects(db, objects, args)
        mode = "DRY RUN" if args.dry_run else "SYNCED"
        print(f"{mode}: {result}")
        if result["created_resources"] and not args.public_base:
            print("Files were registered with the default COS public URL. If the bucket is private, opening files may return 403.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
