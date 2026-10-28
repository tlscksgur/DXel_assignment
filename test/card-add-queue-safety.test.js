const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../public/js/cardAdd.js"), "utf8");

function createApp(fetch = async () => ({ ok: true, json: async () => ({}) })) {
  const elements = new Map();
  const events = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const listeners = new Map();
      elements.set(selector, {
        value: "", innerHTML: "", disabled: false, textContent: "", hidden: false,
        style: { setProperty() {} },
        setAttribute() {},
        classList: { toggle() {} },
        addEventListener(name, callback) { listeners.set(name, callback); },
        listeners
      });
      events.set(selector, listeners);
    }
    return elements.get(selector);
  }
  const context = vm.createContext({
    document: { querySelector: element, querySelectorAll: (selector) => selector === ".saveVisibilityToggle"
      ? [element(".saveVisibilityDesktop"), element(".saveVisibilityMobile button")]
      : selector === ".saveVisibilityHint" ? [element(".saveVisibilityHint")] : [] },
    fetch,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    FormData: class { append() {} },
    alert() {}, confirm: () => true,
    console: { error() {}, warn() {} }, setTimeout, clearTimeout
  });
  vm.runInContext(source, context);
  const run = (code) => vm.runInContext(code, context);
  const item = (id) => ({
    id, file: { name: `${id}.jpg` }, previewUrl: `blob:${id}`,
    status: "ready", imagePath: `/uploads/${id}.jpg`, logoPath: "",
    logoPreviewUrl: "", extracted: { name: id }, tags: [], analysisDurationMs: 100
  });
  context.testItems = [item("first"), item("second"), item("third")];
  return { element, events, run, item };
}

test("저장 범위 선택은 PC·모바일이 동기화되고 자동 저장 전체에 적용된다", async () => {
  const saved = [];
  let complete;
  const app = createApp((_url, options) => {
    saved.push(JSON.parse(options.body));
    if (saved.length === 1) return new Promise((resolve) => { complete = resolve; });
    return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
  });
  assert.equal(app.run("saveVisibility"), "shared");
  app.events.get(".saveVisibilityDesktop").get("click")();
  assert.equal(app.element(".saveVisibilityMobile button").textContent, "개인 저장");
  app.run("uploadQueue = testItems");
  await app.run("activateQueueItem(0)");
  const saving = app.events.get(".autoSaveToggle").get("click")();
  assert.equal(app.element(".saveVisibilityDesktop").disabled, true);
  app.events.get(".saveVisibilityMobile button").get("click")();
  assert.equal(app.run("saveVisibility"), "private");
  complete({ ok: true, status: 201, json: async () => ({}) });
  await saving;
  assert.deepEqual(saved.map((card) => card.visibility), ["private", "private", "private"]);
  assert.equal(app.element(".saveVisibilityDesktop").disabled, false);
  app.events.get(".saveVisibilityMobile button").get("click")();
  assert.equal(app.element(".saveVisibilityDesktop").textContent, "전체 공유");
});

test("대기열에서 다른 명함을 봤다가 돌아와도 수정한 입력을 유지한다", async () => {
  const app = createApp();
  app.run("uploadQueue = [testItems[0], testItems[1]]");
  await app.run("activateQueueItem(0)");
  app.element("#name").value = "수정한 이름";
  app.element("#homepage").value = "https://edited.example";
  await app.run("activateQueueItem(1)");
  await app.run("activateQueueItem(0)");
  assert.equal(app.element("#name").value, "수정한 이름");
  assert.equal(app.element("#homepage").value, "https://edited.example");
});

test("저장 요청 중에는 대기열 이동·건너뛰기·취소가 제출 대상을 바꾸지 않는다", async () => {
  let completeRequest;
  const fetch = () => new Promise((resolve) => { completeRequest = resolve; });
  const app = createApp(fetch);
  app.run("uploadQueue = [testItems[0], testItems[1]]");
  await app.run("activateQueueItem(0)");
  const save = app.events.get(".mainAction").get("click")();
  await app.events.get(".queueBox").get("click")({ target: { closest: () => ({ dataset: { queueIndex: "1" } }) } });
  await app.events.get(".subAction").get("click")();
  await app.events.get(".ghostAction").get("click")();
  assert.equal(app.run("currentQueueIndex"), 0);
  assert.equal(app.run("uploadQueue[0].status"), "ready");
  completeRequest({ ok: true, status: 201, json: async () => ({ success: true }) });
  await save;
  assert.equal(app.run("uploadQueue[0].status"), "saved");
  assert.equal(app.run("uploadQueue[1].status"), "ready");
});

