const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function createPage() {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const listeners = new Map();
      elements.set(selector, {
        innerHTML: "", value: "", textContent: "", hidden: false, dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(name, callback) { listeners.set(name, callback); },
        setAttribute() {}, querySelectorAll: () => [],
        insertAdjacentHTML(_position, html) { this.innerHTML += html; }, listeners
      });
    }
    return elements.get(selector);
  }
  const context = vm.createContext({
    document: { querySelector: element, querySelectorAll: () => [], addEventListener() {}, body: element("body") },
    fetch: () => new Promise(() => {}), setTimeout, clearTimeout, console
  });
  const source = fs.readFileSync(path.join(__dirname, "../public/js/cardManagement.js"), "utf8");
  vm.runInContext(source, context);
  const run = (code) => vm.runInContext(code, context);
  run(`visibleCards = [
    {id:1,name:'혼합중복',company:'예시회사',visibility:'shared',is_mine:0,is_favorite:1,group_name:'업무',tags:'["고객"]'},
    {id:2,name:'혼합중복',company:'예시회사',visibility:'private',is_mine:1,is_favorite:1,group_name:'업무',tags:'["고객"]'},
    {id:3,name:'기존명함',company:'기존회사',is_mine:1,is_favorite:0,group_name:'업무',tags:'["고객"]'}
  ]; renderCurrentView();`);
  return {
    run, element,
    scope(value) {
      const select = element(".visibilityFilterSelect");
      select.value = value;
      select.listeners.get("change")();
    },
    ids() { return [...element(".bcmBoard").innerHTML.matchAll(/data-card-id="(\d+)"/g)].map((match) => Number(match[1])); }
  };
}

test("전체·개인 선택은 표시 명함과 건수를 바꾸고 이전 범위의 선택은 해제한다", () => {
  const page = createPage();
  assert.deepEqual(page.ids(), [3, 2, 1]);
  assert.equal(page.element(".resultSummary").textContent, "전체 3장");
  page.run('selectedCardIdsByView.forEach(ids => ids.add(1)); selectionMode = true;');
  page.scope("private");
  assert.deepEqual(page.ids(), [2]);
  assert.equal(page.element(".resultSummary").textContent, "개인 명함 1장");
  assert.equal(page.run("[...selectedCardIdsByView.values()].every(ids => ids.size === 0)"), true);
  assert.equal(page.run("selectionMode"), false);
  page.scope("private");
  assert.deepEqual(page.ids(), [2]);
  page.scope("shared"); // UI에 없는 값은 무시한다.
  assert.equal(page.run("visibilityFilter"), "private");
  page.scope("all");
  assert.deepEqual(page.ids(), [3, 2, 1]);
});

test("개인 필터는 즐겨찾기·등록자·정렬·그룹·태그·중복 보기에 함께 적용된다", () => {
  const page = createPage();
  page.run('myCardsOnly = true; favoritesOnly = true; sortKey = "name"; sortDirection = "asc";');
  page.scope("private");
  assert.deepEqual(page.ids(), [2]);
  assert.equal(page.run("sortKey"), "name");
  assert.equal(page.run("sortDirection"), "asc");
  assert.equal(page.run("favoritesOnly"), true);
  for (const mode of ["groups", "tags"]) {
    page.run(`setViewMode('${mode}')`);
    assert.deepEqual(page.ids(), [2]);
    assert.match(page.element(".resultSummary").textContent, /^개인 · /);
  }
  page.run('setViewMode("duplicates")');
  assert.deepEqual(page.ids(), []);
  assert.equal(page.element(".duplicateCountBadge").textContent, "0");
  page.run('myCardsOnly = false; favoritesOnly = false;');
  page.scope("all");
  assert.deepEqual(page.ids().sort(), [1, 2]);
});

test("개인 명함이 없으면 개인 범위의 빈 안내를 표시하고 전체로 복귀할 수 있다", () => {
  const page = createPage();
  page.run('visibleCards = visibleCards.filter(card => card.visibility !== "private")');
  page.scope("private");
  assert.match(page.element(".bcmBoard").innerHTML, /개인 저장한 명함이 없습니다/);
  assert.equal(page.element(".resultSummary").textContent, "개인 명함 0장");
  page.scope("all");
  assert.deepEqual(page.ids(), [3, 1]);
});
