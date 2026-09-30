const assert = require("node:assert/strict");
const { test } = require("node:test");

let security = {};
try {
  security = require("../auth/security");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

test("scrypt 비밀번호 해시는 매번 달라도 맞는 비밀번호만 통과한다", async () => {
  assert.equal(typeof security.hashPassword, "function", "hashPassword 함수를 제공해야 합니다.");
  assert.equal(typeof security.verifyPassword, "function", "verifyPassword 함수를 제공해야 합니다.");

  const first = await security.hashPassword("safe-password-123");
  const second = await security.hashPassword("safe-password-123");

  assert.notEqual(first, second);
  assert.equal(await security.verifyPassword("safe-password-123", first), true);
  assert.equal(await security.verifyPassword("wrong-password", first), false);
  assert.equal(await security.verifyPassword("safe-password-123", "invalid-hash"), false);
});

test("세션 토큰은 충분히 무작위이고 저장용 해시는 토큰 원문과 다르다", () => {
  assert.equal(typeof security.createOpaqueToken, "function", "createOpaqueToken 함수를 제공해야 합니다.");
  assert.equal(typeof security.hashToken, "function", "hashToken 함수를 제공해야 합니다.");

  const token = security.createOpaqueToken();
  const tokenHash = security.hashToken(token);

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(token, tokenHash);
  assert.notEqual(token, security.createOpaqueToken());
});

test("세션 쿠키는 보안 속성을 갖고 쿠키 헤더를 안전하게 읽는다", () => {
  assert.equal(typeof security.sessionCookie, "function", "sessionCookie 함수를 제공해야 합니다.");
  assert.equal(typeof security.parseCookies, "function", "parseCookies 함수를 제공해야 합니다.");

  const cookie = security.sessionCookie("opaque-token", { secure: true, maxAge: 3600 });
  assert.match(cookie, /^bcm_session=opaque-token;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=3600/);
  assert.deepEqual(
    { ...security.parseCookies("other=1; bcm_session=opaque%2Dtoken; next=2") },
    { other: "1", bcm_session: "opaque-token", next: "2" }
  );
});
