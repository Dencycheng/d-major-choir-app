-- V1 SQLite migration reference.
-- The executable migration is scripts/migrate_sqlite.py, which creates the
-- SQLAlchemy model schema idempotently for SQLite.

CREATE TABLE IF NOT EXISTS role_permissions (
  permission_id VARCHAR(36) PRIMARY KEY,
  choir_id VARCHAR(36) NOT NULL,
  role VARCHAR(50) NOT NULL,
  permissions JSON NOT NULL,
  scope VARCHAR(30) NOT NULL DEFAULT 'own',
  updated_by VARCHAR(36),
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(choir_id) REFERENCES choirs(choir_id),
  FOREIGN KEY(updated_by) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS profile_change_requests (
  request_id VARCHAR(36) PRIMARY KEY,
  choir_id VARCHAR(36) NOT NULL,
  member_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  field_name VARCHAR(50) NOT NULL DEFAULT 'section_id',
  old_value VARCHAR(300),
  new_value VARCHAR(300),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR(36),
  reviewed_at DATETIME,
  remark TEXT,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(choir_id) REFERENCES choirs(choir_id),
  FOREIGN KEY(member_id) REFERENCES choir_members(member_id),
  FOREIGN KEY(user_id) REFERENCES users(user_id),
  FOREIGN KEY(reviewed_by) REFERENCES users(user_id)
);
