const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const sqlite3 = require("sqlite3");
const { initializeSchema } = require("../database/schema");
const { run, get } = require("../database/operations");
const security = require("../auth/security");

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function withPausedLogin(work) {
  const db = new sqlite3.Database(":memory:");
  const verified = deferred();
  const resume = deferred();
  let pauseNextLogin = true;
  const routes = new Map();
  const app = Object.fromEntries(["get", "post", "patch"].map((method) => [method,
    (url, handler) => routes.set(`${method.toUpperCase()} ${url}`, handler)
  ]));
  const filename = path.join(__dirname, "../auth/routes.js");
  const realRequire = createRequire(filename);
  const context = {
    module: { exports: {} }, Buffer, URL, console,
    require(name) {
      if (name !== "./security") return realRequire(name);
      return {
        ...security,
        async verifyPassword(password, hash) {
          const matches = await security.verifyPassword(password, hash);
          if (pauseNextLogin && matches) {
            pauseNextLogin = false;
            verified.resolve();
            await resume.promise;
          }
          return matches;
        }
      };
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  const request = async (method, url, body = {}, user = null) => {
    const result = { status: 200, headers: {} };
    const res = {
      status(code) { result.status = code; return this; },
      setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
      json(value) { result.body = value; return this; }
    };
    await routes.get(`${method} ${url}`)({ headers: { origin: "http://race.test" }, body, user }, res);
    return result;
  };
  const email = "race@example.test";
  let pendingLogin;
  try {
    await initializeSchema(db);
    await run(db, "INSERT INTO users (id, display_name, email, password_hash, email_verified_at) VALUES (1, ?, ?, ?, ?)",
      ["테스트", email, await security.hashPassword("old-password"), new Date().toISOString()]);
    context.module.exports.registerAuthRoutes(app, { db, appBaseUrl: "http://race.test", sendMail: async () => {} });
    pendingLogin = request("POST", "/api/auth/login", { email, password: "old-password" });
    await verified.promise;
    await work({ db, request, email, release: resume.resolve, pendingLogin });
  } finally {
    resume.resolve();
    await pendingLogin;
    await new Promise((resolve) => db.close(resolve));
  }
}

for (const scenario of ["분실 비밀번호 재설정", "로그인 상태의 비밀번호 변경"]) {
  test(`${scenario} 완료 후 늦게 끝난 이전 비밀번호 로그인은 세션·쿠키를 발급하지 않는다`, async () => {
    await withPausedLogin(async ({ db, request, email, release, pendingLogin }) => {
      if (scenario === "분실 비밀번호 재설정") {
        const token = security.createOpaqueToken();
        await run(db, "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, 1, ?)",
          [security.hashToken(token), new Date(Date.now() + 60000).toISOString()]);
        assert.equal((await request("POST", "/api/auth/password-reset/complete", {
          token, newPassword: "new-password"
        })).status, 200);
      } else {
        assert.equal((await request("PATCH", "/api/auth/password", {
          currentPassword: "old-password", newPassword: "new-password"
        }, { id: 1, email })).status, 200);
      }
      const sessionsAfterChange = (await get(db, "SELECT COUNT(*) AS count FROM sessions")).count;
      release();
      const stale = await pendingLogin;
      assert.equal(stale.status, 401);
      assert.equal(stale.headers["set-cookie"], undefined);
      assert.equal((await get(db, "SELECT COUNT(*) AS count FROM sessions")).count, sessionsAfterChange);
      const current = await request("POST", "/api/auth/login", { email, password: "new-password" });
      assert.equal(current.status, 200);
      assert.ok(current.headers["set-cookie"]);
      assert.equal((await request("POST", "/api/auth/login", { email, password: "old-password" })).status, 401);
    });
  });
}

for (const scenario of ["인증 해제", "계정 삭제"]) {
  test(`로그인 검증 도중 ${scenario} 시에도 세션을 발급하지 않는다`, async () => {
    await withPausedLogin(async ({ db, release, pendingLogin }) => {
      await run(db, scenario === "계정 삭제" ? "DELETE FROM users WHERE id = 1" : "UPDATE users SET email_verified_at = NULL WHERE id = 1");
      release();
      const result = await pendingLogin;
      assert.equal(result.status, 401);
      assert.equal(result.headers["set-cookie"], undefined);
      assert.equal((await get(db, "SELECT COUNT(*) AS count FROM sessions")).count, 0);
    });
  });
}
