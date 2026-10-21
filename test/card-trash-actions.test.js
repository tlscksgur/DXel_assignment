const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../public/js/cardTrash.js"), "utf8");

async function createTrashHarness(action, mutate = async () => ({ success: true })) {
  const listeners = {};
  const board = { innerHTML: "", addEventListener: (name, callback) => { listeners[name] = callback; } };
  const selectAll = { addEventListener() {} };
  const count = {};
  const button = { disabled: false, dataset: { cardId: "7", trashAction: action } };
  const mutations = [];
  const alerts = [];
  const confirmations = [];
  const selectors = { ".trashBoard": board, ".trashCount": count, ".trashSelectAllInput": selectAll };
  let confirmed = true;
  let reads = 0;
  const context = vm.createContext({
    document: { querySelector: (selector) => selectors[selector], querySelectorAll: () => [] },
    window: {
      confirm: (message) => { confirmations.push(message); return confirmed; },
      alert: (message) => alerts.push(message),
    },
    fetch: async (url, options = {}) => {
      if (!options.method) {
        reads += 1;
        return { ok: true, json: async () => ({ cards: reads === 1 ? [{ id: 7, name: "테스트 명함" }] : [] }) };
      }
      mutations.push({ url, method: options.method });
      return { ok: true, json: async () => mutate() };
    },
  });
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  return {
    button, mutations, alerts, confirmations, board,
    confirm(value) { confirmed = value; },
    click() { return listeners.click({ target: { closest: () => button } }); },
  };
}

for (const action of ["restore", "permanent-delete"]) {
  test(`휴지통 ${action}: 취소 후 버튼이 다시 활성화되고 다음 확인으로 처리할 수 있다`, async () => {
    const app = await createTrashHarness(action);
    app.confirm(false);
    await app.click();
    assert.equal(app.button.disabled, false);
    assert.equal(app.mutations.length, 0);
    app.confirm(true);
    await app.click();
    assert.equal(app.mutations.length, 1);
    assert.equal(app.mutations[0].url, action === "restore" ? "./api/cards/7/restore" : "./api/cards/7/permanent");
    assert.equal(app.mutations[0].method, action === "restore" ? "PATCH" : "DELETE");
    assert.equal(app.button.disabled, false);
    assert.match(app.board.innerHTML, /휴지통이 비어 있습니다/);
  });

  test(`휴지통 ${action}: 요청 실패 후 버튼을 다시 사용할 수 있다`, async () => {
    const app = await createTrashHarness(action, async () => { throw new Error("요청 실패"); });
    await app.click();
    assert.equal(app.button.disabled, false);
    assert.deepEqual(app.alerts, ["요청 실패"]);
    assert.equal(app.mutations.length, 1);
  });

  test(`휴지통 ${action}: 진행 중인 버튼을 다시 눌러도 요청이 중복되지 않는다`, async () => {
    let complete;
    const pending = new Promise((resolve) => { complete = resolve; });
    const app = await createTrashHarness(action, () => pending);
    const first = app.click();
    assert.equal(app.button.disabled, true);
    const second = app.click();
    try {
      assert.equal(app.mutations.length, 1);
      assert.equal(app.confirmations.length, 1);
    } finally {
      complete({ success: true });
      await Promise.all([first, second]);
    }
    assert.equal(app.button.disabled, false);
  });
}
