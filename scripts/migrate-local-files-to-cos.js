#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const COS = require("cos-nodejs-sdk-v5");
const { readStore, writeStore } = require("../lib/sqlite-store");

loadEnvFile();

const root = path.join(__dirname, "..");
const uploadsDir = process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/home/ubuntu/d_major_uploads" : path.join(root, "uploads"));
const COS_BUCKET = process.env.COS_BUCKET || "";
const COS_REGION = process.env.COS_REGION || "";
const COS_SECRET_ID = process.env.COS_SECRET_ID || "";
const COS_SECRET_KEY = process.env.COS_SECRET_KEY || "";
const COS_PUBLIC_BASE = (process.env.COS_PUBLIC_BASE || (COS_BUCKET && COS_REGION ? `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com` : "")).replace(/\/$/, "");
const DRY_RUN = process.argv.includes("--dry-run");

if (!COS_BUCKET || !COS_REGION || !COS_SECRET_ID || !COS_SECRET_KEY || !COS_PUBLIC_BASE) {
  console.error("Missing COS env. Required: COS_BUCKET, COS_REGION, COS_SECRET_ID, COS_SECRET_KEY, COS_PUBLIC_BASE");
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

function uploadToCos(key, filePath, mimeType) {
  return new Promise((resolve, reject) => {
    cosClient.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentLength: fs.statSync(filePath).size,
      ContentType: mimeType || "application/octet-stream"
    }, error => {
      if (error) {
        reject(new Error(`COS upload failed ${error.code || error.statusCode || ""}: ${error.message || error}`));
        return;
      }
      resolve();
    });
  });
}

function localPath(asset) {
  if (!asset.path) return "";
  return path.isAbsolute(asset.path) ? asset.path : path.join(root, asset.path);
}

function keyForAsset(asset) {
  const source = localPath(asset);
  const folder = source.includes(`${path.sep}avatars${path.sep}`) ? "avatars" :
    source.includes(`${path.sep}recordings${path.sep}`) ? "recordings" :
    "resources";
  return `${folder}/${path.basename(source)}`;
}

async function main() {
  const store = readStore();
  const assets = (store.fileAssets || []).filter(asset => asset.storageProvider !== "cos");
  let migrated = 0;
  let missing = 0;
  let failed = 0;

  console.log(`Local assets to inspect: ${assets.length}`);
  for (const asset of assets) {
    const source = localPath(asset);
    if (!source || !fs.existsSync(source)) {
      missing += 1;
      console.log(`missing: ${asset.id} ${asset.originalName}`);
      continue;
    }
    const key = keyForAsset(asset);
    if (DRY_RUN) {
      console.log(`would migrate: ${asset.originalName} -> ${key}`);
      continue;
    }
    try {
      await uploadToCos(key, source, asset.mimeType);
      asset.path = key;
      asset.storageProvider = "cos";
      migrated += 1;
      console.log(`migrated: ${asset.originalName} -> ${key}`);
    } catch (error) {
      failed += 1;
      console.error(`failed: ${asset.originalName} ${error.message}`);
    }
  }

  if (!DRY_RUN && migrated > 0) writeStore(store);
  console.log(JSON.stringify({ migrated, missing, failed, dryRun: DRY_RUN }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
