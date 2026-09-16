const sqlite3 = require('sqlite3').verbose(); 

const db = new sqlite3.Database("./database/businesscard.db", (err) => {
  if(err){
    console.error(err.message);
  }else{
    console.log("SQLite connected");
  }
});

db.serialize(() => {
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
      group_name TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 기존에 만들어진 DB에도 그룹 열을 한 번만 추가한다.
  db.all("PRAGMA table_info(business_cards)", (error, columns) => {
    if (error) {
      console.error(error.message);
      return;
    }

    if (!columns.some((column) => column.name === "group_name")) {
      db.run("ALTER TABLE business_cards ADD COLUMN group_name TEXT", (alterError) => {
        if (alterError) {
          console.error(alterError.message);
        }
      });
    }

    if (!columns.some((column) => column.name === "is_favorite")) {
      db.run("ALTER TABLE business_cards ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0", (alterError) => {
        if (alterError) {
          console.error(alterError.message);
        }
      });
    }
  });
});

module.exports = db;
