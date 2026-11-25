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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT, created_by INTEGER,
      visibility TEXT NOT NULL DEFAULT 'shared'
    )
  `, (error) => error ? reject(error) : resolve()));
  const routes = new Map();
  let listenCalls = 0;
  const app = {
    use() {}, listen() { listenCalls += 1; return { on() {} }; },
    get(url, handler) { routes.set(`GET ${url}`, handler); },
    post(url, ...handlers) { routes.set(`POST ${url}`, handlers.at(-1)); },
    patch(url, ...handlers) { routes.set(`PATCH ${url}`, handlers.at(-1)); },
    put(url, ...handlers) { routes.set(`PUT ${url}`, handlers.at(-1)); },
    delete(url, ...handlers) { routes.set(`DELETE ${url}`, handlers.at(-1)); }
  };
  const express = Object.assign(() => app, { json: () => () => {}, static: () => () => {} });
  const upload = { single: () => () => {} };
  const localAi = {
    extractBusinessCard() {}, verifyCriticalFields() {}, imageToDataUrl() {}, parseModelJson: JSON.parse,
    analyzeLogoOrientation: async () => localAi.orientationResponse,
    checkCardCrop: async () => localAi.cropResponse,
    locateCardBounds: async () => {
      localAi.locateCalls = (localAi.locateCalls || 0) + 1;
      if (localAi.locateResponse instanceof Error) throw localAi.locateResponse;
      return localAi.locateResponse;
    }
  };
  const source = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const context = {
    require(name) {
      if (name === "dotenv") return { config() {} };
      if (name === "express") return express;
      if (name === "./database/db") return db;
      if (name === "./database/operations") return require(path.join(root, "database/operations"));
      if (name === "./auth/routes") return require(path.join(root, "auth/routes"));
      if (name === "./auth/card-access") return require(path.join(root, "auth/card-access"));
      if (name === "./auth/mailer") return { createSmtpMailer: () => null };
      if (name === "./upload") return { UPLOAD_DIR: uploads, upload };
      if (name === "./localAi") return localAi;
      if (name === "./logoOrientation") return require("../logoOrientation");
      if (name === "./deployment") return require("../deployment");
      return require(name);
    },
    console, process, fetch, AbortSignal, Buffer, setTimeout, clearTimeout,
    setInterval: () => ({ unref() {} })
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
      dir, uploads, request, card, get, exec, runCode, localAi,
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

test("명함 크롭 안전 여백은 0.8%이며 이미지 경계를 넘지 않는다", async () => {
  await isolatedServer(async ({ runCode }) => {
    const crop = runCode("normalizeCropBounds({x:100,y:100,width:800,height:800})");
    assert.equal(crop.x, 0.092);
    assert.equal(crop.y, 0.092);
    assert.equal(crop.width, 0.816);
    const edge = runCode("normalizeCropBounds({x:0,y:0,width:1000,height:1000})");
    assert.equal(edge.x, 0);
    assert.equal(edge.width, 1);
  });
});

test("로고 방향 확인 API는 문자 각도를 반환하고 임시 파일을 정리한다", async () => {
  await isolatedServer(async ({ request, uploads, localAi }) => {
    localAi.orientationResponse = { choices: [{ message: { content: JSON.stringify({ has_text: true, clockwise_rotation: -45, confidence: 0.95 }) } }] };
    const filePath = path.join(uploads, "orientation.png");
    fs.writeFileSync(filePath, "test");
    const result = await request("POST", "/api/cards/logo-orientation", {}, {}, { path: filePath });
    assert.equal(result.status, 200);
    assert.equal(result.body.rotation, -45);
    // res.json보다 finally의 비동기 삭제가 늦게 끝날 수 있다.
    for (let n = 0; n < 20 && fs.existsSync(filePath); n++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(fs.existsSync(filePath), false);
  });
});

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

test("범위를 벗어난 좌표만 다시 묻고, 그래도 틀리면 크롭과 로고를 건너뛴다", async () => {
  await isolatedServer(async ({ runCode, localAi }) => {
    const ensure = (parsed) => {
      localAi.lastParsed = parsed;
      return runCode(`ensureBoundsInRange(${JSON.stringify(parsed)}, "image")`);
    };
    const answer = (value) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
    const inRange = { x: 40, y: 100, width: 900, height: 700 };
    const pixels = { x: 130, y: 240, width: 1450, height: 880 };
    const noLogo = { x: 0, y: 0, width: 0, height: 0 };

    const good = await ensure({ name: "유지", crop_bounds: inRange, logo_bounds: noLogo });
    assert.equal(localAi.locateCalls || 0, 0);
    assert.equal(good.crop_bounds.width, 900);

    localAi.locateResponse = answer({ crop_bounds: inRange, logo_bounds: noLogo });
    const fixed = await ensure({ name: "유지", crop_bounds: pixels, logo_bounds: noLogo });
    assert.equal(localAi.locateCalls, 1);
    assert.equal(fixed.name, "유지");
    assert.equal(fixed.crop_bounds.width, 900);

    localAi.locateResponse = answer({ crop_bounds: pixels, logo_bounds: noLogo });
    const stillWrong = await ensure({ name: "유지", crop_bounds: pixels, logo_bounds: noLogo });
    assert.equal(stillWrong.crop_bounds, null);
    assert.equal(stillWrong.logo_bounds, null);
    assert.equal(runCode("normalizeCropBounds(null)"), null);

    localAi.locateResponse = new Error("AI 오류");
    const failed = await ensure({ name: "유지", crop_bounds: inRange, logo_bounds: pixels });
    assert.equal(failed.crop_bounds, null);
  });
});

test("크롭 확인 API는 AI 판정을 돌려주고 임시 파일을 지운다", async () => {
  await isolatedServer(async ({ request, uploads, localAi }) => {
    for (const [isComplete, expected] of [[true, true], [false, false], ["true", false]]) {
      localAi.cropResponse = { choices: [{ message: { content: JSON.stringify({ is_complete: isComplete }) } }] };
      const filePath = path.join(uploads, "crop-check.jpg");
      fs.writeFileSync(filePath, "test");
      const result = await request("POST", "/api/cards/crop-check", {}, {}, { path: filePath });
      assert.equal(result.status, 200);
      assert.equal(result.body.isComplete, expected);
      for (let i = 0; i < 50 && fs.existsSync(filePath); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(fs.existsSync(filePath), false);
    }
    localAi.cropResponse = { choices: [{ message: {} }] };
    const filePath = path.join(uploads, "crop-check.jpg");
    fs.writeFileSync(filePath, "test");
    assert.equal((await request("POST", "/api/cards/crop-check", {}, {}, { path: filePath })).status, 502);
  });
});

test("파일 불러오기는 선택한 저장 범위로 저장하고 잘못된 범위는 거부한다", async () => {
  await isolatedServer(async ({ request, get }) => {
    const user = { id: 7 };
    const cards = [{ name: "개인 주소록" }];
    const imported = await request("POST", "/api/cards/import", { cards, visibility: "private" }, {}, undefined, user);
    assert.equal(imported.status, 201);
    assert.equal((await get("SELECT visibility FROM business_cards WHERE id = ?", [imported.body.savedIds[0]])).visibility, "private");
    const rejected = await request("POST", "/api/cards/import", { cards, visibility: "public" }, {}, undefined, user);
    assert.equal(rejected.status, 400);
  });
});

test("미저장 정리는 이 서버가 받은 하루 지난 미참조 파일만 지운다", async () => {
  await isolatedServer(async ({ uploads, card, runCode }) => {
    const stale = "stale.jpg";
    const saved = "saved.jpg";
    const recent = "recent.jpg";
    // DB에 참조가 없어도 이 서버가 받지 않은 파일은 절대 지우면 안 된다(다른 DB로 켠 서버의 전체 삭제 방지).
    const notMine = "not-mine.jpg";
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    for (const name of [stale, saved, recent, notMine]) {
      const file = path.join(uploads, name);
      fs.writeFileSync(file, "x");
      if (name !== recent) fs.utimesSync(file, old, old);
    }
    for (const name of [stale, saved, recent, "already-gone.jpg"]) runCode(`rememberPendingUpload("${name}", 7)`);
    await card("저장됨", `/uploads/${saved}`);
    await runCode("removeOrphanUploads()");
    assert.deepEqual(fs.readdirSync(uploads).sort(), [saved, recent, notMine].sort());
    assert.equal(runCode('pendingUploads.has("recent.jpg")'), true);
    assert.equal(runCode('pendingUploads.has("already-gone.jpg")'), false);
  });
});

test("병합으로 사라진 명함의 사진은 지우고 대표 명함의 사진은 남긴다", async () => {
  await isolatedServer(async ({ uploads, card, request }) => {
    const kept = "kept.jpg";
    const removed = "removed.jpg";
    for (const name of [kept, removed]) fs.writeFileSync(path.join(uploads, name), "x");
    const older = await card("예전", `/uploads/${removed}`);
    const newer = await card("최신", `/uploads/${kept}`);
    const result = await request("POST", "/api/cards/merge-group", { cardIds: [older, newer] }, {}, undefined, { id: 7 });
    assert.equal(result.status, 200);
    assert.deepEqual(fs.readdirSync(uploads), [kept]);
  });
});

test("한글·영문 병기 이름은 추출과 저장에서 한글만 유지하고 외국 이름은 보존한다", async () => {
  await isolatedServer(async ({ runCode, request, get }) => {
    const cases = [
      ["김승현 Seunghyeon Kim", "김승현"],
      ["Seunghyeon Kim (김승현)", "김승현"],
      ["김 승 현 / SEUNGHYEON KIM", "김 승 현"],
      ["김승현\nSeunghyeon Kim", "김승현"],
      ["김승현", "김승현"],
      ["Markus Bursäter", "Markus Bursäter"],
      ["李小明", "李小明"]
    ];
    for (const [input, expected] of cases) {
      for (const fn of ["makeCard", "sanitizeExtractedCard"]) {
        assert.equal(runCode(`${fn}({name: ${JSON.stringify(input)}}).name`), expected, `${fn}: ${input}`);
      }
    }
    const saved = await request("POST", "/api/cards", { name: cases[0][0] }, {}, undefined, { id: 7 });
    assert.equal(saved.status, 201);
    assert.equal((await get("SELECT name FROM business_cards WHERE id = ?", [saved.body.id])).name, "김승현");
  });
});

test("기존에 병기된 이름도 응답에서는 한글만 표시하고 원본 DB와 ID를 유지한다", async () => {
  await isolatedServer(async ({ runCode, card, get }) => {
    const name = "김승현 Seunghyeon Kim";
    const id = await card(name);
    const response = runCode(`cardForResponse({ id: ${id}, name: ${JSON.stringify(name)}, display_number: 3 })`);
    assert.equal(response.name, "김승현");
    assert.equal(response.id, id);
    assert.equal(response.display_number, 3);
    assert.equal((await get("SELECT name FROM business_cards WHERE id = ?", [id])).name, name);
  });
});

test("기존 병기 이름과 새 한글 이름도 같은 회사이면 중복으로 감지한다", async () => {
  await isolatedServer(async ({ request, card, exec }) => {
    const id = await card("김승현 Seunghyeon Kim");
    await exec("UPDATE business_cards SET company = ? WHERE id = ?", ["SAIGE", id]);
    const duplicate = await request("POST", "/api/cards", { name: "김승현", company: "SAIGE" }, {}, undefined, { id: 7 });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.duplicates[0].id, id);
    assert.equal(duplicate.body.duplicates[0].name, "김승현");
  });
});

test("중복 판정은 휴대폰이나 이름+회사로 찾고 조회 순서를 유지하며 불러오는 중 추가한 명함도 찾는다", async () => {
  await isolatedServer(async ({ runCode }) => {
    const ids = (card) => JSON.parse(runCode(`JSON.stringify(finder.find(${JSON.stringify(card)}).map((row) => row.id))`));
    runCode(`var finder = createDuplicateFinder([
      { id: 9, name: "김승현", company: "SAIGE", mobile: "010-1111-2222" },
      { id: 5, name: "이영희", company: "DXEL", mobile: "+82 10-3333-4444 / 010-5555-6666" },
      { id: 2, name: "김승현 Seunghyeon Kim", company: "SAIGE", mobile: "" },
      { id: 1, name: null, company: null, mobile: null }
    ])`);

    assert.deepEqual(ids({ name: "김승현", company: "SAIGE" }), [9, 2]);
    assert.deepEqual(ids({ mobile: "01055556666" }), [5]);
    assert.deepEqual(ids({ mobile: "01033334444", name: "김승현", company: "SAIGE" }), [9, 5, 2]);
    // 이름만 또는 회사만 같으면 다른 사람이고, 빈 값끼리는 중복이 아니다.
    assert.deepEqual(ids({ name: "김승현", company: "DXEL" }), []);
    assert.deepEqual(ids({ name: "", company: "", mobile: "" }), []);

    runCode(`finder.add({ id: 11, name: "박민수", company: "NEW", mobile: "010-7777-8888" })`);
    assert.deepEqual(ids({ mobile: "010-7777-8888" }), [11]);
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

test("cropped upload rejects an untracked originalPath without deleting its file", async () => {
  await isolatedServer(async ({ uploads, request }) => {
    const original = path.join(uploads, "other.png");
    const cropped = path.join(uploads, "crop.png");
    fs.writeFileSync(original, "other image");
    fs.writeFileSync(cropped, "cropped image");
    const result = await request("POST", "/api/cards/cropped-image", { originalPath: "/uploads/other.png" }, {}, {
      path: cropped, filename: "crop.png", originalname: "crop.png", size: 13
    }, { id: 7 });
    assert.equal(result.status, 403);
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
    runCode("rememberCropSource('pending.png', 7)");
    const result = await request("POST", "/api/cards/cropped-image", { originalPath: "/uploads/pending.png" }, {}, {
      path: cropped, filename: "crop.png", originalname: "crop.png", size: 13
    }, { id: 7 });
    assert.equal(result.status, 200);
    assert.equal(fs.existsSync(original), false);
    assert.equal(fs.existsSync(cropped), true);
  });
});

test("명함 분석 실패 시 업로드된 원본 파일을 정리한다", async () => {
  await isolatedServer(async ({ uploads, request }) => {
    const uploaded = path.join(uploads, "analysis-failed.png");
    fs.writeFileSync(uploaded, "uploaded image");

    const result = await request("POST", "/api/cards/extract", {}, {}, {
      path: uploaded, filename: "analysis-failed.png", originalname: "card.png", size: 14
    }, { id: 7 });

    assert.equal(result.status, 502);
    assert.equal(fs.existsSync(uploaded), false);
  });
});

test("명함 등록 전 취소할 때 본인 소유의 미저장 업로드만 정리한다", async () => {
  await isolatedServer(async ({ uploads, request }) => {
    const uploaded = path.join(uploads, "owned-logo.jpg");
    fs.writeFileSync(uploaded, "logo image");
    const uploadResult = await request("POST", "/api/cards/logo-image", {}, {}, {
      path: uploaded, filename: "owned-logo.jpg", originalname: "logo.jpg", size: 10
    }, { id: 7 });

    const cleanup = await request("POST", "/api/cards/uploads/cleanup", {
      paths: [uploadResult.body.file.path]
    }, {}, undefined, { id: 7 });

    assert.equal(cleanup.status, 200);
    assert.equal(cleanup.body.deletedCount, 1);
    assert.equal(fs.existsSync(uploaded), false);
  });
});

test("명함 저장 후에는 업로드 파일의 임시 소유 추적을 해제한다", async () => {
  await isolatedServer(async ({ uploads, request, runCode }) => {
    const uploaded = path.join(uploads, "saved-logo.jpg");
    fs.writeFileSync(uploaded, "logo image");
    const logo = await request("POST", "/api/cards/logo-image", {}, {}, {
      path: uploaded, filename: "saved-logo.jpg", originalname: "logo.jpg", size: 10
    }, { id: 7 });

    const saved = await request("POST", "/api/cards", {
      name: "저장된 명함", logo_path: logo.body.file.path
    }, {}, undefined, { id: 7 });

    assert.equal(saved.status, 201);
    assert.equal(runCode("pendingUploads.has('saved-logo.jpg')"), false);
    assert.equal(fs.existsSync(uploaded), true);
  });
});

test("업로드 정리는 다른 사용자 파일과 이미 명함에 저장된 파일을 보존한다", async () => {
  await isolatedServer(async ({ uploads, request, card }) => {
    const ownedFile = path.join(uploads, "another-users-logo.jpg");
    const savedFile = path.join(uploads, "saved-logo.jpg");
    fs.writeFileSync(ownedFile, "other user logo");
    fs.writeFileSync(savedFile, "saved logo");
    await request("POST", "/api/cards/logo-image", {}, {}, {
      path: ownedFile, filename: "another-users-logo.jpg", originalname: "logo.jpg", size: 16
    }, { id: 7 });
    const savedUpload = await request("POST", "/api/cards/logo-image", {}, {}, {
      path: savedFile, filename: "saved-logo.jpg", originalname: "saved.jpg", size: 10
    }, { id: 8 });
    await card("Saved card", "", savedUpload.body.file.path);

    const otherUserCleanup = await request("POST", "/api/cards/uploads/cleanup", {
      paths: ["/uploads/another-users-logo.jpg"]
    }, {}, undefined, { id: 8 });
    const referencedCleanup = await request("POST", "/api/cards/uploads/cleanup", {
      paths: [savedUpload.body.file.path]
    }, {}, undefined, { id: 8 });

    assert.equal(otherUserCleanup.status, 200);
    assert.equal(otherUserCleanup.body.deletedCount, 0);
    assert.equal(referencedCleanup.status, 200);
    assert.equal(referencedCleanup.body.deletedCount, 0);
    assert.equal(fs.existsSync(ownedFile), true);
    assert.equal(fs.existsSync(savedFile), true);
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
    }, {}, undefined, { id: 1 });
    assert.equal(result.status, 500);
    assert.equal((await get("SELECT COUNT(*) AS count FROM business_cards")).count, 0);
  });
});
