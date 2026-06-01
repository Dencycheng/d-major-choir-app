from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.core.sms import can_create_user_for_mobile, normalize_mobile, send_sms_code, verify_sms_code
from app.core.utils import new_id, now
from app.deps import current_user, db_session
from app.models import User
from app.schemas import LoginIn, SendCodeIn, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/send-code")
def send_code(payload: SendCodeIn, db: Session = Depends(db_session)):
    return send_sms_code(db, payload.mobile, payload.purpose)


@router.post("/login-mobile", response_model=TokenOut)
def login_mobile(payload: LoginIn, db: Session = Depends(db_session)):
    mobile = normalize_mobile(payload.mobile)
    user = db.query(User).filter(User.mobile == mobile).first()
    if not user and not can_create_user_for_mobile(db, mobile):
        raise HTTPException(403, "This mobile is not invited yet")
    verify_sms_code(db, mobile, payload.code, "login")
    if not user:
        user = User(user_id=new_id(), mobile=mobile, name=payload.name or mobile, nickname=payload.name, last_login_at=now())
        db.add(user)
    else:
        user.last_login_at = now()
        if payload.name:
            user.name = payload.name
    db.commit(); db.refresh(user)
    return {"access_token": create_access_token(user.user_id), "token_type": "bearer", "user": UserOut.model_validate(user)}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return UserOut.model_validate(user)
