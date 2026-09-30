const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3");
const { test } = require("node:test");
const { initializeSchema } = require("../database/schema");
const { hashPassword, hashToken, verifyPassword } = require("../auth/security");

let registerAuthRoutes;
let createSessionMiddleware;
let createPasswordResetService;
try {
  ({ registerAuthRoutes, createSessionMiddleware } = require("../auth/routes"));
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}
try {
  ({ createPasswordResetService } = require("../auth/password-reset"));
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

function close(db) {
  return new Promise((resolve, reject) => db.close(
    (error) => error ? reject(error) : resolve()));
}

function createRouteApp() {
  const routes = new Map();
  const addRoute = (method) => (url, handler) => routes.set(`${method} ${url}`, handler);
  const app = {
    get: addRoute("GET"),
    post: addRoute("POST"),
    patch: addRoute("PATCH")
  };

  app.request = async (method, url, { body = {}, query = {}, headers = {}, user = null } = {}) => {
    const handler = routes.get(`${method} ${url}`);
    assert.equal(typeof handler, "function", `누락된 경로: ${method} ${url}`);
    let result = { status: 200, body: null };
    const responseHeaders = {};
    const res = {
      status(status) { result.status = status; return this; },
      setHeader(name, value) { responseHeaders[name.toLowerCase()] = value; },
      json(value) { result.body = value; return this; }
    };
    const req = { body, query, headers, user };
    await handler(req, res);
    return { ...result, headers: responseHeaders };
  };

  return app;
}

async function withAuthApp(runTest) {
  assert.equal(typeof registerAuthRoutes, "function", "registerAuthRoutes 함수를 제공해야 합니다.");
  const db = new sqlite3.Database(":memory:");
  const mails = [];
  const app = createRouteApp();
  try {
    await initializeSchema(db);
    registerAuthRoutes(app, {
      db,
      appBaseUrl: "http://cards.test",
      secureCookie: false,
      now: () => new Date("2026-09-29T00:00:00.000Z"),
      sendMail: async (message) => { mails.push(message); }
    });
    await runTest({ app, db, mails });
  } finally {
    await close(db);
  }
}

test("가입은 표시 이름·이메일·비밀번호만 받아 정규화된 미인증 계정을 만든다", async () => {
  await withAuthApp(async ({ app, db, mails }) => {
    const result = await app.request("POST", "/api/auth/signup", {
      body: {
        displayName: "  김민수 ",
        email: " User@Example.com ",
        password: "safe-password-123",
        company: "무시할 회사"
      },
      headers: { origin: "http://cards.test", host: "cards.test" }
    });

    assert.equal(result.status, 201);
    const user = await get(db, "SELECT * FROM users WHERE email = ?", ["user@example.com"]);
    const token = new URL(mails[0].url).searchParams.get("token");
    const storedToken = await get(db, "SELECT token_hash FROM email_verification_tokens WHERE user_id = ?", [user.id]);

    assert.equal(user.display_name, "김민수");
    assert.equal(user.email_verified_at, null);
    assert.notEqual(user.password_hash, "safe-password-123");
    assert.equal(storedToken.token_hash, hashToken(token));
    assert.equal(result.headers["set-cookie"], undefined);
  });
});

test("이메일 인증 링크는 한 번만 사용해 계정을 활성화한다", async () => {
  await withAuthApp(async ({ app, db, mails }) => {
    await app.request("POST", "/api/auth/signup", {
      body: { displayName: "김민수", email: "user@example.com", password: "safe-password-123" },
      headers: { origin: "http://cards.test", host: "cards.test" }
    });
    const token = new URL(mails[0].url).searchParams.get("token");

    const request = { body: { token }, headers: { origin: "http://cards.test", host: "cards.test" } };
    const first = await app.request("POST", "/api/auth/verify", request);
    const user = await get(db, "SELECT email_verified_at FROM users WHERE email = ?", ["user@example.com"]);
    const repeated = await app.request("POST", "/api/auth/verify", request);

    assert.equal(first.status, 200);
    assert.ok(user.email_verified_at);
    assert.equal(repeated.status, 400);
  });
});

test("검증된 계정 로그인은 원문이 아닌 세션 토큰 해시를 저장하고 현재 사용자를 읽는다", async () => {
  await withAuthApp(async ({ app, db }) => {
    const passwordHash = await hashPassword("safe-password-123");
    await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["김민수", "user@example.com", passwordHash, "2026-09-28T00:00:00.000Z"]
    );

    const login = await app.request("POST", "/api/auth/login", {
      body: { email: " USER@EXAMPLE.COM ", password: "safe-password-123" },
      headers: { origin: "http://cards.test", host: "cards.test" }
    });
    const cookie = login.headers["set-cookie"];
    const rawToken = decodeURIComponent(cookie.match(/bcm_session=([^;]+)/)[1]);
    const storedSession = await get(db, "SELECT token_hash, user_id FROM sessions");
    const req = { headers: { cookie } };
    let continued = false;
    await createSessionMiddleware(db, { now: () => new Date("2026-09-29T00:00:00.000Z") })(
      req,
      {},
      () => { continued = true; }
    );
    const currentUser = await app.request("GET", "/api/auth/me", { user: req.user });

    assert.equal(login.status, 200);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.equal(storedSession.token_hash, hashToken(rawToken));
    assert.notEqual(storedSession.token_hash, rawToken);
    assert.equal(continued, true);
    assert.deepEqual(currentUser.body, {
      success: true,
      user: { id: storedSession.user_id, displayName: "김민수", email: "user@example.com" }
    });
  });
});

