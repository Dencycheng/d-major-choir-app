from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.utils import new_id, to_dict
from app.deps import current_user, db_session, require_member, require_role
from app.models import Resource, User, Work
from app.schemas import ResourceIn, WorkIn

router = APIRouter(prefix="/api", tags=["works"])


@router.post("/choirs/{choir_id}/works")
def create_work(choir_id: str, payload: WorkIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_role(db, choir_id, user, "admin")
    row = Work(work_id=new_id(), choir_id=choir_id, **payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/choirs/{choir_id}/works")
def list_works(choir_id: str, keyword: Optional[str] = None, db: Session = Depends(db_session), user: User = Depends(current_user)):
    require_member(db, choir_id, user)
    q = db.query(Work).filter_by(choir_id=choir_id)
    if keyword:
        q = q.filter(Work.title.contains(keyword))
    return [to_dict(x) for x in q.order_by(Work.created_at.desc()).all()]


@router.get("/works/{work_id}")
def get_work(work_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(Work, work_id)
    if not row:
        raise HTTPException(404, "Work not found")
    require_member(db, row.choir_id, user)
    data = to_dict(row)
    data["resources"] = list_resources(work_id, db, user)
    return data


@router.put("/works/{work_id}")
def update_work(work_id: str, payload: WorkIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    row = db.get(Work, work_id)
    if not row:
        raise HTTPException(404, "Work not found")
    require_role(db, row.choir_id, user, "admin")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit(); db.refresh(row)
    return to_dict(row)


@router.post("/works/{work_id}/resources")
def create_resource(work_id: str, payload: ResourceIn, db: Session = Depends(db_session), user: User = Depends(current_user)):
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(404, "Work not found")
    require_role(db, work.choir_id, user, "admin")
    row = Resource(resource_id=new_id(), work_id=work_id, choir_id=work.choir_id, uploaded_by=user.user_id, **payload.model_dump())
    db.add(row); db.commit(); db.refresh(row)
    return to_dict(row)


@router.get("/works/{work_id}/resources")
def list_resources(work_id: str, db: Session = Depends(db_session), user: User = Depends(current_user)):
    work = db.get(Work, work_id)
    if not work:
        raise HTTPException(404, "Work not found")
    me = require_member(db, work.choir_id, user)
    q = db.query(Resource).filter_by(work_id=work_id)
    if me.role == "member":
        q = q.filter((Resource.visibility == "all") | (Resource.section_id == me.section_id))
    return [to_dict(x) for x in q.order_by(Resource.created_at.desc()).all()]
