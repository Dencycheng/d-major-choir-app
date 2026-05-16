const app = document.querySelector("#app");

const state = {
  view: "admin",
  adminTab: "dashboard",
  data: null
};

const api = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error("请求失败");
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("提交失败");
    return res.json();
  }
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sectionLabel(code) {
  const section = state.data.sections.find(item => item.code === code);
  return section ? `${section.code} ${section.name}` : code;
}

function heatColor(value) {
  if (value >= 80) return "var(--success)";
  if (value >= 60) return "var(--warning)";
  return "var(--error)";
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

async function refresh() {
  state.data = await api.get("/api/bootstrap");
  render();
}

function topbar() {
  const { choir } = state.data;
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">𝄞</div>
        <div>
          <p class="brand-title">${choir.name}</p>
          <div class="brand-subtitle">${choir.subtitle} · ${choir.season}</div>
        </div>
      </div>
      <div class="view-switch" role="tablist" aria-label="视图切换">
        <button class="${state.view === "admin" ? "active" : ""}" data-view="admin">后台管理</button>
        <button class="${state.view === "mobile" ? "active" : ""}" data-view="mobile">成员端预览</button>
      </div>
    </header>
  `;
}

function hero() {
  return `
    <section class="status-strip">
      <div class="hero-panel">
        <div>
          <h1>D大调合唱团 UI 设计语言</h1>
          <p>专业克制、有音乐感、对成员温柔、对管理高效。今天重点关注：${state.data.dashboard.headline}。</p>
        </div>
        <div class="clef">𝄞</div>
      </div>
      <div class="today-card">
        <h2>今日排练空间</h2>
        <p class="muted">从“谁没完成”转为“哪里需要帮助”，让排练前的准备更清楚。</p>
        <div class="pill-row">
          <span class="pill gold">今晚 19:30</span>
          <span class="pill">珠江新城排练室</span>
          <span class="pill success">A 女低已登录</span>
        </div>
      </div>
    </section>
  `;
}

function adminShell() {
  const tabs = [
    ["dashboard", "数据看板"],
    ["members", "成员与声部"],
    ["events", "排练活动"],
    ["tasks", "练习任务"],
    ["library", "谱库资料"],
    ["feedback", "点评反馈"]
  ];
  return `
    ${hero()}
    <div class="layout">
      <aside class="side">
        <div class="side-logo">D Major Choir</div>
        <small>黑金银 · 暖白 · 数字排练空间</small>
        <nav class="nav">
          ${tabs.map(([id, label]) => `<button class="${state.adminTab === id ? "active" : ""}" data-tab="${id}">${label}<span>›</span></button>`).join("")}
        </nav>
      </aside>
      <main class="main-grid">
        ${adminDashboard()}
        ${membersPanel()}
        ${eventsPanel()}
        ${tasksPanel()}
        ${libraryPanel()}
        ${feedbackPanel()}
      </main>
    </div>
  `;
}

function adminDashboard() {
  const { dashboard } = state.data;
  return `
    <section class="admin-panel ${state.adminTab === "dashboard" ? "active" : ""}">
      <div class="section-title">
        <div>
          <h2>管理后台数据看板</h2>
          <p>${dashboard.headline}</p>
        </div>
      </div>
      <div class="kpi-grid">
        ${dashboard.kpis.map(kpi => `
          <article class="card">
            <div class="kpi-label">${kpi.label}</div>
            <div class="kpi-value">${kpi.value}</div>
            <div class="kpi-note">${kpi.note}</div>
          </article>
        `).join("")}
      </div>
      <div class="two-col">
        <article class="card">
          <div class="section-title"><h2>四声部准备度热力图</h2></div>
          <div class="heatmap">
            <div></div><div class="head">出勤</div><div class="head">打卡</div><div class="head">点评</div><div class="head">风险</div>
            ${dashboard.sections.map(section => `
              <div class="section-name">${section.name} ${section.code}</div>
              <div class="heat-cell" style="background:${heatColor(section.attendanceRate)}">${section.attendanceRate}%</div>
              <div class="heat-cell" style="background:${heatColor(section.checkinRate)}">${section.checkinRate}%</div>
              <div class="heat-cell" style="background:${heatColor(section.feedbackRate)}">${section.feedbackRate}%</div>
              <div class="heat-cell" style="background:${heatColor(100 - section.risk)}">${section.risk}%</div>
            `).join("")}
          </div>
        </article>
        <article class="card">
          <div class="section-title"><h2>作品准备度</h2></div>
          <div class="bar-list">
            ${dashboard.works.map(work => `
              <div class="bar-item">
                <strong>${work.title}</strong>
                <div class="bar-track"><div class="bar-fill" style="width:${work.readiness}%"></div></div>
                <strong>${work.readiness}%</strong>
              </div>
            `).join("")}
          </div>
        </article>
      </div>
      <article class="card">
        <div class="section-title"><h2>待处理清单</h2></div>
        <table class="table">
          <thead><tr><th>事项</th><th>声部</th><th>负责人</th><th>建议动作</th></tr></thead>
          <tbody>
            ${dashboard.todos.map(todo => `<tr><td>${todo.item}</td><td>${todo.scope}</td><td>${todo.owner}</td><td>${todo.action}</td></tr>`).join("")}
          </tbody>
        </table>
      </article>
    </section>
  `;
}

function membersPanel() {
  const rows = state.data.members.map(member => `
    <tr>
      <td><strong>${member.name}</strong><div class="muted">${member.voiceRange}</div></td>
      <td><span class="pill ${member.section === "A" ? "info" : ""}">${sectionLabel(member.section)}</span></td>
      <td>${member.role}</td>
      <td>${member.status}</td>
      <td>${member.attendance}%</td>
    </tr>
  `).join("");
  return `
    <section class="admin-panel ${state.adminTab === "members" ? "active" : ""}">
      <div class="section-title">
        <div><h2>成员与声部</h2><p>默认 SATB，保留未定声部和自定义扩展。</p></div>
        <button class="gold-button" data-action="invite">生成邀请码</button>
      </div>
      <article class="card">
        <table class="table">
          <thead><tr><th>成员</th><th>声部</th><th>角色</th><th>状态</th><th>出勤</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </article>
    </section>
  `;
}

function eventsPanel() {
  return `
    <section class="admin-panel ${state.adminTab === "events" ? "active" : ""}">
      <div class="section-title">
        <div><h2>排练活动与考勤</h2><p>发布活动、反馈参加、扫码签到、考勤统计形成团务闭环。</p></div>
      </div>
      <div class="stack">
        ${state.data.events.map(event => `
          <article class="card">
            <div class="section-title">
              <div>
                <h2>${event.title}</h2>
                <p>${event.type} · ${event.time} · ${event.location}</p>
              </div>
              <span class="pill gold">${event.response}</span>
            </div>
            <p>${event.agenda}</p>
            <div class="actions">
              <button class="gold-button" data-checkin="${event.id}">生成并模拟签到</button>
              <button class="ghost-button" data-respond="${event.id}" data-response="参加">反馈参加</button>
              <button class="ghost-button" data-respond="${event.id}" data-response="请假">提交请假</button>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function tasksPanel() {
  return `
    <section class="admin-panel ${state.adminTab === "tasks" ? "active" : ""}">
      <div class="section-title">
        <div><h2>练习任务</h2><p>按作品、段落、声部、截止时间发布，可复制上周任务。</p></div>
      </div>
      <div class="two-col">
        <article class="card">
          <h2>发布短复练任务</h2>
          <form class="form-grid" id="taskForm">
            <div class="field"><label>任务标题</label><input name="title" value="第24小节入口复练" /></div>
            <div class="field"><label>关联作品</label><select name="workId">${state.data.works.map(work => `<option value="${work.id}">${work.title}</option>`).join("")}</select></div>
            <div class="field"><label>段落 / 小节</label><input name="segment" value="第24小节" /></div>
            <div class="field"><label>目标声部</label><select name="target"><option value="A">A 女低</option><option value="T">T 男高</option><option value="ALL">全团</option></select></div>
            <div class="field"><label>截止时间</label><input name="deadline" value="2026-05-16 22:00" /></div>
            <div class="field"><label>说明</label><textarea name="brief">请半速听示范两遍，再录制一次入口和后两小节。</textarea></div>
            <button class="gold-button" type="submit">发布任务</button>
          </form>
        </article>
        <article class="card">
          <h2>任务列表</h2>
          <div class="stack">
            ${state.data.tasks.map(task => `
              <div class="list-card">
                <div>
                  <strong>${task.title}</strong>
                  <div class="muted">${task.workTitle} · ${task.segment} · ${task.targetSections.map(sectionLabel).join(" / ")}</div>
                </div>
                <span class="pill">${task.requiredCount}次</span>
              </div>
            `).join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function libraryPanel() {
  return `
    <section class="admin-panel ${state.adminTab === "library" ? "active" : ""}">
      <div class="section-title">
        <div><h2>谱库资料</h2><p>作品、总谱、声部谱、示范音频、伴奏、权限与版本统一管理。</p></div>
      </div>
      <div class="two-col">
        <article class="card">
          <h2>作品生命周期</h2>
          <div class="bar-list">
            ${state.data.works.map(work => `
              <div class="list-card">
                <div>
                  <strong>${work.title}</strong>
                  <div class="muted">${work.composer} · ${work.weakSpot}</div>
                </div>
                <button class="ghost-button" data-favorite="${work.id}">${work.favorite ? "已收藏" : "收藏"}</button>
              </div>
            `).join("")}
          </div>
        </article>
        <article class="card">
          <h2>资料文件</h2>
          <table class="table">
            <thead><tr><th>资料</th><th>类型</th><th>声部</th><th>版本</th><th>权限</th></tr></thead>
            <tbody>
              ${state.data.resources.map(resource => `<tr><td>${resource.title}</td><td>${resource.type}</td><td>${resource.section}</td><td>${resource.version}</td><td>${resource.visibility}</td></tr>`).join("")}
            </tbody>
          </table>
        </article>
      </div>
    </section>
  `;
}

function feedbackPanel() {
  const pending = state.data.records.filter(record => !record.feedback);
  return `
    <section class="admin-panel ${state.adminTab === "feedback" ? "active" : ""}">
      <div class="section-title">
        <div><h2>点评反馈</h2><p>先说做得好的地方，再给下一次只改一个重点。</p></div>
      </div>
      <div class="two-col">
        <article class="card">
          <h2>待点评录音</h2>
          <div class="stack">
            ${pending.map(record => `
              <div class="list-card">
                <div>
                  <strong>${record.memberName} · ${sectionLabel(record.section)}</strong>
                  <div class="muted">${Math.floor(record.duration / 60)}:${String(record.duration % 60).padStart(2, "0")} · ${record.selfRating}</div>
                </div>
                <button class="gold-button" data-comment="${record.id}">快捷点评</button>
              </div>
            `).join("") || "<p class='muted'>暂无待点评录音。</p>"}
          </div>
        </article>
        <article class="card">
          <h2>快捷评语模板</h2>
          <div class="stack">${state.data.feedbackTemplates.map(template => `<div class="list-card"><span>${template}</span></div>`).join("")}</div>
        </article>
      </div>
    </section>
  `;
}

function mobileView() {
  const member = state.data.currentMember;
  const altoTasks = state.data.tasks.filter(task => task.targetSections.includes(member.section) || task.targetSections.includes("ALL"));
  return `
    ${hero()}
    <main class="layout" style="display:block">
      <div class="section-title">
        <div><h2>小程序 / App 关键界面方向</h2><p>成员端围绕“本周要做什么”，App 后续可承载更强音频练习与离线谱库。</p></div>
      </div>
      <section class="mobile-wrap">
        ${phoneHome(member)}
        ${phoneTask(altoTasks[0])}
        ${phoneRecord(altoTasks[0])}
        ${phoneLibrary()}
      </section>
    </main>
  `;
}

function phoneHome(member) {
  const event = state.data.events[0];
  const latestFeedback = state.data.records.find(record => record.feedback);
  return `
    <article class="phone">
      <div class="phone-notch"></div>
      <h2>今日首页</h2>
      <div class="phone-sub">${state.data.choir.name} · ${sectionLabel(member.section)}</div>
      <div class="black-card">
        <strong>今晚排练</strong>
        <p class="muted">${event.time.slice(11)} · ${event.location}</p>
        <button class="gold-button" data-checkin="${event.id}">签到</button>
      </div>
      <div class="phone-section">
        <h3>本周待办</h3>
        <div class="stack">
          <div class="list-card"><strong>识谱打卡</strong><span class="pill gold">1/2</span></div>
          <div class="list-card"><strong>请假审批</strong><span class="pill success">已通过</span></div>
          <div class="list-card"><strong>最新点评</strong><span class="pill">${latestFeedback ? "1条" : "暂无"}</span></div>
        </div>
      </div>
      <div class="phone-section">
        <h3>我的声部</h3>
        <span class="pill info">${sectionLabel(member.section)}</span>
      </div>
    </article>
  `;
}

function phoneTask(task) {
  const resources = state.data.resources.filter(resource => resource.workId === task.workId);
  return `
    <article class="phone">
      <div class="phone-notch"></div>
      <h2>练习任务</h2>
      <div class="phone-sub">${task.workTitle} · ${sectionLabel(task.targetSections[0])}</div>
      <div class="card">
        <h3>任务目标</h3>
        <p>${task.brief}</p>
      </div>
      <div class="phone-section">
        <h3>关联资料</h3>
        <div class="stack">
          ${resources.map(resource => `<div class="list-card"><strong>${resource.title}</strong><span class="muted">${resource.version}</span></div>`).join("")}
        </div>
      </div>
      <div class="phone-section">
        <button class="gold-button" style="width:100%" data-view="mobile-record">开始练习</button>
      </div>
    </article>
  `;
}

function phoneRecord(task) {
  return `
    <article class="phone">
      <div class="phone-notch"></div>
      <h2>录音打卡</h2>
      <div class="phone-sub">${task.segment}</div>
      <div class="recorder">
        <div>
          <div class="muted">录音时长</div>
          <div class="timer">02:36</div>
        </div>
        <div class="wave">
          ${Array.from({ length: 34 }, (_, index) => `<span style="--i:${(index * 7) % 12}"></span>`).join("")}
        </div>
        <button class="record-button" aria-label="录音"></button>
      </div>
      <form class="form-grid" id="recordForm">
        <input type="hidden" name="taskId" value="${task.id}" />
        <div class="field"><label>自评</label><input name="selfRating" value="音准：一般；节奏：稳定；气息：有点紧" /></div>
        <label class="pill"><input name="needHelp" type="checkbox" /> 需要声部长帮助</label>
        <button class="gold-button" type="submit">提交打卡</button>
      </form>
    </article>
  `;
}

function phoneLibrary() {
  return `
    <article class="phone">
      <div class="phone-notch"></div>
      <h2>谱库</h2>
      <div class="phone-sub">作品与分声部资料</div>
      <div class="field"><input placeholder="搜索作品 / 作曲家 / 资料" /></div>
      <div class="chip-row" style="margin:16px 0 22px">
        <span class="pill gold">练习中</span><span class="pill">已演出</span><span class="pill">我的收藏</span>
      </div>
      <div class="stack">
        ${state.data.works.map(work => `
          <div class="list-card">
            <div>
              <strong>${work.title}</strong>
              <div class="muted">总谱 · 分声部音频 · 伴奏</div>
            </div>
            <span class="pill">${work.status}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      const next = button.dataset.view;
      if (next === "mobile-record") return showToast("练习页已在第三台手机预览中");
      state.view = next;
      render();
    });
  });

  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      state.adminTab = button.dataset.tab;
      render();
    });
  });

  document.querySelectorAll("[data-checkin]").forEach(button => {
    button.addEventListener("click", async () => {
      await api.post("/api/events/checkin", { eventId: button.dataset.checkin });
      showToast("签到成功，考勤已同步到后台看板。");
      await refresh();
    });
  });

  document.querySelectorAll("[data-respond]").forEach(button => {
    button.addEventListener("click", async () => {
      await api.post("/api/events/respond", { eventId: button.dataset.respond, response: button.dataset.response });
      showToast(`已反馈：${button.dataset.response}`);
      await refresh();
    });
  });

  document.querySelectorAll("[data-comment]").forEach(button => {
    button.addEventListener("click", async () => {
      const template = state.data.feedbackTemplates[0];
      await api.post("/api/feedback", { recordId: button.dataset.comment, feedback: template, tags: ["音准", "入口"], needFollowup: true });
      showToast("已使用快捷评语，成员端会收到温柔提醒。");
      await refresh();
    });
  });

  document.querySelectorAll("[data-favorite]").forEach(button => {
    button.addEventListener("click", async () => {
      await api.post("/api/library/favorite", { workId: button.dataset.favorite });
      showToast("谱库收藏状态已更新。");
      await refresh();
    });
  });

  const taskForm = document.querySelector("#taskForm");
  if (taskForm) {
    taskForm.addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(taskForm);
      const target = form.get("target");
      await api.post("/api/tasks", {
        title: form.get("title"),
        workId: form.get("workId"),
        segment: form.get("segment"),
        targetSections: target === "ALL" ? ["S", "A", "T", "B"] : [target],
        deadline: form.get("deadline"),
        requiredCount: 1,
        brief: form.get("brief")
      });
      showToast("练习任务已发布，可在成员端本周待办中查看。");
      await refresh();
    });
  }

  const recordForm = document.querySelector("#recordForm");
  if (recordForm) {
    recordForm.addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(recordForm);
      await api.post("/api/practice/submit", {
        taskId: form.get("taskId"),
        duration: 156,
        selfRating: form.get("selfRating"),
        needHelp: form.get("needHelp") === "on"
      });
      showToast("录音打卡已提交，状态为待点评。");
      await refresh();
    });
  }

  document.querySelector("[data-action='invite']")?.addEventListener("click", () => {
    showToast("邀请码已生成：DMAJOR-2026，可设置有效期和使用次数。");
  });
}

function render() {
  app.innerHTML = `
    <div class="app-shell">
      ${topbar()}
      ${state.view === "admin" ? adminShell() : mobileView()}
    </div>
    <div class="toast" aria-live="polite"></div>
  `;
  bindEvents();
}

refresh().catch(error => {
  app.innerHTML = `<div class="boot">启动失败：${escapeHtml(error.message)}</div>`;
});
