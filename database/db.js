const sqlite3 = require("sqlite3").verbose();
const { initializeSchema } = require("./schema");

const db = new sqlite3.Database("./database/businesscard.db", (error) => {
  if (error) {
    console.error(error.message);
  } else {
    console.log("SQLite connected");
  }
});

db.ready = initializeSchema(db).catch((error) => {
  console.error("SQLite schema initialization failed:", error.message);
  throw error;
});

module.exports = db;
