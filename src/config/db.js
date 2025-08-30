const sqlite3 = require("sqlite3");
const db = new sqlite3.Database("./db/bank_sample.db");
module.exports = db;
