const { applyMigrations, applyBaseSeed, dbPath } = require("../lib/sqlite-store");

applyMigrations();
applyBaseSeed();
console.log(`SQLite migrations applied: ${dbPath()}`);
