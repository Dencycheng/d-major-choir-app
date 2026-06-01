from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

TEST_DB = Path(__file__).resolve().parents[1] / "test_choir_app.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["AUTO_CREATE_TABLES"] = "true"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def login(mobile: str, name: str):
    res = client.post("/api/auth/login-mobile", json={"mobile": mobile, "code": "000000", "name": name})
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["access_token"].count(".") == 2
    from app.core.security import decode_access_token
    assert decode_access_token(payload["access_token"]) == payload["user"]["user_id"]
    return payload["access_token"], payload["user"]


def auth(token: str):
    return {"Authorization": f"Bearer {token}"}


def bootstrap_flow():
    suffix = uuid4().hex[:8]
    admin_token, _admin_user = login(f"138{suffix[:8]}", "Admin")
    member_token, _member_user = login(f"139{suffix[:8]}", "Member")

    choir = client.post("/api/choirs", json={"choir_name": f"D Major Choir {suffix}", "city": "Guangzhou"}, headers=auth(admin_token))
    assert choir.status_code == 200, choir.text
    choir_data = choir.json()
    choir_id = choir_data["choir_id"]
    invite_code = choir_data["invite_code"]

    sections = client.get(f"/api/choirs/{choir_id}/sections", headers=auth(admin_token))
    assert sections.status_code == 200, sections.text
    soprano_id = sections.json()[1]["section_id"]

    joined = client.post(f"/api/choirs/join?invite_code={invite_code}", headers=auth(member_token))
    assert joined.status_code == 200, joined.text
    member_relation_id = joined.json()["member_id"]

    forbidden = client.get(f"/api/choirs/{choir_id}/events", headers=auth(member_token))
    assert forbidden.status_code == 403

    approved = client.put(
        f"/api/choirs/{choir_id}/members/{member_relation_id}",
        json={"member_status": "active", "section_id": soprano_id, "role": "member"},
        headers=auth(admin_token),
    )
    assert approved.status_code == 200, approved.text
    return admin_token, member_token, choir_id, soprano_id


def test_health_and_jwt_me():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["version"] == "0.6.0"

    token, user = login("13800000001", "Admin")
    me = client.get("/api/auth/me", headers=auth(token))
    assert me.status_code == 200, me.text
    assert me.json()["user_id"] == user["user_id"]


