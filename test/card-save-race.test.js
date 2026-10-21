const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../public/js/cardManagement.js"), "utf8");
const saveSource = source.slice(source.indexOf("async function saveCardEdits(form)"), source.indexOf("async function deleteCurrentCard()"));
const busySource = source.slice(source.indexOf("function setEditorBusy("), source.indexOf("function setDetailStatus("));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const first = deferred();
  const calls = [];
  const controls = [{ disabled: false }];
  const status = { textContent: "" };
  const form = {
    querySelectorAll: () => controls,
    querySelector: () => status
  };
  let currentForm = form;
  const state = { shown: [], closed: 0, loads: 0, confirms: 0 };
  const context = vm.createContext({
    activeCardId: 1,
    console: { error() {} },
    FormData: class { get(name) { return name === "name" ? "A 수정" : ""; } },
    getActiveCard: () => ({ id: context.activeCardId, image_path: "/uploads/a.jpg" }),
    canEditCard: () => true,
    detailModal: { open: true },
    detailContent: { contains: (element) => element === currentForm },
    requestCardUpdate: async (id, payload, force) => {
      calls.push({ id, payload, force });
      if (calls.length === 1) await first.promise;
    },
    loadCards: async () => { state.loads += 1; },
    showCardDetail: () => { state.shown.push(context.activeCardId); currentForm = null; },
    closeCardDetail: () => { state.closed += 1; context.activeCardId = null; context.detailModal.open = false; },
    window: { confirm: () => { state.confirms += 1; return true; } }
  });
  vm.runInContext(`${busySource}\n${saveSource}`, context);
  return {
    context, first, calls, form, controls, status, state,
    switchTo(id) { context.activeCardId = id; currentForm = {}; },
    close() { context.activeCardId = null; context.detailModal.open = false; },
    save: () => context.saveCardEdits(form)
  };
}

test("A 저장 중 B를 열면 중복 응답으로 B에 재저장하거나 확인창을 띄우지 않는다", async () => {
  const h = harness();
  const saving = h.save();
  h.switchTo(2);
  h.first.reject(Object.assign(new Error("중복"), { status: 409 }));
  await saving;
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].id, 1);
  assert.equal(h.state.confirms, 0);
  assert.equal(h.context.activeCardId, 2);
  assert.equal(h.controls[0].disabled, false);
});

for (const mode of ["다른 명함", "모달 닫기", "같은 명함 다시 열기", "네이티브 모달 닫기"]) {
  test(`A 저장 완료 전에 ${mode}: 현재 편집 화면을 덮어쓰지 않는다`, async () => {
    const h = harness();
    const saving = h.save();
    if (mode === "모달 닫기") h.close();
    else if (mode === "네이티브 모달 닫기") h.context.detailModal.open = false;
    else h.switchTo(mode === "다른 명함" ? 2 : 1);
    const expectedId = h.context.activeCardId;
    h.first.resolve();
    await saving;
    assert.deepEqual(h.state.shown, []);
    assert.equal(h.state.closed, 0);
    assert.equal(h.context.activeCardId, expectedId);
    assert.equal(h.state.loads, 1);
    assert.equal(h.controls[0].disabled, false);
  });
}

for (const id of [1, 2]) {
  test(`저장 후 목록 로딩 중 명함 ${id} 편집기를 새로 열어도 화면을 유지한다`, async () => {
    const h = harness();
    const loading = deferred();
    const started = deferred();
    h.context.loadCards = async () => { started.resolve(); await loading.promise; };
    const saving = h.save();
    h.first.resolve();
    await started.promise;
    h.switchTo(id);
    loading.resolve();
    await saving;
    assert.equal(h.context.activeCardId, id);
    assert.deepEqual(h.state.shown, []);
    assert.equal(h.controls[0].disabled, false);
  });
}

test("화면 전환 없는 일반 저장은 목록과 상세를 갱신한다", async () => {
  const h = harness();
  const saving = h.save();
  h.first.resolve();
  await saving;
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.state.shown, [1]);
  assert.equal(h.state.loads, 1);
  assert.equal(h.controls[0].disabled, false);
});

test("현재 A 편집기를 유지하면 중복 승인 재시도와 상세 갱신은 정상 동작한다", async () => {
  const h = harness();
  const saving = h.save();
  h.first.reject(Object.assign(new Error("중복"), { status: 409 }));
  await saving;
  assert.deepEqual(h.calls.map(({ id, force }) => [id, force]), [[1, undefined], [1, true]]);
  assert.deepEqual(h.state.shown, [1]);
  assert.equal(h.state.loads, 1);
  assert.equal(h.controls[0].disabled, false);
});

test("동일 편집기의 저장 실패는 폼을 다시 활성화하고 오류를 유지한다", async () => {
  const h = harness();
  const saving = h.save();
  h.first.reject(new Error("저장 실패"));
  await saving;
  assert.equal(h.controls[0].disabled, false);
  assert.equal(h.status.textContent, "저장 실패");
  assert.equal(h.state.loads, 0);
});
