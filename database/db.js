const sqlite3 = require('sqlite3').verbose(); 

const db = new sqlite3.Database("./database/businesscard.db", (err) => {
  if(err){
    console.error(err.message);
  }else{
    console.log("SQLite connected");
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
    fax TEXT,
    email TEXT,
    address TEXT,
    website TEXT,
    other_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;