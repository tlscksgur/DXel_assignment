const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const sqlite3 = require("sqlite3");
const { run } = require("../database/operations");
const { hashToken, createOpaqueToken } = require("../auth/security");

test("개인 명함은 등록자만 목록·중복·내보내기·이미지·변경 API에 접근한다", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "card-visibility-"));
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const imageName = `visibility-${path.basename(dir)}.png`;
  const imagePath = `/uploads/${imageName}`;
  const imageFile = path.join(__dirname, "../uploads", imageName);
  fs.writeFileSync(imageFile, Buffer.from("private-image-test"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NODE_ENV: "test",
      APP_BASE_URL: origin, DATABASE_PATH: path.join(dir, "test.db"), CARD_ADMIN_EMAIL: "admin@example.test" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let db;
  const tokens = new Map();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("테스트 서버 시작 시간 초과")), 8000);
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("Server running")) { clearTimeout(timer); resolve(); }
      });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("테스트 서버 조기 종료")); });
    });
    db = new sqlite3.Database(path.join(dir, "test.db"));
    for (const [id, email] of [[1, "owner@example.test"], [2, "other@example.test"], [3, "admin@example.test"]]) {
      await run(db, "INSERT INTO users (id, display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, 'unused', CURRENT_TIMESTAMP)", [id, `사용자 ${id}`, email]);
      tokens.set(id, createOpaqueToken());
      await run(db, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [hashToken(tokens.get(id)), id, new Date(Date.now() + 3600000).toISOString()]);
    }
    async function request(user, route, method = "GET", body) {
      const response = await fetch(`${origin}${route}`, { method,
        headers: { Origin: origin, Cookie: `bcm_session=${tokens.get(user)}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = raw; }
      return { status: response.status, data };
    }
    const saved = await request(1, "/api/cards", "POST", { name: "개인테스트", company: "비공개회사", visibility: "private", image_path: imagePath });
    assert.equal(saved.status, 201);
    const id = saved.data.id;
    const shared = await request(1, "/api/cards", "POST", { name: "공유테스트" });
    assert.equal(shared.status, 201);
    assert.equal((await request(1, `/api/cards/${id}`)).data.card.visibility, "private");
    assert.equal((await request(1, imagePath)).status, 200);
    assert.equal((await request(1, "/api/cards")).data.cards.length, 2);
    for (const user of [2, 3]) {
      for (const route of ["/api/cards", "/api/cardSelect", "/api/cards?trash=1", "/api/cards?q=개인테스트"]) {
        const result = await request(user, route);
        assert.equal(result.status, 200);
        assert.ok(result.data.cards.every((card) => card.id !== id), route);
      }
      assert.equal((await request(user, `/api/cards/${id}`)).status, 404);
      assert.equal((await request(user, imagePath)).status, 404);
      assert.equal((await request(user, imagePath.replace("visibility", "%76isibility"))).status, 404);
      for (const format of ["csv", "vcard"]) {
        const exported = await request(user, `/api/cards/export/${format}?ids=${id},${shared.data.id}`);
        assert.equal(exported.status, 200);
        assert.ok(!exported.data.includes("개인테스트"));
      }
      assert.deepEqual((await request(user, "/api/cards/duplicates?name=개인테스트&company=비공개회사")).data.duplicates, []);
      const preview = await request(user, "/api/cards/import/preview", "POST", { cards: [{ name: "개인테스트", company: "비공개회사" }] });
      assert.deepEqual(preview.data.cards[0].duplicateIds, []);
      for (const [route, method, body] of [
        [`/api/cards/${id}/favorite`, "PATCH", { isFavorite: true }],
        ["/api/cards/groups", "PATCH", { cardIds: [id], groupName: "침입" }],
        [`/api/cards/${id}`, "PUT", { name: "변경시도" }],
        [`/api/cards/%${id.toString().charCodeAt(0).toString(16)}`, "DELETE"],
        ["/api/cards/bulk-delete", "POST", { cardIds: [id] }],
        ["/api/cards/merge-group", "POST", { cardIds: [id, shared.data.id] }],
        ["/api/cards", "POST", { name: "이미지우회", imagePath }],
        ["/api/cards", "POST", { name: "이미지우회2", image_path: imagePath.replace("visibility", "%76isibility") }]
      ]) assert.equal((await request(user, route, method, body)).status, 404, `${user} ${method} ${route}`);
    }
    assert.equal((await request(1, "/api/cards/merge-group", "POST", { cardIds: [id, shared.data.id] })).status, 400);
    assert.equal((await request(1, "/api/cards", "POST", { name: "잘못된범위", visibility: "public" })).status, 400);
    assert.equal((await request(2, "/api/cards", "POST", { name: "개인테스트", company: "비공개회사" })).status, 201);
    assert.equal((await request(1, `/api/cards/${id}`, "DELETE")).status, 200);
    assert.equal((await request(3, "/api/cards?trash=1")).data.cards.length, 0);
    assert.equal((await request(3, `/api/cards/${id}/restore`, "PATCH")).status, 404);
    assert.equal((await request(1, `/api/cards/${id}/restore`, "PATCH")).status, 200);
  } finally {
    if (db) await new Promise((resolve) => db.close(resolve));
    const exited = once(child, "exit");
    if (child.exitCode === null) { child.kill(); await exited; }
    fs.rmSync(imageFile, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
