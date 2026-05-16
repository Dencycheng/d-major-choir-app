const assert = require("assert");

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";

async function main() {
  const health = await fetch(`${API_BASE_URL}/api/health`).then(res => res.json());
  assert.equal(health.status, "ok");

  const boot = await fetch(`${API_BASE_URL}/api/bootstrap`).then(res => res.json());
  assert.equal(boot.choir.name, "D大调合唱团");
  assert.ok(boot.sections.length >= 4);
  assert.ok(boot.tasks.length >= 1);
  assert.ok(boot.works.length >= 1);

  const work = await fetch(`${API_BASE_URL}/api/works`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `冒烟测试曲目 ${Date.now()}`,
      composer: "Smoke Test",
      status: "识谱中",
      copyright: "测试"
    })
  }).then(res => res.json());
  assert.ok(work.work.id);

  const resourceForm = new FormData();
  resourceForm.append("workId", work.work.id);
  resourceForm.append("title", "冒烟测试总谱");
  resourceForm.append("type", "总谱");
  resourceForm.append("section", "ALL");
  resourceForm.append("version", "v1");
  resourceForm.append("file", new Blob(["%PDF-1.4\n% smoke test\n"], { type: "application/pdf" }), "smoke-score.pdf");
  const resource = await fetch(`${API_BASE_URL}/api/resources/upload`, {
    method: "POST",
    body: resourceForm
  }).then(res => res.json());
  assert.ok(resource.resource.fileUrl);

  const task = await fetch(`${API_BASE_URL}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "冒烟测试练习任务",
      workId: work.work.id,
      segment: "第1-8小节",
      targetSections: ["A"],
      deadline: "2026-05-20 22:00",
      requiredCount: 1,
      brief: "上传一次测试录音"
    })
  }).then(res => res.json());
  assert.ok(task.task.id);

  const checkin = await fetch(`${API_BASE_URL}/api/events/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId: boot.events[0].id })
  }).then(res => res.json());
  assert.equal(checkin.event.response, "已签到");

  const practiceForm = new FormData();
  practiceForm.append("taskId", task.task.id);
  practiceForm.append("feelings", "冒烟测试录音");
  practiceForm.append("pitch", "一般");
  practiceForm.append("rhythm", "稳定");
  practiceForm.append("breath", "一般");
  practiceForm.append("audio", new Blob(["smoke audio"], { type: "audio/mpeg" }), "smoke.mp3");
  const practice = await fetch(`${API_BASE_URL}/api/practice/records`, {
    method: "POST",
    body: practiceForm
  }).then(res => res.json());
  assert.equal(practice.record.status, "待点评");

  const feedback = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recordId: practice.record.id,
      feedback: "入口比上周稳定，下一次只关注第24小节。",
      tags: ["入口", "音准"],
      needFollowup: false
    })
  }).then(res => res.json());
  assert.equal(feedback.record.status, "已点评");

  const file = await fetch(`${API_BASE_URL}${resource.resource.fileUrl}`);
  assert.equal(file.status, 200);

  console.log("Smoke test passed:");
  console.log("- health");
  console.log("- bootstrap/login data");
  console.log("- create work");
  console.log("- upload resource");
  console.log("- create task");
  console.log("- activity check-in");
  console.log("- practice submit");
  console.log("- feedback");
  console.log("- resource file access");
}

main().catch(error => {
  console.error("Smoke test failed:");
  console.error(error);
  process.exit(1);
});
