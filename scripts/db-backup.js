const fs = require("fs");
const path = require("path");
const { dbPath } = require("../lib/sqlite-store");

const source = dbPath();
if (!fs.existsSync(source)) {
  console.error(`SQLite database not found: ${source}`);
  process.exit(1);
}

const backupDir = process.env.BACKUP_DIR || (process.env.NODE_ENV === "production" ? "/home/ubuntu/d_major_backups" : path.join(__dirname, "..", "backups"));
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
const target = path.join(backupDir, `dmajor-${stamp}.sqlite`);
fs.copyFileSync(source, target);

const uploadDir = process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/home/ubuntu/d_major_uploads" : path.join(__dirname, "..", "uploads"));
if (fs.existsSync(uploadDir)) {
  const uploadTarget = path.join(backupDir, `uploads-${stamp}`);
  fs.cpSync(uploadDir, uploadTarget, { recursive: true });
  console.log(`Uploads backup created: ${uploadTarget}`);
}

console.log(`SQLite backup created: ${target}`);
