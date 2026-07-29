const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const projectRoot = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("모든 화면이 모바일 viewport를 사용한다", () => {
  for (const page of ["public/index.html", "public/cardAdd.html", "public/BCM.html"]) {
    assert.match(
      read(page),
      /<meta name="viewport" content="width=device-width, initial-scale=1\.0">/
    );
  }
});

test("공통 헤더, 홈 명함, 푸터가 모바일 너비에 맞게 재배치된다", () => {
  const css = read("public/css/style.css");

  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*header\s*\{[\s\S]*flex-wrap:\s*wrap;/
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*\.contactCard\s*\{[\s\S]*width:\s*calc\(100vw - 32px\);/
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*footer\s*\{[\s\S]*position:\s*static;/
  );
});

test("모바일 홈의 푸터는 콘텐츠가 짧아도 화면 아래에 붙는다", () => {
  const css = read("public/css/style.css");

  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*\.container\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*main\s*\{[\s\S]*flex:\s*1;/
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*footer\s*\{[\s\S]*margin-top:\s*auto;/
  );
});

test("명함 등록 화면은 태블릿과 모바일에서 한 열로 표시된다", () => {
  const css = read("public/css/cardAdd.css");

  assert.match(
    css,
    /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*\.reviewBoard\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*\.extractForm\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*\.fieldGroup\.wide\s*\{[\s\S]*grid-column:\s*span 1;/
  );
});

test("명함관리 도구와 중복 그룹이 모바일 너비에 맞는다", () => {
  const css = read("public/css/BCM.css");

  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*\.bcmBoard\s*\{[\s\S]*grid-template-columns:\s*305px;/
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*\.duplicateGroupHeader\s*\{[\s\S]*padding:\s*0 4px;/
  );
});
