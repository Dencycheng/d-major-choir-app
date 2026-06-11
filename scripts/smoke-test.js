/**
 * D大调合唱团 V2.1 冒烟测试
 * 覆盖：登录体系（密码/微信/改密/锁定相关 401）、邀请码→入团→审核、
 * 权限隔离（401/403）、活动响应/签到、谱库上传、打卡与点评全链路。
 *
 * 用法：
 *   1) npm run migrate
 *   2) ADMIN_EMAIL=admin@dmajorchoir.com ADMIN_PASSWORD=Admin#2026 npm run create-admin
 *   3) 启动服务：PORT=4173 node server.js
 *   4) ADMIN_EMAIL=admin@dmajorchoir.com ADMIN_PASSWORD=Admin#2026 node scripts/smoke-test.js
 */
const assert = require("assert");

const API = process.env.API_BASE_URL || "http://127.0.0.1:4173";
const ADMIN_ID = process.env.ADMIN_EMAIL || process.env.ADMIN_MOBILE || "admin@dmajorchoir.com";
const ADMIN_PW = process.env.ADMIN_PASSWORD || "Admin#2026";
const NEW_PW = process.env.SMOKE_NEW_PASSWORD || "Smoke#Pass2026";

let step = 0;
function log(name) {
  step += 1;
  console.log(`  ${String(step).padStart(2, "0")}. ${name}`);
}

