const sqlite3 = require("sqlite3");

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
  return new Promise((resolve, reject) => db.close((error) => {
    error ? reject(error) : resolve();
  }));
}

function createTransactionConnection(db) {
  const filename = db.filename;
  if (typeof filename !== "string" || filename === ":memory:" || filename.includes("mode=memory")) {
    return { connection: db, ownsConnection: false };
  }

  const connection = new sqlite3.Database(filename);
  connection.configure("busyTimeout", 5000);
  return { connection, ownsConnection: true };
}

async function withTransaction(db, work) {
  const { connection, ownsConnection } = createTransactionConnection(db);
  let transactionStarted = false;
  try {
    if (ownsConnection) await run(connection, "PRAGMA foreign_keys = ON");
    await run(connection, "BEGIN IMMEDIATE");
    transactionStarted = true;
    const result = await work(connection);
    await run(connection, "COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await run(connection, "ROLLBACK");
      } catch (rollbackError) {
        console.error("데이터베이스 롤백 실패:", rollbackError.message);
      }
    }
    throw error;
  } finally {
    if (ownsConnection) {
      try {
        await close(connection);
      } catch (closeError) {
        console.error("트랜잭션 연결 종료 실패:", closeError.message);
      }
    }
  }
}

module.exports = { all, get, run, withTransaction };
