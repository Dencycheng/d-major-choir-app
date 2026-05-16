const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || "127.0.0.1";
const NODE_ENV = process.env.NODE_ENV || "development";
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || "https://admin.dmajorchoir.com";
const FILE_SIGNING_SECRET = process.env.FILE_SIGNING_SECRET || "local-dev-file-signing-secret";
const OBJECT_STORAGE_PRIVATE_BASE_URL = process.env.OBJECT_STORAGE_PRIVATE_BASE_URL || "https://private-storage.example.com/dmajor";

const root = __dirname;
const publicDir = path.join(root, "public");
const dataPath = path.join(root, "data", "db.json");
const uploadsDir = path.join(root, "uploads");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(path.join(uploadsDir, "resources"), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, "recordings"), { recursive: true });

const RESOURCE_TYPES = new Set(["总谱", "分声部谱", "歌词", "伴奏", "示范音频"]);
const SECTION_CODES = new Set(["S", "A", "T", "B", "ALL"]);
const CURRENT_MEMBER_ID = "m-alto-01";

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function readDb() {
  const db = JSON.parse(fs.readFileSync(dataPath, "utf8"));
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
  return db;
}

function writeDb(db) {
  fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Member-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
}

function collectBody(req, maxBytes = 80 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("请求体过大"));
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
  if (!boundaryMatch) throw new Error("缺少 multipart boundary");

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

function saveUpload(file, folder) {
  if (!file || !file.buffer?.length) return null;
  const safeName = sanitizeFilename(file.originalName);
  const relativePath = path.join("uploads", folder, safeName);
  const absolutePath = path.join(root, relativePath);
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

function getCurrentMember(req, db) {
  const requestedId = req.headers["x-member-id"] || CURRENT_MEMBER_ID;
  return db.members.find(member => member.id === requestedId) || db.members.find(member => member.id === CURRENT_MEMBER_ID) || db.members[0];
}

function workTitle(db, workId) {
  return db.works.find(work => work.id === workId)?.title || "未关联作品";
}

function resourceWithFile(db, resource) {
  const file = db.fileAssets.find(asset => asset.id === resource.fileId);
  return {
    ...resource,
    file,
    fileUrl: file ? `/api/files/${file.id}` : "",
    canPreview: Boolean(file)
  };
}

function recordWithFile(db, record) {
  const file = db.fileAssets.find(asset => asset.id === record.audioFileId);
  return {
    ...record,
    taskTitle: db.practiceTasks.find(task => task.id === record.taskId)?.title || "未知任务",
    file,
    audioUrl: file ? `/api/files/${file.id}` : ""
  };
}

function taskProgress(db, task, member) {
  const submitted = db.practiceRecords.filter(record => record.taskId === task.id && record.memberId === member.id).length;
  return {
    submitted,
    required: Number(task.requiredCount || 1),
    done: submitted >= Number(task.requiredCount || 1)
  };
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
    leave: records.filter(record => record.status === "请假").length,
    checkedIn: records.filter(record => record.status === "已签到").length,
    absent: records.filter(record => record.status === "缺勤").length
  };
}

function bootstrap(req, db) {
  const currentMember = getCurrentMember(req, db);
  const resources = db.resources.map(resource => resourceWithFile(db, resource));
  const records = db.practiceRecords.map(record => recordWithFile(db, record));
  const tasks = db.practiceTasks.map(task => ({
    ...task,
    workTitle: workTitle(db, task.workId),
    progress: taskProgress(db, task, currentMember)
  }));
  const events = db.events.map(event => ({
    ...event,
    stats: attendanceStats(db, event.id),
    myAttendance: db.attendance.find(record => record.eventId === event.id && record.memberId === currentMember.id) || null
  }));

  return {
    choir: db.choir,
    currentMember,
    sections: db.sections,
    members: db.members,
    works: db.works,
    resources,
    tasks,
    records,
    events,
    attendance: db.attendance,
    dashboard: calcDashboard(db),
    resourceTypes: Array.from(RESOURCE_TYPES),
    feedbackTemplates: db.feedbackTemplates
  };
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!body[field]) {
      const error = new Error(`缺少字段：${field}`);
      error.statusCode = 400;
      throw error;
    }
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

