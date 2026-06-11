#!/usr/bin/env node
/**
 * 初始化首个超级管理员（PRD V2.1 §4.3）
 * 从 .env / 环境变量读取 ADMIN_EMAIL / ADMIN_MOBILE / ADMIN_PASSWORD，
 * 创建 is_admin 用户并强制首次登录修改密码。
 * 用法：npm run create-admin
 */
const fs = require("fs");
const path = require("path");

// 轻量加载 .env（不引入依赖）
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const { applyMigrations, applyBaseSeed, openDatabase } = require("../lib/sqlite-store");
const auth = require("../lib/auth");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const mobile = (process.env.ADMIN_MOBILE || "").trim();
const password = process.env.ADMIN_PASSWORD || "";

if ((!email && !mobile) || !password) {
  console.error("请先在 .env 中配置 ADMIN_EMAIL（或 ADMIN_MOBILE）与 ADMIN_PASSWORD，再运行 npm run create-admin");
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_PASSWORD 长度至少 8 位");
  process.exit(1);
}

applyMigrations();
applyBaseSeed();
const db = openDatabase();

const existing = auth.getUserByIdentifier(db, email || mobile);
if (existing) {
  if (process.argv.includes("--reset-password")) {
    auth.setPassword(db, existing.id, password, { mustChange: true });
    auth.revokeUserSessions(db, existing.id);
    console.log(`已重置管理员密码：${email || mobile}（首次登录需修改密码，所有旧会话已失效）`);
    process.exit(0);
  }
  console.log(`管理员已存在：${email || mobile}。如需重置密码请运行：node scripts/create-admin.js --reset-password`);
  process.exit(0);
}

const user = auth.createUser(db, {
  name: "超级管理员",
  nickname: "超级管理员",
  email: email || null,
  mobile: mobile || null,
  passwordHash: auth.hashPassword(password),
  isAdmin: true,
  mustChangePassword: true
});

console.log("超级管理员创建成功：");
console.log(`  登录账号：${email || mobile}`);
console.log("  初始密码：来自 .env 的 ADMIN_PASSWORD（请勿提交 Git）");
console.log("  首次登录将强制修改密码。");
console.log(`  用户 ID：${user.id}`);
