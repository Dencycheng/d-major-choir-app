const fs = require("fs");
const path = require("path");
const { dbPath } = require("../lib/sqlite-store");

const source = dbPath();
if (!fs.existsSync(source)) {
  console.error(`SQLite database not found: ${source}`);
  process.exit(1);
}

const backupDir = path.join(__dirname, "..", "backups");
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
const target = path.join(backupDir, `dmajor-${stamp}.sqlite`);
fs.copyFileSync(source, target);
console.log(`Backup created: ${target}`);
