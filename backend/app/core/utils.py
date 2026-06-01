from __future__ import annotations

import secrets
import uuid
from datetime import datetime
from typing import Any


def now() -> datetime:
    return datetime.utcnow()


def new_id() -> str:
    return str(uuid.uuid4())


def code(length: int = 8) -> str:
    return secrets.token_hex(length // 2).upper()


def to_dict(obj: Any) -> dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
