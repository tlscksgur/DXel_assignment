const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const browser = fs.readFileSync(path.join(root, "public/js/cardImport.js"), "utf8");
const context = vm.createContext({});
// 서버·DB 없이 실제 CSV 출력 함수와 현재 가져오기 파서를 함께 검증한다.
vm.runInContext(server.slice(server.indexOf("function csvValue("), server.indexOf("function vcardValue(")), context);
vm.runInContext(browser.slice(browser.indexOf("function normalizeHeader("), browser.indexOf("function unfoldVcard(")), context);

for (const value of [
  "=1+1", "+SUM(1,2)", "-1+2", "@SUM(A1:A2)",
  " =1+1", "\t=1+1", "\r=1+1", "\n=1+1", "\r\n\t =1+1",
  "\uFEFF=1+1", "\u00A0=1+1", "\u0000=1+1",
  "＝1+1", "＋1+1", "－1+1", "＠SUM(A1:A2)"
]) {
  test(`CSV의 수식 접두는 인용부 안에서 텍스트로 보호한다: ${JSON.stringify(value)}`, () => {
    const encoded = context.csvValue(value);
    assert.equal(encoded.startsWith('"\t'), true);
    assert.equal(encoded, `"\t${value.replace(/"/g, '""')}"`);
  });
}

test("일반 CSV 값과 쉼표·따옴표·개행은 기존 인용 규칙을 유지한다", () => {
  for (const value of ["홍길동", "회사, 부서", '가"나', "주소\n둘째 줄", '일반",=1+1', "safe@example.com", "010-1234-5678", ""]) {
    assert.equal(context.csvValue(value), `"${value.replace(/"/g, '""')}"`);
    const rows = context.parseCsvRows(`${context.csvValue(value)},"확인"`);
    assert.equal(rows[0].length, 2);
    assert.equal(rows[0][0], value);
    assert.equal(rows[0][1], "확인");
  }
});

test("CSV 텍스트 보호는 국제 전화번호 및 수식 모양 이름의 재가져오기를 훼손하지 않는다", () => {
  const row = { name: '=HYPERLINK("https://example.test","이름")', company: "가, 나", mobile: "+82 10-1234-5678", email: "one@example.com\ntwo@example.com" };
  const fields = Object.keys(row);
  const csv = `\uFEFF${fields.join(",")}\r\n${fields.map((key) => context.csvValue(row[key])).join(",")}\r\n`;
  const imported = context.parseCsv(csv)[0];
  for (const field of fields) assert.equal(imported[field], row[field], field);
  assert.equal(context.csvValue(imported.mobile), '"\t+82 10-1234-5678"');
  assert.equal(context.csvValue(imported.name).startsWith('"\t='), true);
});
