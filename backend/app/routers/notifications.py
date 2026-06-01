from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.utils import to_dict
from app.deps import current_user, db_session
from app.models import Notification, User

router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/notifications")
def my_notifications(db: Session = Depends(db_session), user: User = Depends(current_user)):
    return [to_dict(x) for x in db.query(Notification).filter_by(user_id=user.user_id).order_by(Notification.created_at.desc()).all()]


@router.put("/notifications/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(Notification, notification_id)
    if not row or row.user_id != user.user_id:
        raise HTTPException(404, "Notification not found")
    row.is_read = True
    db.commit(); db.refresh(row)
    return to_dict(row)
