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
        classList: { toggle() {} },
        addEventListener(name, callback) { listeners.set(name, callback); },
        listeners
      });
      events.set(selector, listeners);
    }
    return elements.get(selector);
  }
  const context = vm.createContext({
    document: { querySelector: element },
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
