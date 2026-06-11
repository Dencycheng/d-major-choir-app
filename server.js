/**
 * D Major Choir Hub · V2.1 服务端
 * 正式登录（后台密码 + 小程序微信）、会话、RBAC 权限隔离、邀请码与入团申请。
 * 零外部依赖：node:http + node:sqlite + node:crypto。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { applyMigrations, applyBaseSeed, readStore, writeStore, openDatabase } = require("./lib/sqlite-store");
const auth = require("./lib/auth");

const PORT = process.env.PORT || 4173;
const NODE_ENV = process.env.NODE_ENV || "development";
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || "https://admin.dmajorchoir.com";
const FILE_SIGNING_SECRET = process.env.FILE_SIGNING_SECRET || "local-dev-file-signing-secret";
const OBJECT_STORAGE_PRIVATE_BASE_URL = process.env.OBJECT_STORAGE_PRIVATE_BASE_URL || "https://private-storage.example.com/dmajor";
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

const root = __dirname;
const publicDir = path.join(root, "public");
const uploadsDir = path.resolve(UPLOAD_DIR);

fs.mkdirSync(uploadsDir, { recursive: true });
["resources", "recordings", "avatars"].forEach(folder => fs.mkdirSync(path.join(uploadsDir, folder), { recursive: true }));

applyMigrations();
applyBaseSeed();
const authDb = openDatabase();

const RESOURCE_TYPES = new Set(["总谱", "分声部谱", "歌词", "伴奏", "分声部音频", "视频谱", "排练视频"]);
const SECTION_CODES = new Set(["S", "A", "T", "B", "ALL"]);
const UPLOAD_MIME_ALLOW = /^(application\/pdf|image\/(png|jpe?g|webp|gif)|audio\/|video\/|text\/plain|application\/octet-stream)/i;

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function readDb() {
  const db = readStore();
  db.fileAssets ||= [];
  db.eventResponses ||= [];
  db.attendance ||= [];
  db.resources ||= [];
  db.works ||= [];
  db.practiceTasks ||= [];
  db.practiceRecords ||= [];
  db.members ||= [];
  db.sections ||= [];
  db.feedbackTemplates ||= [];
  db.leaveRequests ||= [];
  db.profileChangeRequests ||= [];
  db.roles ||= [];
  db.permissions ||= [];
  db.rolePermissions ||= [];
  return db;
}

function writeDb(db) {
  writeStore(db);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function text(res, status, payload, type = "text/plain") {
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  const allowed = new Set([
    ADMIN_ORIGIN,
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "null"
  ]);
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function collectBody(req, maxBytes = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(httpError("请求体过大", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function parseJson(req) {
  const buffer = await collectBody(req, 5 * 1024 * 1024);
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString("utf8"));
}

async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw httpError("缺少 multipart boundary");

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const body = await collectBody(req);
  const raw = body.toString("latin1");
  const parts = raw.split(`--${boundary}`);
  const fields = {};
  const files = {};

  for (const part of parts) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const clean = part.startsWith("\r\n") ? part.slice(2) : part;
    const splitAt = clean.indexOf("\r\n\r\n");
    if (splitAt === -1) continue;

    const headerRaw = clean.slice(0, splitAt);
    let contentRaw = clean.slice(splitAt + 4);
    if (contentRaw.endsWith("\r\n")) contentRaw = contentRaw.slice(0, -2);
    if (contentRaw.endsWith("--")) contentRaw = contentRaw.slice(0, -2);

    const nameMatch = headerRaw.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = headerRaw.match(/filename="([^"]*)"/i);
    const typeMatch = headerRaw.match(/Content-Type:\s*([^\r\n]+)/i);

    if (filenameMatch && filenameMatch[1]) {
      files[name] = {
        originalName: Buffer.from(filenameMatch[1], "latin1").toString("utf8"),
        mimeType: typeMatch ? typeMatch[1].trim() : "application/octet-stream",
        buffer: Buffer.from(contentRaw, "latin1")
      };
    } else {
      fields[name] = Buffer.from(contentRaw, "latin1").toString("utf8");
    }
  }

  return { fields, files };
}

function sanitizeFilename(name) {
  const ext = path.extname(name || "").toLowerCase();
  const base = path.basename(name || "upload", ext).replace(/[^\w\u4e00-\u9fa5.-]+/g, "-").slice(0, 60);
  return `${base || "upload"}-${Date.now()}${ext}`;
}

function saveUpload(file, folder, { maxBytes = 200 * 1024 * 1024 } = {}) {
  if (!file || !file.buffer?.length) return null;
  if (file.buffer.length > maxBytes) throw httpError("文件超过大小限制", 413);
  if (!UPLOAD_MIME_ALLOW.test(file.mimeType || "")) throw httpError(`不支持的文件类型：${file.mimeType}`, 415);
  const safeName = sanitizeFilename(file.originalName);
  const relativePath = path.join("uploads", folder, safeName);
  const absolutePath = path.join(uploadsDir, folder, safeName);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, file.buffer);
  return {
    id: makeId("file"),
    originalName: file.originalName || safeName,
    mimeType: file.mimeType || "application/octet-stream",
    size: file.buffer.length,
    path: relativePath,
    storageProvider: "local",
    createdAt: now()
  };
}

function fileAbsolutePath(asset) {
  const relative = String(asset.path || "").replace(/^uploads[\\/]/, "");
  const absolute = path.resolve(uploadsDir, relative);
  if (!absolute.startsWith(uploadsDir)) return null;
  return absolute;
}

/* ====================== 鉴权 ====================== */

const PUBLIC_ROUTES = new Set(["/api/health", "/api/auth/login", "/api/auth/wechat"]);

function extractToken(req, url) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  // 文件流（<audio>/<img> 标签无法带 Header）允许通过短期签名参数访问，见 /api/files
  return url.searchParams.get("token") || "";
}

function authenticate(req, url, store) {
  const token = extractToken(req, url);
  const resolved = auth.resolveSession(authDb, token);
  if (!resolved) return null;
  const ctx = auth.buildAuthContext(authDb, store, resolved.user);
  ctx.token = token;
  ctx.rawUser = resolved.user;
  return ctx;
}

