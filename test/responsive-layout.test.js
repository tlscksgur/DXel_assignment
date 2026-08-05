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

test("일반 모니터 구간에서 세 화면이 중간 크기로 확대된다", () => {
  const commonCss = read("public/css/style.css");
  const bcmCss = read("public/css/BCM.css");
  const addCss = read("public/css/cardAdd.css");
  const monitorMedia = /@media\s*\(min-width:\s*1200px\)\s*and\s*\(max-width:\s*1599px\)/;

  assert.match(commonCss, monitorMedia);
  assert.match(
    commonCss,
    /@media\s*\(min-width:\s*1200px\)\s*and\s*\(max-width:\s*1599px\)\s*\{[\s\S]*\.contactCard\s*\{[\s\S]*width:\s*550px;[\s\S]*height:\s*170px;/
  );
  assert.match(
    bcmCss,
    /@media\s*\(min-width:\s*1200px\)\s*and\s*\(max-width:\s*1599px\)\s*\{[\s\S]*\.profileCard\s*\{[\s\S]*width:\s*323px;[\s\S]*height:\s*224px;[\s\S]*min-height:\s*224px;/
  );
  assert.match(
    addCss,
    /@media\s*\(min-width:\s*1200px\)\s*and\s*\(max-width:\s*1599px\)\s*\{[\s\S]*\.reviewBoard\s*\{[\s\S]*max-width:\s*1480px;[\s\S]*\.fieldGroup input\s*\{[\s\S]*height:\s*52px;/
  );
  assert.match(
    addCss,
    /@media\s*\(min-width:\s*1200px\)\s*and\s*\(max-width:\s*1599px\)\s*\{[\s\S]*\.extractPanel\s*\{[\s\S]*width:\s*min\(728px,\s*100%\);[\s\S]*min-height:\s*705px;[\s\S]*height:\s*max-content;/
  );
});

test("대형 화면에서 공통 헤더와 홈 명함이 단계적으로 확대된다", () => {
  const css = read("public/css/style.css");

  assert.match(
    css,
    /@media\s*\(min-width:\s*1600px\)\s*\{[\s\S]*header\s*\{[\s\S]*height:\s*86px;[\s\S]*\.contactCard\s*\{[\s\S]*width:\s*600px;[\s\S]*height:\s*184px;/
  );
  assert.match(
    css,
    /@media\s*\(min-width:\s*2200px\)\s*\{[\s\S]*\.mainTitle h1\s*\{[\s\S]*font-size:\s*64px;[\s\S]*\.contactCard\s*\{[\s\S]*width:\s*690px;[\s\S]*height:\s*212px;/
  );
});

test("대형 명함관리 화면에서 검색 도구와 명함 카드가 확대된다", () => {
  const css = read("public/css/BCM.css");

  assert.match(
    css,
    /@media\s*\(min-width:\s*1600px\)\s*\{[\s\S]*\.bcmTools\s*\{[\s\S]*width:\s*min\(900px,\s*100%\);[\s\S]*\.profileCard\s*\{[\s\S]*width:\s*348px;[\s\S]*height:\s*242px;[\s\S]*min-height:\s*242px;/
  );
  assert.match(
    css,
    /@media\s*\(min-width:\s*2200px\)\s*\{[\s\S]*\.profileCard\s*\{[\s\S]*width:\s*393px;[\s\S]*height:\s*273px;[\s\S]*min-height:\s*273px;/
  );
});

test("대형 명함등록 화면에서 업로드 영역과 입력 폼이 확대된다", () => {
  const css = read("public/css/cardAdd.css");

  assert.match(
    css,
    /@media\s*\(min-width:\s*1600px\)\s*\{[\s\S]*\.reviewBoard\s*\{[\s\S]*max-width:\s*1680px;[\s\S]*\.fieldGroup input\s*\{[\s\S]*height:\s*56px;/
  );
  assert.match(
    css,
    /@media\s*\(min-width:\s*2200px\)\s*\{[\s\S]*\.reviewBoard\s*\{[\s\S]*max-width:\s*2100px;[\s\S]*\.fieldGroup input\s*\{[\s\S]*height:\s*62px;/
  );
});
