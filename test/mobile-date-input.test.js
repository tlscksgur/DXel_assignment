const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const projectRoot = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("명함 등록의 모바일 날짜 입력은 datetime-local 네이티브 폭을 제한한다", () => {
  const html = read("public/cardAdd.html");
  const css = read("public/css/cardAdd.css");
  const dateRule = css.match(/input\[type="datetime-local"\][^{]*\{([^}]*)\}/)?.[1] || "";

  assert.match(html, /<input type="datetime-local" id="meeting_date">/);
  assert.match(dateRule, /min-width:\s*0;/);
  assert.match(dateRule, /max-width:\s*100%;/);
  assert.match(dateRule, /width:\s*100%;/);
  assert.match(dateRule, /box-sizing:\s*border-box;/);
  assert.match(dateRule, /-webkit-appearance:\s*none;/);
  assert.match(dateRule, /appearance:\s*none;/);
  assert.match(dateRule, /overflow:\s*hidden;/);
});

test("모바일 폼에는 요청한 iOS 자동 확대 방지 규칙이 적용된다", () => {
  const css = read("public/css/cardAdd.css");
  const mobileRules = css.match(/@media screen and \(max-width:\s*767px\)\s*\{([\s\S]*)/)?.[1] || "";

  assert.match(mobileRules, /input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px\s*!important;/);
});
