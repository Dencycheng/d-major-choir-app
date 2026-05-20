CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS choir (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,
  city TEXT,
  season TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sections (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  english_name TEXT,
  color TEXT,
  leader TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  built_in INTEGER NOT NULL DEFAULT 1,
  managed_sections TEXT DEFAULT '[]',
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS file_assets (
  id TEXT PRIMARY KEY,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER DEFAULT 0,
  path TEXT NOT NULL,
  storage_provider TEXT DEFAULT 'local',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT,
  avatar_file_id TEXT,
  avatar_url TEXT,
  mobile TEXT,
  email TEXT,
  section TEXT,
  role TEXT,
  status TEXT,
  note TEXT,
  voice_range TEXT,
  attendance INTEGER DEFAULT 0,
  managed_sections TEXT DEFAULT '[]',
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (avatar_file_id) REFERENCES file_assets(id)
);

CREATE TABLE IF NOT EXISTS profile_change_requests (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  status TEXT NOT NULL,
  note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  time TEXT,
  location TEXT,
  agenda TEXT,
  response TEXT,
  need_attendance INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT,
  section TEXT,
  status TEXT,
  note TEXT,
  method TEXT,
  time TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  approver_id TEXT,
  approval_note TEXT,
  reviewed_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  composer TEXT,
  arranger TEXT,
  status TEXT,
  difficulty TEXT,
  copyright TEXT,
  readiness INTEGER DEFAULT 0,
  weak_spot TEXT,
  favorite INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  section TEXT DEFAULT 'ALL',
  version TEXT,
  visibility TEXT,
  file_id TEXT,
  storage_key TEXT,
  storage_provider TEXT DEFAULT 'local',
  is_public INTEGER DEFAULT 0,
  ai_ready INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES file_assets(id)
);

CREATE TABLE IF NOT EXISTS practice_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  work_id TEXT,
  work_title TEXT,
  segment TEXT,
  target_sections TEXT DEFAULT '[]',
  deadline TEXT,
  required_count INTEGER DEFAULT 1,
  brief TEXT,
  status TEXT,
  created_by TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (work_id) REFERENCES works(id)
);

CREATE TABLE IF NOT EXISTS practice_records (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT,
  section TEXT,
  audio_file_id TEXT,
  duration INTEGER DEFAULT 0,
  feelings TEXT,
  pitch TEXT,
  rhythm TEXT,
  breath TEXT,
  self_rating TEXT,
  need_help INTEGER DEFAULT 0,
  status TEXT,
  feedback TEXT,
  tags TEXT DEFAULT '[]',
  commented_by TEXT,
  commented_at TEXT,
  submitted_at TEXT,
  ai_pitch_score REAL,
  ai_rhythm_score REAL,
  ai_report_status TEXT DEFAULT 'not_started',
  FOREIGN KEY (task_id) REFERENCES practice_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (audio_file_id) REFERENCES file_assets(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  member_id TEXT,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT 'unread',
  created_at TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
