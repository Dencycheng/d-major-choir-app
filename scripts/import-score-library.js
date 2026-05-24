#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const API_BASE_URL = process.env.API_BASE_URL || "http://119.45.176.130:4173";
const SCORE_DIR = process.env.SCORE_DIR || "/Users/dencycheng/Downloads/南沙D大调合唱团-乐谱集";
const DRY_RUN = process.argv.includes("--dry-run");
const REPLACE_OLD = !process.argv.includes("--keep-old");

const SKIP_DIRS = new Set(["本网盘二维码"]);
const VALID_EXTS = new Set([".pdf", ".mp4", ".mov", ".mp3", ".m4a", ".wav", ".aac", ".txt", ".jpg", ".jpeg", ".png", ".webp"]);

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[＋+]/g, "+")
    .trim();
}

function stripExt(filename) {
  return filename.replace(/\.(pdf|mp4|mov|mp3|m4a|wav|aac|txt|jpg|jpeg|png|webp)$/i, "");
}

function titleFromName(filename, parentName) {
  const base = stripExt(path.basename(filename));
  const quoted = base.match(/《([^》]+)》/);
  if (quoted) return normalizeText(quoted[1].replace(/：澳门$/, "：澳门"));
  if (/伴奏/.test(base)) {
    return normalizeText(base
      .replace(/伴奏.*$/i, "")
      .replace(/\s*-\s*D大调合唱团.*$/i, "")
      .replace(/\s*-\s*D大调.*$/i, ""));
  }
  return normalizeText(parentName || base
    .replace(/\s*-\s*D大调合唱团.*$/i, "")
    .replace(/\s*-\s*D大调.*$/i, "")
    .replace(/\s+v\d.*$/i, "")
    .replace(/伴奏.*$/i, "")
    .replace(/-[SATB]\d?\]?.*$/i, ""));
}

function versionFrom(filename) {
  const base = path.basename(filename);
  const match = base.match(/\bv\s*(\d+(?:\.\d+)*(?:\(\d+\))?)(Y)?/i);
  if (!match) return "v1";
  return `v${match[1]}${match[2] ? "Y" : ""}`;
}

function versionScore(version) {
  const raw = String(version || "v1").replace(/^v/i, "");
  const yPenalty = /Y$/i.test(raw) ? -0.0001 : 0;
  return raw.replace(/Y$/i, "").replace(/[()]/g, ".").split(".")
    .filter(Boolean)
    .reduce((score, part, index) => score + (Number.parseInt(part, 10) || 0) / (10 ** (index * 3)), 0) + yPenalty;
}

function descriptorFrom(filename, type, workTitle = "") {
  let base = stripExt(path.basename(filename));
  base = base.replace(/《[^》]+》/g, "");
  if (workTitle) base = base.replace(new RegExp(workTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");
  base = base.replace(/\bv\s*\d+(?:\.\d+)*(?:\(\d+\))?Y?\b/ig, "");
  base = base.replace(/D大调合唱团|D大调|南沙堂/g, "");
  base = base.replace(/[+\-_]/g, " ");
  base = normalizeText(base);

  if (type === "总谱") {
    if (/器乐版/.test(base)) return "器乐版总谱";
    if (/日语罗马音/.test(base)) return "日语罗马音总谱";
    if (/陈奕迅版/.test(base)) return "陈奕迅版总谱";
    if (/莫文蔚版/.test(base)) return "莫文蔚版总谱";
    if (/Cantonese|粤语/i.test(base)) return "粤语版总谱";
    if (/五线谱/.test(base)) return "五线谱";
    return "总谱";
  }

  if (type === "伴奏") return base || "伴奏";
  if (type === "排练视频") return base || "排练视频";
  if (type === "其他资料") return base || "资料";
  return base || "视频谱";
}

function inferType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (ext === ".pdf") return "总谱";
  if ([".mp3", ".m4a", ".wav", ".aac"].includes(ext)) {
    if (/伴奏|钢琴|音轨|录音/.test(name)) return "伴奏";
    return "分声部音频";
  }
  if ([".mp4", ".mov"].includes(ext)) {
    if (/动作示范|音乐会原声|合唱原声|排练/.test(name)) return "排练视频";
    return "视频谱";
  }
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return "图片谱";
  return "其他资料";
}

function sectionFrom(filename) {
  const name = path.basename(filename);
  if (/(^|[-\s.])S(\d|\b)|女高|一声部|主声部|主音轨|solo/i.test(name)) return "S";
  if (/(^|[-\s.])A(\d|\b)|女低|女中|二声部/i.test(name)) return "A";
  if (/(^|[-\s.])T(\d|\b)|男高|三声部/i.test(name)) return "T";
  if (/(^|[-\s.])B(\d|\b)|男低|Bass|四声部/i.test(name)) return "B";
  return "ALL";
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".txt": "text/plain",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  };
  return map[ext] || "application/octet-stream";
}

function collectFiles(dir) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.endsWith(".downloading")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTS.has(ext)) files.push(full);
    }
  }
  walk(dir);
  return files;
}

