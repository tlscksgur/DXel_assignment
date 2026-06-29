const sqlite3 = require('sqlite3').verbose(); 

const db = new sqlite3.Database("./database/businesscard.db", (err) => {
  if(err) {
    console.error("DB 연결 실패:", err.message);
  } else {
    console.log("SQLite DB 연결 성공");
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS business_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    company TEXT,
    department TEXT,
    position TEXT,
    mobile TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    website TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;