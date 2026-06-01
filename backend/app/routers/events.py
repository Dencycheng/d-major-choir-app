from __future__ import annotations
import csv
import io

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse

from app.core.utils import code, new_id, now, to_dict
from app.deps import current_user, db_session, require_member, require_role
from app.models import AttendanceRecord, ChoirMember, Event, EventResponse, LeaveRequest, Notification, User
from app.schemas import AttendanceUpdateIn, EventIn, EventResponseIn, LeaveIn, LeaveRejectIn

router = APIRouter(prefix="/api", tags=["events"])


@router.post("/choirs/{choir_id}/events")
def create_event(choir_id: str, payload: EventIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    row = Event(event_id=new_id(), choir_id=choir_id, created_by=user.user_id, **payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/events")
def list_events(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    return [to_dict(x) for x in db.query(Event).filter_by(choir_id=choir_id).order_by(Event.start_time.desc()).all()]




@router.put("/events/{event_id}")
def update_event(event_id: str, payload: EventIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(Event, event_id)
    if not row:
        raise HTTPException(404, "Event not found")
    require_role(db, row.choir_id, user, "admin")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.delete("/events/{event_id}")
def delete_event(event_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(Event, event_id)
    if not row:
        raise HTTPException(404, "Event not found")
    require_role(db, row.choir_id, user, "admin")
    db.query(AttendanceRecord).filter_by(event_id=event_id).delete(synchronize_session=False)
    db.query(EventResponse).filter_by(event_id=event_id).delete(synchronize_session=False)
    db.query(LeaveRequest).filter_by(event_id=event_id).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"deleted": True, "event_id": event_id}

@router.get("/events/{event_id}")
def get_event(event_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(Event, event_id)
    if not row:
        raise HTTPException(404, "Event not found")
    require_member(db, row.choir_id, user)
    data = to_dict(row)
    data["attendance_count"] = db.query(AttendanceRecord).filter_by(event_id=event_id, status="present").count()
    data["leave_count"] = db.query(AttendanceRecord).filter_by(event_id=event_id, status="leave").count()
    return data


@router.post("/choirs/{choir_id}/events/{event_id}/response")
def respond_event(choir_id: str, event_id: str, payload: EventResponseIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    event = db.get(Event, event_id)
    if not event or event.choir_id != choir_id:
        raise HTTPException(404, "Event not found")
    row = db.query(EventResponse).filter_by(event_id=event_id, user_id=user.user_id).first()
    if not row:
        row = EventResponse(response_id=new_id(), event_id=event_id, choir_id=choir_id, user_id=user.user_id)
        db.add(row)
    row.response_status = payload.response_status
    row.note = payload.note
    if payload.response_status == "attend":
        db.query(LeaveRequest).filter_by(event_id=event_id, user_id=user.user_id, status="pending").delete(synchronize_session=False)
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.post("/events/{event_id}/checkin-code")
def create_checkin_code(event_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    require_role(db, event.choir_id, user, "admin")
    event.checkin_code = f"CHECKIN-{event_id}-{code(12)}"
    db.commit(); db.refresh(event)
    return {"checkin_code": event.checkin_code}


@router.post("/events/{event_id}/checkin")
def checkin(event_id: str, checkin_code: Optional[str] = None, db: Session = Depends(db_session), user: User = Depends(current_user)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    require_member(db, event.choir_id, user)
    if event.checkin_code and checkin_code != event.checkin_code:
        raise HTTPException(400, "Invalid checkin code")
    row = db.query(AttendanceRecord).filter_by(event_id=event_id, user_id=user.user_id).first()
    if not row:
        row = AttendanceRecord(attendance_id=new_id(), event_id=event_id, choir_id=event.choir_id, user_id=user.user_id)
        db.add(row)
    row.checkin_time = now()
    row.status = "present"
    row.checkin_method = "qr"
    row.operated_by = user.user_id
    db.commit(); db.refresh(row)
    data = to_dict(row)
    data["message"] = "签到成功，快快开嗓一起唱吧。"
    return data


@router.get("/events/{event_id}/attendance")
def attendance(event_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    require_role(db, event.choir_id, user, "admin")
    return [to_dict(x) for x in db.query(AttendanceRecord).filter_by(event_id=event_id).all()]


@router.put("/attendance/{attendance_id}")
def update_attendance(attendance_id: str, payload: AttendanceUpdateIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(AttendanceRecord, attendance_id)
    if not row:
        raise HTTPException(404, "Attendance not found")
    require_role(db, row.choir_id, user, "admin")
    row.status = payload.status
    row.remark = payload.remark
    row.operated_by = user.user_id
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.post("/events/{event_id}/leave")
def create_leave(event_id: str, payload: LeaveIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    require_member(db, event.choir_id, user)
    row = db.query(LeaveRequest).filter_by(event_id=event_id, user_id=user.user_id, status="pending").first()
    if not row:
        row = LeaveRequest(leave_id=new_id(), event_id=event_id, choir_id=event.choir_id, user_id=user.user_id, reason=payload.reason)
        db.add(row)
    else:
        row.reason = payload.reason
    response = db.query(EventResponse).filter_by(event_id=event_id, user_id=user.user_id).first()
    if not response:
        response = EventResponse(response_id=new_id(), event_id=event_id, choir_id=event.choir_id, user_id=user.user_id)
        db.add(response)
    response.response_status = "leave"
    response.note = payload.reason
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/leave-requests")
def list_leaves(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    return [to_dict(x) for x in db.query(LeaveRequest).filter_by(choir_id=choir_id).order_by(LeaveRequest.created_at.desc()).all()]


@router.post("/leave-requests/{leave_id}/approve")
def approve_leave(leave_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(LeaveRequest, leave_id)
    if not row:
        raise HTTPException(404, "Leave not found")
    require_role(db, row.choir_id, user, "admin")
    row.status = "approved"
    row.approved_by = user.user_id
    row.approved_at = now()
    attendance = db.query(AttendanceRecord).filter_by(event_id=row.event_id, user_id=row.user_id).first()
    if not attendance:
        attendance = AttendanceRecord(attendance_id=new_id(), event_id=row.event_id, choir_id=row.choir_id, user_id=row.user_id)
        db.add(attendance)
    attendance.status = "leave"
    attendance.operated_by = user.user_id
    db.add(Notification(notification_id=new_id(), choir_id=row.choir_id, user_id=row.user_id, title="请假申请已通过", content="你的请假申请已通过。", notification_type="leave", related_id=leave_id))
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.post("/leave-requests/{leave_id}/reject")
def reject_leave(leave_id: str, payload: LeaveRejectIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(LeaveRequest, leave_id)
    if not row:
        raise HTTPException(404, "Leave not found")
    require_role(db, row.choir_id, user, "admin")
    row.status = "rejected"
    row.approved_by = user.user_id
    row.approved_at = now()
    row.reject_reason = payload.reject_reason
    db.add(Notification(notification_id=new_id(), choir_id=row.choir_id, user_id=row.user_id, title="请假申请未通过", content=payload.reject_reason or "请假申请未通过，请联系团务确认。", notification_type="leave", related_id=leave_id))
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/attendance/statistics")
def attendance_statistics(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    members = db.query(ChoirMember).filter_by(choir_id=choir_id, member_status="active").all()
    events = db.query(Event).filter_by(choir_id=choir_id).all()
    records = db.query(AttendanceRecord).filter_by(choir_id=choir_id).all()
    by_member: dict[str, dict[str, Any]] = {}
    users = {u.user_id: u for u in db.query(User).filter(User.user_id.in_([m.user_id for m in members] or [""])).all()}
    for member in members:
        user_obj = users.get(member.user_id)
        by_member[member.user_id] = {
            "user_id": member.user_id,
            "name": user_obj.name if user_obj else "",
            "section_id": member.section_id,
            "present": 0,
            "leave": 0,
            "late": 0,
            "absent": 0,
            "attendance_rate": 0.0,
        }
    for record in records:
        if record.user_id not in by_member:
            continue
        if record.status in by_member[record.user_id]:
            by_member[record.user_id][record.status] += 1
    total_events = len(events)
    for row in by_member.values():
        attended = row["present"] + row["late"]
        row["absent"] = max(0, total_events - attended - row["leave"])
        row["attendance_rate"] = round(attended / total_events, 4) if total_events else 0.0
    return {"choir_id": choir_id, "event_count": total_events, "active_member_count": len(members), "member_statistics": list(by_member.values())}


@router.get("/choirs/{choir_id}/attendance/export.csv")
def export_attendance_csv(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["event_title", "event_start_time", "member_name", "mobile", "status", "checkin_time", "remark"])
    rows = (
        db.query(AttendanceRecord, Event, User)
        .join(Event, Event.event_id == AttendanceRecord.event_id)
        .join(User, User.user_id == AttendanceRecord.user_id)
        .filter(AttendanceRecord.choir_id == choir_id)
        .order_by(Event.start_time.desc(), User.name.asc())
        .all()
    )
    for record, event, member_user in rows:
        writer.writerow([
            event.title,
            event.start_time.isoformat() if event.start_time else "",
            member_user.name or "",
            member_user.mobile or "",
            record.status,
            record.checkin_time.isoformat() if record.checkin_time else "",
            record.remark or "",
        ])
    data = "\ufeff" + output.getvalue()
    return StreamingResponse(iter([data]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=attendance.csv"})


@router.get("/events/{event_id}/response-statistics")
def event_response_statistics(event_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    """Return RSVP, leave and attendance counters for an event.

    This is designed for the admin dashboard so the团务 can see, at a glance,
    who has replied, who is absent/leave, and how many people have checked in.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    require_member(db, event.choir_id, user)

    active_members = db.query(ChoirMember).filter_by(choir_id=event.choir_id, member_status="active").all()
    responses = db.query(EventResponse).filter_by(event_id=event_id).all()
    attendance_rows = db.query(AttendanceRecord).filter_by(event_id=event_id).all()

    response_counts: dict[str, int] = {"attend": 0, "attending": 0, "leave": 0, "tentative": 0, "pending": 0}
    for response in responses:
        response_counts[response.response_status] = response_counts.get(response.response_status, 0) + 1
    replied_user_ids = {response.user_id for response in responses}
    response_counts["pending"] = max(0, len(active_members) - len(replied_user_ids))

    attendance_counts: dict[str, int] = {"present": 0, "late": 0, "leave": 0, "absent": 0, "pending_leave": 0}
    for row in attendance_rows:
        attendance_counts[row.status] = attendance_counts.get(row.status, 0) + 1

    checked_user_ids = {row.user_id for row in attendance_rows if row.status in ["present", "late", "leave"]}
    attendance_counts["absent"] = max(0, len(active_members) - len(checked_user_ids))
    attendance_counts["pending_leave"] = db.query(LeaveRequest).filter_by(event_id=event_id, status="pending").count()

    return {
        "event_id": event_id,
        "event_title": event.title,
        "active_member_count": len(active_members),
        "response_counts": response_counts,
        "attendance_counts": attendance_counts,
        "responded_member_count": len(replied_user_ids),
        "checked_or_leave_member_count": len(checked_user_ids),
    }


@router.get("/events/{event_id}/checkin-qr.png")
def checkin_qr_png(event_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    """Return a QR image for the event check-in code.

    The QR encodes the checkin code string. The miniapp/admin can show this
    image directly during rehearsal. If qrcode is not installed, install backend
    requirements again; qrcode[pil] is included from v0.6.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    require_role(db, event.choir_id, user, "admin")
    if not event.checkin_code:
        event.checkin_code = f"CHECKIN-{event_id}-{code(12)}"
        db.commit()
        db.refresh(event)

    import io as _io
    import qrcode
    from fastapi.responses import Response

    image = qrcode.make(event.checkin_code)
    buffer = _io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png")
