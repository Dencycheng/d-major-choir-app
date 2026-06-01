from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

db_path = Path(os.getenv("SQLITE_PATH", "/home/ubuntu/d_major_data/dmajor.sqlite"))
json_path = Path(os.getenv("DB_JSON_PATH", ROOT / "data" / "db.json"))
db_path.parent.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = os.getenv("DATABASE_URL", f"sqlite:///{db_path}")

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.utils import new_id  # noqa: E402
from app.models import Choir, ChoirMember, Section, User  # noqa: E402


def as_list(payload: dict, key: str) -> list[dict]:
    value = payload.get(key, [])
    return value if isinstance(value, list) else []


def main() -> None:
    if not json_path.exists():
        print(f"No db.json found at {json_path}; skipped.")
        return
    Base.metadata.create_all(bind=engine)
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        users: dict[str, User] = {}
        for item in as_list(payload, "users"):
            user_id = item.get("user_id") or item.get("id") or new_id()
            user = db.get(User, user_id) or User(user_id=user_id)
            user.name = item.get("name") or item.get("realName") or user.name
            user.nickname = item.get("nickname") or item.get("nickName") or user.nickname
            user.mobile = item.get("mobile") or item.get("phone") or user.mobile
            user.email = item.get("email") or user.email
            user.avatar_url = item.get("avatar_url") or item.get("avatar") or user.avatar_url
            db.merge(user)
            users[user_id] = user
        db.flush()
        default_user = next(iter(users.values()), None)
        for item in as_list(payload, "choirs"):
            choir_id = item.get("choir_id") or item.get("id") or new_id()
            owner_id = item.get("owner_user_id") or (default_user.user_id if default_user else None)
            if not owner_id:
                owner = User(user_id=new_id(), name="Imported Admin")
                db.add(owner)
                db.flush()
                owner_id = owner.user_id
            choir = db.get(Choir, choir_id) or Choir(choir_id=choir_id, owner_user_id=owner_id, choir_name=item.get("choir_name") or item.get("name") or "Imported Choir")
            choir.city = item.get("city") or choir.city
            choir.description = item.get("description") or choir.description
            choir.invite_code = item.get("invite_code") or choir.invite_code
            db.merge(choir)
        db.flush()
        for item in as_list(payload, "sections"):
            section = Section(section_id=item.get("section_id") or item.get("id") or new_id(), choir_id=item.get("choir_id"), section_name=item.get("section_name") or item.get("name") or "未命名声部", sort_order=int(item.get("sort_order") or 0))
            if section.choir_id:
                db.merge(section)
        for item in as_list(payload, "members"):
            member = ChoirMember(member_id=item.get("member_id") or item.get("id") or new_id(), choir_id=item.get("choir_id"), user_id=item.get("user_id"), section_id=item.get("section_id"), role=item.get("role") or "member", member_status=item.get("member_status") or item.get("status") or "pending", join_date=item.get("join_date"), remark=item.get("remark"))
            if member.choir_id and member.user_id:
                db.merge(member)
        db.commit()
        print(f"Migrated {json_path} to {db_path}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
