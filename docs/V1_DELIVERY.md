# D Major Choir App V1 Delivery

## Database

Production SQLite path:

```bash
/home/ubuntu/d_major_data/dmajor.sqlite
```

Production uploads path:

```bash
/home/ubuntu/d_major_uploads
```

Main tables:

- `users`: user profile, mobile/email/avatar.
- `choirs`: choir metadata and invite code.
- `sections`: voice parts.
- `choir_members`: membership, section, role, status, join date, remarks.
- `role_permissions`: per-choir role permission matrix.
- `profile_change_requests`: member section-change approval workflow.
- `events`: rehearsals/performances.
- `event_responses`: attend/leave/tentative RSVP.
- `leave_requests`: leave reason, approval result and note.
- `attendance_records`: check-in, leave and absence records.
- `works`: repertoire.
- `resources`: PDF/image/electronic score/audio/video resources.
- `practice_tasks`: practice assignments.
- `practice_records`: member check-ins and recordings.
- `comments`: conductor/leader comments.
- `notifications`: member-side result sync.
- `ai_reports`: reserved pitch/rhythm/breath scoring output.
- `file_assets`: protected upload metadata.

## Scripts

```bash
python3 scripts/migrate_sqlite.py
python3 scripts/migrate_db_json.py
python3 scripts/seed_v1.py
scripts/backup.sh
scripts/restore.sh /path/to/dmajor.sqlite /path/to/uploads.tar.gz
```

Useful environment variables:

```bash
SQLITE_PATH=/home/ubuntu/d_major_data/dmajor.sqlite
UPLOAD_DIR=/home/ubuntu/d_major_uploads
BACKUP_DIR=/home/ubuntu/d_major_backups
DB_JSON_PATH=data/db.json
```

`migrate_sqlite.py` creates/updates the SQLite schema from SQLAlchemy models.
`migrate_db_json.py` imports legacy `data/db.json` users, choirs, sections and members when that file exists.
`seed_v1.py` creates safe test data only when the demo choir does not already exist.

## Local Start

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=sqlite:///../data/local.sqlite UPLOAD_DIR=../uploads uvicorn app.main:app --reload
```

Admin web:

```bash
cd admin-web
npm install
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Member web:

```bash
cd member-web
npm install
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

## Server Deployment

```bash
mkdir -p /home/ubuntu/d_major_data /home/ubuntu/d_major_uploads /home/ubuntu/d_major_backups
export SQLITE_PATH=/home/ubuntu/d_major_data/dmajor.sqlite
export UPLOAD_DIR=/home/ubuntu/d_major_uploads
export DATABASE_URL=sqlite:////home/ubuntu/d_major_data/dmajor.sqlite
python3 scripts/migrate_sqlite.py
python3 scripts/migrate_db_json.py
python3 scripts/seed_v1.py
```

Before every deployment:

```bash
scripts/backup.sh
```

Development API stays on:

```bash
http://119.45.176.130:4173
```

Production API is reserved for ICP approval:

```bash
https://api.dmajorchoir.com
```

## Mini Program Test

1. Open `miniapp` in WeChat DevTools.
2. Confirm local storage API base is `http://119.45.176.130:4173`.
3. Login with member test account.
4. Open Home: verify next rehearsal, weekly task, latest notifications and library entry.
5. Open Events: test attend confirmation, leave reason submission and check-in message.
6. Open Tasks: submit recording check-in and self assessment.
7. Open Library: open PDF/audio/video resources and test video speed buttons.
8. Open Me: view profile and switch selected choir.

## Test Accounts

- Admin: `13800000000`, code `000000`.
- Member: `13900000001`, code `000000`.
- Demo invite code: `DMAJOR`.

## Acceptance Checklist

- SQLite schema can be created without committing real DB files.
- `uploads/*`, `*.sqlite`, `data/*.db` and `.env` are ignored by Git.
- Admin can create, search, filter, edit and delete members.
- Admin can configure role permissions.
- Section leaders/principals are scoped to their own section in member lists.
- Member can view profile and update avatar/nickname.
- Section-change request moves member to pending and waits for admin approval.
- Member attend/leave/check-in flows show the requested copy.
- Admin can approve/reject leave requests and member receives notifications.
- Event statistics include attend, pending leave, checked-in, leave and absent counts.
- Library supports PDF, image, audio and video resources.
- Member video playback supports 0.75x, 1x, 1.25x and 1.5x.
- AI scoring table and practice-record fields remain available for later scoring integrations.

## Known Gaps

- Permission checks are implemented for the current admin/member/section-scope flows, but not every legacy endpoint has fine-grained permission-key enforcement yet.
- Mini Program avatar upload UI is not fully wired; Web member profile supports avatar upload.
- Real AI pitch/rhythm scoring is only reserved at schema/API level.
- This local Codex environment did not have `npm`, `pytest` or `sqlalchemy`, so full build/test execution must be run in the project runtime or server environment.
