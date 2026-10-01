const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3");
const { test } = require("node:test");
const { initializeSchema } = require("../database/schema");
const { createCardAccessMiddleware } = require("../auth/card-access");

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) {
    error ? reject(error) : resolve(this);
  }));
}

function close(db) {
  return new Promise((resolve, reject) => db.close(
    (error) => error ? reject(error) : resolve()));
}

async function withAccess(runTest) {
  const db = new sqlite3.Database(":memory:");
  try {
    await initializeSchema(db);
    const middleware = createCardAccessMiddleware(db, { appBaseUrl: "http://cards.test" });
    await runTest({ db, middleware });
  } finally {
    await close(db);
  }
}

async function request(middleware, method, path, {
  user = null, body = {}, query = {}, origin = "http://cards.test", host = new URL(origin).host,
  protocol = new URL(origin).protocol.slice(0, -1)
} = {}) {
  const req = { method, path, user, body, query, protocol, headers: { origin, host } };
  const result = { status: 200, continued: false, body: null };
  const res = {
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; }
  };
  await middleware(req, res, (error) => {
    if (error) throw error;
    result.continued = true;
  });
  return result;
}

test("비로그인 사용자는 활성 명함을 조회할 수 있지만 변경·휴지통·내보내기는 거부된다", async () => {
  await withAccess(async ({ middleware }) => {
    for (const path of ["/api/cards", "/api/cards/3", "/api/cardSelect", "/api/cards/duplicates"]) {
      assert.equal((await request(middleware, "GET", path)).continued, true, path);
    }
    for (const [method, path] of [
      ["POST", "/api/cards"],
      ["POST", "/api/cardStorage"],
      ["POST", "/api/cards/extract"],
      ["PATCH", "/api/cards/3/tags"],
      ["GET", "/api/cards/export/csv"],
      ["GET", "/api/cards/groups"],
      ["GET", "/api/cards"]
    ]) {
      const query = method === "GET" && path === "/api/cards" ? { trash: "1" } : {};
      const result = await request(middleware, method, path, { query });
      assert.equal(result.status, 401, `${method} ${path}`);
      assert.equal(result.continued, false);
    }
  });
});

test("명함 본문 변경은 등록자만 가능하고 개인 즐겨찾기·그룹 지정은 다른 명함에도 가능하다", async () => {
  await withAccess(async ({ db, middleware }) => {
    const owner = await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["등록자", "owner@example.com", "test-hash", "2026-09-29T00:00:00.000Z"]
    );
    const viewer = await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["다른 사용자", "viewer@example.com", "test-hash", "2026-09-29T00:00:00.000Z"]
    );
    const ownCard = await run(db, "INSERT INTO business_cards (name, created_by) VALUES (?, ?)", ["내 명함", owner.lastID]);
    const otherCard = await run(db, "INSERT INTO business_cards (name, created_by) VALUES (?, ?)", ["남의 명함", viewer.lastID]);
    const legacyCard = await run(db, "INSERT INTO business_cards (name) VALUES (?)", ["기존 테스트 명함"]);
    const user = { id: owner.lastID };

    assert.equal((await request(middleware, "PUT", `/api/cards/${ownCard.lastID}`, { user })).continued, true);
    assert.equal((await request(middleware, "PUT", `/api/cards/${otherCard.lastID}`, { user })).status, 403);
    assert.equal((await request(middleware, "DELETE", `/api/cards/${legacyCard.lastID}`, { user })).status, 403);
    assert.equal((await request(middleware, "PATCH", `/api/cards/${otherCard.lastID}/tags`, { user })).status, 403);
    assert.equal((await request(middleware, "PATCH", `/api/cards/${otherCard.lastID}/favorite`, { user })).continued, true);
    assert.equal((await request(middleware, "PATCH", "/api/cards/groups", {
      user, body: { cardIds: [otherCard.lastID], groupName: "내 그룹" }
    })).continued, true);
  });
});

test("일괄 변경은 타인의 명함이 섞이면 시작하지 않고 요청 출처도 확인한다", async () => {
  await withAccess(async ({ db, middleware }) => {
    const owner = await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["등록자", "owner@example.com", "test-hash", "2026-09-29T00:00:00.000Z"]
    );
    const other = await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["다른 사용자", "other@example.com", "test-hash", "2026-09-29T00:00:00.000Z"]
    );
    const ownCard = await run(db, "INSERT INTO business_cards (name, created_by) VALUES (?, ?)", ["내 명함", owner.lastID]);
    const otherCard = await run(db, "INSERT INTO business_cards (name, created_by) VALUES (?, ?)", ["남의 명함", other.lastID]);
    const user = { id: owner.lastID };
    const mixedIds = { cardIds: [ownCard.lastID, otherCard.lastID] };

    assert.equal((await request(middleware, "POST", "/api/cards/bulk-delete", { user, body: mixedIds })).status, 403);
    assert.equal((await request(middleware, "POST", "/api/cards/merge-group", { user, body: mixedIds })).status, 403);
    assert.equal((await request(middleware, "POST", "/api/cards/bulk-delete", {
      user, body: { cardIds: [ownCard.lastID] }
    })).continued, true);
    assert.equal((await request(middleware, "POST", "/api/cards", { user, origin: "https://elsewhere.test" })).status, 403);
  });
});

test("개발 중에는 접속 주소가 달라도 현재 페이지와 같은 출처의 추출 요청을 허용한다", async () => {
  const db = new sqlite3.Database(":memory:");
  try {
    await initializeSchema(db);
    const middleware = createCardAccessMiddleware(db, {
      appBaseUrl: "http://192.168.210.76:3000",
      allowRequestOrigin: true
    });

    const localRequest = await request(middleware, "POST", "/api/cards/extract", {
      user: { id: 1 },
      origin: "http://localhost:3000"
    });
    const forgedRequest = await request(middleware, "POST", "/api/cards/extract", {
      user: { id: 1 },
      origin: "http://attacker.test",
      host: "localhost:3000"
    });

    assert.equal(localRequest.continued, true);
    assert.equal(forgedRequest.status, 403);
  } finally {
    await close(db);
  }
});

test("운영에서는 설정된 APP_BASE_URL과 다른 출처를 허용하지 않는다", async () => {
  const db = new sqlite3.Database(":memory:");
  try {
    await initializeSchema(db);
    const middleware = createCardAccessMiddleware(db, {
      appBaseUrl: "https://cards.example.com",
      allowRequestOrigin: false
    });

    const configuredRequest = await request(middleware, "POST", "/api/cards/extract", {
      user: { id: 1 },
      origin: "https://cards.example.com"
    });
    const alternateRequest = await request(middleware, "POST", "/api/cards/extract", {
      user: { id: 1 },
      origin: "http://localhost:3000"
    });

    assert.equal(configuredRequest.continued, true);
    assert.equal(alternateRequest.status, 403);
  } finally {
    await close(db);
  }
});
