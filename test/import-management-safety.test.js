const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");

function makeElement() {
  return {
    value: "", textContent: "", innerHTML: "", dataset: {}, hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, setAttribute() {}, querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function importContext() {
  const source = fs.readFileSync(path.join(root, "public/js/cardImport.js"), "utf8");
  const context = vm.createContext({ document: { querySelector: makeElement } });
  vm.runInContext(source.slice(0, source.indexOf("function unfoldVcard")), context);
  return context;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function managementContext() {
  const source = fs.readFileSync(path.join(root, "public/js/cardManagement.js"), "utf8");
  const elements = new Map();
  const requests = [];
  const document = {
    documentElement: { style: { setProperty() {} } },
    body: { classList: { add() {}, remove() {} } },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const context = vm.createContext({
    document,
    console: { error() {} },
    fetch(url, options) {
      const request = deferred();
      requests.push({ url, options, ...request });
      return request.promise;
    },
    setTimeout, clearTimeout
  });
  vm.runInContext(source, context);
  return { context, elements, requests };
}

async function flushPromises() {
  await new Promise(setImmediate);
}

test("CSV 필드 안의 줄바꿈과 이스케이프된 따옴표를 한 명함으로 읽는다", () => {
  const context = importContext();
  const csv = '\uFEFF"이름","회사","이메일"\r\n"홍길동","가, 나","first@example.com\r\nsecond@example.com"\r\n"김\"\"철수","다","third@example.com"\r\n';
  const cards = vm.runInContext(`parseCsv(${JSON.stringify(csv)})`, context);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].name, "홍길동");
  assert.equal(cards[0].company, "가, 나");
  assert.equal(cards[0].email, "first@example.com\r\nsecond@example.com");
  assert.equal(cards[1].name, '김"철수');
});

test("태그를 빠르게 연속 선택해도 먼저 저장한 태그를 잃지 않는다", async () => {
  const { context, requests } = managementContext();
  vm.runInContext('visibleCards = [{ id: 1, tags: "[]" }]; activeCardId = 1', context);

  const first = vm.runInContext('toggleCardTag("고객")', context);
  const second = vm.runInContext('toggleCardTag("협력사")', context);
  assert.equal(requests.filter((request) => request.options?.method === "PATCH").length, 1);

  requests[1].resolve({ ok: true, json: async () => ({ tags: ["고객"] }) });
  await flushPromises();
  assert.deepEqual(JSON.parse(requests[2].options.body).tags, ["고객", "협력사"]);

  requests[2].resolve({ ok: true, json: async () => ({ tags: ["고객", "협력사"] }) });
  await Promise.all([first, second]);
  assert.deepEqual(JSON.parse(vm.runInContext('visibleCards[0].tags', context)), ["고객", "협력사"]);
});

test("이전 검색의 늦은 오류가 새 검색 결과 화면을 지우지 않는다", async () => {
  const { context, elements, requests } = managementContext();
  elements.get("#cardSearch").value = "새 검색";
  const latest = vm.runInContext("loadCards()", context);
  requests[0].reject(new Error("오래된 검색 실패"));
  await flushPromises();

  assert.equal(elements.get(".resultSummary").textContent, "명함을 불러오는 중입니다.");
  assert.doesNotMatch(elements.get(".bcmBoard").innerHTML, /오래된 검색 실패/);

  requests[1].resolve({ ok: true, json: async () => ({ cards: [] }) });
  await latest;
});

test("중복 후보는 연결된 항목을 묶되 명함 수에 비례하는 횟수만 정규화한다", () => {
  const { context } = managementContext();
  vm.runInContext('var phoneCalls = 0; var originalNormalizePhone = normalizedPhone; normalizedPhone = (value) => { phoneCalls += 1; return originalNormalizePhone(value); }', context);
  const cards = Array.from({ length: 120 }, (_, index) => ({
    id: index + 1, name: `이름${index}`, company: `회사${index}`, mobile: `010-${index + 1000}`
  }));
  cards[1].name = cards[0].name;
  cards[1].company = cards[0].company;
  cards[2].mobile = cards[1].mobile;
  const groups = context.groupDuplicateCards(cards);

  assert.deepEqual(Array.from(groups[0], (card) => card.id), [1, 2, 3]);
  assert.equal(groups.length, 1);
  assert.ok(vm.runInContext('phoneCalls', context) <= cards.length * 5);
});