function requireMember(ctx) {
  if (!ctx.member) throw httpError("当前账号尚未绑定成员档案，请先通过邀请码申请入团或联系管理员绑定", 403);
  return ctx.member;
}

function requirePermission(ctx, code) {
  if (!ctx.can(code)) throw httpError("没有执行该操作的权限", 403);
}

function isManager(ctx) {
  return ctx.isAdmin || ctx.can("member_manage") || ctx.can("dashboard_view");
}

function maskContact(value) {
  if (!value) return "";
  const str = String(value);
  if (str.includes("@")) {
    const [name, domain] = str.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return str.length >= 7 ? `${str.slice(0, 3)}****${str.slice(-2)}` : "***";
}

/* ====================== 视图组装 ====================== */

function memberWithAvatar(db, member) {
  const file = db.fileAssets.find(asset => asset.id === member.avatarFileId);
  return {
    ...member,
    avatarUrl: member.avatarUrl || (file ? `/api/files/${file.id}` : "")
  };
}

function maskedMember(db, member, ctx) {
  const view = memberWithAvatar(db, member);
  const self = ctx.member && ctx.member.id === member.id;
  if (self || isManager(ctx) || ctx.canManageSection(member.section)) return view;
  return { ...view, mobile: maskContact(view.mobile), email: maskContact(view.email), note: "" };
}

function workTitle(db, workId) {
  return db.works.find(work => work.id === workId)?.title || "未关联作品";
}

function fileUrlFor(ctx, fileId) {
  if (!fileId) return "";
  return `/api/files/${fileId}?token=${encodeURIComponent(ctx.token)}`;
}

function resourceWithFile(db, resource, ctx) {
  const file = db.fileAssets.find(asset => asset.id === resource.fileId);
  return {
    ...resource,
    file: file ? { id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size } : null,
    fileUrl: file ? fileUrlFor(ctx, file.id) : "",
    canPreview: Boolean(file)
  };
}

function recordWithFile(db, record, ctx) {
  const file = db.fileAssets.find(asset => asset.id === record.audioFileId);
  return {
    ...record,
    taskTitle: db.practiceTasks.find(task => task.id === record.taskId)?.title || "未知任务",
    file: file ? { id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size } : null,
    audioUrl: file ? fileUrlFor(ctx, file.id) : ""
  };
}

function taskProgress(db, task, member) {
  if (!member) return { submitted: 0, required: Number(task.requiredCount || 1), done: false };
  const submitted = db.practiceRecords.filter(record => record.taskId === task.id && record.memberId === member.id).length;
  return {
    submitted,
    required: Number(task.requiredCount || 1),
    done: submitted >= Number(task.requiredCount || 1)
  };
}

function visibleResources(db, ctx) {
  if (ctx.isAdmin || ctx.can("library_manage") || ctx.can("dashboard_view")) return db.resources;
  const section = ctx.member?.section;
  return db.resources.filter(resource => {
    const target = resource.section || "ALL";
    if (target === "ALL" || resource.isPublic) return true;
    if (section && target === section) return true;
    return ctx.canManageSection(target);
  });
}

function visibleRecords(db, ctx) {
  if (ctx.isAdmin || ctx.can("dashboard_view")) return db.practiceRecords;
  if (ctx.can("feedback_comment")) {
    return db.practiceRecords.filter(record =>
      (ctx.member && record.memberId === ctx.member.id) || ctx.canManageSection(record.section)
    );
  }
  return ctx.member ? db.practiceRecords.filter(record => record.memberId === ctx.member.id) : [];
}

function visibleLeaveRequests(db, ctx) {
  const canReviewAll = ctx.isAdmin || (ctx.can("leave_approve") && ctx.managedSections.length === 4);
  return db.leaveRequests
    .map(request => {
      const member = db.members.find(item => item.id === request.memberId);
      const section = member?.section || "";
      const mine = ctx.member && request.memberId === ctx.member.id;
      const reviewer = canReviewAll || (ctx.can("leave_approve") && ctx.canManageSection(section));
      if (!mine && !reviewer) return null;
      return {
        ...request,
        reason: mine || reviewer ? request.reason : "",
        memberName: member?.name || "未知成员",
        section,
        eventTitle: db.events.find(event => event.id === request.eventId)?.title || "未知活动",
        canReview: Boolean(reviewer && request.status === "待审批")
      };
    })
    .filter(Boolean);
}

function calcDashboard(db) {
  const formalMembers = db.members.filter(member => member.status === "正式");
  const pendingFeedback = db.practiceRecords.filter(record => !record.feedback).length;
  const completedRecords = db.practiceRecords.filter(record => record.feedback).length;
  const present = db.attendance.filter(record => ["已签到", "迟到"].includes(record.status)).length;
  const attendanceRate = Math.round((present / Math.max(db.attendance.length, 1)) * 100);
  const checkinRate = Math.round((db.practiceRecords.length / Math.max(formalMembers.length * Math.max(db.practiceTasks.length, 1), 1)) * 100);

  const sections = db.sections.map(section => {
    const members = formalMembers.filter(member => member.section === section.code);
    const records = db.practiceRecords.filter(record => record.section === section.code);
    const attendance = db.attendance.filter(record => members.some(member => member.id === record.memberId));
    const sectionPresent = attendance.filter(record => ["已签到", "迟到"].includes(record.status)).length;
    return {
      ...section,
      count: members.length,
      attendanceRate: Math.round((sectionPresent / Math.max(attendance.length, 1)) * 100),
      checkinRate: Math.round((records.length / Math.max(members.length * Math.max(db.practiceTasks.length, 1), 1)) * 100),
      feedbackRate: Math.round((records.filter(record => record.feedback).length / Math.max(records.length, 1)) * 100)
    };
  });

  return {
    headline: `${pendingFeedback} 条录音待点评，${db.works.length} 首作品，${db.practiceTasks.length} 个练习任务`,
    kpis: [
      { label: "作品数", value: db.works.length, note: "谱库真实数据" },
      { label: "资料数", value: db.resources.length, note: "PDF/音频/歌词" },
      { label: "待点评", value: pendingFeedback, note: `已点评 ${completedRecords} 条` },
      { label: "出勤率", value: `${attendanceRate}%`, note: `打卡率 ${checkinRate}%` }
    ],
    sections,
    works: db.works.map(work => ({
      title: work.title,
      status: work.status,
      readiness: work.readiness || 0,
      weakSpot: work.weakSpot || ""
    }))
  };
}

function attendanceStats(db, eventId) {
  const records = db.attendance.filter(record => record.eventId === eventId);
  return {
    total: db.members.filter(member => member.status === "正式").length,
    joined: records.filter(record => record.status === "参加").length,
    leave: records.filter(record => String(record.status).startsWith("请假")).length,
    leavePending: records.filter(record => record.status === "请假待审批").length,
    checkedIn: records.filter(record => record.status === "已签到").length,
    absent: records.filter(record => record.status === "缺勤").length
  };
}

function bootstrap(ctx, db) {
  const me = ctx.member ? memberWithAvatar(db, ctx.member) : null;
  const resources = visibleResources(db, ctx).map(resource => resourceWithFile(db, resource, ctx));
  const records = visibleRecords(db, ctx).map(record => recordWithFile(db, record, ctx));
  const tasks = db.practiceTasks
    .filter(task => {
      if (isManager(ctx) || ctx.can("task_publish") || ctx.can("feedback_comment")) return true;
      if (!me) return false;
      const target = Array.isArray(task.targetSections) ? task.targetSections : [];
      return !target.length || target.includes(me.section);
    })
    .map(task => ({
      ...task,
      workTitle: workTitle(db, task.workId),
      progress: taskProgress(db, task, me)
    }));
  const events = db.events.map(event => ({
    ...event,
    stats: attendanceStats(db, event.id),
    myAttendance: me ? db.attendance.find(record => record.eventId === event.id && record.memberId === me.id) || null : null
  }));

  const manager = isManager(ctx);

  return {
    choir: db.choir,
    auth: {
      user: ctx.user,
      isAdmin: ctx.isAdmin,
      permissions: ctx.permissions,
      managedSections: ctx.managedSections,
      mustChangePassword: ctx.user.mustChangePassword
    },
    currentMember: me,
    sections: db.sections,
    members: db.members.map(member => maskedMember(db, member, ctx)),
    roles: db.roles,
    permissions: db.permissions,
    rolePermissions: db.rolePermissions,
    profileChangeRequests: manager || ctx.can("profile_review")
      ? db.profileChangeRequests
      : db.profileChangeRequests.filter(request => me && request.memberId === me.id),
    leaveRequests: visibleLeaveRequests(db, ctx),
    works: db.works,
    resources,
    tasks,
    records,
    events,
    attendance: manager || ctx.can("attendance_manage")
      ? db.attendance
      : db.attendance.filter(record => me && record.memberId === me.id),
    dashboard: ctx.isAdmin || ctx.can("dashboard_view") ? calcDashboard(db) : null,
    resourceTypes: Array.from(RESOURCE_TYPES),
    feedbackTemplates: db.feedbackTemplates,
    invites: ctx.can("invite_manage") || ctx.isAdmin ? auth.listInvites(authDb) : [],
    joinRequests: ctx.can("invite_manage") || ctx.can("member_manage") || ctx.isAdmin
      ? auth.listJoinRequests(authDb)
      : []
  };
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!body[field]) throw httpError(`缺少字段：${field}`);
  }
}

