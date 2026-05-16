const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || "127.0.0.1";
const root = __dirname;
const publicDir = path.join(root, "public");
const dataPath = path.join(root, "data", "db.json");

function readDb() {
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(dataPath, JSON.stringify(db, null, 2));
}

function send(res, status, payload, type = "application/json") {
  const body = type === "application/json" ? JSON.stringify(payload) : payload;
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function calcDashboard(db) {
  const members = db.members.filter(member => member.status === "正式");
  const sections = db.sections.map(section => {
    const sectionMembers = members.filter(member => member.section === section.code);
    const records = db.practiceRecords.filter(record => record.section === section.code);
    const attendance = db.attendance.filter(record => sectionMembers.some(member => member.id === record.memberId));
    const present = attendance.filter(record => ["已签到", "迟到"].includes(record.status)).length;
    const risk = Math.max(8, Math.round(100 - (present / Math.max(attendance.length, 1)) * 70 - records.length * 3));
    return {
      ...section,
      count: sectionMembers.length,
      attendanceRate: Math.round((present / Math.max(attendance.length, 1)) * 100),
      checkinRate: Math.round((records.length / Math.max(sectionMembers.length * 2, 1)) * 100),
      feedbackRate: Math.round((records.filter(record => record.feedback).length / Math.max(records.length, 1)) * 100),
      risk
    };
  });

  const pendingFeedback = db.practiceRecords.filter(record => !record.feedback).length;
  const attendanceRate = Math.round(
    (db.attendance.filter(record => ["已签到", "迟到"].includes(record.status)).length / Math.max(db.attendance.length, 1)) * 100
  );
  const checkinRate = Math.round(
    (db.practiceRecords.length / Math.max(members.length * db.practiceTasks.length, 1)) * 100
  );

  return {
    headline: "Tenor 出勤偏低，Alto 第24小节待复练，12条录音待点评",
    kpis: [
      { label: "本月出勤率", value: `${attendanceRate}%`, note: "较上月 +4%" },
      { label: "本周打卡率", value: `${checkinRate}%`, note: "S 声部最高" },
      { label: "待点评录音", value: pendingFeedback, note: "建议今晚前完成" },
      { label: "四声部均衡", value: sections.map(s => `${s.code} ${s.count}`).join(" · "), note: "Tenor 可招新" }
    ],
    sections,
    works: db.works.map(work => ({
      title: work.title,
      status: work.status,
      readiness: work.readiness,
      weakSpot: work.weakSpot
    })),
    todos: [
      { item: "今晚排练签到码", scope: "全团", owner: "团务", action: "提前30分钟生成" },
      { item: "第24小节复练", scope: "A/T", owner: "声部长", action: "发布短任务" },
      { item: "12条待点评录音", scope: "S/A/T/B", owner: "指挥/声部长", action: "使用快捷评语" },
      { item: "谱库《月光》v3", scope: "全团", owner: "资料管理员", action: "确认旧版归档" }
    ]
  };
}

function withIds(items) {
  return items.map(item => ({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...item }));
}

function routeApi(req, res, url) {
  return (async () => {
    const db = readDb();

    if (req.method === "GET" && url.pathname === "/api/bootstrap") {
      return send(res, 200, {
        choir: db.choir,
        currentMember: db.members.find(member => member.id === "m-alto-01"),
        sections: db.sections,
        dashboard: calcDashboard(db),
        events: db.events,
        tasks: db.practiceTasks,
        works: db.works,
        resources: db.resources,
        records: db.practiceRecords,
        feedbackTemplates: db.feedbackTemplates,
        members: db.members
      });
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      return send(res, 200, calcDashboard(db));
    }

    if (req.method === "POST" && url.pathname === "/api/events/respond") {
      const body = await parseBody(req);
      const event = db.events.find(item => item.id === body.eventId);
      if (!event) return send(res, 404, { error: "活动不存在" });
      event.response = body.response;
      event.responseNote = body.note || "";
      writeDb(db);
      return send(res, 200, { event });
    }

    if (req.method === "POST" && url.pathname === "/api/events/checkin") {
      const body = await parseBody(req);
      const event = db.events.find(item => item.id === body.eventId);
      if (!event) return send(res, 404, { error: "活动不存在" });
      const record = db.attendance.find(item => item.eventId === body.eventId && item.memberId === "m-alto-01");
      if (record) {
        record.status = "已签到";
        record.time = new Date().toISOString();
        record.method = "二维码";
      } else {
        db.attendance.push({ id: crypto.randomUUID(), eventId: body.eventId, memberId: "m-alto-01", status: "已签到", method: "二维码", time: new Date().toISOString() });
      }
      event.response = "已签到";
      writeDb(db);
      return send(res, 200, { event, dashboard: calcDashboard(db) });
    }

    if (req.method === "POST" && url.pathname === "/api/practice/submit") {
      const body = await parseBody(req);
      const task = db.practiceTasks.find(item => item.id === body.taskId);
      if (!task) return send(res, 404, { error: "任务不存在" });
      const record = {
        id: crypto.randomUUID(),
        taskId: body.taskId,
        memberId: "m-alto-01",
        memberName: "林安",
        section: "A",
        duration: body.duration || 156,
        selfRating: body.selfRating,
        needHelp: Boolean(body.needHelp),
        status: "待点评",
        submittedAt: new Date().toISOString(),
        feedback: ""
      };
      db.practiceRecords.unshift(record);
      writeDb(db);
      return send(res, 201, { record, dashboard: calcDashboard(db) });
    }

    if (req.method === "POST" && url.pathname === "/api/feedback") {
      const body = await parseBody(req);
      const record = db.practiceRecords.find(item => item.id === body.recordId);
      if (!record) return send(res, 404, { error: "录音不存在" });
      record.feedback = body.feedback;
      record.tags = body.tags || [];
      record.status = body.needFollowup ? "需复练" : "已点评";
      record.commentedBy = "陈声部长";
      record.commentedAt = new Date().toISOString();
      writeDb(db);
      return send(res, 200, { record, dashboard: calcDashboard(db) });
    }

    if (req.method === "POST" && url.pathname === "/api/library/favorite") {
      const body = await parseBody(req);
      const work = db.works.find(item => item.id === body.workId);
      if (!work) return send(res, 404, { error: "作品不存在" });
      work.favorite = !work.favorite;
      writeDb(db);
      return send(res, 200, { work });
    }

    if (req.method === "POST" && url.pathname === "/api/tasks") {
      const body = await parseBody(req);
      const task = {
        id: crypto.randomUUID(),
        title: body.title,
        workId: body.workId,
        workTitle: db.works.find(work => work.id === body.workId)?.title || "未关联作品",
        segment: body.segment,
        targetSections: body.targetSections || ["S", "A", "T", "B"],
        deadline: body.deadline,
        requiredCount: Number(body.requiredCount || 1),
        brief: body.brief,
        status: "进行中"
      };
      db.practiceTasks.unshift(task);
      writeDb(db);
      return send(res, 201, { task, dashboard: calcDashboard(db) });
    }

    return send(res, 404, { error: "接口不存在" });
  })().catch(error => {
    send(res, 500, { error: error.message });
  });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return send(res, 403, "Forbidden", "text/plain");

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(publicDir, "index.html"), (fallbackError, fallbackData) => {
        if (fallbackError) return send(res, 404, "Not found", "text/plain");
        send(res, 200, fallbackData, "text/html");
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
    send(res, 200, data, types[ext] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) return routeApi(req, res, url);
  return serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
  console.log(`D Major Choir Hub running at http://${HOST}:${PORT}`);
});
