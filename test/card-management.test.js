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

test("중복 후보 그룹은 가운데에서 시작해 최대 3개씩 줄바꿈한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.bcmBoard\.duplicateMode\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*justify-content:\s*center;/
  );
  assert.match(
    css,
    /\.duplicateGroup\s*\{[\s\S]*flex:\s*0 1 400px;[\s\S]*max-width:\s*100%;/
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
    addEventListener() {},
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

test("명함 디자인은 목록 순서가 바뀌어도 카드 ID별로 유지된다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/card.js"), "utf8");
  const inertElement = {
    value: "",
    innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertAdjacentHTML() {},
    setAttribute() {}
  };
  const context = {
    console,
    document: { querySelector: () => inertElement },
    fetch: async () => ({
      ok: true,
      json: async () => ({ success: true, cards: [] })
    }),
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);

  const contact = {
    id: 7,
    name: "디자인 유지",
    company: "예시회사"
  };
  const firstClass = context.createCard(contact, 0)
    .match(/<article class="profileCard ([^"]+)"/)[1];
  const movedClass = context.createCard(contact, 5)
    .match(/<article class="profileCard ([^"]+)"/)[1];
  const otherClass = context.createCard({ ...contact, id: 8 }, 0)
    .match(/<article class="profileCard ([^"]+)"/)[1];

  assert.equal(firstClass, movedClass);
  assert.notEqual(firstClass, otherClass);
});

test("명함 상세 팝업에 저장하는 9개 필드를 모두 표시한다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/BCM.html"), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, "public/js/card.js"), "utf8");

  assert.match(html, /class="cardDetailModal"/);
  assert.match(html, /class="cardDetailClose"/);
  assert.match(source, /function createCardDetail/);

  for (const field of [
    "이름",
    "회사",
    "부서",
    "직책",
    "휴대폰",
    "유선전화",
    "이메일",
    "홈페이지",
    "주소"
  ]) {
    assert.match(source, new RegExp(field));
  }
});

test("명함은 마우스와 키보드로 상세 정보를 열 수 있다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/card.js"), "utf8");

  assert.match(source, /class="profileCard[^\"]*"[^>]*tabindex="0"/);
  assert.match(source, /board\.addEventListener\("click"/);
  assert.match(source, /board\.addEventListener\("keydown"/);
  assert.match(source, /event\.key !== "Enter"/);
  assert.match(source, /event\.key !== " "/);
  assert.match(source, /event\.key === "Escape"/);
});

test("명함 상세 팝업은 작은 카드 디자인을 이어받고 빈 필드는 없음으로 표시한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/card.js"), "utf8");
  const inertElement = {
    value: "",
    innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertAdjacentHTML() {},
    setAttribute() {},
    showModal() {},
    close() {}
  };
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector: () => inertElement
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ success: true, cards: [] })
    }),
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);

  const detail = context.createCardDetail({
    id: 18,
    name: "권준",
    company: "(주)더비엔",
    department: "",
    position: "편집국장 / 상무이사",
    mobile: "010-4264-7376",
    phone: "070-5031-5329",
    email: "editor@boannews.com",
    website: "https://www.boannews.com",
    address: "서울시 마포구"
  });

  assert.match(detail, /card-dark-grey/);
  assert.match(detail, /편집국장 \/ 상무이사/);
  assert.match(detail, /070-5031-5329/);
  assert.match(detail, /<dd class="isEmpty">없음<\/dd>/);
});

test("상세 명함 번호는 닫기 버튼이 아니라 회사명 바로 옆에 정렬한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/card.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    source,
    /class="cardDetailCompanyLine"[\s\S]*class="pill"[\s\S]*class="cardDetailId"/
  );
  assert.match(
    css,
    /\.cardDetailCompanyLine\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/
  );
  assert.doesNotMatch(
    css,
    /\.cardDetailId\s*\{[\s\S]*position:\s*absolute;/
  );
});

test("어두운 상세 명함의 회사명 배지는 밝은 배경과 테두리로 구분한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.cardDetailCard\.card-dark \.pill,[\s\S]*\.cardDetailCard\.card-dark-grey \.pill\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*\.18\);[\s\S]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*\.32\);/
  );
});

test("상세 명함 홈페이지는 안전한 새 탭 링크로 표시한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/card.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");
  const inertElement = {
    value: "",
    innerHTML: "",
    open: false,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertAdjacentHTML() {},
    setAttribute() {},
    removeAttribute() {},
    showModal() {},
    close() {},
    focus() {}
  };
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector: () => inertElement
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ success: true, cards: [] })
    }),
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);

  const safeLink = context.createWebsiteLink("https://www.example.com");
  const unsafeLink = context.createWebsiteLink("javascript:alert(1)");

  assert.match(safeLink, /class="cardDetailWebsiteLink"/);
  assert.match(safeLink, /href="https:\/\/www\.example\.com"/);
  assert.match(safeLink, /target="_blank"/);
  assert.match(safeLink, /rel="noopener noreferrer"/);
  assert.doesNotMatch(unsafeLink, /<a /);
  assert.match(css, /\.cardDetailWebsiteLink\s*\{[\s\S]*text-decoration:\s*underline;/);
});
