-- V2.1 正式账号体系：登录用户、会话、登录日志、邀请码、入团申请、操作日志
-- PRD V2.1 第 4/5/9 章

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  nickname TEXT,
  avatar_url TEXT,
  mobile TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  wechat_openid TEXT UNIQUE,
  is_admin INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  client TEXT,
  ip TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  identifier TEXT,
  ip TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id);

CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  target_section TEXT,
  default_role TEXT,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_by TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS join_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  invite_id TEXT,
  invite_code TEXT,
  name TEXT NOT NULL,
  mobile TEXT,
  section_preference TEXT,
  voice_range TEXT,
  experience TEXT,
  status TEXT NOT NULL DEFAULT '待审核',
  reviewer_id TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_join_requests_status ON join_requests(status);

CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_operation_logs_actor ON operation_logs(actor_id);

-- V2.1 新增权限点（幂等）
INSERT OR IGNORE INTO permissions (code, name, description) VALUES
  ('role_manage', '角色权限管理', '配置角色与权限映射'),
  ('dashboard_view', '数据看板', '查看全团出勤、打卡与作品数据'),
  ('invite_manage', '邀请与入团管理', '生成邀请码、审核入团申请'),
  ('system_manage', '系统设置', '系统级配置与账号管理');

-- 角色权限映射在 database/seeds/001_roles_permissions.sql 中维护（roles 表先于此处填充）

-- 成员档案绑定登录用户
ALTER TABLE members ADD COLUMN user_id TEXT;
