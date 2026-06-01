from __future__ import annotations

import hashlib
import hmac
import json
import random
from datetime import timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.utils import new_id, now
from app.models import ChoirMember, SmsVerificationCode, User


def normalize_mobile(mobile: str) -> str:
    value = "".join(ch for ch in mobile.strip() if ch.isdigit() or ch == "+")
    if value.startswith("+86"):
        value = value[3:]
    if value.startswith("86") and len(value) == 13:
        value = value[2:]
    if not (len(value) == 11 and value.startswith("1") and value.isdigit()):
        raise HTTPException(400, "Invalid mobile number")
    return value


def tencent_phone_number(mobile: str) -> str:
    return "+86" + normalize_mobile(mobile)


def generate_sms_code() -> str:
    return f"{random.SystemRandom().randint(0, 999999):06d}"


def code_digest(mobile: str, code: str, purpose: str) -> str:
    payload = f"{normalize_mobile(mobile)}:{purpose}:{code}".encode("utf-8")
    return hmac.new(settings.JWT_SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def send_tencent_sms(mobile: str, code: str) -> dict[str, Any]:
    required = {
        "TENCENTCLOUD_SECRET_ID": settings.TENCENTCLOUD_SECRET_ID,
        "TENCENTCLOUD_SECRET_KEY": settings.TENCENTCLOUD_SECRET_KEY,
        "TENCENT_SMS_SDK_APP_ID": settings.TENCENT_SMS_SDK_APP_ID,
        "TENCENT_SMS_SIGN_NAME": settings.TENCENT_SMS_SIGN_NAME,
        "TENCENT_SMS_TEMPLATE_ID": settings.TENCENT_SMS_TEMPLATE_ID,
    }
    missing = [key for key, value in required.items() if not value]
    if missing:
        raise HTTPException(500, f"Missing Tencent SMS config: {', '.join(missing)}")

    try:
        from tencentcloud.common import credential
        from tencentcloud.common.profile.client_profile import ClientProfile
        from tencentcloud.common.profile.http_profile import HttpProfile
        from tencentcloud.sms.v20210111 import models, sms_client
    except ImportError as exc:
        raise HTTPException(500, "Tencent Cloud SDK is not installed") from exc

    cred = credential.Credential(settings.TENCENTCLOUD_SECRET_ID, settings.TENCENTCLOUD_SECRET_KEY)
    http_profile = HttpProfile()
    http_profile.endpoint = "sms.tencentcloudapi.com"
    client_profile = ClientProfile()
    client_profile.httpProfile = http_profile
    client = sms_client.SmsClient(cred, settings.TENCENT_SMS_REGION, client_profile)

    req = models.SendSmsRequest()
    req.SmsSdkAppId = settings.TENCENT_SMS_SDK_APP_ID
    req.SignName = settings.TENCENT_SMS_SIGN_NAME
    req.TemplateId = settings.TENCENT_SMS_TEMPLATE_ID
    req.TemplateParamSet = [code, str(max(1, settings.SMS_CODE_EXPIRE_SECONDS // 60))]
    req.PhoneNumberSet = [tencent_phone_number(mobile)]
    resp = client.SendSms(req)
    status_set = getattr(resp, "SendStatusSet", None) or []
    failed = [status for status in status_set if getattr(status, "Code", "") != "Ok"]
    if failed:
        message = getattr(failed[0], "Message", "Tencent SMS send failed")
        raise HTTPException(502, message)
    return json.loads(resp.to_json_string())


def send_sms_code(db: Session, mobile: str, purpose: str = "login") -> dict[str, Any]:
    mobile = normalize_mobile(mobile)
    latest = (
        db.query(SmsVerificationCode)
        .filter_by(mobile=mobile, purpose=purpose)
        .order_by(SmsVerificationCode.sent_at.desc())
        .first()
    )
    current = now()
    if latest and (current - latest.sent_at).total_seconds() < settings.SMS_RESEND_INTERVAL_SECONDS:
        raise HTTPException(429, "Verification code was sent too recently")

    code = "000000" if settings.SMS_PROVIDER == "mock" else generate_sms_code()
    provider_response: Any = {"mock": True}
    if settings.SMS_PROVIDER == "tencent":
        provider_response = send_tencent_sms(mobile, code)
    elif settings.SMS_PROVIDER != "mock":
        raise HTTPException(500, "Unsupported SMS provider")

    row = SmsVerificationCode(
        code_id=new_id(),
        mobile=mobile,
        purpose=purpose,
        code_hash=code_digest(mobile, code, purpose),
        expires_at=current + timedelta(seconds=settings.SMS_CODE_EXPIRE_SECONDS),
        sent_at=current,
        provider=settings.SMS_PROVIDER,
        provider_response=provider_response,
    )
    db.add(row)
    db.commit()
    return {
        "mobile": mobile,
        "purpose": purpose,
        "expires_in": settings.SMS_CODE_EXPIRE_SECONDS,
        "message": "Verification code sent",
        "debug_code": code if settings.SMS_PROVIDER == "mock" else None,
    }


def verify_sms_code(db: Session, mobile: str, code: str, purpose: str = "login") -> None:
    mobile = normalize_mobile(mobile)
    if settings.ALLOW_DEMO_LOGIN_CODE and code == "000000":
        return
    row = (
        db.query(SmsVerificationCode)
        .filter_by(mobile=mobile, purpose=purpose, consumed_at=None)
        .order_by(SmsVerificationCode.sent_at.desc())
        .first()
    )
    if not row or row.expires_at < now():
        raise HTTPException(400, "Verification code expired or not found")
    if row.attempts >= settings.SMS_MAX_VERIFY_ATTEMPTS:
        raise HTTPException(429, "Too many verification attempts")
    row.attempts += 1
    if not hmac.compare_digest(row.code_hash, code_digest(mobile, code, purpose)):
        db.commit()
        raise HTTPException(400, "Invalid verification code")
    row.consumed_at = now()
    db.commit()


def can_create_user_for_mobile(db: Session, mobile: str) -> bool:
    if settings.AUTH_ALLOW_OPEN_REGISTRATION:
        return True
    return (
        db.query(ChoirMember)
        .join(User, User.user_id == ChoirMember.user_id)
        .filter(User.mobile == normalize_mobile(mobile))
        .first()
        is not None
    )