async function routeApi(req, res, url) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const db = readDb();
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, { status: "ok", env: NODE_ENV, time: now() });
  }

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    return json(res, 200, bootstrap(req, db));
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    return json(res, 200, calcDashboard(db));
  }

  if (req.method === "POST" && pathname === "/api/works") {
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
    db.works.unshift(work);
    writeDb(db);
    return json(res, 201, { work, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "PUT" && pathname.startsWith("/api/works/")) {
    const id = pathname.split("/").pop();
    const body = await parseJson(req);
    const work = db.works.find(item => item.id === id);
    if (!work) return json(res, 404, { error: "作品不存在" });
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
    writeDb(db);
    return json(res, 200, { work, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/works/")) {
    const id = pathname.split("/").pop();
    db.works = db.works.filter(work => work.id !== id);
    db.resources = db.resources.filter(resource => resource.workId !== id);
    db.practiceTasks = db.practiceTasks.filter(task => task.workId !== id);
    writeDb(db);
    return json(res, 200, { ok: true, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "POST" && pathname === "/api/resources/upload") {
    const { fields, files } = await parseMultipart(req);
    requireFields(fields, ["workId", "type", "title"]);
    if (!RESOURCE_TYPES.has(fields.type)) return json(res, 400, { error: "资料类型不合法" });
    if (fields.section && !SECTION_CODES.has(fields.section)) return json(res, 400, { error: "声部不合法" });
    const work = db.works.find(item => item.id === fields.workId);
    if (!work) return json(res, 404, { error: "作品不存在" });
    const saved = saveUpload(files.file, "resources");
    if (!saved) return json(res, 400, { error: "请选择要上传的文件" });
    db.fileAssets.push(saved);
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
    db.resources.unshift(resource);
    writeDb(db);
    return json(res, 201, { resource: resourceWithFile(db, resource), bootstrap: bootstrap(req, db) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/resources/")) {
    const id = pathname.split("/").pop();
    const resource = db.resources.find(item => item.id === id);
    db.resources = db.resources.filter(item => item.id !== id);
    writeDb(db);
    return json(res, 200, { ok: true, deleted: resource || null, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "POST" && pathname === "/api/tasks") {
    const body = await parseJson(req);
    requireFields(body, ["title", "workId", "deadline"]);
    const task = {
      id: makeId("task"),
      title: body.title.trim(),
      workId: body.workId,
      workTitle: workTitle(db, body.workId),
      segment: body.segment || "",
      targetSections: Array.isArray(body.targetSections) && body.targetSections.length ? body.targetSections : ["S", "A", "T", "B"],
      deadline: body.deadline,
      requiredCount: Number(body.requiredCount || 1),
      brief: body.brief || "",
      status: "进行中",
      createdBy: body.createdBy || "管理员",
      createdAt: now(),
      updatedAt: now()
    };
    db.practiceTasks.unshift(task);
    writeDb(db);
    return json(res, 201, { task, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "PUT" && pathname.startsWith("/api/tasks/")) {
    const id = pathname.split("/").pop();
    const body = await parseJson(req);
    const task = db.practiceTasks.find(item => item.id === id);
    if (!task) return json(res, 404, { error: "任务不存在" });
    Object.assign(task, {
      title: body.title ?? task.title,
      workId: body.workId ?? task.workId,
      workTitle: workTitle(db, body.workId ?? task.workId),
      segment: body.segment ?? task.segment,
      targetSections: body.targetSections ?? task.targetSections,
      deadline: body.deadline ?? task.deadline,
      requiredCount: body.requiredCount === undefined ? task.requiredCount : Number(body.requiredCount),
      brief: body.brief ?? task.brief,
      status: body.status ?? task.status,
      updatedAt: now()
    });
    writeDb(db);
    return json(res, 200, { task, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/tasks/")) {
    const id = pathname.split("/").pop();
    db.practiceTasks = db.practiceTasks.filter(task => task.id !== id);
    db.practiceRecords = db.practiceRecords.filter(record => record.taskId !== id);
    writeDb(db);
    return json(res, 200, { ok: true, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "POST" && pathname === "/api/practice/records") {
    const { fields, files } = await parseMultipart(req);
    requireFields(fields, ["taskId"]);
    const task = db.practiceTasks.find(item => item.id === fields.taskId);
    if (!task) return json(res, 404, { error: "任务不存在" });
    const member = getCurrentMember(req, db);
    const saved = saveUpload(files.audio, "recordings");
    if (!saved) return json(res, 400, { error: "请上传录音文件" });
    db.fileAssets.push(saved);
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
    db.practiceRecords.unshift(record);
    writeDb(db);
    return json(res, 201, { record: recordWithFile(db, record), bootstrap: bootstrap(req, db) });
  }

  if (req.method === "POST" && pathname === "/api/practice/submit") {
    const body = await parseJson(req);
    const task = db.practiceTasks.find(item => item.id === body.taskId);
    if (!task) return json(res, 404, { error: "任务不存在" });
    const member = getCurrentMember(req, db);
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
    db.practiceRecords.unshift(record);
    writeDb(db);
    return json(res, 201, { record: recordWithFile(db, record), bootstrap: bootstrap(req, db) });
  }

  if (req.method === "POST" && pathname === "/api/feedback") {
    const body = await parseJson(req);
    requireFields(body, ["recordId", "feedback"]);
    const record = db.practiceRecords.find(item => item.id === body.recordId);
    if (!record) return json(res, 404, { error: "打卡记录不存在" });
    record.feedback = body.feedback.trim();
    record.tags = String(body.tags || "")
      .split(/[，,\s]+/)
      .map(item => item.trim())
      .filter(Boolean);
    record.status = body.needFollowup ? "需复练" : "已点评";
    record.commentedBy = body.commentedBy || "声部长/指挥";
    record.commentedAt = now();
    writeDb(db);
    return json(res, 200, { record: recordWithFile(db, record), bootstrap: bootstrap(req, db) });
  }

  if (req.method === "POST" && pathname === "/api/events") {
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
    db.events.unshift(event);
    writeDb(db);
    return json(res, 201, { event, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "PUT" && pathname.startsWith("/api/events/")) {
    const id = pathname.split("/").pop();
    const body = await parseJson(req);
    const event = db.events.find(item => item.id === id);
    if (!event) return json(res, 404, { error: "活动不存在" });
    Object.assign(event, {
      title: body.title ?? event.title,
      type: body.type ?? event.type,
      time: body.time ?? event.time,
      location: body.location ?? event.location,
      agenda: body.agenda ?? event.agenda,
      needAttendance: body.needAttendance ?? event.needAttendance,
      updatedAt: now()
    });
    writeDb(db);
    return json(res, 200, { event, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/events/")) {
    const id = pathname.split("/").pop();
    db.events = db.events.filter(event => event.id !== id);
    db.attendance = db.attendance.filter(record => record.eventId !== id);
    writeDb(db);
    return json(res, 200, { ok: true, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "POST" && pathname === "/api/events/respond") {
    const body = await parseJson(req);
    requireFields(body, ["eventId", "response"]);
    const event = db.events.find(item => item.id === body.eventId);
    if (!event) return json(res, 404, { error: "活动不存在" });
    const member = getCurrentMember(req, db);
    const status = body.response === "请假" ? "请假" : "参加";
    const record = upsertAttendance(db, event.id, member, status, body.note || "", "成员反馈");
    event.response = status;
    writeDb(db);
    return json(res, 200, { event, record, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "POST" && pathname === "/api/events/checkin") {
    const body = await parseJson(req);
    requireFields(body, ["eventId"]);
    const event = db.events.find(item => item.id === body.eventId);
    if (!event) return json(res, 404, { error: "活动不存在" });
    const member = getCurrentMember(req, db);
    const record = upsertAttendance(db, event.id, member, "已签到", body.note || "", "点击签到");
    event.response = "已签到";
    writeDb(db);
    return json(res, 200, { event, record, bootstrap: bootstrap(req, db) });
  }

  if (req.method === "GET" && pathname.startsWith("/api/files/")) {
    if (pathname === "/api/files/sign") {
      const resourceId = url.searchParams.get("resourceId");
      const resource = db.resources.find(item => item.id === resourceId);
      if (!resource) return json(res, 404, { error: "资料不存在" });
      const localFile = db.fileAssets.find(file => file.id === resource.fileId);
      if (localFile) {
        return json(res, 200, {
          resourceId,
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          url: `/api/files/${localFile.id}`,
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
    const asset = db.fileAssets.find(file => file.id === fileId);
    if (!asset) return json(res, 404, { error: "文件不存在" });
    const absolutePath = path.join(root, asset.path);
    if (!absolutePath.startsWith(uploadsDir) || !fs.existsSync(absolutePath)) {
      return json(res, 404, { error: "文件不存在或已迁移" });
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
      console.error(error);
      json(res, error.statusCode || 500, { error: error.message || "服务器错误" });
    });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`D Major Choir Hub running at http://${HOST}:${PORT}`);
});
