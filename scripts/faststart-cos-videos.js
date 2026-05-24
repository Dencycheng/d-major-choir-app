#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const COS = require("cos-nodejs-sdk-v5");
const { readStore } = require("../lib/sqlite-store");

loadEnvFile();

const root = path.join(__dirname, "..");
const uploadsDir = process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/home/ubuntu/d_major_uploads" : path.join(root, "uploads"));
const COS_BUCKET = process.env.COS_BUCKET || "";
const COS_REGION = process.env.COS_REGION || "";
const COS_SECRET_ID = process.env.COS_SECRET_ID || "";
const COS_SECRET_KEY = process.env.COS_SECRET_KEY || "";
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = readLimit();

if (!COS_BUCKET || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY) {
  console.error("Missing COS env. Required: COS_BUCKET, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY");
  process.exit(1);
}

const cosClient = new COS({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY });

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function readLimit() {
  const arg = process.argv.find(item => item.startsWith("--limit="));
  if (!arg) return 0;
  const value = Number(arg.split("=")[1]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isMp4Video(asset) {
  const mime = String(asset.mimeType || "").toLowerCase();
  const source = String(asset.path || asset.originalName || "").toLowerCase();
  return (mime.startsWith("video/") || source.endsWith(".mp4")) && source.endsWith(".mp4");
}

function localPath(asset) {
  if (!asset.path) return "";
  return path.isAbsolute(asset.path) ? asset.path : path.join(uploadsDir, asset.path);
}

function isFastStart(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = buffer.toString("latin1");
  const moov = text.indexOf("moov");
  const mdat = text.indexOf("mdat");
  return moov >= 0 && mdat >= 0 && moov < mdat;
}

function uploadToCos(key, filePath, mimeType) {
  return new Promise((resolve, reject) => {
    cosClient.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentLength: fs.statSync(filePath).size,
      ContentType: mimeType || "video/mp4"
    }, error => {
      if (error) {
        reject(new Error(`COS upload failed ${error.code || error.statusCode || ""}: ${error.message || error}`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const store = readStore();
  const videos = (store.fileAssets || []).filter(asset => asset.storageProvider === "cos" && isMp4Video(asset));
  const targets = LIMIT ? videos.slice(0, LIMIT) : videos;
  let checked = 0;
  let optimized = 0;
  let alreadyFastStart = 0;
  let missing = 0;
  let failed = 0;

  console.log(`COS MP4 videos to inspect: ${targets.length}${LIMIT ? ` (limit ${LIMIT} of ${videos.length})` : ""}`);
  for (const asset of targets) {
    checked += 1;
    const source = localPath(asset);
    if (!source || !fs.existsSync(source)) {
      missing += 1;
      console.log(`missing: ${asset.id} ${asset.originalName}`);
      continue;
    }
    if (isFastStart(source)) {
      alreadyFastStart += 1;
      console.log(`already faststart: ${asset.originalName}`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`would optimize: ${asset.originalName}`);
      continue;
    }

    const temp = path.join(os.tmpdir(), `${asset.id}-${Date.now()}-faststart.mp4`);
    try {
      const result = spawnSync("ffmpeg", ["-y", "-i", source, "-c", "copy", "-movflags", "+faststart", temp], { encoding: "utf8" });
      if (result.status !== 0) {
        throw new Error((result.stderr || result.stdout || "ffmpeg failed").split(/\r?\n/).slice(-6).join("\n"));
      }
      await uploadToCos(asset.path, temp, asset.mimeType || "video/mp4");
      fs.copyFileSync(temp, source);
      optimized += 1;
      console.log(`optimized: ${asset.originalName}`);
    } catch (error) {
      failed += 1;
      console.error(`failed: ${asset.originalName} ${error.message}`);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }

  console.log(JSON.stringify({ checked, optimized, alreadyFastStart, missing, failed, dryRun: DRY_RUN }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
