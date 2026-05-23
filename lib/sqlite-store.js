const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const root = path.join(__dirname, "..");
const defaultDbPath = process.env.NODE_ENV === "production"
  ? "/home/ubuntu/d_major_data/dmajor.sqlite"
  : path.join(root, "data", "dmajor.sqlite");
const migrationsDir = path.join(root, "database", "migrations");
const seedSqlPath = path.join(root, "database", "seeds", "001_roles_permissions.sql");

function dbPath() {
  return process.env.SQLITE_PATH || process.env.SQLITE_DB_PATH || defaultDbPath;
}

function openDatabase() {
  fs.mkdirSync(path.dirname(dbPath()), { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function applyMigrations(db = openDatabase()) {
  const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith(".sql")).sort();
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map(row => row.version));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))").run(file);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}

function applyBaseSeed(db = openDatabase()) {
  const roleCount = db.prepare("SELECT COUNT(*) count FROM roles").get().count;
  if (roleCount === 0 && fs.existsSync(seedSqlPath)) {
    db.exec(fs.readFileSync(seedSqlPath, "utf8"));
  }
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function bool(value) {
  return value ? 1 : 0;
}

function readStore() {
  const db = applyMigrations();
  applyBaseSeed(db);
  const choir = db.prepare("SELECT * FROM choir LIMIT 1").get() || {
    id: "choir-d-major",
    name: "D大调合唱团",
    subtitle: "数字排练空间",
    city: "上海",
    season: "2026 春夏排练季"
  };

  const fileAssets = db.prepare("SELECT id, original_name originalName, mime_type mimeType, size, path, storage_provider storageProvider, created_at createdAt FROM file_assets").all();
  const roles = db.prepare("SELECT id, code, name, description, built_in builtIn, managed_sections managedSections, created_at createdAt, updated_at updatedAt FROM roles ORDER BY name").all().map(role => ({
    ...role,
    builtIn: Boolean(role.builtIn),
    managedSections: parseJson(role.managedSections, [])
  }));
  const rolePermissions = db.prepare("SELECT role_id roleId, permission_code permissionCode FROM role_permissions").all();

  return {
    choir: {
      id: choir.id,
      name: choir.name,
      subtitle: choir.subtitle,
      city: choir.city,
      season: choir.season
    },
    sections: db.prepare("SELECT code, name, english_name englishName, color, leader, sort_order sortOrder FROM sections ORDER BY sort_order, code").all(),
    roles,
    permissions: db.prepare("SELECT code, name, description FROM permissions ORDER BY code").all(),
    rolePermissions,
    members: db.prepare("SELECT id, name, nickname, avatar_file_id avatarFileId, avatar_url avatarUrl, mobile, email, section, role, status, note, voice_range voiceRange, attendance, managed_sections managedSections, created_at createdAt, updated_at updatedAt FROM members ORDER BY section, name").all().map(member => ({
      ...member,
      managedSections: parseJson(member.managedSections, [])
    })),
    profileChangeRequests: db.prepare("SELECT id, member_id memberId, field, old_value oldValue, new_value newValue, status, note, reviewed_by reviewedBy, reviewed_at reviewedAt, created_at createdAt FROM profile_change_requests ORDER BY created_at DESC").all(),
    events: db.prepare("SELECT id, title, type, time, location, agenda, response, need_attendance needAttendance, created_at createdAt, updated_at updatedAt FROM events ORDER BY time DESC").all().map(event => ({ ...event, needAttendance: Boolean(event.needAttendance) })),
    attendance: db.prepare("SELECT id, event_id eventId, member_id memberId, member_name memberName, section, status, note, method, time, created_at createdAt, updated_at updatedAt FROM attendance ORDER BY updated_at DESC").all(),
    leaveRequests: db.prepare("SELECT id, event_id eventId, member_id memberId, reason, status, approver_id approverId, approval_note approvalNote, reviewed_at reviewedAt, created_at createdAt, updated_at updatedAt FROM leave_requests ORDER BY created_at DESC").all(),
    works: db.prepare("SELECT id, title, composer, arranger, status, difficulty, copyright, readiness, weak_spot weakSpot, favorite, created_at createdAt, updated_at updatedAt FROM works ORDER BY created_at DESC").all().map(work => ({ ...work, favorite: Boolean(work.favorite) })),
    resources: db.prepare("SELECT id, work_id workId, title, type, section, version, visibility, file_id fileId, storage_key storageKey, storage_provider storageProvider, is_public isPublic, ai_ready aiReady, created_at createdAt, updated_at updatedAt FROM resources ORDER BY created_at DESC").all().map(resource => ({ ...resource, isPublic: Boolean(resource.isPublic), aiReady: Boolean(resource.aiReady) })),
    fileAssets,
    practiceTasks: db.prepare("SELECT id, title, work_id workId, work_title workTitle, segment, target_sections targetSections, deadline, required_count requiredCount, brief, status, created_by createdBy, created_at createdAt, updated_at updatedAt FROM practice_tasks ORDER BY created_at DESC").all().map(task => ({
      ...task,
      targetSections: parseJson(task.targetSections, [])
    })),
    practiceRecords: db.prepare("SELECT id, task_id taskId, member_id memberId, member_name memberName, section, audio_file_id audioFileId, duration, feelings, pitch, rhythm, breath, self_rating selfRating, need_help needHelp, status, feedback, tags, commented_by commentedBy, commented_at commentedAt, submitted_at submittedAt, ai_pitch_score aiPitchScore, ai_rhythm_score aiRhythmScore, ai_report_status aiReportStatus FROM practice_records ORDER BY submitted_at DESC").all().map(record => ({
      ...record,
      needHelp: Boolean(record.needHelp),
      tags: parseJson(record.tags, [])
    })),
    feedbackTemplates: [
      "音准整体稳定，下一次重点听入口。",
      "节奏已基本稳定，副歌第3句再放慢两遍。",
      "气息有点紧，先用半速跟伴奏练两次。",
      "咬字清楚很多，注意收尾不要抢拍。"
    ]
  };
}

function runMany(db, sql, rows, mapper) {
  const stmt = db.prepare(sql);
  rows.forEach(row => stmt.run(...mapper(row)));
}

function writeStore(store) {
  const db = applyMigrations();
  applyBaseSeed(db);
  db.exec("BEGIN");
  try {
    [
      "role_permissions",
      "notifications",
      "practice_records",
      "practice_tasks",
      "resources",
      "works",
      "leave_requests",
      "attendance",
      "events",
      "profile_change_requests",
      "members",
      "file_assets",
      "sections",
      "choir"
    ].forEach(table => db.exec(`DELETE FROM ${table}`));

    const choir = store.choir || {};
    db.prepare("INSERT INTO choir (id, name, subtitle, city, season, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))").run(
      choir.id || "choir-d-major",
      choir.name || "D大调合唱团",
      choir.subtitle || "",
      choir.city || "",
      choir.season || ""
    );

    runMany(db, "INSERT INTO role_permissions (role_id, permission_code) VALUES (?, ?)", store.rolePermissions || [], item => [
      item.roleId,
      item.permissionCode
    ]);

    runMany(db, "INSERT INTO sections (code, name, english_name, color, leader, sort_order) VALUES (?, ?, ?, ?, ?, ?)", store.sections || [], section => [
      section.code,
      section.name,
      section.englishName || "",
      section.color || "",
      section.leader || "",
      section.sortOrder || 0
    ]);

    runMany(db, "INSERT INTO file_assets (id, original_name, mime_type, size, path, storage_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", store.fileAssets || [], file => [
      file.id,
      file.originalName || "",
      file.mimeType || "application/octet-stream",
      file.size || 0,
      file.path,
      file.storageProvider || "local",
      file.createdAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO members (id, name, nickname, avatar_file_id, avatar_url, mobile, email, section, role, status, note, voice_range, attendance, managed_sections, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.members || [], member => [
      member.id,
      member.name,
      member.nickname || "",
      member.avatarFileId || null,
      member.avatarUrl || "",
      member.mobile || "",
      member.email || "",
      member.section || "",
      member.role || "普通成员",
      member.status || "正式",
      member.note || "",
      member.voiceRange || "",
      member.attendance || 0,
      JSON.stringify(member.managedSections || []),
      member.createdAt || new Date().toISOString(),
      member.updatedAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO profile_change_requests (id, member_id, field, old_value, new_value, status, note, reviewed_by, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.profileChangeRequests || [], request => [
      request.id,
      request.memberId,
      request.field,
      request.oldValue || "",
      request.newValue || "",
      request.status || "待审核",
      request.note || "",
      request.reviewedBy || "",
      request.reviewedAt || "",
      request.createdAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO events (id, title, type, time, location, agenda, response, need_attendance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.events || [], event => [
      event.id,
      event.title,
      event.type || "",
      event.time || "",
      event.location || "",
      event.agenda || "",
      event.response || "待反馈",
      bool(event.needAttendance !== false),
      event.createdAt || new Date().toISOString(),
      event.updatedAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO attendance (id, event_id, member_id, member_name, section, status, note, method, time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.attendance || [], record => [
      record.id,
      record.eventId,
      record.memberId,
      record.memberName || "",
      record.section || "",
      record.status || "",
      record.note || "",
      record.method || "",
      record.time || "",
      record.createdAt || new Date().toISOString(),
      record.updatedAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO leave_requests (id, event_id, member_id, reason, status, approver_id, approval_note, reviewed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.leaveRequests || [], request => [
      request.id,
      request.eventId,
      request.memberId,
      request.reason || "",
      request.status || "待审批",
      request.approverId || "",
      request.approvalNote || "",
      request.reviewedAt || "",
      request.createdAt || new Date().toISOString(),
      request.updatedAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO works (id, title, composer, arranger, status, difficulty, copyright, readiness, weak_spot, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.works || [], work => [
      work.id,
      work.title,
      work.composer || "",
      work.arranger || "",
      work.status || "",
      work.difficulty || "",
      work.copyright || "",
      work.readiness || 0,
      work.weakSpot || "",
      bool(work.favorite),
      work.createdAt || new Date().toISOString(),
      work.updatedAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO resources (id, work_id, title, type, section, version, visibility, file_id, storage_key, storage_provider, is_public, ai_ready, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.resources || [], resource => [
      resource.id,
      resource.workId,
      resource.title,
      resource.type,
      resource.section || "ALL",
      resource.version || "",
      resource.visibility || "",
      resource.fileId || null,
      resource.storageKey || "",
      resource.storageProvider || "local",
      bool(resource.isPublic),
      bool(resource.aiReady),
      resource.createdAt || new Date().toISOString(),
      resource.updatedAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO practice_tasks (id, title, work_id, work_title, segment, target_sections, deadline, required_count, brief, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.practiceTasks || [], task => [
      task.id,
      task.title,
      task.workId || "",
      task.workTitle || "",
      task.segment || "",
      JSON.stringify(task.targetSections || []),
      task.deadline || "",
      task.requiredCount || 1,
      task.brief || "",
      task.status || "",
      task.createdBy || "",
      task.createdAt || new Date().toISOString(),
      task.updatedAt || new Date().toISOString()
    ]);

    runMany(db, "INSERT INTO practice_records (id, task_id, member_id, member_name, section, audio_file_id, duration, feelings, pitch, rhythm, breath, self_rating, need_help, status, feedback, tags, commented_by, commented_at, submitted_at, ai_pitch_score, ai_rhythm_score, ai_report_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", store.practiceRecords || [], record => [
      record.id,
      record.taskId,
      record.memberId,
      record.memberName || "",
      record.section || "",
      record.audioFileId || null,
      record.duration || 0,
      record.feelings || "",
      record.pitch || "",
      record.rhythm || "",
      record.breath || "",
      record.selfRating || "",
      bool(record.needHelp),
      record.status || "",
      record.feedback || "",
      JSON.stringify(record.tags || []),
      record.commentedBy || "",
      record.commentedAt || "",
      record.submittedAt || new Date().toISOString(),
      record.aiPitchScore || null,
      record.aiRhythmScore || null,
      record.aiReportStatus || "not_started"
    ]);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  dbPath,
  openDatabase,
  applyMigrations,
  applyBaseSeed,
  readStore,
  writeStore
};
