from __future__ import annotations
import csv
import io

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.utils import code, new_id, now, to_dict
from app.deps import SECTION_SCOPED_ROLES, current_user, db_session, require_member, require_role
from app.models import AttendanceRecord, Choir, ChoirMember, Comment, Event, PracticeRecord, PracticeTask, ProfileChangeRequest, Resource, RolePermission, Section, User, Work
from app.schemas import ChoirIn, LeaveRejectIn, MemberCreate, MemberUpdate, ProfileUpdateIn, RolePermissionIn, SectionChangeIn, SectionIn, UserOut

router = APIRouter(prefix="/api", tags=["choirs"])

ROLE_OPTIONS = [
    {"value": "leader", "label": "团长"},
    {"value": "conductor", "label": "指挥"},
    {"value": "accompanist", "label": "钢琴伴奏"},
    {"value": "soprano", "label": "女高"},
    {"value": "alto", "label": "女中"},
    {"value": "tenor", "label": "男高"},
    {"value": "bass", "label": "男低"},
    {"value": "section_leader", "label": "声部长"},
    {"value": "principal", "label": "声部首席"},
    {"value": "member", "label": "普通成员"},
    {"value": "admin", "label": "管理员"},
    {"value": "super_admin", "label": "超级管理员"},
]
PERMISSION_OPTIONS = [
    "member_manage",
    "event_manage",
    "leave_approve",
    "attendance_manage",
    "practice_task_publish",
    "practice_comment",
    "library_manage",
    "dashboard_view",
]
DEFAULT_ROLE_PERMISSIONS: dict[str, tuple[list[str], str]] = {
    "super_admin": (PERMISSION_OPTIONS, "all"),
    "admin": (PERMISSION_OPTIONS, "all"),
    "leader": (PERMISSION_OPTIONS, "all"),
    "conductor": (["event_manage", "practice_task_publish", "practice_comment", "library_manage", "dashboard_view"], "all"),
    "section_leader": (["member_manage", "leave_approve", "attendance_manage", "practice_comment", "dashboard_view"], "section"),
    "principal": (["practice_comment", "dashboard_view"], "section"),
    "accompanist": (["practice_comment", "library_manage", "dashboard_view"], "all"),
    "member": ([], "own"),
}


def member_payload(db: Session, member: ChoirMember) -> dict[str, Any]:
    d = to_dict(member)
    u = db.get(User, member.user_id)
    section = db.get(Section, member.section_id) if member.section_id else None
    d["user"] = UserOut.model_validate(u).model_dump() if u else None
    d["section_name"] = section.section_name if section else None
    return d


def create_choir_internal(payload: ChoirIn, db: Session, user: User) -> dict[str, Any]:
    choir = Choir(choir_id=new_id(), owner_user_id=user.user_id, invite_code=code(), **payload.model_dump())
    db.add(choir); db.flush()
    first_section = None
    for i, name in enumerate(["Soprano / 一声部", "Alto / 二声部", "Tenor / 男高", "Bass / 男低"], start=1):
        section = Section(section_id=new_id(), choir_id=choir.choir_id, section_name=name, sort_order=i)
        db.add(section)
        if not first_section:
            first_section = section
    db.flush()
    db.add(ChoirMember(member_id=new_id(), choir_id=choir.choir_id, user_id=user.user_id, section_id=first_section.section_id if first_section else None, role="super_admin", member_status="active"))
    for role, (permissions, scope) in DEFAULT_ROLE_PERMISSIONS.items():
        db.add(RolePermission(permission_id=new_id(), choir_id=choir.choir_id, role=role, permissions=permissions, scope=scope, updated_by=user.user_id))
    db.commit(); db.refresh(choir)
    return to_dict(choir)