async function call(path, { method = "GET", token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  console.log(`\nD大调合唱团 V2.1 冒烟测试 → ${API}\n`);

  /* ---------- 健康检查与未登录拦截 ---------- */
  log("健康检查 /api/health");
  let r = await call("/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "ok");

  log("未携带 token 访问业务接口应 401");
  r = await call("/api/bootstrap");
  assert.equal(r.status, 401);

  /* ---------- 管理员登录与首登改密 ---------- */
  log("错误密码登录应 401");
  r = await call("/api/auth/login", { method: "POST", body: { identifier: ADMIN_ID, password: "wrong-password" } });
  assert.equal(r.status, 401);

  log("管理员正确密码登录");
  r = await call("/api/auth/login", { method: "POST", body: { identifier: ADMIN_ID, password: ADMIN_PW } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let adminToken = r.data.token;
  const mustChange = r.data.user.mustChangePassword;

  if (mustChange) {
    log("首登未改密访问业务接口应 428");
    r = await call("/api/bootstrap", { token: adminToken });
    assert.equal(r.status, 428);

    log("修改初始密码");
    r = await call("/api/auth/change-password", {
      method: "POST", token: adminToken,
      body: { oldPassword: ADMIN_PW, newPassword: NEW_PW }
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    adminToken = r.data.token;

    log("旧 token 已撤销（改密后旧会话失效在新 token 发放前撤销，此处校验新 token 可用）");
    r = await call("/api/me", { token: adminToken });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.mustChangePassword, false);
  } else {
    log("管理员已完成首登改密（跳过 428 校验）");
  }

  log("管理员 bootstrap");
  r = await call("/api/bootstrap", { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(r.data.choir.name, "D大调合唱团");
  assert.ok(r.data.sections.length >= 4);

  log("管理员数据看板");
  r = await call("/api/dashboard", { token: adminToken });
  assert.equal(r.status, 200);

  /* ---------- 邀请码 → 微信入团 → 审核 ---------- */
  log("创建邀请码（目标声部 A）");
  r = await call("/api/invites", {
    method: "POST", token: adminToken,
    body: { targetSection: "A", maxUses: 5 }
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const invite = r.data.invite;
  assert.ok(invite.code);

  log("微信登录（开发模式模拟 openid）");
  const wxCode = `smoke-${Date.now()}`;
  r = await call("/api/auth/wechat", { method: "POST", body: { code: wxCode, nickname: "冒烟新人" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const memberTokenBefore = r.data.token;
  assert.equal(r.data.member, null);

  log("新用户访问 bootstrap 应被拒（未绑定成员）");
  r = await call("/api/bootstrap", { token: memberTokenBefore });
  assert.ok([400, 403].includes(r.status), `expect 400/403 got ${r.status}`);

  log("错误邀请码提交申请应 400");
  r = await call("/api/join-requests", {
    method: "POST", token: memberTokenBefore,
    body: { inviteCode: "DMJ-INVALID", name: "冒烟新人" }
  });
  assert.equal(r.status, 400);

  log("有效邀请码提交入团申请");
  r = await call("/api/join-requests", {
    method: "POST", token: memberTokenBefore,
    body: { inviteCode: invite.code, name: "冒烟新人", mobile: "13800001234", sectionPreference: "A", voiceRange: "F3-E5", experience: "校合唱团两年" }
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const joinId = r.data.request.id;

  log("普通用户不能查看入团申请列表（403）");
  r = await call("/api/join-requests", { token: memberTokenBefore });
  assert.equal(r.status, 403);

  log("管理员审核通过入团申请");
  r = await call(`/api/join-requests/${joinId}/review`, {
    method: "POST", token: adminToken,
    body: { approved: true, section: "A", note: "欢迎加入" }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  log("新成员重新拉取 /api/me 已绑定成员");
  r = await call("/api/me", { token: memberTokenBefore });
  assert.equal(r.status, 200);
  assert.ok(r.data.member && r.data.member.id, "member should be bound");
  const memberToken = memberTokenBefore;
  const newMemberId = r.data.member.id;

  log("新成员 bootstrap 可用");
  r = await call("/api/bootstrap", { token: memberToken });
  assert.equal(r.status, 200);
  const memberBoot = r.data;

  /* ---------- 权限隔离 ---------- */
  log("普通成员访问数据看板应 403");
  r = await call("/api/dashboard", { token: memberToken });
  assert.equal(r.status, 403);

  log("普通成员创建邀请码应 403");
  r = await call("/api/invites", { method: "POST", token: memberToken, body: {} });
  assert.equal(r.status, 403);

  log("普通成员发布任务应 403");
  r = await call("/api/tasks", {
    method: "POST", token: memberToken,
    body: { title: "越权任务", requirement: "x", targetSections: ["A"] }
  });
  assert.equal(r.status, 403);

  log("普通成员查询操作日志应 403");
  r = await call("/api/operation-logs", { token: memberToken });
  assert.equal(r.status, 403);

  /* ---------- 谱库与任务（管理员） ---------- */
  log("管理员创建作品");
  r = await call("/api/works", {
    method: "POST", token: adminToken,
    body: { title: `冒烟测试曲目 ${Date.now()}`, composer: "Smoke", status: "识谱中", copyright: "测试" }
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const workId = r.data.work.id;

  log("管理员上传谱库资料（PDF）");
  const form = new FormData();
  form.append("workId", workId);
  form.append("title", "冒烟测试总谱");
  form.append("type", "总谱");
  form.append("section", "ALL");
  form.append("version", "v1");
  form.append("file", new Blob(["%PDF-1.4\n% smoke\n"], { type: "application/pdf" }), "smoke-score.pdf");
  r = await call("/api/resources/upload", { method: "POST", token: adminToken, form });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  // 服务端返回的 fileUrl 已内嵌当前用户 token，这里剥离 query 验证裸路径鉴权
  const fileUrlBare = r.data.resource.fileUrl.split("?")[0];

  log("未登录拉取文件流应 401");
  r = await call(fileUrlBare);
  assert.equal(r.status, 401);

  log("成员携带 ?token= 拉取文件流");
  r = await fetch(`${API}${fileUrlBare}?token=${encodeURIComponent(memberToken)}`);
  assert.equal(r.status, 200);

  log("管理员发布练习任务（A 声部）");
  r = await call("/api/tasks", {
    method: "POST", token: adminToken,
    body: { title: "冒烟打卡任务", workId, segment: "第24小节", brief: "录一段第24小节", targetSections: ["A"], deadline: "2099-12-31 23:59" }
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const taskId = r.data.task.id;

  /* ---------- 活动：响应 + 签到 ---------- */
  const event = memberBoot.events && memberBoot.events[0];
  if (event) {
    log("新成员报名参加活动");
    r = await call("/api/events/respond", {
      method: "POST", token: memberToken,
      body: { eventId: event.id, response: "attend" }
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));

    log("新成员活动签到");
    r = await call("/api/events/checkin", { method: "POST", token: memberToken, body: { eventId: event.id } });
    assert.ok([200, 201].includes(r.status), JSON.stringify(r.data));
  } else {
    log("无种子活动，跳过活动响应/签到");
  }

  /* ---------- 打卡 → 点评 ---------- */
  log("新成员提交录音打卡");
  const recForm = new FormData();
  recForm.append("taskId", taskId);
  recForm.append("feelings", "副歌还有点不稳");
  recForm.append("pitch", "3");
  recForm.append("rhythm", "4");
  recForm.append("breath", "3");
  recForm.append("audio", new Blob([Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00])], { type: "audio/mpeg" }), "smoke.mp3");
  r = await call("/api/practice/records", { method: "POST", token: memberToken, form: recForm });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const recordId = r.data.record.id;

  log("管理员点评录音");
  r = await call("/api/feedback", {
    method: "POST", token: adminToken,
    body: { recordId, feedback: "节奏已基本稳定，副歌第3句再放慢2遍。", tags: "节奏", needFollowup: false }
  });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.data));

  /* ---------- 登出与会话撤销 ---------- */
  log("成员登出");
  r = await call("/api/auth/logout", { method: "POST", token: memberToken });
  assert.equal(r.status, 200);

  log("登出后 token 不可再用（401）");
  r = await call("/api/me", { token: memberToken });
  assert.equal(r.status, 401);

  log("管理员查看操作日志/登录日志");
  r = await call("/api/operation-logs", { token: adminToken });
  assert.equal(r.status, 200);
  r = await call("/api/login-logs", { token: adminToken });
  assert.equal(r.status, 200);

  console.log(`\n✅ 冒烟测试全部通过（${step} 步）。新成员ID: ${newMemberId}\n`);
}

main().catch(error => {
  console.error(`\n❌ 冒烟测试失败于第 ${step} 步：`, error.message);
  process.exit(1);
});
