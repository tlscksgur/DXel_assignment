const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const sqlite3 = require("sqlite3");
const { test } = require("node:test");

const root = path.join(__dirname, "..");

async function isolatedServer(run, { deferDatabaseReady = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcm-integrity-"));
  const uploads = path.join(dir, "uploads");
  fs.mkdirSync(uploads);
  const db = new sqlite3.Database(path.join(dir, "cards.db"));
  let finishDatabaseReady;
  db.ready = deferDatabaseReady
    ? new Promise((resolve) => { finishDatabaseReady = resolve; })
    : Promise.resolve();
  await new Promise((resolve, reject) => db.exec(`
    CREATE TABLE business_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, company TEXT, department TEXT,
      position TEXT, mobile TEXT, phone TEXT, email TEXT, address TEXT, website TEXT,
      image_path TEXT, logo_path TEXT, group_name TEXT, meeting_date TEXT,
      meeting_place TEXT, meeting_purpose TEXT, meeting_note TEXT,
      tags TEXT NOT NULL DEFAULT '[]', is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT, created_by INTEGER
    )
  `, (error) => error ? reject(error) : resolve()));
  const routes = new Map();
  let listenCalls = 0;
  const app = {
    use() {}, listen() { listenCalls += 1; return { on() {} }; },
    get(url, handler) { routes.set(`GET ${url}`, handler); },
    post(url, ...handlers) { routes.set(`POST ${url}`, handlers.at(-1)); },
    patch(url, handler) { routes.set(`PATCH ${url}`, handler); },
    put(url, handler) { routes.set(`PUT ${url}`, handler); },
    delete(url, handler) { routes.set(`DELETE ${url}`, handler); }
  };
  const express = Object.assign(() => app, { json: () => () => {}, static: () => () => {} });
  const upload = { single: () => () => {} };
  const localAi = {
    extractBusinessCard() {}, verifyCriticalFields() {}, imageToDataUrl() {}, parseModelJson() {}
  };
  const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const context = {
    require(name) {
      if (name === "dotenv") return { config() {} };
      if (name === "express") return express;
      if (name === "./database/db") return db;
      if (name === "./auth/routes") return require(path.join(root, "auth/routes"));
      if (name === "./auth/card-access") return require(path.join(root, "auth/card-access"));
      if (name === "./auth/mailer") return { createSmtpMailer: () => null };
      if (name === "./upload") return { UPLOAD_DIR: uploads, upload };
      if (name === "./localAi") return localAi;
      return require(name);
    },
    console, process, fetch, AbortSignal, Buffer, setTimeout, clearTimeout
  };
  vm.runInNewContext(source, context, { filename: "server.js" });
  const request = (method, url, body = {}, params = {}, file, user = null) => new Promise((resolve, reject) => {
    const handler = routes.get(`${method} ${url}`);
    if (!handler) return reject(new Error(`Missing route ${method} ${url}`));
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { resolve({ status: this.statusCode, body: value }); return this; }
    };
    try { handler({ body, params, file, user }, res); } catch (error) { reject(error); }
  });
  const exec = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (error) { error ? reject(error) : resolve(this); });
  });
  const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
  const card = async (name, imagePath = "", logoPath = "") => {
    const result = await exec("INSERT INTO business_cards (name, company, image_path, logo_path) VALUES (?, ?, ?, ?)", [name, `Company ${name}`, imagePath, logoPath]);
    return result.lastID;
  };
  const runCode = (code) => vm.runInContext(code, context);
  try {
    await run({
      dir, uploads, request, card, get, exec, runCode,
      getListenCalls: () => listenCalls,
      finishDatabaseReady: () => finishDatabaseReady?.()
    });
  }
  finally {
    finishDatabaseReady?.();
    await new Promise((resolve) => db.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("HTTP 서버는 DB 스키마 초기화가 끝난 뒤에만 요청을 받는다", async () => {
  await isolatedServer(async ({ getListenCalls, finishDatabaseReady }) => {
    assert.equal(getListenCalls(), 0);
    finishDatabaseReady();
    await new Promise(setImmediate);
    assert.equal(getListenCalls(), 1);
  }, { deferDatabaseReady: true });
});

test("일반 등록과 파일 불러오기는 로그인 계정을 등록자로 저장한다", async () => {
  await isolatedServer(async ({ request, get }) => {
    const user = { id: 7 };
    const single = await request("POST", "/api/cards", { name: "직접 등록" }, {}, undefined, user);
    const imported = await request("POST", "/api/cards/import", {
      cards: [{ name: "파일 등록" }]
    }, {}, undefined, user);

    assert.equal(single.status, 201);
    assert.equal(imported.status, 201);
    assert.equal((await get("SELECT created_by FROM business_cards WHERE id = ?", [single.body.id])).created_by, 7);
    assert.equal((await get("SELECT created_by FROM business_cards WHERE id = ?", [imported.body.savedIds[0]])).created_by, 7);
  });
});

test("bulk group and trash reject missing ids without changing valid cards", async () => {
  await isolatedServer(async ({ request, card, get }) => {
    const id = await card("A");
    assert.equal((await request("PATCH", "/api/cards/groups", { cardIds: [id, id + 999], groupName: "Test" })).status, 404);
    assert.equal((await get("SELECT group_name FROM business_cards WHERE id = ?", [id])).group_name, null);
    assert.equal((await request("POST", "/api/cards/bulk-delete", { cardIds: [id, id + 999] })).status, 404);
    assert.equal((await get("SELECT deleted_at FROM business_cards WHERE id = ?", [id])).deleted_at, null);
  });
});

test("bulk restore and permanent deletion reject missing ids without changing valid cards", async () => {
  await isolatedServer(async ({ request, card, get }) => {
    const id = await card("A");
    assert.equal((await request("DELETE", "/api/cards/:id", {}, { id })).status, 200);
    assert.equal((await request("POST", "/api/cards/bulk-restore", { cardIds: [id, id + 999] })).status, 404);
    assert.ok((await get("SELECT deleted_at FROM business_cards WHERE id = ?", [id])).deleted_at);
    assert.equal((await request("POST", "/api/cards/bulk-permanent-delete", { cardIds: [id, id + 999] })).status, 404);
    assert.ok(await get("SELECT id FROM business_cards WHERE id = ?", [id]));
  });
});

test("cropped upload cannot delete an unrelated image named by originalPath", async () => {
  await isolatedServer(async ({ uploads, request }) => {
    const original = path.join(uploads, "other.png");
    const cropped = path.join(uploads, "crop.png");
    fs.writeFileSync(original, "other image");
    fs.writeFileSync(cropped, "cropped image");
    const result = await request("POST", "/api/cards/cropped-image", { originalPath: "/uploads/other.png" }, {}, {
      path: cropped, filename: "crop.png", originalname: "crop.png", size: 13
    });
    assert.equal(result.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(fs.readFileSync(original, "utf8"), "other image");
  });
});

test("a server-tracked extract can replace its own source image", async () => {
  await isolatedServer(async ({ uploads, request, runCode }) => {
    const original = path.join(uploads, "pending.png");
    const cropped = path.join(uploads, "crop.png");
    fs.writeFileSync(original, "original image");
    fs.writeFileSync(cropped, "cropped image");
    runCode("rememberCropSource('pending.png')");
    const result = await request("POST", "/api/cards/cropped-image", { originalPath: "/uploads/pending.png" }, {}, {
      path: cropped, filename: "crop.png", originalname: "crop.png", size: 13
    });
    assert.equal(result.status, 200);
    assert.equal(fs.existsSync(original), false);
    assert.equal(fs.existsSync(cropped), true);
  });
});

test("permanent deletion removes unreferenced images but keeps shared images", async () => {
  await isolatedServer(async ({ uploads, request, card }) => {
    const shared = path.join(uploads, "shared.png");
    const unique = path.join(uploads, "unique.png");
    fs.writeFileSync(shared, "shared");
    fs.writeFileSync(unique, "unique");
    const first = await card("A", "/uploads/shared.png", "/uploads/unique.png");
    const second = await card("B", "/uploads/shared.png");
    await request("DELETE", "/api/cards/:id", {}, { id: first });
    assert.equal((await request("DELETE", "/api/cards/:id/permanent", {}, { id: first })).status, 200);
    assert.equal(fs.existsSync(shared), true);
    assert.equal(fs.existsSync(unique), false);
    await request("DELETE", "/api/cards/:id", {}, { id: second });
    assert.equal((await request("POST", "/api/cards/bulk-permanent-delete", { cardIds: [second] })).status, 200);
    assert.equal(fs.existsSync(shared), false);
  });
});

test("failed merge transaction rolls back its representative update", async () => {
  await isolatedServer(async ({ request, card, get, exec }) => {
    const representativeId = await card("Original representative");
    const duplicateId = await card("Duplicate");
    await exec("UPDATE business_cards SET created_at = '2026-01-02 00:00:00' WHERE id = ?", [representativeId]);
    await exec("UPDATE business_cards SET created_at = '2026-01-01 00:00:00' WHERE id = ?", [duplicateId]);
    await exec(`CREATE TRIGGER reject_merge_delete BEFORE DELETE ON business_cards
      WHEN OLD.id = ${duplicateId} BEGIN SELECT RAISE(ABORT, 'forced failure'); END`);

    const result = await request("POST", "/api/cards/merge-group", { cardIds: [representativeId, duplicateId] });
    assert.equal(result.status, 500);
    assert.equal((await get("SELECT name FROM business_cards WHERE id = ?", [representativeId])).name, "Original representative");
    assert.ok(await get("SELECT id FROM business_cards WHERE id = ?", [duplicateId]));
  });
});

test("failed bulk import leaves no partially inserted cards", async () => {
  await isolatedServer(async ({ request, get, exec }) => {
    await exec(`CREATE TRIGGER reject_failed_import BEFORE INSERT ON business_cards
      WHEN NEW.name = 'Force failure' BEGIN SELECT RAISE(ABORT, 'forced failure'); END`);
    const result = await request("POST", "/api/cards/import", {
      cards: [
        { name: "First import", company: "Company A" },
        { name: "Force failure", company: "Company B" }
      ],
      duplicateAction: "add"
    });
    assert.equal(result.status, 500);
    assert.equal((await get("SELECT COUNT(*) AS count FROM business_cards")).count, 0);
  });
});
