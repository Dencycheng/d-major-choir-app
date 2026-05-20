const app = document.querySelector("#app");

const API_BASE_URL = window.DMAJOR_API_BASE_URL || (window.location.protocol === "file:" ? "http://127.0.0.1:4173" : "");

const state = {
  view: "admin",
  adminTab: "library",
  memberTab: "home",
  data: null,
  editingMemberId: "",
  editingWorkId: "",
  editingTaskId: "",
  editingEventId: ""
};

const api = {
  async get(path) {
    const res = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
    return parseResponse(res);
  },
  async json(method, path, body) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    return parseResponse(res);
  },
  async form(path, formData) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      body: formData
    });
    return parseResponse(res);
  },
  delete(path) {
    return this.json("DELETE", path, {});
  }
};

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "操作失败");
  return data;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function h(value = "") {
  return escapeHtml(value);
}

function fileUrl(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${API_BASE_URL}${url}`;
}

function sectionLabel(code) {
  const section = state.data.sections.find(item => item.code === code);
  if (!section) return code || "全团";
  return `${section.englishName} / ${section.name}`;
}

function workById(id) {
  return state.data.works.find(work => work.id === id) || {};
}

function taskById(id) {
  return state.data.tasks.find(task => task.id === id) || {};
}

function eventById(id) {
  return state.data.events.find(event => event.id === id) || {};
}

function memberById(id) {
  return state.data.members.find(member => member.id === id) || {};
}

function resourcesForWork(workId) {
  return state.data.resources.filter(resource => resource.workId === workId);
}

function recordsForTask(taskId) {
  return state.data.records.filter(record => record.taskId === taskId);
}

function isAudio(resourceOrRecord) {
  const type = resourceOrRecord.type || "";
  const mime = resourceOrRecord.file?.mimeType || "";
  return type.includes("音频") || type.includes("伴奏") || mime.startsWith("audio/");
}

function isVideo(resourceOrRecord) {
  const type = resourceOrRecord.type || "";
  const mime = resourceOrRecord.file?.mimeType || "";
  return type.includes("视频") || mime.startsWith("video/");
}

function isPdf(resource) {
  const mime = resource.file?.mimeType || "";
  return resource.type === "总谱" || resource.type === "分声部谱" || mime.includes("pdf");
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function refresh(silent = false) {
  state.data = await api.get("/api/bootstrap");
  render();
  if (!silent) showToast("数据已刷新");
}

function hydrateFromPayload(payload, message) {
  if (payload.bootstrap) {
    state.data = payload.bootstrap;
    render();
  }
  if (message) showToast(message);
}

function topbar() {
  const choir = state.data.choir;
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">D</div>
        <div>
          <p class="brand-title">${h(choir.name)}</p>
          <div class="brand-subtitle">全员可用 MVP · SQLite 持久化 · 文件写入 uploads</div>
        </div>
      </div>
      <div class="view-switch">
        <button class="${state.view === "admin" ? "active" : ""}" data-view="admin">管理后台</button>
        <button class="${state.view === "member" ? "active" : ""}" data-view="member">成员端</button>
      </div>
    </header>
  `;
}

function shell() {
  return `
    <div class="app-shell">
      ${topbar()}
      ${state.view === "admin" ? adminView() : memberView()}
      <div class="toast" aria-live="polite"></div>
    </div>
  `;
}

function adminView() {
  const tabs = [
    ["members", "团员管理"],
    ["library", "谱库管理"],
    ["tasks", "练习任务"],
    ["records", "打卡点评"],
    ["events", "活动签到"],
    ["dashboard", "数据概览"]
  ];
  return `
    <div class="layout functional-layout">
      <aside class="side">
        <div class="side-logo">D Major Admin</div>
        <small>新增、上传、提交、点评都写入真实数据</small>
        <nav class="nav">
          ${tabs.map(([id, label]) => `<button class="${state.adminTab === id ? "active" : ""}" data-admin-tab="${id}">${label}<span>›</span></button>`).join("")}
        </nav>
      </aside>
      <main class="main-grid">
        ${state.adminTab === "library" ? adminLibrary() : ""}
        ${state.adminTab === "members" ? adminMembers() : ""}
        ${state.adminTab === "tasks" ? adminTasks() : ""}
        ${state.adminTab === "records" ? adminRecords() : ""}
        ${state.adminTab === "events" ? adminEvents() : ""}
        ${state.adminTab === "dashboard" ? adminDashboard() : ""}
      </main>
    </div>
  `;
}

function memberView() {
  const tabs = [
    ["home", "首页"],
    ["library", "谱库"],
    ["tasks", "练习任务"],
    ["events", "活动"],
    ["feedback", "我的反馈"],
    ["profile", "我的资料"]
  ];
  return `
    <div class="member-shell">
      <nav class="member-tabs">
        ${tabs.map(([id, label]) => `<button class="${state.memberTab === id ? "active" : ""}" data-member-tab="${id}">${label}</button>`).join("")}
      </nav>
      <main class="member-main">
        ${state.memberTab === "home" ? memberHome() : ""}
        ${state.memberTab === "library" ? memberLibrary() : ""}
        ${state.memberTab === "tasks" ? memberTasks() : ""}
        ${state.memberTab === "events" ? memberEvents() : ""}
        ${state.memberTab === "feedback" ? memberFeedback() : ""}
        ${state.memberTab === "profile" ? memberProfile() : ""}
      </main>
    </div>
  `;
}

