from __future__ import annotations
import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.utils import new_id, to_dict
from app.deps import current_user, db_session, require_member
from app.models import ChoirMember, Comment, Notification, PracticeRecord, PracticeTask, User
from app.schemas import CommentIn, PracticeRecordIn, PracticeTaskIn

router = APIRouter(prefix="/api", tags=["practice"])


@router.post("/choirs/{choir_id}/practice-tasks")
def create_task(choir_id: str, payload: PracticeTaskIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    me = require_member(db, choir_id, user)
    if me.role not in ["section_leader", "conductor", "admin", "super_admin"]:
        raise HTTPException(403, "Only leaders can create tasks")
    data = payload.model_dump()
    if me.role == "section_leader":
        data["target_sections"] = [me.section_id] if me.section_id else []
    row = PracticeTask(task_id=new_id(), choir_id=choir_id, created_by=user.user_id, **data)
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/practice-tasks")
def list_tasks(choir_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    me = require_member(db, choir_id, user)
    rows = db.query(PracticeTask).filter_by(choir_id=choir_id).order_by(PracticeTask.created_at.desc()).all()
    if me.role in ["member", "section_leader"]:
        rows = [r for r in rows if not r.target_sections or me.section_id in r.target_sections]
    return [to_dict(x) for x in rows]


@router.get("/practice-tasks/{task_id}/statistics")
def task_statistics(task_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    task = db.get(PracticeTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    require_member(db, task.choir_id, user)
    members_q = db.query(ChoirMember).filter_by(choir_id=task.choir_id, member_status="active")
    if task.target_sections:
        members_q = members_q.filter(ChoirMember.section_id.in_(task.target_sections))
    members = members_q.all()
    records = db.query(PracticeRecord).filter_by(task_id=task_id, status="submitted").all()
    submitted_user_ids = {r.user_id for r in records}
    return {
        "task_id": task_id,
        "target_member_count": len(members),
        "submitted_member_count": len(submitted_user_ids),
        "record_count": len(records),
        "completion_rate": round(len(submitted_user_ids) / len(members), 4) if members else 0.0,
        "unsubmitted_user_ids": [m.user_id for m in members if m.user_id not in submitted_user_ids],
    }


@router.post("/practice-tasks/{task_id}/records")
def create_record(task_id: str, payload: PracticeRecordIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    task = db.get(PracticeTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    me = require_member(db, task.choir_id, user)
    if task.target_sections and me.section_id not in task.target_sections:
        raise HTTPException(403, "Task is not assigned to your section")
    row = PracticeRecord(practice_record_id=new_id(), task_id=task_id, choir_id=task.choir_id, user_id=user.user_id, section_id=me.section_id, **payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/practice-tasks/{task_id}/records")
def list_records(task_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    task = db.get(PracticeTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    me = require_member(db, task.choir_id, user)
    q = db.query(PracticeRecord).filter_by(task_id=task_id, status="submitted")
    if me.role == "member":
        q = q.filter_by(user_id=user.user_id)
    elif me.role == "section_leader":
        q = q.filter_by(section_id=me.section_id)
    return [to_dict(x) for x in q.order_by(PracticeRecord.created_at.desc()).all()]



@router.get("/choirs/{choir_id}/practice-records")
def list_choir_practice_records(choir_id: str, task_id: str | None = None, db: Session = Depends(db_session), user: User = Depends(current_user)):
    me = require_member(db, choir_id, user)
    q = db.query(PracticeRecord).filter_by(choir_id=choir_id, status="submitted")
    if task_id:
        q = q.filter_by(task_id=task_id)
    if me.role == "member":
        q = q.filter_by(user_id=user.user_id)
    elif me.role == "section_leader":
        q = q.filter_by(section_id=me.section_id)
    rows = []
    for record in q.order_by(PracticeRecord.created_at.desc()).all():
        d = to_dict(record)
        d["comments"] = [to_dict(x) for x in db.query(Comment).filter_by(practice_record_id=record.practice_record_id).order_by(Comment.created_at.desc()).all()]
        rows.append(d)
    return rows

@router.get("/practice-records/{record_id}")
def get_practice_record(record_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    record = db.get(PracticeRecord, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    me = require_member(db, record.choir_id, user)
    if me.role == "member" and record.user_id != user.user_id:
        raise HTTPException(403, "No access")
    if me.role == "section_leader" and me.section_id != record.section_id:
        raise HTTPException(403, "No access")
    data = to_dict(record)
    data["comments"] = [to_dict(x) for x in db.query(Comment).filter_by(practice_record_id=record_id).order_by(Comment.created_at.desc()).all()]
    return data


@router.post("/practice-records/{record_id}/comments")
def create_comment(record_id: str, payload: CommentIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    record = db.get(PracticeRecord, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    me = require_member(db, record.choir_id, user)
    if me.role == "member" or (me.role == "section_leader" and me.section_id != record.section_id):
        raise HTTPException(403, "No permission to comment")
    row = Comment(comment_id=new_id(), practice_record_id=record_id, choir_id=record.choir_id, commenter_user_id=user.user_id, **payload.model_dump())
    db.add(row)
    db.add(Notification(notification_id=new_id(), choir_id=record.choir_id, user_id=record.user_id, title="你收到一条练习点评", content=payload.content, notification_type="comment", related_id=record_id))
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/practice-records/{record_id}/comments")
def list_comments(record_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    record = db.get(PracticeRecord, record_id)
    if not record:
        raise HTTPException(404, "Record not found")
    me = require_member(db, record.choir_id, user)
    if me.role == "member" and record.user_id != user.user_id:
        raise HTTPException(403, "No access")
    return [to_dict(x) for x in db.query(Comment).filter_by(practice_record_id=record_id).order_by(Comment.created_at.desc()).all()]


@router.get("/practice-tasks/{task_id}/records/export.csv")
def export_task_records_csv(task_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    task = db.get(PracticeTask, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    require_member(db, task.choir_id, user)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["task_title", "member_name", "mobile", "section_id", "audio_url", "audio_duration", "practice_count", "pitch_self_rating", "rhythm_self_rating", "breath_self_rating", "need_help", "note", "created_at"])
    rows = (
        db.query(PracticeRecord, User)
        .join(User, User.user_id == PracticeRecord.user_id)
        .filter(PracticeRecord.task_id == task_id, PracticeRecord.status == "submitted")
        .order_by(PracticeRecord.created_at.desc())
        .all()
    )
    for record, member_user in rows:
        writer.writerow([
            task.title,
            member_user.name or "",
            member_user.mobile or "",
            record.section_id or "",
            record.audio_url or "",
            record.audio_duration or "",
            record.practice_count or "",
            record.pitch_self_rating or "",
            record.rhythm_self_rating or "",
            record.breath_self_rating or "",
            "yes" if record.need_help else "no",
            record.note or "",
            record.created_at.isoformat() if record.created_at else "",
        ])
    data = "\ufeff" + output.getvalue()
    return StreamingResponse(iter([data]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=practice_records.csv"})
