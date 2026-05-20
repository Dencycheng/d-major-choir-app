const fs = require("fs");
const path = require("path");
const { applyMigrations, applyBaseSeed, readStore, writeStore, dbPath } = require("../lib/sqlite-store");

const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "data", "db.json");

if (!fs.existsSync(jsonPath)) {
  console.log("data/db.json not found, nothing to migrate.");
  process.exit(0);
}

applyMigrations();
applyBaseSeed();

const existing = readStore();
if (existing.members.length || existing.works.length || existing.events.length) {
  console.log(`SQLite already has data, migration skipped to avoid overwriting real data: ${dbPath()}`);
  process.exit(0);
}

const source = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
source.fileAssets ||= [];
source.profileChangeRequests ||= [];
source.leaveRequests ||= [];
source.members = (source.members || []).map(member => ({
  ...member,
  nickname: member.nickname || member.name,
  email: member.email || "",
  mobile: member.mobile || "",
  note: member.note || "",
  managedSections: member.role === "声部长" ? [member.section].filter(Boolean) : []
}));
source.sections = (source.sections || []).map((section, index) => ({ ...section, sortOrder: index + 1 }));

writeStore({
  ...source,
  roles: existing.roles,
  permissions: existing.permissions,
  rolePermissions: existing.rolePermissions
});

console.log(`Migrated data/db.json to SQLite: ${dbPath()}`);