def test_full_mvp_business_flow_with_secure_files_and_exports():
    admin_token, member_token, choir_id, soprano_id = bootstrap_flow()

    start = (datetime.utcnow() + timedelta(days=1)).isoformat()
    end = (datetime.utcnow() + timedelta(days=1, hours=2)).isoformat()
    event = client.post(
        f"/api/choirs/{choir_id}/events",
        json={"title": "周五晚常规排练", "start_time": start, "end_time": end, "location": "南沙排练室"},
        headers=auth(admin_token),
    )
    assert event.status_code == 200, event.text
    event_id = event.json()["event_id"]

    code = client.post(f"/api/events/{event_id}/checkin-code", headers=auth(admin_token))
    assert code.status_code == 200, code.text

    qr = client.get(f"/api/events/{event_id}/checkin-qr.png", headers=auth(admin_token))
    assert qr.status_code == 200, qr.text
    assert qr.headers["content-type"].startswith("image/png")


    bad_checkin = client.post(f"/api/events/{event_id}/checkin?checkin_code=BAD", headers=auth(member_token))
    assert bad_checkin.status_code == 400

    checkin = client.post(
        f"/api/events/{event_id}/checkin?checkin_code={code.json()['checkin_code']}",
        headers=auth(member_token),
    )
    assert checkin.status_code == 200, checkin.text
    assert checkin.json()["status"] == "present"

    response_stats = client.get(f"/api/events/{event_id}/response-statistics", headers=auth(admin_token))
    assert response_stats.status_code == 200, response_stats.text
    assert response_stats.json()["attendance_counts"]["present"] >= 1


    leave = client.post(f"/api/events/{event_id}/leave", json={"reason": "出差请假"}, headers=auth(member_token))
    assert leave.status_code == 200, leave.text
    leave_id = leave.json()["leave_id"]
    approved_leave = client.post(f"/api/leave-requests/{leave_id}/approve", headers=auth(admin_token))
    assert approved_leave.status_code == 200, approved_leave.text
    assert approved_leave.json()["status"] == "approved"

    work = client.post(
        f"/api/choirs/{choir_id}/works",
        json={"title": "雪绒花", "composer": "Richard Rodgers", "language": "English"},
        headers=auth(admin_token),
    )
    assert work.status_code == 200, work.text
    work_id = work.json()["work_id"]

    upload = client.post(
        "/api/files/upload",
        files={"file": ("score.pdf", b"fake-pdf", "application/pdf")},
        data={"choir_id": choir_id, "purpose": "resource"},
        headers=auth(admin_token),
    )
    assert upload.status_code == 200, upload.text
    asset_id = upload.json()["asset_id"]

    signed = client.get(f"/api/files/{asset_id}/signed-url", headers=auth(admin_token))
    assert signed.status_code == 200, signed.text
    downloaded = client.get(signed.json()["signed_url"])
    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.content == b"fake-pdf"

    resource = client.post(
        f"/api/works/{work_id}/resources",
        json={"resource_name": "雪绒花总谱", "resource_type": "score", "file_url": upload.json()["file_url"], "file_format": "pdf"},
        headers=auth(admin_token),
    )
    assert resource.status_code == 200, resource.text

    task = client.post(
        f"/api/choirs/{choir_id}/practice-tasks",
        json={
            "title": "本周练习：雪绒花第一段",
            "work_id": work_id,
            "target_sections": [soprano_id],
            "description": "请录制一遍第一段。",
            "deadline": end,
        },
        headers=auth(admin_token),
    )
    assert task.status_code == 200, task.text
    task_id = task.json()["task_id"]

    audio_upload = client.post(
        "/api/files/upload",
        files={"file": ("practice.m4a", b"fake-audio", "audio/mp4")},
        data={"choir_id": choir_id, "purpose": "practice_record"},
        headers=auth(member_token),
    )
    assert audio_upload.status_code == 200, audio_upload.text

    record = client.post(
        f"/api/practice-tasks/{task_id}/records",
        json={"audio_url": audio_upload.json()["file_url"], "audio_duration": 58, "practice_count": 2, "pitch_self_rating": "stable", "note": "今天练了两遍"},
        headers=auth(member_token),
    )
    assert record.status_code == 200, record.text
    record_id = record.json()["practice_record_id"]

    global_records = client.get(f"/api/choirs/{choir_id}/practice-records", headers=auth(admin_token))
    assert global_records.status_code == 200, global_records.text
    assert any(x["practice_record_id"] == record_id for x in global_records.json())

    comment = client.post(
        f"/api/practice-records/{record_id}/comments",
        json={"content": "音准整体不错，注意尾音不要掉。", "rating": 4},
        headers=auth(admin_token),
    )
    assert comment.status_code == 200, comment.text

    task_stats = client.get(f"/api/practice-tasks/{task_id}/statistics", headers=auth(admin_token))
    assert task_stats.status_code == 200, task_stats.text
    assert task_stats.json()["completion_rate"] == 1.0

    dashboard = client.get(f"/api/choirs/{choir_id}/dashboard", headers=auth(admin_token))
    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["member_count"] >= 2
    assert dashboard.json()["practice_record_count"] >= 1

    section_dashboard = client.get(f"/api/choirs/{choir_id}/section-dashboard?section_id={soprano_id}", headers=auth(admin_token))
    assert section_dashboard.status_code == 200, section_dashboard.text
    assert section_dashboard.json()["section_id"] == soprano_id


    attendance_export = client.get(f"/api/choirs/{choir_id}/attendance/export.csv", headers=auth(admin_token))
    assert attendance_export.status_code == 200, attendance_export.text
    assert "周五晚常规排练" in attendance_export.text

    records_export = client.get(f"/api/practice-tasks/{task_id}/records/export.csv", headers=auth(admin_token))
    assert records_export.status_code == 200, records_export.text
    assert "本周练习" in records_export.text

    import_csv = "name,mobile,section_name,role,member_status\n新成员,13700000001,Soprano / 一声部,member,active\n"
    imported = client.post(
        f"/api/choirs/{choir_id}/members/import-csv",
        files={"file": ("members.csv", import_csv.encode("utf-8"), "text/csv")},
        headers=auth(admin_token),
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["imported"] == 1

    template = client.get(f"/api/choirs/{choir_id}/members/import-template.csv", headers=auth(admin_token))
    assert template.status_code == 200, template.text
    assert "name,mobile,section_name" in template.text


    notifications = client.get("/api/notifications", headers=auth(member_token))
    assert notifications.status_code == 200, notifications.text
    types = [n["notification_type"] for n in notifications.json()]
    assert "comment" in types
    assert "leave" in types

    delete_event = client.delete(f"/api/events/{event_id}", headers=auth(admin_token))
    assert delete_event.status_code == 200, delete_event.text
    assert delete_event.json()["deleted"] is True

    deleted_event = client.get(f"/api/events/{event_id}", headers=auth(admin_token))
    assert deleted_event.status_code == 404
