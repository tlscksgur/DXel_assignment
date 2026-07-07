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
    email TEXT,
    address TEXT,
    website TEXT,
    image_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.all("PRAGMA table_info(business_cards)", (err, columns) => {
  if (err) {
    console.error(err.message);
    return;
  }

  const columnNames = columns.map((column) => column.name);
  const requiredColumns = ["image_path"];

  requiredColumns.forEach((column) => {
    if (!columnNames.includes(column)) {
      db.run(`ALTER TABLE business_cards ADD COLUMN ${column} TEXT`);
    }
  });
});

module.exports = db;
