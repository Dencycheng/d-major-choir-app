from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import decode_access_token
from app.models import ChoirMember, User

ROLE_LEVEL = {
    "member": 1,
    "soprano": 1,
    "alto": 1,
    "tenor": 1,
    "bass": 1,
    "principal": 2,
    "section_leader": 2,
    "accompanist": 2,
    "conductor": 3,
    "leader": 4,
    "admin": 4,
    "super_admin": 5,
}
SECTION_SCOPED_ROLES = {"section_leader", "principal"}
security = HTTPBearer(auto_error=False)


def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-ID"),
    db: Session = Depends(db_session),
) -> User:
    raw_token = credentials.credentials if credentials else None
    user_id = decode_access_token(raw_token) if raw_token else None

    # Development-only bridge for older local scripts. Off by default.
    if not user_id and settings.ALLOW_LEGACY_USER_ID_TOKEN:
        user_id = raw_token or x_user_id

    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid token")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def membership(db: Session, choir_id: str, user_id: str, statuses: Optional[list[str]] = None) -> Optional[ChoirMember]:
    statuses = statuses or ["active"]
    return (
        db.query(ChoirMember)
        .filter(
            ChoirMember.choir_id == choir_id,
            ChoirMember.user_id == user_id,
            ChoirMember.member_status.in_(statuses),
        )
        .first()
    )


def require_member(db: Session, choir_id: str, user: User) -> ChoirMember:
    row = membership(db, choir_id, user.user_id, ["active"])
    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this choir")
    return row


def require_role(db: Session, choir_id: str, user: User, min_role: str) -> ChoirMember:
    row = require_member(db, choir_id, user)
    if ROLE_LEVEL.get(row.role, 0) < ROLE_LEVEL[min_role]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
    return row
