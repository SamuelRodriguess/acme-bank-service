const sqlite3 = require("sqlite3");
const database = new sqlite3.Database("./db/bank_sample.db");

module.exports = database;