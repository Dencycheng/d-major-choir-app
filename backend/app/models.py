from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.utils import now


class User(Base):
    __tablename__ = "users"
    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    nickname: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class SmsVerificationCode(Base):
    __tablename__ = "sms_verification_codes"
    code_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mobile: Mapped[str] = mapped_column(String(50), index=True)
    purpose: Mapped[str] = mapped_column(String(30), default="login")
    code_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    provider: Mapped[str] = mapped_column(String(30), default="mock")
    provider_response: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Choir(Base):
    __tablename__ = "choirs"
    choir_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_name: Mapped[str] = mapped_column(String(200), index=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    rehearsal_location: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    owner_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"))
    invite_code: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class Section(Base):
    __tablename__ = "sections"
    section_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    section_name: Mapped[str] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class ChoirMember(Base):
    __tablename__ = "choir_members"
    member_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    section_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sections.section_id"), nullable=True)
    role: Mapped[str] = mapped_column(String(30), default="member")
    member_status: Mapped[str] = mapped_column(String(30), default="pending")
    join_date: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    permission_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    role: Mapped[str] = mapped_column(String(50), index=True)
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)
    scope: Mapped[str] = mapped_column(String(30), default="own")
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.user_id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class ProfileChangeRequest(Base):
    __tablename__ = "profile_change_requests"
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    member_id: Mapped[str] = mapped_column(String(36), ForeignKey("choir_members.member_id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    field_name: Mapped[str] = mapped_column(String(50), default="section_id")
    old_value: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.user_id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Event(Base):
    __tablename__ = "events"
    event_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    event_type: Mapped[str] = mapped_column(String(50), default="rehearsal")
    start_time: Mapped[datetime] = mapped_column(DateTime)
    end_time: Mapped[datetime] = mapped_column(DateTime)
    location: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    need_attendance: Mapped[bool] = mapped_column(Boolean, default=True)
    checkin_method: Mapped[str] = mapped_column(String(30), default="qr")
    checkin_code: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"))
    status: Mapped[str] = mapped_column(String(30), default="published")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class EventResponse(Base):
    __tablename__ = "event_responses"
    response_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.event_id"), index=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    response_status: Mapped[str] = mapped_column(String(30), default="pending")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    attendance_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.event_id"), index=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    checkin_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="present")
    checkin_method: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    operated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    leave_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.event_id"), index=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    approved_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reject_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Work(Base):
    __tablename__ = "works"
    work_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    title: Mapped[str] = mapped_column(String(200), index=True)
    lyricist: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    composer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    arranger: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    style: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    difficulty: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    copyright_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="practicing")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Resource(Base):
    __tablename__ = "resources"
    resource_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    work_id: Mapped[str] = mapped_column(String(36), ForeignKey("works.work_id"), index=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    resource_name: Mapped[str] = mapped_column(String(200))
    resource_type: Mapped[str] = mapped_column(String(50), default="score")
    file_url: Mapped[str] = mapped_column(String(800))
    file_format: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    section_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sections.section_id"), nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    visibility: Mapped[str] = mapped_column(String(30), default="all")
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class PracticeTask(Base):
    __tablename__ = "practice_tasks"
    task_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    task_type: Mapped[str] = mapped_column(String(50), default="section_practice")
    work_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("works.work_id"), nullable=True)
    target_sections: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    required_checkin_count: Mapped[int] = mapped_column(Integer, default=1)
    deadline: Mapped[datetime] = mapped_column(DateTime)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"))
    status: Mapped[str] = mapped_column(String(30), default="published")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class PracticeRecord(Base):
    __tablename__ = "practice_records"
    practice_record_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("practice_tasks.task_id"), index=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    section_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sections.section_id"), nullable=True)
    audio_url: Mapped[Optional[str]] = mapped_column(String(800), nullable=True)
    audio_duration: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    practice_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pitch_self_rating: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    rhythm_self_rating: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    breath_self_rating: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    need_help: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_status: Mapped[str] = mapped_column(String(30), default="not_requested")
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Comment(Base):
    __tablename__ = "comments"
    comment_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    practice_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("practice_records.practice_record_id"), index=True)
    choir_id: Mapped[str] = mapped_column(String(36), ForeignKey("choirs.choir_id"), index=True)
    commenter_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"))
    content: Mapped[str] = mapped_column(Text)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    need_followup: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Notification(Base):
    __tablename__ = "notifications"
    notification_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("choirs.choir_id"), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    notification_type: Mapped[str] = mapped_column(String(50), default="system")
    related_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AIReport(Base):
    __tablename__ = "ai_reports"
    ai_report_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    practice_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("practice_records.practice_record_id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    pitch_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rhythm_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    breath_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completeness_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    suggestions: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    raw_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class FileAsset(Base):
    __tablename__ = "file_assets"
    asset_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    choir_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("choirs.choir_id"), nullable=True, index=True)
    owner_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id"), index=True)
    original_filename: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    stored_filename: Mapped[str] = mapped_column(String(300))
    storage_path: Mapped[str] = mapped_column(String(800))
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    purpose: Mapped[str] = mapped_column(String(50), default="general")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
