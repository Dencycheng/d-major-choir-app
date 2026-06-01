from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.core.config import settings


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def _json_dumps(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def create_access_token(user_id: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    header = {"alg": settings.JWT_ALGORITHM, "typ": "JWT"}
    payload = {"sub": user_id, "exp": int(expire.timestamp()), "type": "access"}
    signing_input = f"{_b64encode(_json_dumps(header))}.{_b64encode(_json_dumps(payload))}"
    signature = hmac.new(settings.JWT_SECRET_KEY.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64encode(signature)}"


def decode_access_token(token: str) -> Optional[str]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}"
        expected = hmac.new(settings.JWT_SECRET_KEY.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
        provided = _b64decode(signature_b64)
        if not hmac.compare_digest(expected, provided):
            return None
        header = json.loads(_b64decode(header_b64))
        if header.get("alg") != settings.JWT_ALGORITHM:
            return None
        payload = json.loads(_b64decode(payload_b64))
        if payload.get("type") != "access":
            return None
        if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None


def create_file_token(asset_id: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(seconds=settings.FILE_SIGNED_URL_EXPIRE_SECONDS))
    header = {"alg": settings.JWT_ALGORITHM, "typ": "JWT"}
    payload = {"sub": asset_id, "exp": int(expire.timestamp()), "type": "file"}
    signing_input = f"{_b64encode(_json_dumps(header))}.{_b64encode(_json_dumps(payload))}"
    signature = hmac.new(settings.JWT_SECRET_KEY.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64encode(signature)}"


def decode_file_token(token: str) -> Optional[str]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}"
        expected = hmac.new(settings.JWT_SECRET_KEY.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
        provided = _b64decode(signature_b64)
        if not hmac.compare_digest(expected, provided):
            return None
        header = json.loads(_b64decode(header_b64))
        if header.get("alg") != settings.JWT_ALGORITHM:
            return None
        payload = json.loads(_b64decode(payload_b64))
        if payload.get("type") != "file":
            return None
        if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
            return None
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None
