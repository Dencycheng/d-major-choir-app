from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

db_path = Path(os.getenv("SQLITE_PATH", "/home/ubuntu/d_major_data/dmajor.sqlite"))
db_path.parent.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = os.getenv("DATABASE_URL", f"sqlite:///{db_path}")

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.utils import new_id  # noqa: E402
from app.models import Choir, ChoirMember, Event, PracticeTask, Resource, RolePermission, Section, User, Work  # noqa: E402
from app.routers.choirs import DEFAULT_ROLE_PERMISSIONS  # noqa: E402


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        admin = db.query(User).filter_by(mobile="13800000000").first()
        if not admin:
            admin = User(user_id=new_id(), mobile="13800000000", name="D Major Admin", nickname="Admin")
            db.add(admin)
            db.flush()
        choir = db.query(Choir).filter_by(choir_name="D Major Choir").first()
        if not choir:
            choir = Choir(choir_id=new_id(), choir_name="D Major Choir", city="广州南沙", description="D Major Choir V1 MVP", owner_user_id=admin.user_id, invite_code="DMAJOR")
            db.add(choir)
            db.flush()
            sections = []
            for order, name in enumerate(["女高", "女中", "男高", "男低"], start=1):
                section = Section(section_id=new_id(), choir_id=choir.choir_id, section_name=name, sort_order=order)
                db.add(section)
                sections.append(section)
            db.flush()
            db.add(ChoirMember(member_id=new_id(), choir_id=choir.choir_id, user_id=admin.user_id, section_id=sections[0].section_id, role="super_admin", member_status="active", join_date=datetime.utcnow().date().isoformat()))
            member = User(user_id=new_id(), mobile="13900000001", name="测试团员", nickname="小D")
            db.add(member)
            db.flush()
            db.add(ChoirMember(member_id=new_id(), choir_id=choir.choir_id, user_id=member.user_id, section_id=sections[1].section_id, role="member", member_status="active", join_date=datetime.utcnow().date().isoformat()))
            for role, (permissions, scope) in DEFAULT_ROLE_PERMISSIONS.items():
                db.add(RolePermission(permission_id=new_id(), choir_id=choir.choir_id, role=role, permissions=permissions, scope=scope, updated_by=admin.user_id))
            work = Work(work_id=new_id(), choir_id=choir.choir_id, title="雪绒花", composer="Richard Rodgers", language="English", status="practicing")
            db.add(work)
            db.flush()
            db.add(Resource(resource_id=new_id(), work_id=work.work_id, choir_id=choir.choir_id, resource_name="雪绒花总谱 Demo", resource_type="score_full", file_url="/uploads/demo-score.pdf", file_format="pdf", visibility="all", uploaded_by=admin.user_id))
            db.add(Resource(resource_id=new_id(), work_id=work.work_id, choir_id=choir.choir_id, resource_name="排练视频 Demo", resource_type="rehearsal_video", file_url="/uploads/demo-video.mp4", file_format="mp4", visibility="all", uploaded_by=admin.user_id))
            start = datetime.utcnow() + timedelta(days=3)
            db.add(Event(event_id=new_id(), choir_id=choir.choir_id, title="周五晚常规排练", start_time=start, end_time=start + timedelta(hours=2), location="南沙排练室", created_by=admin.user_id))
            db.add(PracticeTask(task_id=new_id(), choir_id=choir.choir_id, title="本周练习：雪绒花第一段", work_id=work.work_id, target_sections=None, description="录制自己的声部并提交自评。", required_checkin_count=1, deadline=start, created_by=admin.user_id))
        db.commit()
        print("V1 seed ready. Admin: 13800000000 / code 000000, Member: 13900000001 / code 000000")
    finally:
        db.close()


if __name__ == "__main__":
    main()
