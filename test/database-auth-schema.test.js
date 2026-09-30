const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3");
const { test } = require("node:test");

let initializeSchema;
try {
  ({ initializeSchema } = require("../database/schema"));
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) {
    error ? reject(error) : resolve(this);
  }));
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params,
    (error, row) => error ? reject(error) : resolve(row)));
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params,
    (error, rows) => error ? reject(error) : resolve(rows)));
}

function close(db) {
  return new Promise((resolve, reject) => db.close(
    (error) => error ? reject(error) : resolve()));
}

async function createLegacyBusinessCardsTable(db) {
  await run(db, `CREATE TABLE business_cards (
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
    deleted_at TEXT
  )`);
}

test("인증 스키마 초기화는 기존 명함을 보존하고 반복 실행할 수 있다", async () => {
  assert.equal(typeof initializeSchema, "function", "initializeSchema 함수를 내보내야 합니다.");

  const db = new sqlite3.Database(":memory:");
  try {
    await createLegacyBusinessCardsTable(db);
    await run(db, "INSERT INTO business_cards (name) VALUES (?)", ["테스트 명함"]);

    await initializeSchema(db);
    await initializeSchema(db);

    const card = await get(db, "SELECT name FROM business_cards WHERE id = 1");
    const columns = await all(db, "PRAGMA table_info(business_cards)");
    const tables = await all(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
    const tableNames = new Set(tables.map((table) => table.name));

    assert.equal(card.name, "테스트 명함");
    assert.ok(columns.some((column) => column.name === "created_by"));
    for (const tableName of [
      "users",
      "sessions",
      "email_verification_tokens",
      "password_reset_tokens",
      "card_favorites",
      "user_card_groups"
    ]) {
      assert.ok(tableNames.has(tableName), `누락된 테이블: ${tableName}`);
    }
  } finally {
    await close(db);
  }
});
