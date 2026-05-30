const fs = require("fs");
const path = require("path");

const migration = path.join(__dirname, "db-migrate.js");

console.log("SQLite migration command:");
console.log(migration);
console.log("");
console.log("Run:");
console.log("npm run db:migrate");

if (!fs.existsSync(migration)) {
  process.exitCode = 1;
}