@router.post("/choirs")
def create_choir(payload: ChoirIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    return create_choir_internal(payload, db, user)


@router.get("/choirs/my")
def my_choirs(db: Session = Depends(db_session), user: User = Depends(current_user)):
    rows = db.query(Choir).join(ChoirMember, ChoirMember.choir_id == Choir.choir_id).filter(ChoirMember.user_id == user.user_id).order_by(Choir.created_at.desc()).all()
    return [to_dict(r) for r in rows]


@router.get("/choirs/{choir_id}")
def get_choir(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    row = db.get(Choir, choir_id)
    if not row:
        raise HTTPException(404, "Choir not found")
    return to_dict(row)


@router.post("/choirs/{choir_id}/invite-code")
def generate_invite(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    choir = db.get(Choir, choir_id)
    if not choir:
        raise HTTPException(404, "Choir not found")
    choir.invite_code = code()
    db.commit(); db.refresh(choir)
    return {"invite_code": choir.invite_code}


@router.post("/choirs/join")
def join_choir(invite_code: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    choir = db.query(Choir).filter(Choir.invite_code == invite_code).first()
    if not choir:
        raise HTTPException(404, "Invite code not found")
    existing = db.query(ChoirMember).filter_by(choir_id=choir.choir_id, user_id=user.user_id).first()
    if existing:
        return to_dict(existing)
    row = ChoirMember(member_id=new_id(), choir_id=choir.choir_id, user_id=user.user_id, role="member", member_status="pending")
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/sections")
def list_sections(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    return [to_dict(x) for x in db.query(Section).filter_by(choir_id=choir_id).order_by(Section.sort_order).all()]


@router.post("/choirs/{choir_id}/sections")
def create_section(choir_id: str, payload: SectionIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    row = Section(section_id=new_id(), choir_id=choir_id, section_name=payload.section_name, sort_order=payload.sort_order)
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/roles")
def role_options(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    return {"roles": ROLE_OPTIONS, "permissions": PERMISSION_OPTIONS}


@router.get("/choirs/{choir_id}/role-permissions")
def list_role_permissions(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    existing = {row.role: row for row in db.query(RolePermission).filter_by(choir_id=choir_id).all()}
    rows = []
    for option in ROLE_OPTIONS:
        role = option["value"]
        row = existing.get(role)
        permissions, scope = DEFAULT_ROLE_PERMISSIONS.get(role, ([], "own"))
        rows.append({"role": role, "label": option["label"], "permissions": row.permissions if row else permissions, "scope": row.scope if row else scope})
    return rows


@router.put("/choirs/{choir_id}/role-permissions/{role}")
def update_role_permission(choir_id: str, role: str, payload: RolePermissionIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    row = db.query(RolePermission).filter_by(choir_id=choir_id, role=role).first()
    if not row:
        row = RolePermission(permission_id=new_id(), choir_id=choir_id, role=role)
        db.add(row)
    row.permissions = [p for p in payload.permissions if p in PERMISSION_OPTIONS]
    row.scope = payload.scope if payload.scope in {"all", "section", "own"} else "own"
    row.updated_by = user.user_id
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/members")
def list_members(
    choir_id: str,
    keyword: str | None = Query(default=None),
    section_id: str | None = Query(default=None),
    role: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(db_session),
    user: User = Depends(current_user),
):
    me = require_member(db, choir_id, user)
    q = db.query(ChoirMember).filter_by(choir_id=choir_id)
    if me.role == "member":
        q = q.filter_by(user_id=user.user_id)
    elif me.role in SECTION_SCOPED_ROLES:
        q = q.filter_by(section_id=me.section_id)
    if section_id:
        q = q.filter_by(section_id=section_id)
    if role:
        q = q.filter_by(role=role)
    if status:
        q = q.filter_by(member_status=status)
    rows = []
    for m in q.order_by(ChoirMember.created_at.desc()).all():
        d = member_payload(db, m)
        if keyword:
            haystack = " ".join([d.get("user", {}).get("name") or "", d.get("user", {}).get("nickname") or "", d.get("user", {}).get("mobile") or "", d.get("user", {}).get("email") or ""])
            if keyword not in haystack:
                continue
        rows.append(d)
    return rows


@router.post("/choirs/{choir_id}/members")
def create_member(choir_id: str, payload: MemberCreate, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    member_user = None
    if payload.mobile:
        member_user = db.query(User).filter(User.mobile == payload.mobile).first()
    if not member_user and payload.email:
        member_user = db.query(User).filter(User.email == payload.email).first()
    if not member_user:
        member_user = User(user_id=new_id(), name=payload.name, nickname=payload.nickname, mobile=payload.mobile, email=payload.email, avatar_url=payload.avatar_url)
        db.add(member_user); db.flush()
    else:
        for key in ["name", "nickname", "mobile", "email", "avatar_url"]:
            value = getattr(payload, key)
            if value is not None:
                setattr(member_user, key, value)
    existing = db.query(ChoirMember).filter_by(choir_id=choir_id, user_id=member_user.user_id).first()
    if existing:
        raise HTTPException(409, "Member already exists")
    row = ChoirMember(member_id=new_id(), choir_id=choir_id, user_id=member_user.user_id, section_id=payload.section_id, role=payload.role, member_status=payload.member_status, join_date=payload.join_date, remark=payload.remark)
    db.add(row); db.commit(); db.refresh(row)
    return member_payload(db, row)


@router.put("/choirs/{choir_id}/members/{member_id}")
def update_member(choir_id: str, member_id: str, payload: MemberUpdate, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    row = db.get(ChoirMember, member_id)
    if not row or row.choir_id != choir_id:
        raise HTTPException(404, "Member not found")
    member_user = db.get(User, row.user_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        if k in {"name", "nickname", "avatar_url", "mobile", "email"}:
            if member_user:
                setattr(member_user, k, v)
        else:
            setattr(row, k, v)
    db.commit(); db.refresh(row)
    return member_payload(db, row)


@router.delete("/choirs/{choir_id}/members/{member_id}")
def delete_member(choir_id: str, member_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    row = db.get(ChoirMember, member_id)
    if not row or row.choir_id != choir_id:
        raise HTTPException(404, "Member not found")
    db.delete(row)
    db.commit()
    return {"deleted": True, "member_id": member_id}


@router.post("/choirs/{choir_id}/members/{member_id}/approve")
def approve_member(choir_id: str, member_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    row = db.get(ChoirMember, member_id)
    if not row or row.choir_id != choir_id:
        raise HTTPException(404, "Member not found")
    row.member_status = "active"
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/me")
def my_profile(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    member = require_member(db, choir_id, user)
    data = member_payload(db, member)
    data["pending_section_request"] = [
        to_dict(x) for x in db.query(ProfileChangeRequest).filter_by(choir_id=choir_id, user_id=user.user_id, field_name="section_id", status="pending").order_by(ProfileChangeRequest.created_at.desc()).all()
    ]
    return data


@router.put("/choirs/{choir_id}/me")
def update_my_profile(choir_id: str, payload: ProfileUpdateIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit(); db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/choirs/{choir_id}/me/section-change")
def request_section_change(choir_id: str, payload: SectionChangeIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    member = require_member(db, choir_id, user)
    section = db.get(Section, payload.section_id)
    if not section or section.choir_id != choir_id:
        raise HTTPException(404, "Section not found")
    request = ProfileChangeRequest(request_id=new_id(), choir_id=choir_id, member_id=member.member_id, user_id=user.user_id, old_value=member.section_id, new_value=payload.section_id, remark=payload.remark)
    member.member_status = "pending"
    db.add(request); db.commit(); db.refresh(request)
    return to_dict(request)


@router.get("/choirs/{choir_id}/profile-change-requests")
def list_profile_change_requests(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    return [to_dict(x) for x in db.query(ProfileChangeRequest).filter_by(choir_id=choir_id).order_by(ProfileChangeRequest.created_at.desc()).all()]


@router.post("/profile-change-requests/{request_id}/approve")
def approve_profile_change(request_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(ProfileChangeRequest, request_id)
    if not row:
        raise HTTPException(404, "Request not found")
    require_role(db, row.choir_id, user, "admin")
    member = db.get(ChoirMember, row.member_id)
    if member and row.field_name == "section_id":
        member.section_id = row.new_value
        member.member_status = "active"
    row.status = "approved"; row.reviewed_by = user.user_id; row.reviewed_at = now()
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.post("/profile-change-requests/{request_id}/reject")
def reject_profile_change(request_id: str, payload: LeaveRejectIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(ProfileChangeRequest, request_id)
    if not row:
        raise HTTPException(404, "Request not found")
    require_role(db, row.choir_id, user, "admin")
    member = db.get(ChoirMember, row.member_id)
    if member:
        member.member_status = "active"
    row.status = "rejected"; row.reviewed_by = user.user_id; row.reviewed_at = now(); row.remark = payload.reject_reason
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/dashboard")
def dashboard(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    members = db.query(ChoirMember).filter_by(choir_id=choir_id).all()
    sections = {s.section_id: s.section_name for s in db.query(Section).filter_by(choir_id=choir_id).all()}
    section_counts: dict[str, int] = {}
    for m in members:
        name = sections.get(m.section_id, "未分配")
        section_counts[name] = section_counts.get(name, 0) + 1
    return {
        "choir_id": choir_id,
        "member_count": len(members),
        "active_member_count": len([m for m in members if m.member_status == "active"]),
        "event_count": db.query(Event).filter_by(choir_id=choir_id).count(),
        "task_count": db.query(PracticeTask).filter_by(choir_id=choir_id).count(),
        "practice_record_count": db.query(PracticeRecord).filter_by(choir_id=choir_id, status="submitted").count(),
        "attendance_count": db.query(AttendanceRecord).filter_by(choir_id=choir_id, status="present").count(),
        "section_counts": section_counts,
    }


@router.post("/admin/demo-seed")
def demo_seed(db: Session = Depends(db_session), user: User = Depends(current_user)):
    payload = ChoirIn(choir_name="D Major Choir Demo", city="广州南沙", description="用于MVP联调的示例合唱团")
    choir_dict = create_choir_internal(payload, db, user)
    choir_id = choir_dict["choir_id"]
    sections = db.query(Section).filter_by(choir_id=choir_id).order_by(Section.sort_order).all()
    work = Work(work_id=new_id(), choir_id=choir_id, title="雪绒花", lyricist="Oscar Hammerstein II", composer="Richard Rodgers", language="English", style="Musical", difficulty="easy", copyright_status="unknown", status="practicing")
    db.add(work); db.flush()
    db.add(Resource(resource_id=new_id(), work_id=work.work_id, choir_id=choir_id, resource_name="雪绒花总谱 Demo PDF", resource_type="score", file_url="/uploads/demo-score.pdf", file_format="pdf", version="v1", visibility="all", uploaded_by=user.user_id))
    event = Event(event_id=new_id(), choir_id=choir_id, title="周五晚常规排练", event_type="rehearsal", start_time=datetime.utcnow(), end_time=datetime.utcnow(), location="南沙排练室", description="示例排练活动", created_by=user.user_id)
    db.add(event)
    task = PracticeTask(task_id=new_id(), choir_id=choir_id, title="本周练习：雪绒花第一段", task_type="section_practice", work_id=work.work_id, target_sections=[sections[0].section_id] if sections else None, description="请先听示范音频，再录一遍自己的声部。", required_checkin_count=1, deadline=datetime.utcnow(), created_by=user.user_id)
    db.add(task)
    db.commit()
    return {"choir_id": choir_id, "work_id": work.work_id, "event_id": event.event_id, "task_id": task.task_id, "message": "Demo data created"}


@router.post("/choirs/{choir_id}/members/import-csv")
async def import_members_csv(choir_id: str, file: UploadFile = File(...), db: Session = Depends(db_session), user: User = Depends(current_user)):
    """Batch import members from CSV.

    Expected headers: name,mobile,section_name,role,member_status
    Missing roles default to member; missing status defaults to active.
    """
    require_role(db, choir_id, user, "admin")
    raw = await file.read()
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    imported, skipped = 0, []
    sections = {s.section_name: s for s in db.query(Section).filter_by(choir_id=choir_id).all()}
    for index, row in enumerate(reader, start=2):
        mobile = (row.get("mobile") or "").strip()
        name = (row.get("name") or mobile).strip()
        if not mobile:
            skipped.append({"row": index, "reason": "mobile is required"})
            continue
        section_name = (row.get("section_name") or "").strip()
        section = None
        if section_name:
            section = sections.get(section_name)
            if not section:
                section = Section(section_id=new_id(), choir_id=choir_id, section_name=section_name, sort_order=len(sections) + 1)
                db.add(section); db.flush()
                sections[section_name] = section
        member_user = db.query(User).filter_by(mobile=mobile).first()
        if not member_user:
            member_user = User(user_id=new_id(), mobile=mobile, name=name or mobile, nickname=name or None)
            db.add(member_user); db.flush()
        existing = db.query(ChoirMember).filter_by(choir_id=choir_id, user_id=member_user.user_id).first()
        if existing:
            existing.section_id = section.section_id if section else existing.section_id
            existing.role = (row.get("role") or existing.role or "member").strip()
            existing.member_status = (row.get("member_status") or existing.member_status or "active").strip()
        else:
            db.add(ChoirMember(
                member_id=new_id(),
                choir_id=choir_id,
                user_id=member_user.user_id,
                section_id=section.section_id if section else None,
                role=(row.get("role") or "member").strip(),
                member_status=(row.get("member_status") or "active").strip(),
            ))
        imported += 1
    db.commit()
    return {"imported": imported, "skipped": skipped}


@router.get("/choirs/{choir_id}/section-dashboard")
def section_dashboard(choir_id: str, section_id: str | None = None, db: Session = Depends(db_session), user: User = Depends(current_user)):
    """Dashboard for a section leader or admin.

    If section_id is omitted, section leaders see their own section and admins
    see the first section by sort order. This endpoint is intentionally compact
    for v0.6试点看板.
    """
    me = require_member(db, choir_id, user)
    if me.role == "member":
        raise HTTPException(403, "Only leaders can view section dashboard")
    if me.role == "section_leader":
        section_id = me.section_id
    if not section_id:
        first = db.query(Section).filter_by(choir_id=choir_id).order_by(Section.sort_order).first()
        section_id = first.section_id if first else None
    if not section_id:
        return {"choir_id": choir_id, "section_id": None, "section_name": "未分配", "member_count": 0, "active_member_count": 0, "task_count": 0, "record_count": 0, "pending_review_count": 0, "attendance_rate": 0.0}

    section = db.get(Section, section_id)
    if not section or section.choir_id != choir_id:
        raise HTTPException(404, "Section not found")

    members = db.query(ChoirMember).filter_by(choir_id=choir_id, section_id=section_id).all()
    active_members = [m for m in members if m.member_status == "active"]
    member_user_ids = [m.user_id for m in active_members]
    events = db.query(Event).filter_by(choir_id=choir_id).all()
    attendance_rows = db.query(AttendanceRecord).filter(AttendanceRecord.choir_id == choir_id, AttendanceRecord.user_id.in_(member_user_ids or [""])).all()
    attended = len([r for r in attendance_rows if r.status in ["present", "late"]])
    possible_attendance = len(events) * len(active_members)

    tasks = db.query(PracticeTask).filter_by(choir_id=choir_id).all()
    section_tasks = [t for t in tasks if not t.target_sections or section_id in t.target_sections]
    records = db.query(PracticeRecord).filter_by(choir_id=choir_id, section_id=section_id, status="submitted").all()
    comments_by_record = {c.practice_record_id for c in db.query(Comment).filter(Comment.choir_id == choir_id).all()}
    pending_review_count = len([r for r in records if r.practice_record_id not in comments_by_record])

    return {
        "choir_id": choir_id,
        "section_id": section_id,
        "section_name": section.section_name,
        "member_count": len(members),
        "active_member_count": len(active_members),
        "task_count": len(section_tasks),
        "record_count": len(records),
        "submitted_member_count": len({r.user_id for r in records}),
        "pending_review_count": pending_review_count,
        "attendance_rate": round(attended / possible_attendance, 4) if possible_attendance else 0.0,
    }


@router.get("/choirs/{choir_id}/members/import-template.csv")
def member_import_template(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    from fastapi.responses import StreamingResponse
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "mobile", "section_name", "role", "member_status"])
    writer.writerow(["张三", "13800000001", "Soprano / 一声部", "member", "active"])
    writer.writerow(["李四", "13800000002", "Alto / 二声部", "section_leader", "active"])
    data = "\ufeff" + output.getvalue()
    return StreamingResponse(iter([data]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=member_import_template.csv"})
