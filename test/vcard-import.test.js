const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const importSource = fs.readFileSync(path.join(root, "public/js/cardImport.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const context = vm.createContext({});
// 서버나 DB를 열지 않고 실제 가져오기 파서와 내보내기 함수를 실행한다.
vm.runInContext(importSource.slice(importSource.indexOf("function unfoldVcard("), importSource.indexOf("function selectedCards(")), context);
vm.runInContext(serverSource.slice(serverSource.indexOf("function vcardValue("), serverSource.indexOf("// ===== Local AI")), context);

function parse(text) {
  return JSON.parse(JSON.stringify(context.parseVcard(text)));
}

test("자체 vCard 내보내기와 재가져오기는 구분자와 역슬래시를 보존한다", () => {
  const row = {
    name: "김;신,찬\\혁",
    company: "DX;el, 연구\\소",
    department: "개발;1,2\\팀",
    position: "연구;개발,책임\\자",
    address: "서울;강서,중앙\\로 10",
    email: "first@example.com\nsecond@example.com",
    mobile: "010-1234-5678",
    phone: "02-123-4567",
    website: "https://example.com/path",
  };
  assert.deepEqual(parse(context.createVcard(row)), [row]);
});

test("vCard의 실제 줄바꿈과 문자 그대로의 역슬래시 n은 구별한다", () => {
  const row = {
    name: "첫 줄\n둘째 줄\\n문자",
    company: "회사\\;세미콜론",
    department: "팀\\\\;부서",
    position: "직책\\N문자",
    address: "건물\n2층\\n번지",
  };
  const card = parse(context.createVcard(row))[0];
  for (const [field, value] of Object.entries(row)) assert.equal(card[field], value, field);
  assert.equal(parse("BEGIN:VCARD\nFN:첫 줄\\N둘째 줄\nEND:VCARD")[0].name, "첫 줄\n둘째 줄");
});

test("구조화된 ORG와 ADR은 이스케이프되지 않은 세미콜론만 분리한다", () => {
  const [card] = parse(String.raw`BEGIN:VCARD
FN:테스트
ORG:회사\;이름;개발\;부서
ADR;TYPE=WORK:;;서울\;로 1;강서구;서울;12345;한국
END:VCARD`);
  assert.equal(card.company, "회사;이름");
  assert.equal(card.department, "개발;부서");
  assert.equal(card.address, "서울;로 1 강서구 서울 12345 한국");
});

test("역슬래시 쌍 뒤의 구조 구분자는 새 부서로 분리한다", () => {
  const [card] = parse(String.raw`BEGIN:VCARD
FN:테스트
ORG:회사\\;개발팀
ADR:;;서울\\;강서구;;;;
END:VCARD`);
  assert.equal(card.company, "회사\\");
  assert.equal(card.department, "개발팀");
  assert.equal(card.address, "서울\\ 강서구");
});

test("접힌 줄과 여러 명함 및 여러 이메일의 기존 가져오기를 유지한다", () => {
  const cards = parse("BEGIN:VCARD\r\nFN:김동\r\n 호\r\nORG:이에이트;개발팀\r\nEMAIL:a@example.com\r\nEMAIL:b@example.com\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:정지\r\n\t헌\r\nORG:이에이트;SI팀\r\nEND:VCARD\r\n");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].name, "김동호");
  assert.equal(cards[0].email, "a@example.com\nb@example.com");
  assert.equal(cards[1].name, "정지헌");
  assert.equal(cards[1].department, "SI팀");
});

test("필드 값의 END:VCARD 문자열은 명함 경계로 처리하지 않는다", () => {
  const row = {
    name: "이름 END:VCARD 뒤",
    company: "회사 end:vcard 뒤",
    department: "부서 END:VCARD 뒤",
    position: "직책 END:VCARD 뒤",
    address: "주소 END:VCARD 뒤",
  };
  const cards = parse(context.createVcard(row));
  assert.equal(cards.length, 1);
  for (const [field, value] of Object.entries(row)) assert.equal(cards[0][field], value, field);
});

for (const newline of ["\n", "\r\n"]) {
  test(`완전한 시작·종료 행만 대소문자 구분 없이 명함을 분리한다 (${JSON.stringify(newline)})`, () => {
    const cards = parse([
      "begin:vcard", "FN:첫 번째", "ORG:END:VCARD", "end:vcard",
      "BEGIN:VCARD", "FN:두 번째", "TITLE:END:VCARD 직책", "END:VCARD", "",
    ].join(newline));
    assert.equal(cards.length, 2);
    assert.equal(cards[0].company, "END:VCARD");
    assert.equal(cards[1].position, "END:VCARD 직책");
  });
}

test("접힌 값은 먼저 펼쳐서 END:VCARD 문자열을 보존한다", () => {
  const [card] = parse("BEGIN:VCARD\r\nFN:이름\r\n END:VCARD\r\nORG:회사 END:\r\n\tVCARD 뒤\r\nEND:VCARD");
  assert.equal(card.name, "이름END:VCARD");
  assert.equal(card.company, "회사 END:VCARD 뒤");
});

test("vCard 시작·종료 행이 없는 입력과 잘린 연락처는 거부한다", () => {
  for (const text of ["", "FN:이름", "FN:이름\nEND:VCARD", "BEGIN:VCARD\nFN:이름", "BEGIN:VCARD\nFN:이름\nEND:VCARD\nBEGIN:VCARD\nFN:잘린 명함"]) {
    assert.throws(() => parse(text), /vCard/);
  }
});
