const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const projectRoot = path.join(__dirname, "..");

test("명함관리 화면에 검색창과 중복 모아보기 버튼이 있다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/BCM.html"), "utf8");

  assert.match(html, /id="cardSearch"/);
  assert.match(html, /class="duplicateToggle"/);
  assert.match(html, /중복 모아보기/);
});

test("명함 카드 크기를 305x204로 유지한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.bcmBoard\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*305px\)/
  );
  assert.match(
    css,
    /\.duplicateCards\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*305px\)/
  );
  assert.match(
    css,
    /\.profileCard\s*\{[\s\S]*width:\s*305px;[\s\S]*height:\s*204px;/
  );
});

test("명함 내용을 참고 이미지처럼 왼쪽 위에서 순서대로 정렬한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.profileCard\s*\{[\s\S]*align-items:\s*flex-start;[\s\S]*text-align:\s*left;/
  );
  assert.match(
    css,
    /\.profileCard h2\s*\{[\s\S]*margin-top:\s*18px;[\s\S]*font-size:\s*30px;/
  );
  assert.doesNotMatch(css, /\.card-portrait\s*\{[^}]*align-items:\s*center;/);
});

test("전화번호 또는 이름과 회사가 같은 명함을 인접 그룹으로 묶는다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/card.js"), "utf8");
  const board = {
    innerHTML: "",
    classList: { add() {}, remove() {} },
    insertAdjacentHTML(position, html) {
      this.innerHTML += html;
    }
  };
  const inertElement = {
    value: "",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    setAttribute() {}
  };
  const context = {
    console,
    document: {
      querySelector(selector) {
        if (selector === ".bcmBoard") return board;
        return inertElement;
      }
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ success: true, cards: [] })
    }),
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);

  assert.equal(typeof context.groupDuplicateCards, "function");

  const groups = context.groupDuplicateCards([
    { id: 4, name: "단독", company: "회사D", mobile: "010-4444-4444" },
    { id: 3, name: "김중복", company: "회사B", mobile: "010-1111-1111" },
    { id: 2, name: "김중복", company: "회사B", mobile: "010-2222-2222" },
    { id: 1, name: "다른 이름", company: "회사C", mobile: "010-1111-1111" }
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(
    Array.from(groups[0], (card) => card.id),
    [3, 2, 1]
  );
});
