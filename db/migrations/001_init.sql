CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS choirs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  choir_id uuid NOT NULL REFERENCES choirs(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  english_name text,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (choir_id, code)
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mobile text UNIQUE,
  password_hash text,
  wechat_openid text UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS choir_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  choir_id uuid NOT NULL REFERENCES choirs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections(id),
  role_code text NOT NULL REFERENCES roles(code),
  member_status text NOT NULL DEFAULT 'formal',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (choir_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  choir_id uuid NOT NULL REFERENCES choirs(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_type text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  agenda text,
  need_attendance boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL,
  method text NOT NULL,
  checked_in_at timestamptz,
  operated_by uuid REFERENCES users(id),
  UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  choir_id uuid NOT NULL REFERENCES choirs(id) ON DELETE CASCADE,
  title text NOT NULL,
  composer text,
  arranger text,
  status text NOT NULL DEFAULT 'learning',
  readiness integer NOT NULL DEFAULT 0,
  copyright_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  title text NOT NULL,
  resource_type text NOT NULL,
  section_id uuid REFERENCES sections(id),
  storage_key text NOT NULL,
  version text NOT NULL,
  visibility text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  choir_id uuid NOT NULL REFERENCES choirs(id) ON DELETE CASCADE,
  work_id uuid REFERENCES works(id),
  title text NOT NULL,
  segment text,
  brief text,
  deadline timestamptz,
  required_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES practice_tasks(id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections(id),
  user_id uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS practice_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES practice_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id uuid REFERENCES sections(id),
  audio_storage_key text,
  duration_seconds integer,
  self_rating text,
  need_help boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending_feedback',
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_record_id uuid NOT NULL REFERENCES practice_records(id) ON DELETE CASCADE,
  commenter_user_id uuid NOT NULL REFERENCES users(id),
  content text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  need_followup boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  object_type text NOT NULL,
  object_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
