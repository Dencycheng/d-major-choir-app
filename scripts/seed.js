const fs = require("fs");
const path = require("path");

const seed = path.join(__dirname, "..", "db", "seeds", "001_trial_seed.sql");

console.log("Seed file prepared:");
console.log(seed);
console.log("");
console.log("Run against production PostgreSQL with:");
console.log('psql "$DATABASE_URL" -f db/seeds/001_trial_seed.sql');

if (!fs.existsSync(seed)) {
  process.exitCode = 1;
}
