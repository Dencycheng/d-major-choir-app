from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    user_id: str
    name: Optional[str] = None
    nickname: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    model_config = {"from_attributes": True}


class LoginIn(BaseModel):
    mobile: str
    code: str
    name: Optional[str] = None


class SendCodeIn(BaseModel):
    mobile: str
    purpose: str = Field(default="login", pattern="^(login|register)$")


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ChoirIn(BaseModel):
    choir_name: str
    logo_url: Optional[str] = None
    description: Optional[str] = None
    city: Optional[str] = None
    rehearsal_location: Optional[str] = None


class SectionIn(BaseModel):
    section_name: str
    sort_order: int = 0


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    section_id: Optional[str] = None
    role: Optional[str] = None
    member_status: Optional[str] = None
    join_date: Optional[str] = None
    remark: Optional[str] = None


class MemberCreate(BaseModel):
    name: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    section_id: Optional[str] = None
    role: str = "member"
    member_status: str = "active"
    join_date: Optional[str] = None
    remark: Optional[str] = None


class RolePermissionIn(BaseModel):
    role: str
    permissions: list[str] = []
    scope: str = "own"


class ProfileUpdateIn(BaseModel):
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None


class SectionChangeIn(BaseModel):
    section_id: str
    remark: Optional[str] = None


class EventIn(BaseModel):
    title: str
    event_type: str = "rehearsal"
    start_time: datetime
    end_time: datetime
    location: Optional[str] = None
    description: Optional[str] = None
    need_attendance: bool = True
    checkin_method: str = "qr"
    status: str = "published"


class EventResponseIn(BaseModel):
    response_status: str = Field(pattern="^(attend|leave|tentative|pending)$")
    note: Optional[str] = None


class AttendanceUpdateIn(BaseModel):
    status: str = Field(pattern="^(present|late|leave|absent|pending|early_leave)$")
    remark: Optional[str] = None


class LeaveIn(BaseModel):
    reason: str


class LeaveRejectIn(BaseModel):
    reject_reason: Optional[str] = None


class WorkIn(BaseModel):
    title: str
    lyricist: Optional[str] = None
    composer: Optional[str] = None
    arranger: Optional[str] = None
    language: Optional[str] = None
    style: Optional[str] = None
    difficulty: Optional[str] = None
    copyright_status: Optional[str] = None
    status: str = "practicing"


class ResourceIn(BaseModel):
    resource_name: str
    resource_type: str = "score"
    file_url: str
    file_format: Optional[str] = None
    section_id: Optional[str] = None
    version: Optional[str] = None
    visibility: str = "all"


class PracticeTaskIn(BaseModel):
    title: str
    task_type: str = "section_practice"
    work_id: Optional[str] = None
    target_sections: Optional[list[str]] = None
    description: Optional[str] = None
    required_checkin_count: int = 1
    deadline: datetime
    status: str = "published"


class PracticeRecordIn(BaseModel):
    audio_url: Optional[str] = None
    audio_duration: Optional[int] = None
    practice_count: Optional[int] = None
    pitch_self_rating: Optional[str] = None
    rhythm_self_rating: Optional[str] = None
    breath_self_rating: Optional[str] = None
    need_help: bool = False
    note: Optional[str] = None


class CommentIn(BaseModel):
    content: str
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    need_followup: bool = False