test("저장 실패 후에는 같은 명함을 다시 수정하고 저장할 수 있다", async () => {
  const app = createApp(async () => ({
    ok: false, status: 500, json: async () => ({ message: "저장 실패" })
  }));
  app.run("uploadQueue = [testItems[0]]");
  await app.run("activateQueueItem(0)");
  await app.events.get(".mainAction").get("click")();
  assert.equal(app.run("isSaving"), false);
  assert.equal(app.run("uploadQueue[0].status"), "ready");
  assert.equal(app.element(".mainAction").disabled, false);
});

test("마지막 명함에서 다음으로 가면 앞쪽의 미처리 명함으로 순환한다", async () => {
  const app = createApp();
  app.run("uploadQueue = [testItems[0], testItems[1], testItems[2]]");
  app.run("uploadQueue[1].status = 'saved'");
  await app.run("activateQueueItem(2)");
  await app.run("moveToNextCard()");
  assert.equal(app.run("currentQueueIndex"), 0);
});

test("자동 저장은 추출된 명함을 순서대로 한 번씩 저장하고 완료된다", async () => {
  const names = [];
  const app = createApp(async (_url, options) => {
    names.push(JSON.parse(options.body).name);
    return { ok: true, status: 201, json: async () => ({}) };
  });
  app.run("uploadQueue = testItems");
  await app.run("activateQueueItem(0)");
  await app.events.get(".autoSaveToggle").get("click")();
  assert.deepEqual(names, ["first", "second", "third"]);
  assert.equal(app.run("uploadQueue.every(item => item.status === 'saved')"), true);
  assert.equal(app.run("autoSaveEnabled"), false);
  assert.equal(app.run("currentQueueIndex"), -1);
});

test("업로드 전에 켠 자동 저장은 다음 명함 분석 후에도 계속된다", async () => {
  let saves = 0;
  const app = createApp(async () => {
    saves++;
    return { ok: true, status: 201, json: async () => ({}) };
  });
  await app.events.get(".autoSaveToggle").get("click")();
  app.run(`uploadQueue = testItems; uploadQueue.forEach(item => item.status = 'waiting');
    analyzeCurrentCard = async () => {
      const item = uploadQueue[currentQueueIndex];
      item.status = 'ready'; showQueueItem(item);
    };`);
  await app.run("activateQueueItem(0)");
  assert.equal(saves, 3);
  assert.equal(app.run("autoSaveEnabled"), false);
});

for (const status of [409, 500]) {
  test(`자동 저장에서 ${status} 응답은 현재 명함을 보존하고 다음 처리를 멈춘다`, async () => {
    let calls = 0;
    const app = createApp(async () => {
      calls++;
      return { ok: false, status, json: async () => ({ message: "확인 필요", duplicates: [{}] }) };
    });
    app.run("uploadQueue = testItems");
    await app.run("activateQueueItem(0)");
    await app.events.get(".autoSaveToggle").get("click")();
    assert.equal(calls, 1);
    assert.equal(app.run("autoSaveEnabled"), false);
    assert.equal(app.run("currentQueueIndex"), 0);
    assert.equal(app.run("uploadQueue[0].status"), "ready");
    assert.equal(app.element(".mainAction").disabled, false);
  });
}

test("추출 실패 시 자동 저장을 끄고 실패한 명함에서 멈춘다", async () => {
  let saves = 0;
  const app = createApp(async () => { saves++; });
  app.run(`uploadQueue = testItems; uploadQueue[0].status = 'waiting';
    requestCardAnalysis = async () => { throw new Error('AI 연결 실패'); };
    setAutoSave(true);`);
  await app.run("activateQueueItem(0)");
  assert.equal(saves, 0);
  assert.equal(app.run("autoSaveEnabled"), false);
  assert.equal(app.run("uploadQueue[0].status"), "error");
  assert.equal(app.run("currentQueueIndex"), 0);
});

test("저장 중 자동 저장 끄기는 현재 요청만 완료하며 다시 켜도 이중 저장하지 않는다", async () => {
  let resolveSave;
  let calls = 0;
  const app = createApp(() => {
    calls++;
    return new Promise(resolve => { resolveSave = resolve; });
  });
  app.run("uploadQueue = [testItems[0], testItems[1]]");
  await app.run("activateQueueItem(0)");
  const start = app.events.get(".autoSaveToggle").get("click")();
  await app.events.get(".autoSaveToggle").get("click")();
  resolveSave({ ok: true, status: 201, json: async () => ({}) });
  await start;
  assert.equal(calls, 1);
  assert.equal(app.run("uploadQueue[0].status"), "saved");
  assert.equal(app.run("uploadQueue[1].status"), "ready");
  const restart = app.events.get(".autoSaveToggle").get("click")();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  resolveSave({ ok: true, status: 201, json: async () => ({}) });
  await restart;
  assert.equal(app.run("uploadQueue.every(item => item.status === 'saved')"), true);
});