test("미인증 계정은 로그인할 수 없고, 세션 만료 후 사용자를 반환하지 않는다", async () => {
  await withAuthApp(async ({ app, db }) => {
    const passwordHash = await hashPassword("safe-password-123");
    const inserted = await run(db,
      "INSERT INTO users (display_name, email, password_hash) VALUES (?, ?, ?)",
      ["김민수", "user@example.com", passwordHash]
    );
    const login = await app.request("POST", "/api/auth/login", {
      body: { email: "user@example.com", password: "safe-password-123" },
      headers: { origin: "http://cards.test", host: "cards.test" }
    });
    const unknownEmail = await app.request("POST", "/api/auth/login", {
      body: { email: "missing@example.com", password: "safe-password-123" },
      headers: { origin: "http://cards.test", host: "cards.test" }
    });
    const expiredToken = "e".repeat(43);
    await run(db,
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      [hashToken(expiredToken), inserted.lastID, "2026-09-28T23:59:59.000Z"]
    );

    const req = { headers: { cookie: `bcm_session=${expiredToken}` } };
    await createSessionMiddleware(db, { now: () => new Date("2026-09-29T00:00:00.000Z") })(req, {}, () => {});

    assert.equal(login.status, 401);
    assert.deepEqual(login.body, unknownEmail.body);
    assert.equal(login.headers["set-cookie"], undefined);
    assert.equal(req.user, undefined);
    assert.equal(await get(db, "SELECT token_hash FROM sessions WHERE token_hash = ?", [hashToken(expiredToken)]), undefined);
  });
});

test("로그아웃은 현재 세션을 폐기하고 세션 쿠키를 지운다", async () => {
  await withAuthApp(async ({ app, db }) => {
    const passwordHash = await hashPassword("safe-password-123");
    await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["김민수", "user@example.com", passwordHash, "2026-09-28T00:00:00.000Z"]
    );
    const headers = { origin: "http://cards.test", host: "cards.test" };
    const login = await app.request("POST", "/api/auth/login", {
      body: { email: "user@example.com", password: "safe-password-123" },
      headers
    });
    const logout = await app.request("POST", "/api/auth/logout", {
      headers: { ...headers, cookie: login.headers["set-cookie"] }
    });

    assert.equal(logout.status, 200);
    assert.match(logout.headers["set-cookie"], /bcm_session=/);
    assert.match(logout.headers["set-cookie"], /Max-Age=0/);
    assert.equal(await get(db, "SELECT token_hash FROM sessions"), undefined);
  });
});

test("프로필 이름 변경은 로그인한 계정의 표시 이름만 갱신한다", async () => {
  await withAuthApp(async ({ app, db }) => {
    const passwordHash = await hashPassword("safe-password-123");
    const inserted = await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["김민수", "user@example.com", passwordHash, "2026-09-28T00:00:00.000Z"]
    );
    const result = await app.request("PATCH", "/api/auth/profile", {
      body: { displayName: "  김 민수  " },
      headers: { origin: "http://cards.test", host: "cards.test" },
      user: { id: inserted.lastID, displayName: "김민수", email: "user@example.com" }
    });
    const updated = await get(db, "SELECT display_name, email FROM users WHERE id = ?", [inserted.lastID]);

    assert.equal(result.status, 200);
    assert.deepEqual(updated, { display_name: "김 민수", email: "user@example.com" });
    assert.equal(result.body.user.displayName, "김 민수");
  });
});

