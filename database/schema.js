const CARD_COLUMNS = [
  ["company", "TEXT"],
  ["department", "TEXT"],
  ["position", "TEXT"],
  ["mobile", "TEXT"],
  ["phone", "TEXT"],
  ["email", "TEXT"],
  ["address", "TEXT"],
  ["website", "TEXT"],
  ["image_path", "TEXT"],
  ["logo_path", "TEXT"],
  ["group_name", "TEXT"],
  ["meeting_date", "TEXT"],
  ["meeting_place", "TEXT"],
  ["meeting_purpose", "TEXT"],
  ["meeting_note", "TEXT"],
  ["tags", "TEXT NOT NULL DEFAULT '[]'"],
  ["is_favorite", "INTEGER NOT NULL DEFAULT 0"],
  ["deleted_at", "TEXT"],
  ["created_by", "INTEGER"]
];

function exec(db, sql) {
  return new Promise((resolve, reject) => db.exec(sql, (error) => {
    error ? reject(error) : resolve();
  }));
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => {
    error ? reject(error) : resolve(rows);
  }));
}

function run(db, sql) {
  return new Promise((resolve, reject) => db.run(sql, (error) => {
    error ? reject(error) : resolve();
  }));
}

async function ensureCardColumns(db) {
  const columns = new Set((await all(db, "PRAGMA table_info(business_cards)")).map((column) => column.name));
  for (const [name, definition] of CARD_COLUMNS) {
    if (!columns.has(name)) {
      await run(db, `ALTER TABLE business_cards ADD COLUMN ${name} ${definition}`);
    }
  }
}

async function initializeSchema(db) {
  await run(db, "PRAGMA foreign_keys = ON");
  await exec(db, `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      email_verified_at TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);

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
      logo_path TEXT,
      group_name TEXT,
      meeting_date TEXT,
      meeting_place TEXT,
      meeting_purpose TEXT,
      meeting_note TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      created_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS card_favorites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_id INTEGER NOT NULL REFERENCES business_cards(id) ON DELETE CASCADE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, card_id)
    );

    CREATE TABLE IF NOT EXISTS user_card_groups (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_id INTEGER NOT NULL REFERENCES business_cards(id) ON DELETE CASCADE,
      group_name TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, card_id)
    );
  `);

  await ensureCardColumns(db);
}

module.exports = { initializeSchema };
