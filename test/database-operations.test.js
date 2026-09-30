const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3");
const { test } = require("node:test");
const { all, get, run } = require("../database/operations");

test("공용 SQLite 작업 함수는 기존 콜백 결과를 Promise로 반환한다", async () => {
  const db = new sqlite3.Database(":memory:");

  try {
    await run(db, "CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT)");
    const inserted = await run(db, "INSERT INTO records (value) VALUES (?)", ["saved"]);

    assert.equal(inserted.lastID, 1);
    assert.equal(inserted.changes, 1);
    assert.deepEqual(await all(db, "SELECT value FROM records"), [{ value: "saved" }]);
    assert.deepEqual(await get(db, "SELECT value FROM records WHERE id = ?", [inserted.lastID]), { value: "saved" });
  } finally {
    await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
  }
});
