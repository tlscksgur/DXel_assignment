const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../public/js/cardManagement.js"), "utf8");
const deleteSource = source.slice(source.indexOf("async function deleteCurrentCard()"), source.indexOf("function openCardDetail("));

function harness() {
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const state = { deleted: [], statuses: [], closed: 0, loads: 0 };
  const context = vm.createContext({
    activeCardId: 1,
    console: { error() {} },
    getActiveCard: () => ({ id: 1, name: "A" }),
    canEditCard: () => true,
    window: { confirm: () => true },
    detailModal: { open: true },
    detailContent: { firstElementChild: {} },
    setDetailStatus: (message) => state.statuses.push(message),
    requestCardDelete: async (id) => { state.deleted.push(id); await pending; },
    closeCardDetail: () => { state.closed += 1; context.activeCardId = null; context.detailModal.open = false; },
    loadCards: async () => { state.loads += 1; }
  });
  vm.runInContext(deleteSource, context);
  return {
    context, state, resolve, reject,
    delete: () => context.deleteCurrentCard(),
    open(id) { context.activeCardId = id; context.detailModal.open = true; context.detailContent.firstElementChild = {}; }
  };
}

for (const id of [1, 2]) {
  test(`삭제 응답 전에 명함 ${id}을 새로 열면 현재 화면을 닫지 않는다`, async () => {
    const h = harness();
    const deletion = h.delete();
    h.open(id);
    h.resolve();
    await deletion;
    assert.deepEqual(h.state.deleted, [1]);
    assert.equal(h.state.closed, 0);
    assert.equal(h.context.activeCardId, id);
    assert.equal(h.state.loads, 1);
  });

  test(`삭제 실패가 새로 연 명함 ${id}의 상태 메시지를 바꾸지 않는다`, async () => {
    const h = harness();
    const deletion = h.delete();
    h.open(id);
    h.reject(new Error("삭제 실패"));
    await deletion;
    assert.equal(h.state.statuses.length, 1);
    assert.equal(h.state.loads, 0);
  });
}

test("삭제 대기 중 닫은 모달을 다시 닫거나 열지 않는다", async () => {
  const h = harness();
  const deletion = h.delete();
  h.context.detailModal.open = false;
  h.resolve();
  await deletion;
  assert.equal(h.state.closed, 0);
  assert.equal(h.context.detailModal.open, false);
  assert.equal(h.state.loads, 1);
});

test("현재 명함 삭제는 해당 화면을 닫고 목록을 갱신한다", async () => {
  const h = harness();
  const deletion = h.delete();
  h.resolve();
  await deletion;
  assert.deepEqual(h.state.deleted, [1]);
  assert.equal(h.state.closed, 1);
  assert.equal(h.state.loads, 1);
});

test("삭제 대상은 변경 가능한 activeCardId가 아니라 시작 시 명함 ID다", async () => {
  const h = harness();
  h.context.window.confirm = () => { h.context.activeCardId = 2; return true; };
  const deletion = h.delete();
  h.resolve();
  await deletion;
  assert.deepEqual(h.state.deleted, [1]);
});

test("현재 명함 삭제 실패는 현재 화면에 오류를 표시한다", async () => {
  const h = harness();
  const deletion = h.delete();
  h.reject(new Error("삭제 실패"));
  await deletion;
  assert.equal(h.state.statuses.at(-1), "삭제 실패");
  assert.equal(h.state.closed, 0);
});
