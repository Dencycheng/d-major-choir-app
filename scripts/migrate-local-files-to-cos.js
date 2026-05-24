#!/usr/bin/env node
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function hmacSha1(key, value) {
  return crypto.createHmac("sha1", key).update(value).digest("hex");
}

function cosObjectPath(key) {
  return `/${String(key).split("/").map(part => encodeURIComponent(part)).join("/")}`;
}

function cosSignature(method, key, expiresIn = 3600) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const signTime = `${nowSeconds};${nowSeconds + expiresIn}`;
  const host = new URL(COS_PUBLIC_BASE).host;
  const objectPath = cosObjectPath(key);
  const httpString = [
    method.toLowerCase(),
    objectPath,
    "",
    `host=${host}\n`,
    ""
  ].join("\n");
  const stringToSign = ["sha1", signTime, sha1(httpString), ""].join("\n");
  const signKey = hmacSha1(COS_SECRET_KEY, signTime);
  const signature = hmacSha1(signKey, stringToSign);
  return {
    host,
    objectPath,
    authorization: [
      "q-sign-algorithm=sha1",
      `q-ak=${COS_SECRET_ID}`,
      `q-sign-time=${signTime}`,
      `q-key-time=${signTime}`,
      "q-header-list=host",
      "q-url-param-list=",
      `q-signature=${signature}`
    ].join("&")
  };
}

function uploadToCos(key, filePath, mimeType) {
  const signature = cosSignature("PUT", key, 3600);
  const stat = fs.statSync(filePath);
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: "PUT",
      hostname: signature.host,
      path: signature.objectPath,
      headers: {
        Authorization: signature.authorization,
        Host: signature.host,
        "Content-Type": mimeType || "application/octet-stream",
        "Content-Length": stat.size
      }
    }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
          return;
        }
        reject(new Error(`COS upload failed ${res.statusCode}: ${Buffer.concat(chunks).toString("utf8").slice(0, 300)}`));
      });
    });
    req.on("error", reject);
    fs.createReadStream(filePath).pipe(req);
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
