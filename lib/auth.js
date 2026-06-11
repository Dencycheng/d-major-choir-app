/**
 * V2.1 正式账号体系核心库（零外部依赖）
 * - 密码哈希：node:crypto scrypt（加盐、内存困难型 KDF，与 bcrypt/argon2 同级，禁止明文）
 * - 会话：随机 256-bit 不透明 token，库内只存 SHA-256 哈希，可撤销（登出即失效）
 * - 登录保护：10 分钟内失败 5 次锁定，写 login_logs
 * - 微信登录：wx.login code → jscode2session → openid 绑定 user
 * - RBAC：users.is_admin 为超级管理员；其余按 members.role → roles → role_permissions 解析
 */
const crypto = require("crypto");
const https = require("https");
const { openDatabase } = require("./sqlite-store");

const TOKEN_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24 * 14);
const LOCK_WINDOW_MINUTES = 10;
const LOCK_THRESHOLD = 5;
const TOKEN_PEPPER = process.env.JWT_SECRET || "dev-only-token-pepper";

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/* ---------- 密码 ---------- */

function hashPassword(password) {
  if (!password || String(password).length < 8) {
    const error = new Error("密码长度至少 8 位");
    error.statusCode = 400;
    throw error;
  }
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(String(password), salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p)
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/* ---------- 用户 ---------- */

function getUserById(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
}

function getUserByIdentifier(db, identifier) {
  if (!identifier) return null;
  const value = String(identifier).trim().toLowerCase();
  return db.prepare("SELECT * FROM users WHERE lower(email) = ? OR mobile = ?").get(value, String(identifier).trim()) || null;
}

function getUserByOpenid(db, openid) {
  if (!openid) return null;
  return db.prepare("SELECT * FROM users WHERE wechat_openid = ?").get(openid) || null;
}

function createUser(db, fields) {
  const user = {
    id: makeId("user"),
    name: fields.name || "",
    nickname: fields.nickname || fields.name || "",
    avatar_url: fields.avatarUrl || "",
    mobile: fields.mobile || null,
    email: fields.email ? String(fields.email).trim().toLowerCase() : null,
    password_hash: fields.passwordHash || null,
    wechat_openid: fields.wechatOpenid || null,
    is_admin: fields.isAdmin ? 1 : 0,
    must_change_password: fields.mustChangePassword ? 1 : 0,
    status: fields.status || "active"
  };
  db.prepare(`INSERT INTO users (id, name, nickname, avatar_url, mobile, email, password_hash, wechat_openid, is_admin, must_change_password, status, failed_attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
    .run(user.id, user.name, user.nickname, user.avatar_url, user.mobile, user.email, user.password_hash,
      user.wechat_openid, user.is_admin, user.must_change_password, user.status, now(), now());
  return getUserById(db, user.id);
}

function setPassword(db, userId, password, { mustChange = false } = {}) {
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?")
    .run(hashPassword(password), mustChange ? 1 : 0, now(), userId);
}

/* ---------- 登录锁定与日志 ---------- */

function isLocked(user) {
  return Boolean(user.locked_until && new Date(user.locked_until) > new Date());
}

function registerFailure(db, user) {
  const attempts = (user.failed_attempts || 0) + 1;
  let lockedUntil = null;
  if (attempts >= LOCK_THRESHOLD) {
    lockedUntil = new Date(Date.now() + LOCK_WINDOW_MINUTES * 60 * 1000).toISOString();
  }
  db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?")
    .run(attempts >= LOCK_THRESHOLD ? 0 : attempts, lockedUntil, now(), user.id);
  return lockedUntil;
}

function clearFailures(db, user) {
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?")
    .run(now(), now(), user.id);
}

function recordLogin(db, { userId = null, identifier = "", ip = "", userAgent = "", success = false, reason = "" }) {
  db.prepare("INSERT INTO login_logs (id, user_id, identifier, ip, user_agent, success, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(makeId("login"), userId, identifier, ip, String(userAgent).slice(0, 300), success ? 1 : 0, reason, now());
}

/* ---------- 会话 ---------- */

function hashToken(token) {
  return crypto.createHmac("sha256", TOKEN_PEPPER).update(token).digest("hex");
}

function createSession(db, userId, { client = "web", ip = "", userAgent = "" } = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600 * 1000).toISOString();
  db.prepare("INSERT INTO auth_sessions (id, user_id, token_hash, client, ip, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(makeId("sess"), userId, hashToken(token), client, ip, String(userAgent).slice(0, 300), expiresAt, now());
  return { token, expiresAt };
}

function resolveSession(db, token) {
  if (!token) return null;
  const session = db.prepare("SELECT * FROM auth_sessions WHERE token_hash = ?").get(hashToken(token));
  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at) <= new Date()) return null;
  const user = getUserById(db, session.user_id);
  if (!user || user.status !== "active") return null;
  return { session, user };
}

function revokeSession(db, token) {
  db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?").run(now(), hashToken(token));
}

function revokeUserSessions(db, userId) {
  db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now(), userId);
}

/* ---------- 后台密码登录 ---------- */

function loginWithPassword(db, { identifier, password, ip, userAgent }) {
  const fail = (reason, statusCode = 401) => {
    recordLogin(db, { identifier, ip, userAgent, success: false, reason });
    const error = new Error(reason);
    error.statusCode = statusCode;
    return error;
  };

  const user = getUserByIdentifier(db, identifier);
  if (!user || !user.password_hash) throw fail("账号或密码不正确");
  if (user.status !== "active") throw fail("账号已停用，请联系超级管理员", 403);
  if (isLocked(user)) throw fail("尝试次数过多，账号已临时锁定，请 10 分钟后再试", 423);

  if (!verifyPassword(password, user.password_hash)) {
    const lockedUntil = registerFailure(db, user);
    recordLogin(db, { userId: user.id, identifier, ip, userAgent, success: false, reason: lockedUntil ? "密码错误，触发锁定" : "密码错误" });
    const error = new Error(lockedUntil ? "失败次数过多，账号已临时锁定 10 分钟" : "账号或密码不正确");
    error.statusCode = lockedUntil ? 423 : 401;
    throw error;
  }

  clearFailures(db, user);
  recordLogin(db, { userId: user.id, identifier, ip, userAgent, success: true, reason: "密码登录" });
  const session = createSession(db, user.id, { client: "admin-web", ip, userAgent });
  return { user: getUserById(db, user.id), ...session };
}

/* ---------- 微信登录 ---------- */

function wechatCodeToSession(code) {
  const appId = process.env.WECHAT_APP_ID || process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_APP_SECRET || process.env.WECHAT_SECRET;

  if (!appId || !secret || /CHANGE_ME/i.test(`${appId}${secret}`)) {
    if (process.env.NODE_ENV === "production") {
      const error = new Error("服务器未配置微信小程序密钥（WECHAT_APP_ID / WECHAT_APP_SECRET）");
      error.statusCode = 500;
      return Promise.reject(error);
    }
    // 开发模式：用 code 派生稳定的模拟 openid，便于本地/开发者工具联调
    return Promise.resolve({ openid: `dev-${crypto.createHash("sha256").update(String(code)).digest("hex").slice(0, 24)}`, devMode: true });
  }

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      let data = "";
      response.on("data", chunk => (data += chunk));
      response.on("end", () => {
        try {
          const payload = JSON.parse(data);
          if (payload.errcode) {
            const error = new Error(`微信登录失败：${payload.errmsg || payload.errcode}`);
            error.statusCode = 401;
            reject(error);
            return;
          }
          resolve({ openid: payload.openid, sessionKey: payload.session_key, unionid: payload.unionid });
        } catch {
          reject(new Error("微信登录响应解析失败"));
        }
      });
    }).on("error", () => reject(new Error("无法连接微信服务器")));
  });
}

async function loginWithWechat(db, { code, nickname = "", avatarUrl = "", ip = "", userAgent = "" }) {
  if (!code) {
    const error = new Error("缺少微信登录 code");
    error.statusCode = 400;
    throw error;
  }
  const { openid, devMode } = await wechatCodeToSession(code);
  let user = getUserByOpenid(db, openid);
  if (!user) {
    user = createUser(db, { wechatOpenid: openid, nickname, avatarUrl });
  } else if ((nickname && nickname !== user.nickname) || (avatarUrl && avatarUrl !== user.avatar_url)) {
    db.prepare("UPDATE users SET nickname = COALESCE(NULLIF(?, ''), nickname), avatar_url = COALESCE(NULLIF(?, ''), avatar_url), updated_at = ? WHERE id = ?")
      .run(nickname, avatarUrl, now(), user.id);
    user = getUserById(db, user.id);
  }
  recordLogin(db, { userId: user.id, identifier: `wechat:${openid.slice(0, 10)}…`, ip, userAgent, success: true, reason: devMode ? "微信登录（开发模式）" : "微信登录" });
  const session = createSession(db, user.id, { client: "miniprogram", ip, userAgent });
  return { user, ...session, devMode: Boolean(devMode) };
}

/* ---------- 邀请码与入团申请 ---------- */

function normalizeInvite(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    targetSection: row.target_section || "",
    defaultRole: row.default_role || "普通成员",
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at || "",
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listInvites(db) {
  return db.prepare("SELECT * FROM invite_codes ORDER BY created_at DESC").all().map(normalizeInvite);
}

function createInvite(db, { code, targetSection = "", defaultRole = "普通成员", maxUses = 0, expiresAt = "", createdBy = "" }) {
  const finalCode = (code || `DMJ${new Date().getFullYear()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`).trim().toUpperCase();
  db.prepare("INSERT INTO invite_codes (id, code, status, target_section, default_role, max_uses, used_count, expires_at, created_by, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?, 0, ?, ?, ?, ?)")
    .run(makeId("invite"), finalCode, targetSection, defaultRole, Number(maxUses) || 0, expiresAt || null, createdBy, now(), now());
  return normalizeInvite(db.prepare("SELECT * FROM invite_codes WHERE code = ?").get(finalCode));
}

function disableInvite(db, id) {
  db.prepare("UPDATE invite_codes SET status = 'disabled', updated_at = ? WHERE id = ?").run(now(), id);
}

function findUsableInvite(db, code) {
  if (!code) return { error: "请输入邀请码" };
  const row = db.prepare("SELECT * FROM invite_codes WHERE upper(code) = ?").get(String(code).trim().toUpperCase());
  if (!row) return { error: "邀请码不存在，请向管理员确认" };
  if (row.status !== "active") return { error: "邀请码已失效" };
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return { error: "邀请码已过期" };
  if (row.max_uses > 0 && row.used_count >= row.max_uses) return { error: "邀请码使用次数已用完" };
  return { invite: normalizeInvite(row), row };
}

function consumeInvite(db, id) {
  db.prepare("UPDATE invite_codes SET used_count = used_count + 1, updated_at = ? WHERE id = ?").run(now(), id);
}

function normalizeJoinRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    inviteId: row.invite_id || "",
    inviteCode: row.invite_code || "",
    name: row.name,
    mobile: row.mobile || "",
    sectionPreference: row.section_preference || "",
    voiceRange: row.voice_range || "",
    experience: row.experience || "",
    status: row.status,
    reviewerId: row.reviewer_id || "",
    reviewNote: row.review_note || "",
    reviewedAt: row.reviewed_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listJoinRequests(db, { status } = {}) {
  const rows = status
    ? db.prepare("SELECT * FROM join_requests WHERE status = ? ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT * FROM join_requests ORDER BY created_at DESC").all();
  return rows.map(normalizeJoinRequest);
}

function getJoinRequestByUser(db, userId) {
  return normalizeJoinRequest(db.prepare("SELECT * FROM join_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(userId));
}

function createJoinRequest(db, { userId, invite, inviteCode, name, mobile = "", sectionPreference = "", voiceRange = "", experience = "" }) {
  const existing = db.prepare("SELECT * FROM join_requests WHERE user_id = ? AND status = '待审核'").get(userId);
  if (existing) {
    db.prepare("UPDATE join_requests SET name = ?, mobile = ?, section_preference = ?, voice_range = ?, experience = ?, updated_at = ? WHERE id = ?")
      .run(name, mobile, sectionPreference, voiceRange, experience, now(), existing.id);
    return normalizeJoinRequest(db.prepare("SELECT * FROM join_requests WHERE id = ?").get(existing.id));
  }
  const id = makeId("join");
  db.prepare("INSERT INTO join_requests (id, user_id, invite_id, invite_code, name, mobile, section_preference, voice_range, experience, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '待审核', ?, ?)")
    .run(id, userId, invite ? invite.id : null, inviteCode || "", name, mobile, sectionPreference, voiceRange, experience, now(), now());
  return normalizeJoinRequest(db.prepare("SELECT * FROM join_requests WHERE id = ?").get(id));
}

function reviewJoinRequest(db, id, { approved, reviewerId, note = "", section = "", role = "" }) {
  const row = db.prepare("SELECT * FROM join_requests WHERE id = ?").get(id);
  if (!row) {
    const error = new Error("入团申请不存在");
    error.statusCode = 404;
    throw error;
  }
  db.prepare("UPDATE join_requests SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
    .run(approved ? "已通过" : "已驳回", reviewerId || "", note, now(), now(), id);
  return { request: normalizeJoinRequest(db.prepare("SELECT * FROM join_requests WHERE id = ?").get(id)), section, role };
}

/* ---------- 操作日志 ---------- */

function logOperation(db, { actorId = "", actorName = "", action, targetType = "", targetId = "", detail = "" }) {
  db.prepare("INSERT INTO operation_logs (id, actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(makeId("op"), actorId, actorName, action, targetType, targetId, typeof detail === "string" ? detail : JSON.stringify(detail), now());
}

/* ---------- 鉴权上下文（user → member → role → permissions） ---------- */

const SECTION_LEADER_ROLES = new Set(["声部长", "声部首席"]);
const MANAGER_ROLES = new Set(["团长", "指挥", "钢琴伴奏", "管理员"]);

function buildAuthContext(db, store, user) {
  const member = store.members.find(item => item.userId === user.id) || null;
  let permissions = new Set();
  let role = null;
  let managedSections = [];

  if (user.is_admin) {
    store.permissions.forEach(permission => permissions.add(permission.code));
    managedSections = ["S", "A", "T", "B"];
  } else if (member) {
    role = store.roles.find(item => item.name === member.role) || null;
    if (role) {
      store.rolePermissions
        .filter(item => item.roleId === role.id)
        .forEach(item => permissions.add(item.permissionCode));
      managedSections = Array.isArray(role.managedSections) && role.managedSections.length
        ? role.managedSections
        : [];
    }
    if (SECTION_LEADER_ROLES.has(member.role)) {
      const declared = Array.isArray(member.managedSections) ? member.managedSections.filter(Boolean) : [];
      managedSections = declared.length ? declared : [member.section].filter(Boolean);
    } else if (MANAGER_ROLES.has(member.role)) {
      managedSections = ["S", "A", "T", "B"];
    }
  }

  return {
    user: publicUser(user),
    member,
    role,
    isAdmin: Boolean(user.is_admin),
    permissions: Array.from(permissions),
    managedSections,
    can(code) {
      return Boolean(user.is_admin) || permissions.has(code);
    },
    canManageSection(sectionCode) {
      if (user.is_admin) return true;
      return managedSections.includes(sectionCode);
    }
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name || "",
    nickname: user.nickname || "",
    avatarUrl: user.avatar_url || "",
    mobile: user.mobile || "",
    email: user.email || "",
    isAdmin: Boolean(user.is_admin),
    mustChangePassword: Boolean(user.must_change_password),
    hasWechat: Boolean(user.wechat_openid),
    status: user.status,
    lastLoginAt: user.last_login_at || ""
  };
}

module.exports = {
  openAuthDb: openDatabase,
  makeId,
  hashPassword,
  verifyPassword,
  getUserById,
  getUserByIdentifier,
  getUserByOpenid,
  createUser,
  setPassword,
  recordLogin,
  createSession,
  resolveSession,
  revokeSession,
  revokeUserSessions,
  loginWithPassword,
  loginWithWechat,
  listInvites,
  createInvite,
  disableInvite,
  findUsableInvite,
  consumeInvite,
  listJoinRequests,
  getJoinRequestByUser,
  createJoinRequest,
  reviewJoinRequest,
  logOperation,
  buildAuthContext,
  publicUser
};
