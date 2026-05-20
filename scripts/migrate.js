const fs = require("fs");
const path = require("path");

const migration = path.join(__dirname, "..", "db", "migrations", "001_init.sql");

console.log("Migration file prepared:");
console.log(migration);
console.log("");
console.log("Run against production PostgreSQL with:");
console.log('psql "$DATABASE_URL" -f db/migrations/001_init.sql');

if (!fs.existsSync(migration)) {
  process.exitCode = 1;
}
