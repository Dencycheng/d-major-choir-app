const fs = require("fs");
const path = require("path");
const { dbPath } = require("../lib/sqlite-store");

const sqliteBackup = process.argv[2];
const uploadsBackup = process.argv[3];

if (!sqliteBackup || !fs.existsSync(sqliteBackup)) {
  console.error("Usage: node scripts/db-restore.js /path/to/dmajor.sqlite [/path/to/uploads-backup-dir]");
  process.exit(1);
}

const targetDb = dbPath();
fs.mkdirSync(path.dirname(targetDb), { recursive: true });
fs.copyFileSync(sqliteBackup, targetDb);
console.log(`SQLite restored: ${targetDb}`);

if (uploadsBackup) {
  if (!fs.existsSync(uploadsBackup)) {
    console.error(`Uploads backup not found: ${uploadsBackup}`);
    process.exit(1);
  }
  const uploadDir = process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/home/ubuntu/d_major_uploads" : path.join(__dirname, "..", "uploads"));
  fs.rmSync(uploadDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(uploadDir), { recursive: true });
  fs.cpSync(uploadsBackup, uploadDir, { recursive: true });
  console.log(`Uploads restored: ${uploadDir}`);
}
