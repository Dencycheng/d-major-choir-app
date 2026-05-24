#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const API_BASE_URL = process.env.API_BASE_URL || "http://119.45.176.130:4173";
const SCORE_DIR = process.env.SCORE_DIR || "/Users/dencycheng/Nutstore Files/我的坚果云/01 Personal/11 music/D大调/D大调歌谱";
const REPLACE_DEMO = process.argv.includes("--replace-demo");
const DRY_RUN = process.argv.includes("--dry-run");
const DEMO_TITLES = new Set(["月光", "春之声"]);

function cleanTitle(filename) {
  const base = filename.replace(/\.pdf$/i, "");
  const quoted = base.match(/《([^》]+)》/);
  if (quoted) return quoted[1].trim();
  return base
    .replace(/\s*-\s*D大调合唱团.*$/i, "")
    .replace(/\s*-\s*D大调.*$/i, "")
    .replace(/\s+v\d.*$/i, "")
    .trim();
}

function versionFrom(filename) {
  const match = filename.match(/\bv\d+(?:\.\d+)*(?:\(\d+\))?/i);
  return match ? match[0] : "v1";
}

function uniqueByFile(files) {
  const seen = new Set();
  return files.filter(file => {
    const key = path.basename(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(payload.error || `${response.status} ${response.statusText}`);
  }
  return payload;
}

async function postJson(pathname, body) {
  return getJson(`${API_BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function putJson(pathname, body) {
  return getJson(`${API_BASE_URL}${pathname}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function uploadResource(workId, filePath) {
  const filename = path.basename(filePath);
  const form = new FormData();
  form.set("workId", workId);
  form.set("type", "总谱");
  form.set("title", `${cleanTitle(filename)} 总谱`);
  form.set("section", "ALL");
  form.set("version", versionFrom(filename));
  form.set("file", await fs.openAsBlob(filePath, { type: "application/pdf" }), filename);
  return getJson(`${API_BASE_URL}/api/resources/upload`, {
    method: "POST",
    body: form
  });
}

async function main() {
  if (!fs.existsSync(SCORE_DIR)) {
    throw new Error(`谱子目录不存在：${SCORE_DIR}`);
  }

  const files = uniqueByFile(fs.readdirSync(SCORE_DIR)
    .filter(name => /\.pdf$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
    .map(name => path.join(SCORE_DIR, name)));

  console.log(`API: ${API_BASE_URL}`);
  console.log(`谱子目录: ${SCORE_DIR}`);
  console.log(`发现 PDF: ${files.length} 个`);

  if (DRY_RUN) {
    files.forEach(file => console.log(`${cleanTitle(path.basename(file))} | ${versionFrom(path.basename(file))} | ${path.basename(file)}`));
    return;
  }

  let bootstrap = await getJson(`${API_BASE_URL}/api/bootstrap`);
  const existingWorks = new Map((bootstrap.works || []).map(work => [work.title, work]));
  const existingResources = new Set((bootstrap.resources || []).map(resource => `${resource.workId}|${resource.title}|${resource.originalName || ""}`));

  if (REPLACE_DEMO) {
    const demoWorks = (bootstrap.works || []).filter(work => DEMO_TITLES.has(work.title));
    for (const work of demoWorks) {
      console.log(`归档 demo 作品: ${work.title}`);
      await putJson(`/api/works/${encodeURIComponent(work.id)}`, {
        ...work,
        status: "归档",
        readiness: 0,
        weakSpot: "已由真实曲库替代，保留历史练习关联"
      });
    }
    bootstrap = await getJson(`${API_BASE_URL}/api/bootstrap`);
  }

  let createdWorks = 0;
  let uploadedResources = 0;
  let skippedResources = 0;

  for (const filePath of files) {
    const filename = path.basename(filePath);
    const title = cleanTitle(filename);
    let work = existingWorks.get(title);

    if (!work) {
      const result = await postJson("/api/works", {
        title,
        status: "排练中",
        copyright: "D大调合唱团内部排练使用",
        readiness: 0
      });
      work = result.work;
      existingWorks.set(title, work);
      createdWorks += 1;
      console.log(`新增作品: ${title}`);
    }

    const resourceTitle = `${title} 总谱`;
    const duplicateKey = `${work.id}|${resourceTitle}|${filename}`;
    if (existingResources.has(duplicateKey)) {
      skippedResources += 1;
      console.log(`跳过已存在资料: ${filename}`);
      continue;
    }

    await uploadResource(work.id, filePath);
    uploadedResources += 1;
    console.log(`上传总谱: ${filename}`);
  }

  const finalData = await getJson(`${API_BASE_URL}/api/bootstrap`);
  console.log(JSON.stringify({
    createdWorks,
    uploadedResources,
    skippedResources,
    totalWorks: finalData.works.length,
    totalResources: finalData.resources.length
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