function entryFor(filePath) {
  const rel = path.relative(SCORE_DIR, filePath);
  const parts = rel.split(path.sep);
  const parentName = parts.length > 1 ? parts[0] : "";
  const type = inferType(filePath);
  const title = titleFromName(filePath, parentName);
  const descriptor = descriptorFrom(filePath, type, title);
  const version = versionFrom(filePath);
  const section = sectionFrom(filePath);
  return {
    filePath,
    filename: path.basename(filePath),
    title,
    type,
    descriptor,
    resourceTitle: `${title} ${descriptor}`,
    version,
    versionRank: versionScore(version),
    section,
    size: fs.statSync(filePath).size
  };
}

function latestEntries(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = [entry.title, entry.type, entry.descriptor, entry.section].join("|");
    const current = byKey.get(key);
    if (!current || entry.versionRank > current.versionRank || (entry.versionRank === current.versionRank && entry.size > current.size)) {
      byKey.set(key, entry);
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.title.localeCompare(b.title, "zh-Hans-CN") ||
    a.type.localeCompare(b.type, "zh-Hans-CN") ||
    a.resourceTitle.localeCompare(b.resourceTitle, "zh-Hans-CN")
  );
}

async function getJson(url, options) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
      }
      if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
      }
    }
  }
  throw lastError;
}

async function postJson(pathname, body) {
  return getJson(`${API_BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function ensureWork(worksByTitle, title) {
  let work = worksByTitle.get(title);
  if (work) return work;
  const result = await postJson("/api/works", {
    title,
    status: "排练中",
    copyright: "D大调合唱团内部排练使用",
    readiness: 0
  });
  work = result.work;
  worksByTitle.set(title, work);
  console.log(`新增作品: ${title}`);
  return work;
}

async function deleteResource(resourceId) {
  await getJson(`${API_BASE_URL}/api/resources/${encodeURIComponent(resourceId)}`, { method: "DELETE" });
}

async function uploadResource(workId, entry) {
  const form = new FormData();
  form.set("workId", workId);
  form.set("type", entry.type);
  form.set("title", entry.resourceTitle);
  form.set("section", entry.section);
  form.set("version", entry.version);
  form.set("file", await fs.openAsBlob(entry.filePath, { type: mimeType(entry.filePath) }), entry.filename);
  return getJson(`${API_BASE_URL}/api/resources/upload`, { method: "POST", body: form });
}

async function main() {
  if (!fs.existsSync(SCORE_DIR)) throw new Error(`乐谱集目录不存在：${SCORE_DIR}`);
  const all = collectFiles(SCORE_DIR).map(entryFor);
  const selected = latestEntries(all);
  const skippedOld = all.length - selected.length;

  console.log(`API: ${API_BASE_URL}`);
  console.log(`乐谱集: ${SCORE_DIR}`);
  console.log(`可导入文件: ${all.length}`);
  console.log(`去重后待处理: ${selected.length}`);
  console.log(`因旧版本/重复跳过: ${skippedOld}`);

  if (DRY_RUN) {
    selected.forEach(entry => {
      console.log(`${entry.title} | ${entry.type} | ${entry.section} | ${entry.resourceTitle} | ${entry.version} | ${(entry.size / 1024 / 1024).toFixed(1)}MB | ${entry.filename}`);
    });
    return;
  }

  const bootstrap = await getJson(`${API_BASE_URL}/api/bootstrap`);
  const worksByTitle = new Map((bootstrap.works || []).map(work => [work.title, work]));
  const existingByKey = new Map();
  for (const resource of bootstrap.resources || []) {
    const work = (bootstrap.works || []).find(item => item.id === resource.workId);
    if (!work) continue;
    const key = [work.title, resource.type, resource.title, resource.section || "ALL"].join("|");
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(resource);
  }

  let created = 0;
  let uploaded = 0;
  let skippedExisting = 0;
  let replaced = 0;
  const failed = [];

  for (const entry of selected) {
    const work = await ensureWork(worksByTitle, entry.title);
    if (!bootstrap.works.find(item => item.id === work.id)) created += 1;

    const key = [entry.title, entry.type, entry.resourceTitle, entry.section].join("|");
    const existing = existingByKey.get(key) || [];
    const newerOrSame = existing.some(resource => versionScore(resource.version) >= entry.versionRank);
    if (newerOrSame) {
      skippedExisting += 1;
      console.log(`跳过已有新版: ${entry.resourceTitle} ${entry.version}`);
      continue;
    }

    if (REPLACE_OLD) {
      for (const resource of existing) {
        await deleteResource(resource.id);
        replaced += 1;
      }
    }

    try {
      await uploadResource(work.id, entry);
      uploaded += 1;
      console.log(`上传: ${entry.resourceTitle} ${entry.version} (${entry.type}, ${entry.section})`);
    } catch (error) {
      failed.push({
        title: entry.resourceTitle,
        version: entry.version,
        sizeMb: Number((entry.size / 1024 / 1024).toFixed(1)),
        file: entry.filePath,
        error: error.message
      });
      console.error(`上传失败，继续后续文件: ${entry.resourceTitle} ${entry.version} - ${error.message}`);
    }
  }

  const finalData = await getJson(`${API_BASE_URL}/api/bootstrap`);
  console.log(JSON.stringify({
    selected: selected.length,
    createdWorks: created,
    uploadedResources: uploaded,
    skippedExisting,
    replacedOldResources: replaced,
    failed,
    totalWorks: finalData.works.length,
    totalResources: finalData.resources.length
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