function upsertAttendance(db, eventId, member, status, note = "", method = "成员操作") {
  let record = db.attendance.find(item => item.eventId === eventId && item.memberId === member.id);
  if (!record) {
    record = {
      id: makeId("att"),
      eventId,
      memberId: member.id,
      memberName: member.name,
      section: member.section,
      createdAt: now()
    };
    db.attendance.push(record);
  }
  record.status = status;
  record.note = note;
  record.method = method;
  record.time = status === "已签到" ? now() : record.time || "";
  record.updatedAt = now();
  return record;
}

function logOp(ctx, action, targetType, targetId, detail = "") {
  auth.logOperation(authDb, {
    actorId: ctx.user.id,
    actorName: ctx.member?.name || ctx.user.name || ctx.user.nickname || "管理员",
    action,
    targetType,
    targetId,
    detail
  });
}

/* ====================== 路由 ====================== */

async function routeApi(req, res, url) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = decodeURIComponent(url.pathname);

  /* ---- 公开接口 ---- */

  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, { status: "ok", env: NODE_ENV, version: "2.1.0", time: now() });
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await parseJson(req);
    requireFields(body, ["identifier", "password"]);
    const result = auth.loginWithPassword(authDb, {
      identifier: body.identifier,
      password: body.password,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || ""
    });
    return json(res, 200, {
      token: result.token,
      expiresAt: result.expiresAt,
      user: auth.publicUser(result.user)
    });
  }

  if (req.method === "POST" && pathname === "/api/auth/wechat") {
    const body = await parseJson(req);
    const result = await auth.loginWithWechat(authDb, {
      code: body.code,
      nickname: body.nickname || "",
      avatarUrl: body.avatarUrl || "",
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || ""
    });
    const store = readDb();
    const ctx = auth.buildAuthContext(authDb, store, result.user);
    return json(res, 200, {
      token: result.token,
      expiresAt: result.expiresAt,
      devMode: result.devMode,
      user: ctx.user,
      member: ctx.member,
      joinRequest: ctx.member ? null : auth.getJoinRequestByUser(authDb, result.user.id)
    });
  }

  /* ---- 登录态 ---- */

  const store = readDb();
  const ctx = authenticate(req, url, store);
  if (!ctx) {
    return json(res, 401, { error: "未登录或登录已过期，请重新登录", code: "UNAUTHORIZED" });
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    auth.revokeSession(authDb, ctx.token);
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/auth/change-password") {
    const body = await parseJson(req);
    requireFields(body, ["newPassword"]);
    if (ctx.rawUser.password_hash) {
      if (!body.oldPassword || !auth.verifyPassword(body.oldPassword, ctx.rawUser.password_hash)) {
        throw httpError("当前密码不正确", 401);
      }
    }
    auth.setPassword(authDb, ctx.user.id, body.newPassword, { mustChange: false });
    auth.revokeUserSessions(authDb, ctx.user.id);
    const session = auth.createSession(authDb, ctx.user.id, {
      client: "after-change-password",
      ip: clientIp(req),
      userAgent: req.headers["user-agent"] || ""
    });
    logOp(ctx, "修改密码", "user", ctx.user.id);
    return json(res, 200, { ok: true, token: session.token, expiresAt: session.expiresAt });
  }

  if (req.method === "GET" && pathname === "/api/me") {
    return json(res, 200, {
      user: ctx.user,
      member: ctx.member ? memberWithAvatar(store, ctx.member) : null,
      role: ctx.role,
      isAdmin: ctx.isAdmin,
      permissions: ctx.permissions,
      managedSections: ctx.managedSections,
      joinRequest: ctx.member ? null : auth.getJoinRequestByUser(authDb, ctx.user.id)
    });
  }

  /* ---- 强制首登改密（仅放行改密/登出/me） ---- */
  if (ctx.user.mustChangePassword) {
    throw httpError("首次登录请先修改初始密码", 428);
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    if (!ctx.member && !ctx.isAdmin) {
      return json(res, 403, { error: "尚未加入合唱团，请先通过邀请码申请入团", code: "NO_MEMBER" });
    }
    return json(res, 200, bootstrap(ctx, store));
  }

  if (req.method === "GET" && pathname === "/api/profile") {
    const member = requireMember(ctx);
    return json(res, 200, {
      member: memberWithAvatar(store, member),
      pendingRequests: store.profileChangeRequests.filter(request => request.memberId === member.id)
    });
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    if (!ctx.isAdmin && !ctx.can("dashboard_view")) throw httpError("没有查看数据看板的权限", 403);
    return json(res, 200, calcDashboard(store));
  }

  /* ---- 邀请码与入团 ---- */

  if (req.method === "GET" && pathname === "/api/invites") {
    if (!ctx.isAdmin && !ctx.can("invite_manage")) throw httpError("没有邀请管理权限", 403);
    return json(res, 200, { invites: auth.listInvites(authDb) });
  }

  if (req.method === "POST" && pathname === "/api/invites") {
    if (!ctx.isAdmin && !ctx.can("invite_manage")) throw httpError("没有邀请管理权限", 403);
    const body = await parseJson(req);
    const invite = auth.createInvite(authDb, {
      code: body.code,
      targetSection: body.targetSection || "",
      defaultRole: body.defaultRole || "普通成员",
      maxUses: body.maxUses,
      expiresAt: body.expiresAt || "",
      createdBy: ctx.user.id
    });
    logOp(ctx, "创建邀请码", "invite", invite.id, invite.code);
    return json(res, 201, { invite, invites: auth.listInvites(authDb) });
  }

  if (req.method === "POST" && /^\/api\/invites\/[^/]+\/disable$/.test(pathname)) {
    if (!ctx.isAdmin && !ctx.can("invite_manage")) throw httpError("没有邀请管理权限", 403);
    const id = pathname.split("/")[3];
    auth.disableInvite(authDb, id);
    logOp(ctx, "停用邀请码", "invite", id);
    return json(res, 200, { ok: true, invites: auth.listInvites(authDb) });
  }

  if (req.method === "POST" && pathname === "/api/join-requests") {
    if (ctx.member) throw httpError("你已经是合唱团成员，无需再次申请", 400);
    const body = await parseJson(req);
    requireFields(body, ["inviteCode", "name"]);
    const found = auth.findUsableInvite(authDb, body.inviteCode);
    if (found.error) throw httpError(found.error, 400);
    const request = auth.createJoinRequest(authDb, {
      userId: ctx.user.id,
      invite: found.invite,
      inviteCode: found.invite.code,
      name: String(body.name).trim(),
      mobile: body.mobile || "",
      sectionPreference: body.sectionPreference || found.invite.targetSection || "",
      voiceRange: body.voiceRange || "",
      experience: body.experience || ""
    });
    return json(res, 201, { request, message: "申请已提交，管理员审核通过后即可进入合唱团" });
  }

  if (req.method === "GET" && pathname === "/api/join-requests") {
    if (!ctx.isAdmin && !ctx.can("invite_manage") && !ctx.can("member_manage")) throw httpError("没有审核入团申请的权限", 403);
    return json(res, 200, { requests: auth.listJoinRequests(authDb, { status: url.searchParams.get("status") || undefined }) });
  }

  if (req.method === "POST" && /^\/api\/join-requests\/[^/]+\/review$/.test(pathname)) {
    if (!ctx.isAdmin && !ctx.can("invite_manage") && !ctx.can("member_manage")) throw httpError("没有审核入团申请的权限", 403);
    const id = pathname.split("/")[3];
    const body = await parseJson(req);
    const { request } = auth.reviewJoinRequest(authDb, id, {
      approved: Boolean(body.approved),
      reviewerId: ctx.user.id,
      note: body.note || ""
    });

    if (body.approved) {
      const section = body.section || request.sectionPreference || "A";
      if (!SECTION_CODES.has(section) || section === "ALL") throw httpError("请为新成员指定有效声部（S/A/T/B）");
      const member = {
        id: makeId("member"),
        userId: request.userId,
        name: request.name,
        nickname: request.name,
        avatarFileId: "",
        avatarUrl: "",
        mobile: request.mobile || "",
        email: "",
        section,
        role: body.role || "普通成员",
        status: body.memberStatus || "正式",
        note: request.experience ? `入团申请：${request.experience}` : "",
        voiceRange: request.voiceRange || "",
        attendance: 0,
        managedSections: [],
        createdAt: now(),
        updatedAt: now()
      };
      store.members.unshift(member);
      if (request.inviteId) auth.consumeInvite(authDb, request.inviteId);
      writeDb(store);
      logOp(ctx, "通过入团申请", "join_request", id, `${request.name} → ${section}`);
      return json(res, 200, { request, member, bootstrap: bootstrap(ctx, readDb()) });
    }

    logOp(ctx, "驳回入团申请", "join_request", id, body.note || "");
    return json(res, 200, { request, bootstrap: bootstrap(ctx, store) });
  }

  /* ---- 成员管理 ---- */

  if (req.method === "POST" && pathname === "/api/members") {
    requirePermission(ctx, "member_manage");
    const body = await parseJson(req);
    requireFields(body, ["name"]);
    const member = {
      id: makeId("member"),
      userId: body.userId || null,
      name: body.name.trim(),
      nickname: body.nickname || body.name.trim(),
      avatarFileId: "",
      avatarUrl: body.avatarUrl || "",
      mobile: body.mobile || "",
      email: body.email || "",
      section: body.section || "A",
      role: body.role || "普通成员",
      status: body.status || "正式",
      note: body.note || "",
      voiceRange: body.voiceRange || "",
      attendance: 0,
      managedSections: body.managedSections || [],
      createdAt: now(),
      updatedAt: now()
    };
    store.members.unshift(member);
    writeDb(store);
    logOp(ctx, "新增成员", "member", member.id, member.name);
    return json(res, 201, { member: memberWithAvatar(store, member), bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "PUT" && pathname.startsWith("/api/members/")) {
    requirePermission(ctx, "member_manage");
    const id = pathname.split("/").pop();
    const body = await parseJson(req);
    const member = store.members.find(item => item.id === id);
    if (!member) throw httpError("团员不存在", 404);
    Object.assign(member, {
      name: body.name ?? member.name,
      nickname: body.nickname ?? member.nickname,
      mobile: body.mobile ?? member.mobile,
      email: body.email ?? member.email,
      section: body.section ?? member.section,
      role: body.role ?? member.role,
      status: body.status ?? member.status,
      note: body.note ?? member.note,
      voiceRange: body.voiceRange ?? member.voiceRange,
      managedSections: body.managedSections ?? member.managedSections ?? [],
      userId: body.userId === undefined ? member.userId : (body.userId || null),
      updatedAt: now()
    });
    writeDb(store);
    logOp(ctx, "编辑成员", "member", member.id, member.name);
    return json(res, 200, { member: memberWithAvatar(store, member), bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/members/")) {
    requirePermission(ctx, "member_manage");
    const id = pathname.split("/").pop();
    const target = store.members.find(member => member.id === id);
    store.members = store.members.filter(member => member.id !== id);
    store.attendance = store.attendance.filter(record => record.memberId !== id);
    store.practiceRecords = store.practiceRecords.filter(record => record.memberId !== id);
    store.profileChangeRequests = store.profileChangeRequests.filter(record => record.memberId !== id);
    store.leaveRequests = store.leaveRequests.filter(record => record.memberId !== id);
    writeDb(store);
    logOp(ctx, "删除成员", "member", id, target?.name || "");
    return json(res, 200, { ok: true, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname.startsWith("/api/roles/") && pathname.endsWith("/permissions")) {
    if (!ctx.isAdmin && !ctx.can("role_manage")) throw httpError("只有超级管理员可以配置角色权限", 403);
    const roleId = pathname.split("/")[3];
    const body = await parseJson(req);
    const role = store.roles.find(item => item.id === roleId);
    if (!role) throw httpError("角色不存在", 404);
    store.rolePermissions = store.rolePermissions.filter(item => item.roleId !== roleId);
    (body.permissionCodes || []).forEach(permissionCode => {
      store.rolePermissions.push({ roleId, permissionCode });
    });
    writeDb(store);
    logOp(ctx, "配置角色权限", "role", roleId, (body.permissionCodes || []).join(","));
    return json(res, 200, { role, bootstrap: bootstrap(ctx, store) });
  }

  /* ---- 个人资料 ---- */

  if ((req.method === "POST" || req.method === "PUT") && pathname === "/api/profile") {
    const body = await parseJson(req);
    const member = requireMember(ctx);
    member.nickname = body.nickname ?? member.nickname;
    member.mobile = body.mobile ?? member.mobile;
    member.email = body.email ?? member.email;
    member.note = body.note ?? member.note;
    if (body.section && body.section !== member.section) {
      store.profileChangeRequests.unshift({
        id: makeId("profile"),
        memberId: member.id,
        field: "section",
        oldValue: member.section,
        newValue: body.section,
        status: "待审核",
        note: body.sectionNote || "成员申请调整声部",
        createdAt: now()
      });
    }
    member.updatedAt = now();
    writeDb(store);
    return json(res, 200, { member: memberWithAvatar(store, member), bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname === "/api/profile/avatar") {
    const { files } = await parseMultipart(req);
    const member = requireMember(ctx);
    const saved = saveUpload(files.avatar, "avatars", { maxBytes: 8 * 1024 * 1024 });
    if (!saved) throw httpError("请选择头像文件");
    store.fileAssets.push(saved);
    member.avatarFileId = saved.id;
    member.avatarUrl = `/api/files/${saved.id}`;
    member.updatedAt = now();
    writeDb(store);
    return json(res, 200, { member: memberWithAvatar(store, member), bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname === "/api/profile/requests/review") {
    if (!ctx.isAdmin && !ctx.can("profile_review") && !ctx.can("member_manage")) throw httpError("没有资料审核权限", 403);
    const body = await parseJson(req);
    requireFields(body, ["requestId"]);
    const request = store.profileChangeRequests.find(item => item.id === body.requestId);
    if (!request) throw httpError("申请不存在", 404);
    request.status = body.approved ? "已同意" : "未同意";
    request.note = body.note || request.note || "";
    request.reviewedBy = ctx.member?.name || ctx.user.name || "管理员";
    request.reviewedAt = now();
    if (body.approved && request.field === "section") {
      const member = store.members.find(item => item.id === request.memberId);
      if (member) {
        member.section = request.newValue;
        member.updatedAt = now();
      }
    }
    writeDb(store);
    logOp(ctx, body.approved ? "通过资料变更" : "驳回资料变更", "profile_change", request.id);
    return json(res, 200, { request, bootstrap: bootstrap(ctx, store) });
  }

  /* ---- 谱库 ---- */

  if (req.method === "POST" && pathname === "/api/works") {
    requirePermission(ctx, "library_manage");
    const body = await parseJson(req);
    requireFields(body, ["title"]);
    const work = {
      id: makeId("work"),
      title: body.title.trim(),
      composer: body.composer || "",
      arranger: body.arranger || "",
      status: body.status || "识谱中",
      difficulty: body.difficulty || "",
      copyright: body.copyright || "",
      readiness: Number(body.readiness || 0),
      weakSpot: body.weakSpot || "",
      favorite: false,
      createdAt: now(),
      updatedAt: now()
    };
    store.works.unshift(work);
    writeDb(store);
    return json(res, 201, { work, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "PUT" && pathname.startsWith("/api/works/")) {
    requirePermission(ctx, "library_manage");
    const id = pathname.split("/").pop();
    const body = await parseJson(req);
    const work = store.works.find(item => item.id === id);
    if (!work) throw httpError("作品不存在", 404);
    Object.assign(work, {
      title: body.title ?? work.title,
      composer: body.composer ?? work.composer,
      arranger: body.arranger ?? work.arranger,
      status: body.status ?? work.status,
      difficulty: body.difficulty ?? work.difficulty,
      copyright: body.copyright ?? work.copyright,
      readiness: body.readiness === undefined ? work.readiness : Number(body.readiness),
      weakSpot: body.weakSpot ?? work.weakSpot,
      updatedAt: now()
    });
    writeDb(store);
    return json(res, 200, { work, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/works/")) {
    requirePermission(ctx, "library_manage");
    const id = pathname.split("/").pop();
    store.works = store.works.filter(work => work.id !== id);
    store.resources = store.resources.filter(resource => resource.workId !== id);
    store.practiceTasks = store.practiceTasks.filter(task => task.workId !== id);
    writeDb(store);
    logOp(ctx, "删除作品", "work", id);
    return json(res, 200, { ok: true, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname === "/api/resources/upload") {
    requirePermission(ctx, "library_manage");
    const { fields, files } = await parseMultipart(req);
    requireFields(fields, ["workId", "type", "title"]);
    if (!RESOURCE_TYPES.has(fields.type)) throw httpError("资料类型不合法");
    if (fields.section && !SECTION_CODES.has(fields.section)) throw httpError("声部不合法");
    const work = store.works.find(item => item.id === fields.workId);
    if (!work) throw httpError("作品不存在", 404);
    const saved = saveUpload(files.file, "resources");
    if (!saved) throw httpError("请选择要上传的文件");
    store.fileAssets.push(saved);
    const resource = {
      id: makeId("res"),
      workId: fields.workId,
      title: fields.title.trim(),
      type: fields.type,
      section: fields.section || "ALL",
      version: fields.version || "v1",
      visibility: fields.section && fields.section !== "ALL" ? "本声部" : "全团可见",
      fileId: saved.id,
      storageKey: saved.path,
      storageProvider: "local",
      isPublic: false,
      createdAt: now(),
      updatedAt: now()
    };
    store.resources.unshift(resource);
    writeDb(store);
    logOp(ctx, "上传资料", "resource", resource.id, `${work.title} / ${resource.title}`);
    return json(res, 201, { resource: resourceWithFile(store, resource, ctx), bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/resources/")) {
    requirePermission(ctx, "library_manage");
    const id = pathname.split("/").pop();
    const resource = store.resources.find(item => item.id === id);
    store.resources = store.resources.filter(item => item.id !== id);
    writeDb(store);
    logOp(ctx, "删除资料", "resource", id, resource?.title || "");
    return json(res, 200, { ok: true, deleted: resource || null, bootstrap: bootstrap(ctx, store) });
  }

  /* ---- 练习任务 ---- */

  if (req.method === "POST" && pathname === "/api/tasks") {
    requirePermission(ctx, "task_publish");
    const body = await parseJson(req);
    requireFields(body, ["title", "workId", "deadline"]);
    let targetSections = Array.isArray(body.targetSections) && body.targetSections.length ? body.targetSections : ["S", "A", "T", "B"];
    if (!ctx.isAdmin && ctx.managedSections.length && ctx.managedSections.length < 4) {
      targetSections = targetSections.filter(section => ctx.canManageSection(section));
      if (!targetSections.length) throw httpError("只能向自己管理的声部发布任务", 403);
    }
    const task = {
      id: makeId("task"),
      title: body.title.trim(),
      workId: body.workId,
      workTitle: workTitle(store, body.workId),
      segment: body.segment || "",
      targetSections,
      deadline: body.deadline,
      requiredCount: Number(body.requiredCount || 1),
      brief: body.brief || "",
      status: "进行中",
      createdBy: ctx.member?.name || ctx.user.name || "管理员",
      createdAt: now(),
      updatedAt: now()
    };
    store.practiceTasks.unshift(task);
    writeDb(store);
    return json(res, 201, { task, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "PUT" && pathname.startsWith("/api/tasks/")) {
    requirePermission(ctx, "task_publish");
    const id = pathname.split("/").pop();
    const body = await parseJson(req);
    const task = store.practiceTasks.find(item => item.id === id);
    if (!task) throw httpError("任务不存在", 404);
    Object.assign(task, {
      title: body.title ?? task.title,
      workId: body.workId ?? task.workId,
      workTitle: workTitle(store, body.workId ?? task.workId),
      segment: body.segment ?? task.segment,
      targetSections: body.targetSections ?? task.targetSections,
      deadline: body.deadline ?? task.deadline,
      requiredCount: body.requiredCount === undefined ? task.requiredCount : Number(body.requiredCount),
      brief: body.brief ?? task.brief,
      status: body.status ?? task.status,
      updatedAt: now()
    });
    writeDb(store);
    return json(res, 200, { task, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/tasks/")) {
    requirePermission(ctx, "task_publish");
    const id = pathname.split("/").pop();
    store.practiceTasks = store.practiceTasks.filter(task => task.id !== id);
    store.practiceRecords = store.practiceRecords.filter(record => record.taskId !== id);
    writeDb(store);
    logOp(ctx, "删除任务", "task", id);
    return json(res, 200, { ok: true, bootstrap: bootstrap(ctx, store) });
  }

  /* ---- 打卡与点评 ---- */

  if (req.method === "POST" && pathname === "/api/practice/records") {
    const member = requireMember(ctx);
    const { fields, files } = await parseMultipart(req);
    requireFields(fields, ["taskId"]);
    const task = store.practiceTasks.find(item => item.id === fields.taskId);
    if (!task) throw httpError("任务不存在", 404);
    const saved = saveUpload(files.audio, "recordings");
    if (!saved) throw httpError("请上传录音文件");
    store.fileAssets.push(saved);
    const record = {
      id: makeId("rec"),
      taskId: fields.taskId,
      memberId: member.id,
      memberName: member.name,
      section: member.section,
      audioFileId: saved.id,
      duration: Number(fields.duration || 0),
      feelings: fields.feelings || "",
      pitch: fields.pitch || "",
      rhythm: fields.rhythm || "",
      breath: fields.breath || "",
      selfRating: `音准：${fields.pitch || "未填"}；节奏：${fields.rhythm || "未填"}；气息：${fields.breath || "未填"}`,
      needHelp: fields.needHelp === "on" || fields.needHelp === "true",
      status: "待点评",
      submittedAt: now(),
      feedback: ""
    };
    store.practiceRecords.unshift(record);
    writeDb(store);
    return json(res, 201, { record: recordWithFile(store, record, ctx), bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname === "/api/practice/submit") {
    const member = requireMember(ctx);
    const body = await parseJson(req);
    const task = store.practiceTasks.find(item => item.id === body.taskId);
    if (!task) throw httpError("任务不存在", 404);
    const record = {
      id: makeId("rec"),
      taskId: body.taskId,
      memberId: member.id,
      memberName: member.name,
      section: member.section,
      duration: body.duration || 0,
      feelings: body.feelings || "",
      pitch: body.pitch || "",
      rhythm: body.rhythm || "",
      breath: body.breath || "",
      selfRating: body.selfRating || "",
      needHelp: Boolean(body.needHelp),
      status: "待点评",
      submittedAt: now(),
      feedback: ""
    };
    store.practiceRecords.unshift(record);
    writeDb(store);
    return json(res, 201, { record: recordWithFile(store, record, ctx), bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname === "/api/feedback") {
    requirePermission(ctx, "feedback_comment");
    const body = await parseJson(req);
    requireFields(body, ["recordId", "feedback"]);
    const record = store.practiceRecords.find(item => item.id === body.recordId);
    if (!record) throw httpError("打卡记录不存在", 404);
    if (!ctx.isAdmin && !ctx.canManageSection(record.section)) {
      throw httpError("只能点评自己管理声部的打卡", 403);
    }
    record.feedback = body.feedback.trim();
    record.tags = String(body.tags || "")
      .split(/[，,\s]+/)
      .map(item => item.trim())
      .filter(Boolean);
    record.status = body.needFollowup ? "需复练" : "已点评";
    record.commentedBy = ctx.member?.name || ctx.user.name || "声部长/指挥";
    record.commentedAt = now();
    writeDb(store);
    logOp(ctx, "打卡点评", "practice_record", record.id, record.memberName);
    return json(res, 200, { record: recordWithFile(store, record, ctx), bootstrap: bootstrap(ctx, store) });
  }

  /* ---- 活动、请假、签到 ---- */

  if (req.method === "POST" && pathname === "/api/events") {
    requirePermission(ctx, "event_manage");
    const body = await parseJson(req);
    requireFields(body, ["title", "time"]);
    const event = {
      id: makeId("event"),
      title: body.title.trim(),
      type: body.type || "常规排练",
      time: body.time,
      location: body.location || "",
      agenda: body.agenda || "",
      response: "待反馈",
      needAttendance: body.needAttendance !== false,
      createdAt: now(),
      updatedAt: now()
    };
    store.events.unshift(event);
    writeDb(store);
    return json(res, 201, { event, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "PUT" && pathname.startsWith("/api/events/") && !pathname.endsWith("/checkin")) {
    requirePermission(ctx, "event_manage");
    const id = pathname.split("/").pop();
    const body = await parseJson(req);
    const event = store.events.find(item => item.id === id);
    if (!event) throw httpError("活动不存在", 404);
    Object.assign(event, {
      title: body.title ?? event.title,
      type: body.type ?? event.type,
      time: body.time ?? event.time,
      location: body.location ?? event.location,
      agenda: body.agenda ?? event.agenda,
      needAttendance: body.needAttendance ?? event.needAttendance,
      updatedAt: now()
    });
    writeDb(store);
    return json(res, 200, { event, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/events/")) {
    requirePermission(ctx, "event_manage");
    const id = pathname.split("/").pop();
    store.events = store.events.filter(event => event.id !== id);
    store.attendance = store.attendance.filter(record => record.eventId !== id);
    writeDb(store);
    logOp(ctx, "删除活动", "event", id);
    return json(res, 200, { ok: true, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname === "/api/events/respond") {
    const member = requireMember(ctx);
    const body = await parseJson(req);
    requireFields(body, ["eventId", "response"]);
    const event = store.events.find(item => item.id === body.eventId);
    if (!event) throw httpError("活动不存在", 404);
    let status = "参加";
    if (body.response === "请假") {
      status = "请假待审批";
      const existing = store.leaveRequests.find(item => item.eventId === event.id && item.memberId === member.id && item.status === "待审批");
      if (existing) {
        existing.reason = body.note || existing.reason || "";
        existing.updatedAt = now();
      } else {
        store.leaveRequests.unshift({
          id: makeId("leave"),
          eventId: event.id,
          memberId: member.id,
          reason: body.note || "成员提交请假",
          status: "待审批",
          approvalNote: "",
          createdAt: now(),
          updatedAt: now()
        });
      }
    }
    const record = upsertAttendance(store, event.id, member, status, body.note || "", "成员反馈");
    writeDb(store);
    return json(res, 200, { event, record, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname === "/api/leave/approve") {
    requirePermission(ctx, "leave_approve");
    const body = await parseJson(req);
    requireFields(body, ["requestId"]);
    const leave = store.leaveRequests.find(item => item.id === body.requestId);
    if (!leave) throw httpError("请假申请不存在", 404);
    const target = store.members.find(member => member.id === leave.memberId);
    if (!ctx.isAdmin && !ctx.canManageSection(target?.section || "")) {
      throw httpError("只能审批自己管理声部的请假", 403);
    }
    leave.status = body.approved ? "已同意" : "未同意";
    leave.approverId = ctx.user.id;
    leave.approvalNote = body.note || "";
    leave.reviewedAt = now();
    leave.updatedAt = now();
    const attendance = store.attendance.find(item => item.eventId === leave.eventId && item.memberId === leave.memberId);
    if (attendance) {
      attendance.status = body.approved ? "请假" : "请假未通过";
      attendance.note = body.note || attendance.note || "";
      attendance.updatedAt = now();
    }
    writeDb(store);
    logOp(ctx, body.approved ? "通过请假" : "驳回请假", "leave_request", leave.id, target?.name || "");
    return json(res, 200, { leave, bootstrap: bootstrap(ctx, store) });
  }

  if (req.method === "POST" && pathname === "/api/events/checkin") {
    const member = requireMember(ctx);
    const body = await parseJson(req);
    requireFields(body, ["eventId"]);
    const event = store.events.find(item => item.id === body.eventId);
    if (!event) throw httpError("活动不存在", 404);
    const record = upsertAttendance(store, event.id, member, "已签到", body.note || "", "点击签到");
    writeDb(store);
    return json(res, 200, { event, record, bootstrap: bootstrap(ctx, store) });
  }

  /* ---- 操作日志（管理） ---- */

  if (req.method === "GET" && pathname === "/api/operation-logs") {
    if (!ctx.isAdmin && !ctx.can("system_manage")) throw httpError("没有查看操作日志的权限", 403);
    const rows = authDb.prepare("SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 200").all();
    return json(res, 200, { logs: rows });
  }

  if (req.method === "GET" && pathname === "/api/login-logs") {
    if (!ctx.isAdmin && !ctx.can("system_manage")) throw httpError("没有查看登录日志的权限", 403);
    const rows = authDb.prepare("SELECT id, user_id, identifier, ip, success, reason, created_at FROM login_logs ORDER BY created_at DESC LIMIT 200").all();
    return json(res, 200, { logs: rows });
  }

  /* ---- 文件 ---- */

  if (req.method === "GET" && pathname.startsWith("/api/files/")) {
    if (pathname === "/api/files/sign") {
      const resourceId = url.searchParams.get("resourceId");
      const resource = store.resources.find(item => item.id === resourceId);
      if (!resource) throw httpError("资料不存在", 404);
      const allowed = visibleResources(store, ctx).some(item => item.id === resourceId);
      if (!allowed) throw httpError("当前资料暂未向本声部开放，如需查看请联系管理员", 403);
      const localFile = store.fileAssets.find(file => file.id === resource.fileId);
      if (localFile) {
        return json(res, 200, {
          resourceId,
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          url: fileUrlFor(ctx, localFile.id),
          provider: "local"
        });
      }
      const expiresAt = Math.floor(Date.now() / 1000) + 600;
      const storageKey = resource.storageKey || `resources/${resource.id}`;
      const signature = crypto
        .createHmac("sha256", FILE_SIGNING_SECRET)
        .update(`${storageKey}:${expiresAt}`)
        .digest("hex");
      return json(res, 200, {
        resourceId,
        expiresAt,
        url: `${OBJECT_STORAGE_PRIVATE_BASE_URL}/${encodeURIComponent(storageKey)}?expires=${expiresAt}&signature=${signature}`,
        provider: "cos-ready"
      });
    }

    const fileId = pathname.split("/").pop();
    const asset = store.fileAssets.find(file => file.id === fileId);
    if (!asset) throw httpError("文件不存在", 404);

    // 权限：资料文件按声部可见性校验；录音文件仅本人/点评者/管理员
    const resource = store.resources.find(item => item.fileId === fileId);
    if (resource) {
      const allowed = visibleResources(store, ctx).some(item => item.id === resource.id);
      if (!allowed) throw httpError("当前资料暂未向本声部开放", 403);
    }
    const record = store.practiceRecords.find(item => item.audioFileId === fileId);
    if (record) {
      const mine = ctx.member && record.memberId === ctx.member.id;
      const reviewer = ctx.isAdmin || ctx.can("dashboard_view") || (ctx.can("feedback_comment") && ctx.canManageSection(record.section));
      if (!mine && !reviewer) throw httpError("没有收听该录音的权限", 403);
    }

    const absolutePath = fileAbsolutePath(asset);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      // 兼容旧数据：文件可能仍在代码目录 uploads 下
      const legacy = path.join(root, asset.path);
      if (legacy.startsWith(path.join(root, "uploads")) && fs.existsSync(legacy)) {
        res.writeHead(200, {
          "Content-Type": asset.mimeType || "application/octet-stream",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
          "Cache-Control": "private, max-age=60"
        });
        fs.createReadStream(legacy).pipe(res);
        return;
      }
      throw httpError("文件不存在或已迁移", 404);
    }
    res.writeHead(200, {
      "Content-Type": asset.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
      "Cache-Control": "private, max-age=60"
    });
    fs.createReadStream(absolutePath).pipe(res);
    return;
  }

  return json(res, 404, { error: "接口不存在" });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return text(res, 403, "Forbidden");

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(publicDir, "index.html"), (fallbackError, fallbackData) => {
        if (fallbackError) return text(res, 404, "Not found");
        text(res, 200, fallbackData, "text/html");
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "text/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml"
    };
    res.writeHead(200, {
      "Content-Type": `${types[ext] || "application/octet-stream"}; charset=utf-8`,
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    routeApi(req, res, url).catch(error => {
      if (!error.statusCode || error.statusCode >= 500) console.error(error);
      json(res, error.statusCode || 500, { error: error.message || "服务器错误" });
    });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`D Major Choir Hub v2.1 running at http://${HOST}:${PORT} (env: ${NODE_ENV})`);
});
