const fs = require("fs");
const path = require("path");

const seed = path.join(__dirname, "migrate-db-json.js");

console.log("SQLite seed/import command:");
console.log(seed);
console.log("");
console.log("Run:");
console.log("npm run db:migrate-json");

if (!fs.existsSync(seed)) {
  process.exitCode = 1;
}