function adminDashboard() {
  const dashboard = state.data.dashboard;
  return `
    <section>
      <div class="section-title">
        <div>
          <h2>数据概览</h2>
          <p>${h(dashboard.headline)}</p>
        </div>
        <button class="ghost-button" data-refresh>刷新</button>
      </div>
      <div class="kpi-grid">
        ${dashboard.kpis.map(kpi => `
          <article class="card">
            <div class="kpi-label">${h(kpi.label)}</div>
            <div class="kpi-value">${h(kpi.value)}</div>
            <div class="kpi-note">${h(kpi.note)}</div>
          </article>
        `).join("")}
      </div>
      <article class="card">
        <h3>四声部状态</h3>
        <table class="table">
          <thead><tr><th>声部</th><th>人数</th><th>出勤</th><th>打卡</th><th>点评</th></tr></thead>
          <tbody>
            ${dashboard.sections.map(section => `
              <tr>
                <td><span class="pill" style="background:${section.color};color:#fff">${section.code} ${section.name}</span></td>
                <td>${section.count}</td>
                <td>${section.attendanceRate}%</td>
                <td>${section.checkinRate}%</td>
                <td>${section.feedbackRate}%</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </article>
    </section>
  `;
}

function adminMembers() {
  const editing = state.editingMemberId ? memberById(state.editingMemberId) : {};
  const pendingProfiles = state.data.profileChangeRequests || [];
  return `
    <section>
      <div class="section-title">
        <div>
          <h2>团员管理</h2>
          <p>超级管理员维护团员资料、角色权限；声部长/声部首席按授权声部管理数据。</p>
        </div>
        <button class="ghost-button" data-refresh>刷新</button>
      </div>
      <div class="two-col">
        <article class="card">
          <h3>${editing.id ? "编辑团员" : "新增团员"}</h3>
          <form class="form-grid" id="memberForm">
            <input type="hidden" name="id" value="${h(editing.id || "")}" />
            <div class="field"><label>姓名</label><input name="name" required value="${h(editing.name || "")}" /></div>
            <div class="field"><label>昵称</label><input name="nickname" value="${h(editing.nickname || "")}" /></div>
            <div class="field"><label>手机号</label><input name="mobile" value="${h(editing.mobile || "")}" /></div>
            <div class="field"><label>邮箱</label><input name="email" type="email" value="${h(editing.email || "")}" /></div>
            <div class="field"><label>声部</label><select name="section">${sectionOptions(false, editing.section || "A")}</select></div>
            <div class="field"><label>角色</label><select name="role">${roleOptions(editing.role || "普通成员")}</select></div>
            <div class="field"><label>状态</label><select name="status">${["正式", "候选", "暂停", "退出"].map(item => `<option ${editing.status === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
            <div class="field"><label>授权管理声部</label><div class="check-grid">${sectionManageChecks(editing.managedSections || [])}</div></div>
            <div class="field"><label>备注</label><textarea name="note">${h(editing.note || "")}</textarea></div>
            <div class="actions">
              <button class="gold-button" type="submit">${editing.id ? "保存团员" : "新增团员"}</button>
              ${editing.id ? `<button class="ghost-button" type="button" data-cancel-member-edit>取消编辑</button>` : ""}
            </div>
          </form>
        </article>
        <article class="card">
          <h3>角色权限配置</h3>
          <div class="stack">
            ${state.data.roles.map(role => rolePermissionCard(role)).join("")}
          </div>
        </article>
      </div>
      <article class="card">
        <h3>团员列表</h3>
        <table class="table compact">
          <thead><tr><th>头像</th><th>姓名</th><th>联系方式</th><th>声部</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${state.data.members.map(member => `
              <tr>
                <td>${member.avatarUrl ? `<img class="avatar-small" src="${fileUrl(member.avatarUrl)}" alt="">` : `<span class="avatar-small placeholder">${h((member.name || "?").slice(0, 1))}</span>`}</td>
                <td><strong>${h(member.name)}</strong><div class="muted">${h(member.nickname || "")}</div></td>
                <td>${h(member.mobile || "-")}<div class="muted">${h(member.email || "")}</div></td>
                <td>${sectionLabel(member.section)}</td>
                <td>${h(member.role)}</td>
                <td>${h(member.status)}</td>
                <td><button class="ghost-button small" data-edit-member="${member.id}">编辑</button> <button class="danger-button small" data-delete-member="${member.id}">删除</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </article>
      <article class="card">
        <h3>待审核资料变更</h3>
        <div class="stack">
          ${pendingProfiles.map(request => `
            <div class="list-card vertical">
              <strong>${h(memberById(request.memberId).name || "成员")} 申请修改 ${h(request.field)}</strong>
              <div class="muted">${h(request.oldValue)} → ${h(request.newValue)} · ${h(request.status)}</div>
              <div class="actions">
                <button class="gold-button small" data-review-profile="${request.id}" data-approved="true">同意</button>
                <button class="danger-button small" data-review-profile="${request.id}" data-approved="false">不同意</button>
              </div>
            </div>
          `).join("") || `<p class="muted">暂无待审核申请。</p>`}
        </div>
      </article>
    </section>
  `;
}

function rolePermissionCard(role) {
  const selected = state.data.rolePermissions.filter(item => item.roleId === role.id).map(item => item.permissionCode);
  return `
    <form class="role-permission-card" data-role-permission="${role.id}">
      <strong>${h(role.name)}</strong>
      <div class="muted">${h(role.description || "")}</div>
      <div class="check-grid">
        ${state.data.permissions.map(permission => `
          <label class="checkbox-line">
            <input type="checkbox" name="permissionCodes" value="${permission.code}" ${selected.includes(permission.code) ? "checked" : ""} />
            ${h(permission.name)}
          </label>
        `).join("")}
      </div>
      <button class="ghost-button small" type="submit">保存权限</button>
    </form>
  `;
}

function adminLibrary() {
  const editing = state.editingWorkId ? workById(state.editingWorkId) : {};
  return `
    <section>
      <div class="section-title">
        <div>
          <h2>谱库管理</h2>
          <p>新增作品、上传 PDF/图片/电子谱/音频/视频谱，成员端可直接查看、播放和倍速练习。</p>
        </div>
        <button class="ghost-button" data-refresh>刷新</button>
      </div>
      <div class="two-col">
        <article class="card">
          <h3>${editing.id ? "编辑作品" : "新增作品"}</h3>
          <form class="form-grid" id="workForm">
            <input type="hidden" name="id" value="${h(editing.id || "")}" />
            <div class="field"><label>作品名称</label><input name="title" required value="${h(editing.title || "")}" placeholder="例如：月光" /></div>
            <div class="field"><label>作曲 / 编曲</label><input name="composer" value="${h(editing.composer || "")}" placeholder="Debussy / 合唱改编" /></div>
            <div class="field"><label>状态</label><select name="status">${["识谱中", "排练中", "演出准备", "已演出", "归档"].map(item => `<option ${editing.status === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
            <div class="field"><label>版权说明</label><input name="copyright" value="${h(editing.copyright || "")}" placeholder="内部排练使用 / 已授权" /></div>
            <div class="field"><label>准备度</label><input name="readiness" type="number" min="0" max="100" value="${editing.readiness ?? 0}" /></div>
            <div class="field"><label>当前薄弱点</label><textarea name="weakSpot" placeholder="例如：第24小节 Alto 入口">${h(editing.weakSpot || "")}</textarea></div>
            <div class="actions">
              <button class="gold-button" type="submit">${editing.id ? "保存作品" : "新增作品"}</button>
              ${editing.id ? `<button class="ghost-button" type="button" data-cancel-work-edit>取消编辑</button>` : ""}
            </div>
          </form>
        </article>
        <article class="card">
          <h3>上传资料</h3>
          <form class="form-grid" id="resourceForm" enctype="multipart/form-data">
            <div class="field"><label>关联作品</label><select name="workId" required>${workOptions()}</select></div>
            <div class="field"><label>资料标题</label><input name="title" required placeholder="例如：A 女低示范 / 总谱 v2" /></div>
            <div class="field"><label>资料类型</label><select name="type" required>${state.data.resourceTypes.map(type => `<option>${type}</option>`).join("")}</select></div>
            <div class="field"><label>声部</label><select name="section">${sectionOptions(true)}</select></div>
            <div class="field"><label>版本</label><input name="version" value="v1" /></div>
            <div class="field"><label>文件</label><input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.wav,.aac,.mp4,.mov,.txt,audio/*,video/*,image/*,application/pdf,text/plain" required /></div>
            <button class="gold-button" type="submit">上传资料</button>
          </form>
        </article>
      </div>
      <article class="card">
        <h3>作品与资料列表</h3>
        <div class="stack">
          ${state.data.works.map(work => workCard(work)).join("")}
        </div>
      </article>
    </section>
  `;
}

function workCard(work) {
  const resources = resourcesForWork(work.id);
  return `
    <div class="entity-card">
      <div class="entity-head">
        <div>
          <h3>${h(work.title)}</h3>
          <p class="muted">${h(work.composer || "未填写作曲")} · ${h(work.status || "未设置状态")} · 准备度 ${work.readiness || 0}%</p>
          ${work.weakSpot ? `<p>${h(work.weakSpot)}</p>` : ""}
        </div>
        <div class="actions">
          <button class="ghost-button" data-edit-work="${work.id}">编辑</button>
          <button class="danger-button" data-delete-work="${work.id}">删除</button>
        </div>
      </div>
      <table class="table compact">
        <thead><tr><th>资料</th><th>类型</th><th>声部</th><th>文件</th><th>操作</th></tr></thead>
        <tbody>
          ${resources.map(resource => resourceRow(resource, true)).join("") || `<tr><td colspan="5" class="muted">还没有上传资料。</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function resourceRow(resource, allowDelete = false) {
  const preview = resource.canPreview
    ? isVideo(resource)
      ? `<div class="video-preview"><video id="video-${resource.id}" controls src="${fileUrl(resource.fileUrl)}"></video><div class="actions">${[0.75, 1, 1.25, 1.5].map(rate => `<button class="ghost-button small" data-video-rate="${resource.id}" data-rate="${rate}">${rate}x</button>`).join("")}</div></div>`
      : isAudio(resource)
      ? `<audio controls src="${fileUrl(resource.fileUrl)}"></audio>`
      : `<a class="ghost-button small" target="_blank" href="${fileUrl(resource.fileUrl)}">查看文件</a>`
    : `<span class="muted">未上传本地文件</span>`;
  return `
    <tr>
      <td><strong>${h(resource.title)}</strong><div class="muted">${h(resource.version || "")}</div></td>
      <td>${h(resource.type)}</td>
      <td>${resource.section === "ALL" ? "全团" : sectionLabel(resource.section)}</td>
      <td>${preview}</td>
      <td>${allowDelete ? `<button class="danger-button small" data-delete-resource="${resource.id}">删除资料</button>` : ""}</td>
    </tr>
  `;
}

function adminTasks() {
  const editing = state.editingTaskId ? taskById(state.editingTaskId) : {};
  return `
    <section>
      <div class="section-title">
        <div>
          <h2>练习任务</h2>
          <p>创建任务后，目标声部成员会在成员端看到自己的待完成任务。</p>
        </div>
      </div>
      <div class="two-col">
        <article class="card">
          <h3>${editing.id ? "编辑任务" : "创建练习任务"}</h3>
          <form class="form-grid" id="taskForm">
            <input type="hidden" name="id" value="${h(editing.id || "")}" />
            <div class="field"><label>任务标题</label><input name="title" required value="${h(editing.title || "")}" placeholder="例如：《月光》第17-32小节" /></div>
            <div class="field"><label>关联作品</label><select name="workId" required>${workOptions(editing.workId)}</select></div>
            <div class="field"><label>段落 / 小节</label><input name="segment" value="${h(editing.segment || "")}" placeholder="第17-32小节" /></div>
            <div class="field"><label>目标声部</label><div class="check-grid">${sectionChecks(editing.targetSections || ["S", "A", "T", "B"])}</div></div>
            <div class="field"><label>截止时间</label><input name="deadline" required value="${h(editing.deadline || "")}" placeholder="2026-05-20 22:00" /></div>
            <div class="field"><label>要求打卡次数</label><input name="requiredCount" type="number" min="1" value="${editing.requiredCount || 1}" /></div>
            <div class="field"><label>练习说明</label><textarea name="brief" placeholder="练习目标、注意事项、资料使用说明">${h(editing.brief || "")}</textarea></div>
            <div class="actions">
              <button class="gold-button" type="submit">${editing.id ? "保存任务" : "创建任务"}</button>
              ${editing.id ? `<button class="ghost-button" type="button" data-cancel-task-edit>取消编辑</button>` : ""}
            </div>
          </form>
        </article>
        <article class="card">
          <h3>任务列表</h3>
          <div class="stack">
            ${state.data.tasks.map(task => `
              <div class="list-card vertical">
                <div>
                  <strong>${h(task.title)}</strong>
                  <div class="muted">${h(task.workTitle)} · ${h(task.segment || "未指定段落")} · ${task.targetSections.map(sectionLabel).join(" / ")}</div>
                  <div class="muted">截止：${h(task.deadline)} · 要求 ${task.requiredCount} 次 · 已提交 ${recordsForTask(task.id).length} 条</div>
                  <p>${h(task.brief || "")}</p>
                </div>
                <div class="actions">
                  <button class="ghost-button" data-edit-task="${task.id}">编辑</button>
                  <button class="danger-button" data-delete-task="${task.id}">删除</button>
                </div>
              </div>
            `).join("") || `<p class="muted">暂无任务。</p>`}
          </div>
        </article>
      </div>
      <article class="card">
        <h3>请假审批</h3>
        <div class="stack">
          ${(state.data.leaveRequests || []).map(request => `
            <div class="list-card vertical">
              <strong>${h(request.memberName)} · ${h(request.eventTitle)}</strong>
              <div class="muted">理由：${h(request.reason || "")} · 状态：${h(request.status)}</div>
              <div class="actions">
                <button class="gold-button small" data-approve-leave="${request.id}" data-approved="true">同意</button>
                <button class="danger-button small" data-approve-leave="${request.id}" data-approved="false">不同意</button>
              </div>
            </div>
          `).join("") || `<p class="muted">暂无请假申请。</p>`}
        </div>
      </article>
    </section>
  `;
}

function adminRecords() {
  return `
    <section>
      <div class="section-title">
        <div>
          <h2>打卡记录与点评</h2>
          <p>成员上传的录音会出现在这里，声部长/指挥可播放并写点评。</p>
        </div>
      </div>
      <div class="stack">
        ${state.data.records.map(record => `
          <article class="card record-card">
            <div class="entity-head">
              <div>
                <h3>${h(record.memberName)} · ${sectionLabel(record.section)}</h3>
                <p class="muted">${h(record.taskTitle)} · ${new Date(record.submittedAt).toLocaleString("zh-CN")}</p>
              </div>
              <span class="pill ${record.feedback ? "success" : "gold"}">${h(record.status)}</span>
            </div>
            ${record.audioUrl ? `<audio controls src="${fileUrl(record.audioUrl)}"></audio>` : `<p class="muted">这条旧记录没有上传音频文件。</p>`}
            <div class="record-meta">
              <span>音准：${h(record.pitch || "未填")}</span>
              <span>节奏：${h(record.rhythm || "未填")}</span>
              <span>气息：${h(record.breath || "未填")}</span>
              <span>${record.needHelp ? "需要帮助" : "未标记帮助"}</span>
            </div>
            ${record.feelings ? `<p>练习感受：${h(record.feelings)}</p>` : ""}
            ${record.feedback ? `<div class="feedback-box"><strong>已有点评：</strong>${h(record.feedback)}</div>` : ""}
            <form class="form-grid feedback-form" data-feedback-form="${record.id}">
              <div class="field"><label>点评内容</label><textarea name="feedback" required>${h(record.feedback || "")}</textarea></div>
              <div class="field"><label>标签</label><input name="tags" value="${h((record.tags || []).join(","))}" placeholder="音准,节奏,入口" /></div>
              <label class="checkbox-line"><input type="checkbox" name="needFollowup" ${record.status === "需复练" ? "checked" : ""} /> 标记为需要复练</label>
              <button class="gold-button" type="submit">提交点评</button>
            </form>
          </article>
        `).join("") || `<article class="card"><p class="muted">暂无打卡记录。</p></article>`}
      </div>
    </section>
  `;
}

function adminEvents() {
  const editing = state.editingEventId ? eventById(state.editingEventId) : {};
  return `
    <section>
      <div class="section-title">
        <div>
          <h2>活动与签到</h2>
          <p>创建排练活动，成员反馈参加/请假并点击签到，后台查看考勤统计。</p>
        </div>
      </div>
      <div class="two-col">
        <article class="card">
          <h3>${editing.id ? "编辑活动" : "创建排练活动"}</h3>
          <form class="form-grid" id="eventForm">
            <input type="hidden" name="id" value="${h(editing.id || "")}" />
            <div class="field"><label>活动标题</label><input name="title" required value="${h(editing.title || "")}" placeholder="周四晚间排练" /></div>
            <div class="field"><label>类型</label><select name="type">${["常规排练", "加排", "演出", "团建", "会议", "试唱"].map(item => `<option ${editing.type === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>
            <div class="field"><label>时间</label><input name="time" required value="${h(editing.time || "")}" placeholder="2026-05-20 19:30" /></div>
            <div class="field"><label>地点</label><input name="location" value="${h(editing.location || "")}" /></div>
            <div class="field"><label>排练议程</label><textarea name="agenda">${h(editing.agenda || "")}</textarea></div>
            <div class="actions">
              <button class="gold-button" type="submit">${editing.id ? "保存活动" : "创建活动"}</button>
              ${editing.id ? `<button class="ghost-button" type="button" data-cancel-event-edit>取消编辑</button>` : ""}
            </div>
          </form>
        </article>
        <article class="card">
          <h3>活动列表与考勤统计</h3>
          <div class="stack">
            ${state.data.events.map(event => eventCard(event)).join("") || `<p class="muted">暂无活动。</p>`}
          </div>
        </article>
      </div>
    </section>
  `;
}

function eventCard(event) {
  const rows = state.data.attendance.filter(record => record.eventId === event.id);
  return `
    <div class="entity-card">
      <div class="entity-head">
        <div>
          <h3>${h(event.title)}</h3>
          <p class="muted">${h(event.type)} · ${h(event.time)} · ${h(event.location || "未填写地点")}</p>
          <p>${h(event.agenda || "")}</p>
          <div class="pill-row">
            <span class="pill">参加 ${event.stats.joined}</span>
            <span class="pill">请假 ${event.stats.leave}</span>
            <span class="pill gold">待审批 ${event.stats.leavePending}</span>
            <span class="pill success">已签到 ${event.stats.checkedIn}</span>
          </div>
        </div>
        <div class="actions">
          <button class="ghost-button" data-edit-event="${event.id}">编辑</button>
          <button class="danger-button" data-delete-event="${event.id}">删除</button>
        </div>
      </div>
      <table class="table compact">
        <thead><tr><th>成员</th><th>声部</th><th>状态</th><th>时间</th><th>备注</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr><td>${h(row.memberName)}</td><td>${sectionLabel(row.section)}</td><td>${h(row.status)}</td><td>${row.time ? new Date(row.time).toLocaleString("zh-CN") : "-"}</td><td>${h(row.note || "")}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">暂无成员反馈。</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function memberHome() {
  const member = state.data.currentMember;
  const myTasks = getMyTasks();
  const pending = myTasks.filter(task => !task.progress.done);
  const latestFeedback = getMyRecords().find(record => record.feedback);
  return `
    <section>
      <div class="member-hero">
        <div>
          <h1>${h(member.name)}，本周要做的事</h1>
          <p>${sectionLabel(member.section)} · ${state.data.choir.name}</p>
        </div>
        <span class="pill info">${pending.length} 个待完成任务</span>
      </div>
      <div class="kpi-grid">
        <article class="card"><div class="kpi-label">待完成任务</div><div class="kpi-value">${pending.length}</div><div class="kpi-note">按你的声部筛选</div></article>
        <article class="card"><div class="kpi-label">我的打卡</div><div class="kpi-value">${getMyRecords().length}</div><div class="kpi-note">真实提交记录</div></article>
        <article class="card"><div class="kpi-label">最新点评</div><div class="kpi-value">${latestFeedback ? "1" : "0"}</div><div class="kpi-note">${latestFeedback ? latestFeedback.status : "暂无新反馈"}</div></article>
        <article class="card"><div class="kpi-label">可看资料</div><div class="kpi-value">${getVisibleResources().length}</div><div class="kpi-note">总谱/本声部/伴奏</div></article>
      </div>
      <article class="card">
        <h3>优先处理</h3>
        <div class="stack">
          ${pending.slice(0, 3).map(task => `<div class="list-card"><div><strong>${h(task.title)}</strong><div class="muted">${h(task.workTitle)} · 截止 ${h(task.deadline)}</div></div><button class="gold-button" data-member-tab="tasks">去打卡</button></div>`).join("") || `<p class="muted">当前没有待完成任务。</p>`}
        </div>
      </article>
    </section>
  `;
}

function memberLibrary() {
  return `
    <section>
      <div class="section-title"><div><h2>谱库</h2><p>可查看全团资料和自己声部资料。</p></div></div>
      <div class="stack">
        ${state.data.works.map(work => {
          const resources = getVisibleResources().filter(resource => resource.workId === work.id);
          if (!resources.length) return "";
          return `
            <article class="card">
              <h3>${h(work.title)}</h3>
              <p class="muted">${h(work.composer || "")} · ${h(work.status || "")}</p>
              <table class="table compact">
                <thead><tr><th>资料</th><th>类型</th><th>声部</th><th>查看 / 播放</th></tr></thead>
                <tbody>${resources.map(resource => resourceRow(resource, false)).join("")}</tbody>
              </table>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function memberTasks() {
  const tasks = getMyTasks();
  return `
    <section>
      <div class="section-title"><div><h2>我的练习任务</h2><p>只展示与你声部相关的任务，提交后后台立即可见。</p></div></div>
      <div class="stack">
        ${tasks.map(task => `
          <article class="card">
            <div class="entity-head">
              <div>
                <h3>${h(task.title)}</h3>
                <p class="muted">${h(task.workTitle)} · ${h(task.segment || "")} · 截止 ${h(task.deadline)}</p>
                <p>${h(task.brief || "")}</p>
              </div>
              <span class="pill ${task.progress.done ? "success" : "gold"}">${task.progress.submitted}/${task.progress.required}</span>
            </div>
            <details ${task.progress.done ? "" : "open"}>
              <summary>提交练习打卡</summary>
              <form class="form-grid practice-form" data-practice-form="${task.id}" enctype="multipart/form-data">
                <div class="field"><label>录音文件</label><input name="audio" type="file" accept="audio/*,.mp3,.m4a,.wav,.aac" required /></div>
                <div class="field"><label>练习感受</label><textarea name="feelings" placeholder="今天练习中觉得哪里顺、哪里卡"></textarea></div>
                <div class="three-fields">
                  <div class="field"><label>音准自评</label>${ratingSelect("pitch")}</div>
                  <div class="field"><label>节奏自评</label>${ratingSelect("rhythm")}</div>
                  <div class="field"><label>气息自评</label>${ratingSelect("breath")}</div>
                </div>
                <label class="checkbox-line"><input type="checkbox" name="needHelp" /> 需要声部长帮助</label>
                <button class="gold-button" type="submit">提交录音打卡</button>
              </form>
            </details>
            <div class="record-list">
              ${getMyRecords().filter(record => record.taskId === task.id).map(record => myRecordLine(record)).join("") || `<p class="muted">还没有提交记录。</p>`}
            </div>
          </article>
        `).join("") || `<article class="card"><p class="muted">暂无分配给你的任务。</p></article>`}
      </div>
    </section>
  `;
}

function memberEvents() {
  return `
    <section>
      <div class="section-title"><div><h2>活动与签到</h2><p>反馈参加/请假，排练时点击签到。</p></div></div>
      <div class="stack">
        ${state.data.events.map(event => `
          <article class="card">
            <div class="entity-head">
              <div>
                <h3>${h(event.title)}</h3>
                <p class="muted">${h(event.type)} · ${h(event.time)} · ${h(event.location || "")}</p>
                <p>${h(event.agenda || "")}</p>
              </div>
              <span class="pill ${event.myAttendance?.status === "已签到" ? "success" : "gold"}">${h(event.myAttendance?.status || "待反馈")}</span>
            </div>
            <form class="form-inline event-response-form" data-event-response="${event.id}">
              <input name="note" placeholder="请假原因或备注，可不填" />
              <button class="ghost-button" name="response" value="参加" type="submit">反馈参加</button>
              <button class="ghost-button" name="response" value="请假" type="submit">提交请假</button>
              <button class="gold-button" type="button" data-checkin="${event.id}">签到</button>
            </form>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function memberFeedback() {
  const records = getMyRecords();
  return `
    <section>
      <div class="section-title"><div><h2>我的点评反馈</h2><p>后台点评后会显示在这里。</p></div></div>
      <div class="stack">
        ${records.map(record => myRecordLine(record, true)).join("") || `<article class="card"><p class="muted">暂无打卡或点评。</p></article>`}
      </div>
    </section>
  `;
}

function memberProfile() {
  const member = state.data.currentMember;
  const myRequests = (state.data.profileChangeRequests || []).filter(request => request.memberId === member.id);
  return `
    <section>
      <div class="section-title"><div><h2>我的资料</h2><p>头像、昵称和联系方式可直接更新；声部调整会进入审核。</p></div></div>
      <div class="two-col">
        <article class="card">
          <h3>头像</h3>
          <div class="profile-head">
            ${member.avatarUrl ? `<img class="avatar-large" src="${fileUrl(member.avatarUrl)}" alt="">` : `<span class="avatar-large placeholder">${h((member.name || "?").slice(0, 1))}</span>`}
            <form id="avatarForm" enctype="multipart/form-data">
              <div class="field"><label>上传新头像</label><input name="avatar" type="file" accept="image/*" required /></div>
              <button class="gold-button" type="submit">上传头像</button>
            </form>
          </div>
        </article>
        <article class="card">
          <h3>基本资料</h3>
          <form class="form-grid" id="profileForm">
            <div class="field"><label>昵称</label><input name="nickname" value="${h(member.nickname || "")}" /></div>
            <div class="field"><label>手机号</label><input name="mobile" value="${h(member.mobile || "")}" /></div>
            <div class="field"><label>邮箱</label><input name="email" type="email" value="${h(member.email || "")}" /></div>
            <div class="field"><label>申请声部</label><select name="section">${sectionOptions(false, member.section)}</select></div>
            <div class="field"><label>申请说明</label><textarea name="sectionNote" placeholder="如果申请调整声部，请写一句原因"></textarea></div>
            <button class="gold-button" type="submit">保存资料</button>
          </form>
        </article>
      </div>
      <article class="card">
        <h3>我的审核记录</h3>
        <div class="stack">
          ${myRequests.map(request => `<div class="list-card"><strong>${h(request.oldValue)} → ${h(request.newValue)}</strong><span class="pill gold">${h(request.status)}</span></div>`).join("") || `<p class="muted">暂无审核记录。</p>`}
        </div>
      </article>
    </section>
  `;
}

function myRecordLine(record, full = false) {
  return `
    <div class="list-card vertical">
      <div>
        <strong>${h(record.taskTitle)}</strong>
        <div class="muted">${new Date(record.submittedAt).toLocaleString("zh-CN")} · ${h(record.status)}</div>
        ${record.audioUrl ? `<audio controls src="${fileUrl(record.audioUrl)}"></audio>` : ""}
        ${full || record.feedback ? `<p>练习感受：${h(record.feelings || "未填写")}</p>` : ""}
        ${record.feedback ? `<div class="feedback-box"><strong>点评：</strong>${h(record.feedback)}</div>` : `<p class="muted">等待声部长/指挥点评。</p>`}
      </div>
    </div>
  `;
}

function getMyTasks() {
  const section = state.data.currentMember.section;
  return state.data.tasks.filter(task => task.targetSections.includes(section) || task.targetSections.includes("ALL"));
}

function getMyRecords() {
  return state.data.records.filter(record => record.memberId === state.data.currentMember.id);
}

function getVisibleResources() {
  const section = state.data.currentMember.section;
  return state.data.resources.filter(resource => resource.section === "ALL" || resource.section === section);
}

function workOptions(selected = "") {
  return state.data.works.map(work => `<option value="${work.id}" ${selected === work.id ? "selected" : ""}>${h(work.title)}</option>`).join("");
}

function sectionOptions(includeAll = false, selected = "ALL") {
  const all = includeAll ? `<option value="ALL" ${selected === "ALL" ? "selected" : ""}>全团 / 不限声部</option>` : "";
  return all + state.data.sections.map(section => `<option value="${section.code}" ${selected === section.code ? "selected" : ""}>${section.englishName} / ${section.name}</option>`).join("");
}

function sectionChecks(selected = []) {
  return state.data.sections.map(section => `
    <label class="checkbox-line">
      <input type="checkbox" name="targetSections" value="${section.code}" ${selected.includes(section.code) ? "checked" : ""} />
      ${section.englishName} / ${section.name}
    </label>
  `).join("");
}

function sectionManageChecks(selected = []) {
  return state.data.sections.map(section => `
    <label class="checkbox-line">
      <input type="checkbox" name="managedSections" value="${section.code}" ${selected.includes(section.code) ? "checked" : ""} />
      ${section.englishName} / ${section.name}
    </label>
  `).join("");
}

function roleOptions(selected = "") {
  const builtIn = ["团长", "指挥", "钢琴伴奏", "女高", "女中", "男高", "男低", "声部长", "声部首席", "普通成员"];
  const names = Array.from(new Set([...builtIn, ...(state.data.roles || []).map(role => role.name)]));
  return names.map(name => `<option ${selected === name ? "selected" : ""}>${h(name)}</option>`).join("");
}

function ratingSelect(name) {
  return `
    <select name="${name}">
      <option>稳定</option>
      <option selected>一般</option>
      <option>需要帮助</option>
    </select>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-admin-tab]").forEach(button => {
    button.addEventListener("click", () => {
      state.adminTab = button.dataset.adminTab;
      render();
    });
  });

  document.querySelectorAll("[data-member-tab]").forEach(button => {
    button.addEventListener("click", () => {
      state.memberTab = button.dataset.memberTab;
      state.view = "member";
      render();
    });
  });

  document.querySelectorAll("[data-refresh]").forEach(button => button.addEventListener("click", () => refresh()));
  document.querySelector("[data-cancel-work-edit]")?.addEventListener("click", () => { state.editingWorkId = ""; render(); });
  document.querySelector("[data-cancel-task-edit]")?.addEventListener("click", () => { state.editingTaskId = ""; render(); });
  document.querySelector("[data-cancel-event-edit]")?.addEventListener("click", () => { state.editingEventId = ""; render(); });
  document.querySelector("[data-cancel-member-edit]")?.addEventListener("click", () => { state.editingMemberId = ""; render(); });

  document.querySelector("#memberForm")?.addEventListener("submit", submitMember);
  document.querySelector("#workForm")?.addEventListener("submit", submitWork);
  document.querySelector("#resourceForm")?.addEventListener("submit", submitResource);
  document.querySelector("#taskForm")?.addEventListener("submit", submitTask);
  document.querySelector("#eventForm")?.addEventListener("submit", submitEvent);
  document.querySelector("#profileForm")?.addEventListener("submit", submitProfile);
  document.querySelector("#avatarForm")?.addEventListener("submit", submitAvatar);

  document.querySelectorAll("[data-edit-member]").forEach(button => button.addEventListener("click", () => { state.editingMemberId = button.dataset.editMember; render(); }));
  document.querySelectorAll("[data-delete-member]").forEach(button => button.addEventListener("click", () => deleteItem(`/api/members/${button.dataset.deleteMember}`, "团员已删除")));
  document.querySelectorAll("[data-edit-work]").forEach(button => button.addEventListener("click", () => { state.editingWorkId = button.dataset.editWork; render(); }));
  document.querySelectorAll("[data-delete-work]").forEach(button => button.addEventListener("click", () => deleteItem(`/api/works/${button.dataset.deleteWork}`, "作品已删除")));
  document.querySelectorAll("[data-delete-resource]").forEach(button => button.addEventListener("click", () => deleteItem(`/api/resources/${button.dataset.deleteResource}`, "资料已删除")));
  document.querySelectorAll("[data-edit-task]").forEach(button => button.addEventListener("click", () => { state.editingTaskId = button.dataset.editTask; render(); }));
  document.querySelectorAll("[data-delete-task]").forEach(button => button.addEventListener("click", () => deleteItem(`/api/tasks/${button.dataset.deleteTask}`, "任务已删除")));
  document.querySelectorAll("[data-edit-event]").forEach(button => button.addEventListener("click", () => { state.editingEventId = button.dataset.editEvent; render(); }));
  document.querySelectorAll("[data-delete-event]").forEach(button => button.addEventListener("click", () => deleteItem(`/api/events/${button.dataset.deleteEvent}`, "活动已删除")));

  document.querySelectorAll(".practice-form").forEach(form => form.addEventListener("submit", submitPractice));
  document.querySelectorAll(".feedback-form").forEach(form => form.addEventListener("submit", submitFeedback));
  document.querySelectorAll(".event-response-form").forEach(form => form.addEventListener("submit", submitEventResponse));
  document.querySelectorAll(".role-permission-card").forEach(form => form.addEventListener("submit", submitRolePermissions));
  document.querySelectorAll("[data-checkin]").forEach(button => button.addEventListener("click", () => checkin(button.dataset.checkin)));
  document.querySelectorAll("[data-review-profile]").forEach(button => button.addEventListener("click", () => reviewProfile(button.dataset.reviewProfile, button.dataset.approved === "true")));
  document.querySelectorAll("[data-approve-leave]").forEach(button => button.addEventListener("click", () => approveLeave(button.dataset.approveLeave, button.dataset.approved === "true")));
  document.querySelectorAll("[data-video-rate]").forEach(button => button.addEventListener("click", () => setVideoRate(button.dataset.videoRate, Number(button.dataset.rate))));
}

async function submitMember(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = formData.get("id");
  const payload = Object.fromEntries(formData.entries());
  payload.managedSections = formData.getAll("managedSections");
  const result = id
    ? await api.json("PUT", `/api/members/${id}`, payload)
    : await api.json("POST", "/api/members", payload);
  state.editingMemberId = "";
  hydrateFromPayload(result, id ? "团员资料已保存" : "团员已新增");
}

async function submitRolePermissions(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const result = await api.json("POST", `/api/roles/${event.currentTarget.dataset.rolePermission}/permissions`, {
    permissionCodes: formData.getAll("permissionCodes")
  });
  hydrateFromPayload(result, "角色权限已保存");
}

async function submitWork(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get("id");
  const payload = Object.fromEntries(form.entries());
  const result = id
    ? await api.json("PUT", `/api/works/${id}`, payload)
    : await api.json("POST", "/api/works", payload);
  state.editingWorkId = "";
  hydrateFromPayload(result, id ? "作品已保存" : "作品已新增");
}

async function submitResource(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const result = await api.form("/api/resources/upload", formData);
  hydrateFromPayload(result, "资料已上传，成员端可查看/播放");
}

async function submitTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get("id");
  const targetSections = formData.getAll("targetSections");
  const payload = Object.fromEntries(formData.entries());
  payload.targetSections = targetSections;
  const result = id
    ? await api.json("PUT", `/api/tasks/${id}`, payload)
    : await api.json("POST", "/api/tasks", payload);
  state.editingTaskId = "";
  hydrateFromPayload(result, id ? "任务已保存" : "任务已创建，成员端已可见");
}

async function submitEvent(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = formData.get("id");
  const payload = Object.fromEntries(formData.entries());
  const result = id
    ? await api.json("PUT", `/api/events/${id}`, payload)
    : await api.json("POST", "/api/events", payload);
  state.editingEventId = "";
  hydrateFromPayload(result, id ? "活动已保存" : "活动已创建");
}

async function submitPractice(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  formData.append("taskId", form.dataset.practiceForm);
  const result = await api.form("/api/practice/records", formData);
  hydrateFromPayload(result, "录音打卡已提交，后台可点评");
}

async function submitFeedback(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  payload.recordId = event.currentTarget.dataset.feedbackForm;
  payload.needFollowup = formData.get("needFollowup") === "on";
  const result = await api.json("POST", "/api/feedback", payload);
  hydrateFromPayload(result, "点评已提交，成员端可查看");
}

async function submitProfile(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const result = await api.json("POST", "/api/profile", payload);
  hydrateFromPayload(result, "资料已保存；如申请调整声部，将等待管理员审核");
}

async function submitAvatar(event) {
  event.preventDefault();
  const result = await api.form("/api/profile/avatar", new FormData(event.currentTarget));
  hydrateFromPayload(result, "头像已更新");
}

async function reviewProfile(requestId, approved) {
  const note = window.prompt(approved ? "写一句温暖的同意备注，可留空" : "请写一句温和说明，帮助成员理解", "") || "";
  const result = await api.json("POST", "/api/profile/requests/review", { requestId, approved, note });
  hydrateFromPayload(result, approved ? "已同意资料变更" : "已记录不同意原因");
}

async function submitEventResponse(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const formData = new FormData(event.currentTarget);
  const response = submitter?.value || "参加";
  let note = formData.get("note") || "";
  if (response === "参加" && !window.confirm("确认参加，期待一起唱歌。")) return;
  if (response === "请假") {
    note = window.prompt("今晚需要请假吗？写下原因，声部长会温柔确认。", note) || "";
    if (!note.trim()) {
      showToast("请简单填写请假理由，方便声部长安排声部平衡。");
      return;
    }
  }
  const payload = {
    eventId: event.currentTarget.dataset.eventResponse,
    response,
    note
  };
  const result = await api.json("POST", "/api/events/respond", payload);
  hydrateFromPayload(result, payload.response === "请假" ? "请假已提交，等待声部长/管理员确认" : "确认参加，期待一起唱歌。");
}

async function checkin(eventId) {
  const result = await api.json("POST", "/api/events/checkin", { eventId });
  hydrateFromPayload(result, "签到成功，快快开嗓一起唱吧。");
}

async function approveLeave(requestId, approved) {
  const note = window.prompt(approved ? "给成员一句温暖确认，可留空" : "请写一句温和说明，方便成员调整安排", "") || "";
  const result = await api.json("POST", "/api/leave/approve", { requestId, approved, note });
  hydrateFromPayload(result, approved ? "已同意请假，声部安排会同步更新" : "已不同意请假，并记录说明");
}

function setVideoRate(resourceId, rate) {
  const video = document.getElementById(`video-${resourceId}`);
  if (!video) return;
  video.playbackRate = rate;
  showToast(`视频播放速度已切换为 ${rate}x`);
}

async function deleteItem(path, message) {
  if (!window.confirm("确认删除？此操作会写入 SQLite 数据库。")) return;
  const result = await api.delete(path);
  hydrateFromPayload(result, message);
}

function render() {
  app.innerHTML = shell();
  bindEvents();
}

refresh(true).catch(error => {
  app.innerHTML = `<div class="boot">无法连接 API：${h(error.message)}<br />请确认本地或腾讯云服务已启动。</div>`;
});