test("비밀번호 변경은 현재 비밀번호를 확인하고 다른 세션을 폐기한다", async () => {
  await withAuthApp(async ({ app, db }) => {
    const passwordHash = await hashPassword("safe-password-123");
    const inserted = await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["김민수", "user@example.com", passwordHash, "2026-09-28T00:00:00.000Z"]
    );
    const oldTokens = ["a".repeat(43), "b".repeat(43)];
    for (const token of oldTokens) {
      await run(db,
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        [hashToken(token), inserted.lastID, "2026-10-06T00:00:00.000Z"]
      );
    }
    const request = {
      body: { currentPassword: "wrong-password", newPassword: "new-password-123" },
      headers: { origin: "http://cards.test", host: "cards.test", cookie: `bcm_session=${oldTokens[0]}` },
      user: { id: inserted.lastID, displayName: "김민수", email: "user@example.com" }
    };
    const rejected = await app.request("PATCH", "/api/auth/password", request);
    const afterRejected = await get(db, "SELECT password_hash FROM users WHERE id = ?", [inserted.lastID]);
    const updated = await app.request("PATCH", "/api/auth/password", {
      ...request,
      body: { currentPassword: "safe-password-123", newPassword: "new-password-123" }
    });
    const changed = await get(db, "SELECT password_hash FROM users WHERE id = ?", [inserted.lastID]);
    const currentSession = await get(db, "SELECT token_hash, user_id FROM sessions");
    const newToken = decodeURIComponent(updated.headers["set-cookie"].match(/bcm_session=([^;]+)/)[1]);

    assert.equal(rejected.status, 400);
    assert.equal(afterRejected.password_hash, passwordHash);
    assert.equal(updated.status, 200);
    assert.equal(await verifyPassword("new-password-123", changed.password_hash), true);
    assert.equal(currentSession.token_hash, hashToken(newToken));
    assert.equal(currentSession.user_id, inserted.lastID);
    assert.equal(await get(db, "SELECT token_hash FROM sessions WHERE token_hash = ?", [hashToken(oldTokens[1])]), undefined);
  });
});

test("분실 비밀번호 토큰은 해시로 저장되고 한 번 사용하면 세션과 함께 폐기된다", async () => {
  await withAuthApp(async ({ db, mails }) => {
    const passwordHash = await hashPassword("safe-password-123");
    const inserted = await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["김민수", "user@example.com", passwordHash, "2026-09-28T00:00:00.000Z"]
    );
    await run(db,
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
      [hashToken("c".repeat(43)), inserted.lastID, "2026-10-06T00:00:00.000Z"]
    );
    const service = createPasswordResetService({
      db,
      appBaseUrl: "http://cards.test",
      sendMail: async (message) => { mails.push(message); },
      now: () => new Date("2026-09-29T00:00:00.000Z")
    });

    await service.requestReset("missing@example.com");
    assert.equal(mails.length, 0);
    await service.requestReset(" USER@EXAMPLE.COM ");
    const token = new URL(mails[0].url).searchParams.get("token");
    const savedToken = await get(db, "SELECT token_hash FROM password_reset_tokens WHERE user_id = ?", [inserted.lastID]);
    const completed = await service.completeReset(token, "new-password-123");
    const replayed = await service.completeReset(token, "another-password-123");
    const updatedUser = await get(db, "SELECT password_hash FROM users WHERE id = ?", [inserted.lastID]);

    assert.equal(savedToken.token_hash, hashToken(token));
    assert.notEqual(savedToken.token_hash, token);
    assert.equal(completed, true);
    assert.equal(replayed, false);
    assert.equal(await verifyPassword("new-password-123", updatedUser.password_hash), true);
    assert.equal(await get(db, "SELECT token_hash FROM sessions WHERE user_id = ?", [inserted.lastID]), undefined);
  });
});

test("비밀번호 재설정 API는 이메일 존재 여부를 숨기고 링크로 새 비밀번호를 설정한다", async () => {
  await withAuthApp(async ({ app, db, mails }) => {
    const passwordHash = await hashPassword("safe-password-123");
    await run(db,
      "INSERT INTO users (display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?)",
      ["김민수", "user@example.com", passwordHash, "2026-09-28T00:00:00.000Z"]
    );
    const headers = { origin: "http://cards.test", host: "cards.test" };
    const unknown = await app.request("POST", "/api/auth/password-reset/request", {
      body: { email: "missing@example.com" }, headers
    });
    const known = await app.request("POST", "/api/auth/password-reset/request", {
      body: { email: "user@example.com" }, headers
    });
    const token = new URL(mails[0].url).searchParams.get("token");
    const completed = await app.request("POST", "/api/auth/password-reset/complete", {
      body: { token, newPassword: "new-password-123" }, headers
    });

    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.body, known.body);
    assert.equal(mails.length, 1);
    assert.equal(completed.status, 200);
  });
});
