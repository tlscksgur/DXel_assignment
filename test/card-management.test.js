const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const projectRoot = path.join(__dirname, "..");

test("명함관리 검색창은 유지하고 목록 도구에서 그룹·중복·선택 보기를 제공한다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/BCM.html"), "utf8");

  assert.match(html, /id="cardSearch"/);
  assert.match(html, /class="cardListControls"/);
  assert.match(html, /class="resultSummary"/);
  assert.match(html, /class="allViewToggle active"[^>]*>[\s\S]*전체/);
  assert.match(html, /class="groupViewToggle"[^>]*>[\s\S]*그룹별 보기/);
  assert.match(html, /class="duplicateToggle"/);
  assert.match(html, /중복 의심 보기/);
  assert.match(html, /class="duplicateCountBadge"/);
  assert.match(html, /class="cardSortSelect"/);
  assert.match(html, /value="recent"[^>]*>최근 등록순/);
  assert.match(html, /value="name"[^>]*>이름순/);
  assert.match(html, /value="company"[^>]*>회사순/);
  assert.match(html, /class="sortDirectionButton active"[^>]*data-sort-direction="desc"[^>]*>내림차순/);
  assert.match(html, /data-sort-direction="asc"[^>]*>오름차순/);
  assert.match(html, /class="favoriteViewToggle"/);
  assert.match(html, /aria-label="즐겨찾기 명함만 보기"/);
  assert.match(html, /class="selectionToggle"[^>]*>[\s\S]*선택/);
  assert.match(html, /class="selectionInlineCount"/);
  const searchForm = html.match(/<form class="cardSearchForm"[\s\S]*?<\/form>/)?.[0] || "";
  assert.doesNotMatch(searchForm, /class="duplicateToggle"/);
  assert.doesNotMatch(html, /총\s*\d+개\s*보관/);
});

test("즐겨찾기는 DB에 저장하고 단건 토글 API로 변경한다", () => {
  const databaseSource = fs.readFileSync(
    path.join(projectRoot, "database/db.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");

  assert.match(databaseSource, /is_favorite\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/i);
  assert.match(databaseSource, /ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0/);
  assert.match(serverSource, /app\.patch\("\/api\/cards\/:id\/favorite"/);
  assert.match(serverSource, /SET is_favorite = \? WHERE id = \?/);
});

test("이름이 비어 있는 명함은 임의 이름 대신 하이픈으로 표시한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");

  assert.doesNotMatch(source, /이름 없음/);
  assert.match(source, /contact\.name\s*\|\|\s*"-"/);
});

test("즐겨찾기는 PC 더블클릭과 상세 모달 별 버튼으로 토글한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(source, /function toggleFavorite/);
  assert.match(source, /requestFavoriteUpdate/);
  assert.match(source, /function usesFinePointer\(\)/);
  assert.match(source, /board\.addEventListener\("dblclick"/);
  assert.match(source, /if \(!usesFinePointer\(\)\) \{/);
  assert.match(source, /data-action="toggle-favorite"/);
  assert.match(source, /favoriteViewToggle\.addEventListener\("click"/);
  assert.match(source, /class="profileCardFavoriteMarker"/);
  assert.doesNotMatch(source, /class="cardDetailNameLine"/);
  assert.match(css, /\.cardDetailFavoriteButton\s*\{/);
  assert.match(
    css,
    /\.cardDetailFavoriteButton\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/
  );
  assert.match(
    css,
    /\.cardDetailFavoriteButton\.is-favorite\s*\{[\s\S]*color:\s*#e8a814;/
  );
  assert.match(
    css,
    /\.profileCardFavoriteMarker\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*0;[\s\S]*right:\s*0;[\s\S]*transform:\s*translate\([^;]+\);[\s\S]*color:\s*#e8a814;/
  );
  assert.match(
    css,
    /\.profileCard\s*\{[\s\S]*overflow:\s*visible;/
  );
  assert.doesNotMatch(css, /\.profileCard\.has-favorite\s+\.cardId/);
  assert.match(css, /\.favoriteViewToggle\.active\s*\{/);
});

test("일반 목록에서 즐겨찾기를 바꿔도 전체 목록을 다시 렌더링하지 않는다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const toggleFavorite = source.match(/async function toggleFavorite[\s\S]*?\n}\n\nasync function saveCardEdits/)?.[0] || "";

  assert.match(source, /function syncFavoriteCard\(/);
  assert.match(toggleFavorite, /if \(favoritesOnly\) \{\s*renderCurrentView\(\);\s*\} else \{\s*syncFavoriteCard/);
  assert.doesNotMatch(toggleFavorite, /showCardDetail\(\);\s*renderCurrentView\(\);/);
});

test("명함 목록을 새로 불러오면 모든 보기의 삭제된 선택 상태를 정리한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const loadCards = source.match(/async function loadCards\(\)[\s\S]*?\n}\n\n\/\/ ===== 검색/)?.[0] || "";

  assert.match(source, /function pruneSelectedCardIds\(visibleIds\)/);
  assert.match(source, /selectedCardIdsByView\.forEach/);
  assert.match(loadCards, /pruneSelectedCardIds\(visibleIds\)/);
});

test("목록 요청 실패 시 그룹 보기 클래스도 제거해 빈 안내를 정상 크기로 표시한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const loadCards = source.match(/async function loadCards\(\)[\s\S]*?\n}\n\n\/\/ ===== 검색/)?.[0] || "";

  assert.match(loadCards, /board\.classList\.remove\("duplicateMode", "groupMode"\)/);
});

test("명함 목록은 선택한 기준과 방향으로 정렬한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const inertElement = {
    value: "recent",
    innerHTML: "",
    hidden: true,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertAdjacentHTML() {},
    setAttribute() {},
    querySelectorAll() { return []; }
  };
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector: () => inertElement,
      querySelectorAll: () => []
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ success: true, cards: [] })
    }),
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);
  const cards = [
    { id: 2, name: "Beta", company: "Alpha" },
    { id: 3, name: "Alpha", company: "Charlie" },
    { id: 1, name: "Charlie", company: "Beta" }
  ];

  assert.deepEqual(
    Array.from(context.sortCards(cards, "recent", "desc"), (card) => card.id),
    [3, 2, 1]
  );
  assert.deepEqual(
    Array.from(context.sortCards(cards, "name", "asc"), (card) => card.id),
    [3, 2, 1]
  );
  assert.deepEqual(
    Array.from(context.sortCards(cards, "company", "desc"), (card) => card.id),
    [3, 1, 2]
  );
});

test("그룹별 보기에서는 그룹이 지정되지 않은 명함을 제외한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const inertElement = {
    value: "",
    innerHTML: "",
    hidden: true,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertAdjacentHTML() {},
    setAttribute() {},
    querySelectorAll() { return []; }
  };
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector: () => inertElement,
      querySelectorAll: () => []
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ success: true, cards: [] })
    }),
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);
  const groups = context.groupCardsByName([
    { id: 1, group_name: "거래처" },
    { id: 2, group_name: "" },
    { id: 3, group_name: null }
  ]);

  assert.equal(groups.size, 1);
  assert.equal(groups.has("거래처"), true);
  assert.equal(groups.has("그룹 미지정"), false);
  assert.match(source, /지정된 그룹이 없습니다\./);
  assert.match(source, /class="groupRemoveButton"[\s\S]*data-card-ids="\$\{cardIds\}"[\s\S]*그룹 삭제/);
  assert.match(source, /function removeGroupAssignment\(button\)/);
});

test("보기별로 명함 선택 상태를 분리하고 빈 선택 모드는 화면 전환 시 해제한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");

  assert.match(source, /const selectedCardIdsByView = new Map\(/);
  assert.match(source, /const selectionModeByView = new Map\(/);
  assert.match(source, /let selectedCardIds = selectedCardIdsByView\.get\(viewMode\);/);
  assert.match(source, /let selectionMode = selectionModeByView\.get\(viewMode\);/);
  assert.match(source, /if \(selectedCardIds\.size === 0\) \{[\s\S]*selectionMode = false;[\s\S]*selectionModeByView\.set\(viewMode, selectionMode\);/);
  assert.match(source, /function setViewMode\(nextViewMode\)[\s\S]*selectedCardIds = selectedCardIdsByView\.get\(viewMode\);[\s\S]*selectionMode = selectionModeByView\.get\(viewMode\);/);
  assert.match(source, /function setSelectionMode\(isActive\)[\s\S]*selectionModeByView\.set\(viewMode, selectionMode\);/);
  assert.match(source, /allViewToggle\.addEventListener\("click", \(\) => \{[\s\S]*setViewMode\("all"\)/);
  assert.match(source, /groupViewToggle\.addEventListener\("click", \(\) => \{[\s\S]*setViewMode\(viewMode === "groups" \? "all" : "groups"\)/);
  assert.match(source, /duplicateToggle\.addEventListener\("click", \(\) => \{[\s\S]*setViewMode\(viewMode === "duplicates" \? "all" : "duplicates"\)/);
});

test("같은 그룹을 다시 지정하려 하면 요청 전에 안내하고 중단한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const inertElement = {
    value: "",
    innerHTML: "",
    hidden: true,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertAdjacentHTML() {},
    setAttribute() {},
    querySelectorAll() { return []; }
  };
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector: () => inertElement,
      querySelectorAll: () => []
    },
    fetch: async () => ({ ok: true, json: async () => ({ success: true, cards: [] }) }),
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);

  assert.equal(context.isSelectedCardsAlreadyInGroup([
    { group_name: "거래처" },
    { group_name: "거래처" }
  ], "거래처"), true);
  assert.equal(context.isSelectedCardsAlreadyInGroup([
    { group_name: "거래처" },
    { group_name: "고객" }
  ], "거래처"), false);
  assert.match(source, /이미 “\$\{groupName\}” 그룹에 속해 있습니다\./);
});

test("기존 그룹 빠른 선택은 검색 결과가 아닌 전체 그룹 API에서 불러온다", async () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");
  const inertElement = {
    value: "",
    innerHTML: "",
    hidden: true,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertAdjacentHTML() {},
    setAttribute() {},
    querySelectorAll() { return []; }
  };
  const requests = [];
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector: () => inertElement,
      querySelectorAll: () => []
    },
    fetch: async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({ success: true, groups: ["거래처", "고객"] })
      };
    },
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);
  requests.length = 0;

  const groups = await context.requestGroupNames();

  assert.equal(requests[0], "/api/cards/groups");
  assert.deepEqual(Array.from(groups), ["거래처", "고객"]);
  assert.match(source, /function renderGroupAssignmentOptions\(groupNames\)/);
  assert.doesNotMatch(source, /function renderGroupAssignmentOptions\(\)[\s\S]*visibleCards\s*\.map\(\(card\) => String\(card\.group_name/);
  assert.match(serverSource, /app\.get\("\/api\/cards\/groups"/);
  assert.match(serverSource, /SELECT DISTINCT group_name FROM business_cards/);
});

test("빈 명함 목록은 검색 여부와 보기 방식에 맞는 동일 크기 안내 영역을 표시한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(source, /function renderEmptyCards\(message\)/);
  assert.match(source, /등록된 명함이 없습니다\./);
  assert.match(source, /검색 결과가 없습니다\./);
  assert.match(source, /renderEmptyCards\(cards\.length === 0/);
  assert.match(source, /renderEmptyCards\(visibleCards\.length === 0/);
  assert.match(source, /function renderEmptyCards\(message\)[\s\S]*board\.classList\.remove\("duplicateMode", "groupMode"\)/);
  assert.doesNotMatch(css, /\.bcmBoard\.groupMode \.emptyCards|\.bcmBoard\.duplicateMode \.emptyCards/);
  assert.match(css, /\.emptyCards\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/);
});

test("선택 작업 바는 CSV·vCard 내보내기와 그룹 지정·삭제를 명확한 아이콘으로 제공한다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/BCM.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");
  const selectedCardRule = css.match(/\.profileCard\.is-selected\s*\{([^}]*)\}/)?.[1] || "";

  const actionBar = html.match(/<aside class="selectionActionBar"[\s\S]*?<\/aside>/)?.[0] || "";
  assert.match(actionBar, /class="selectionBarCount"[\s\S]*선택됨/);
  assert.match(actionBar, /data-selection-action="export-csv"[^>]*>[\s\S]*CSV/);
  assert.match(actionBar, /data-selection-action="export-vcard"[^>]*>[\s\S]*vCard/);
  assert.match(actionBar, /data-selection-action="group"[^>]*>[\s\S]*그룹 지정/);
  assert.match(actionBar, /data-selection-action="remove-from-group"[^>]*hidden[\s\S]*그룹에서 제거/);
  assert.match(actionBar, /data-selection-action="delete"[^>]*>[\s\S]*휴지통으로 이동/);
  assert.equal((actionBar.match(/<button/g) || []).length, 5);
  assert.equal((actionBar.match(/<svg/g) || []).length, 5);
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  assert.match(source, /groupRemoveSelectedButton\.hidden\s*=\s*!\(hasSelection && viewMode === "groups"\)/);
  assert.doesNotMatch(css, /selectionActionBar button\[data-selection-action=.*::before/);
  assert.match(selectedCardRule, /border:\s*3px solid rgba\(3,\s*22,\s*50,\s*\.42\);/);
  assert.match(selectedCardRule, /box-shadow:\s*none;/);
  assert.doesNotMatch(selectedCardRule, /outline|outline-offset|transform/);
  assert.doesNotMatch(html, /cardSelectionIndicator|selectionCheckbox/);
});

test("명함 선택은 목록을 다시 렌더링하지 않아 현재 스크롤 위치를 유지한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const toggleSelectionBody = source.match(/function toggleCardSelection\(cardId\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(toggleSelectionBody, /board\.querySelectorAll\(`\.profileCard\[data-card-id="\$\{numericId\}"\]`\)/);
  assert.match(toggleSelectionBody, /classList\.toggle\("is-selected", isSelected\)/);
  assert.match(toggleSelectionBody, /setAttribute\("aria-pressed", String\(isSelected\)\)/);
  assert.doesNotMatch(toggleSelectionBody, /renderCurrentView\(\)/);
});

test("모바일 보기 전환 배지와 선택 작업 바가 줄바꿈·안전 영역 없이 표시된다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(css, /\.viewModeControls \.duplicateToggle\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /@media \(max-width: 680px\)\s*\{[\s\S]*\.selectionActionBar\s*\{[\s\S]*bottom:\s*env\(safe-area-inset-bottom\);/);
  assert.match(css, /@media \(max-width: 680px\)\s*\{[\s\S]*\.selectionActionBar\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*max-content repeat\(4, max-content\);/);
  assert.match(css, /\.selectionBarCount\s*\{[\s\S]*height:\s*34px;/);
  assert.match(css, /\.selectionActionBar svg\s*\{[\s\S]*display:\s*block;/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*openCardDetail\(card\.dataset\.cardId\);[\s\S]*\}, 200\);/);
});

test("모바일 상세 모달은 실제 브라우저 viewport 높이를 사용해 하단 배경 여백을 남기지 않는다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/BCM.html"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");

  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(source, /function syncVisualViewportHeight\(\)[\s\S]*globalThis\.visualViewport\?\.height[\s\S]*setProperty\(\s*"--visual-viewport-height"/);
  assert.match(source, /globalThis\.visualViewport\.addEventListener\("resize", syncVisualViewportHeight\)/);
  assert.match(css, /:root\s*\{[\s\S]*--visual-viewport-height:\s*100dvh;/);
  assert.match(css, /@media \(max-width: 680px\)\s*\{[\s\S]*\.cardDetailModal\s*\{[\s\S]*inset:\s*0;[\s\S]*width:\s*100%;[\s\S]*height:\s*calc\(var\(--visual-viewport-height\) \+ env\(safe-area-inset-bottom\)\);[\s\S]*max-height:\s*none;/);
  assert.match(css, /@media \(max-width: 680px\)\s*\{[\s\S]*\.cardDetailContent\s*\{[\s\S]*height:\s*100%;[\s\S]*max-height:\s*100%;/);
  assert.match(css, /@media \(max-width: 680px\)\s*\{[\s\S]*\.cardDetailModal::backdrop\s*\{[\s\S]*min-height:\s*calc\(var\(--visual-viewport-height\) \+ env\(safe-area-inset-bottom\)\);/);
});

test("그룹 지정 창은 선택 대상과 기존 그룹 빠른 선택을 제공하며 불필요한 옵션은 표시하지 않는다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/BCM.html"), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");

  const modal = html.match(/<dialog class="groupAssignModal"[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.match(modal, /class="groupAssignHeader"/);
  assert.match(modal, /class="groupAssignSelectedCards"/);
  assert.match(modal, /class="groupQuickList"/);
  assert.match(modal, /data-group-action="cancel"/);
  assert.doesNotMatch(modal, /태그 색상|덮어쓰기|교체/);
  assert.match(source, /function renderGroupAssignmentOptions\(groupNames\)/);
  assert.match(source, /data-group-name=/);
});

test("선택 명함 CSV와 vCard는 각각 올바른 내보내기 API를 사용한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const context = { URLSearchParams };

  vm.runInNewContext(source.match(/function selectedExportPath[\s\S]*?\n\}/)?.[0] || "", context);

  assert.equal(context.selectedExportPath("csv", [9, 7]), "/api/cards/export/csv?ids=9%2C7");
  assert.equal(context.selectedExportPath("vcard", [9, 7]), "/api/cards/export/vcard?ids=9%2C7");
});

test("그룹 저장소와 선택 명함 일괄 처리 API를 제공한다", () => {
  const databaseSource = fs.readFileSync(path.join(projectRoot, "database/db.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");

  assert.match(databaseSource, /group_name TEXT/);
  assert.match(databaseSource, /PRAGMA table_info\(business_cards\)/);
  assert.match(databaseSource, /ALTER TABLE business_cards ADD COLUMN group_name TEXT/);
  assert.match(serverSource, /app\.patch\("\/api\/cards\/groups"/);
  assert.match(serverSource, /typeof req\.body\.groupName !== "string"/);
  assert.match(serverSource, /app\.post\("\/api\/cards\/bulk-delete"/);
  assert.match(serverSource, /req\.query\.ids/);
});

test("삭제 명함은 휴지통으로 이동하고 복원 또는 영구 삭제할 수 있다", () => {
  const databaseSource = fs.readFileSync(path.join(projectRoot, "database/db.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");
  const html = fs.readFileSync(path.join(projectRoot, "public/BCM.html"), "utf8");
  const trashHtml = fs.readFileSync(path.join(projectRoot, "public/cardTrash.html"), "utf8");
  const trashSource = fs.readFileSync(path.join(projectRoot, "public/js/cardTrash.js"), "utf8");

  assert.match(databaseSource, /deleted_at TEXT/);
  assert.match(databaseSource, /ALTER TABLE business_cards ADD COLUMN deleted_at TEXT/);
  assert.match(serverSource, /const trashOnly = req\.query\.trash === "1"/);
  assert.match(serverSource, /WHERE deleted_at IS NULL/);
  assert.match(serverSource, /deleted_at IS NOT NULL/);
  assert.match(serverSource, /app\.patch\("\/api\/cards\/:id\/restore"/);
  assert.match(serverSource, /app\.post\("\/api\/cards\/bulk-restore"/);
  assert.match(serverSource, /app\.delete\("\/api\/cards\/:id\/permanent"/);
  assert.match(serverSource, /app\.post\("\/api\/cards\/bulk-permanent-delete"/);
  assert.match(serverSource, /UPDATE business_cards SET deleted_at = CURRENT_TIMESTAMP/);
  const header = html.match(/<header>[\s\S]*?<\/header>/)?.[0] || "";
  assert.doesNotMatch(header, /cardTrash\.html/);
  assert.match(html, /class="trashFooterLink" href="\.\/cardTrash\.html"/);
  assert.doesNotMatch(html, /Local AI Ready/);
  assert.match(html, /href="\.\/cardTrash\.html"/);
  assert.match(trashHtml, /class="trashBoard"/);
  assert.match(trashSource, /\/api\/cards\?trash=1/);
  assert.match(trashSource, /data-trash-action="restore"/);
  assert.match(trashSource, /data-trash-action="permanent-delete"/);
  assert.match(trashSource, /window\.confirm\(`선택한 명함 \$\{cardIds\.length\}장을 복원할까요\?`\)/);
  assert.match(trashSource, /if \(selectedTrashIds\.size > 0\) selectedTrashIds\.clear\(\);/);
});

test("명함 데이터 불러오기는 중복 의심을 제외해 선택하고 취소 시 현재 입력을 초기화한다", () => {
  const importHtml = fs.readFileSync(path.join(projectRoot, "public/cardImport.html"), "utf8");
  const importSource = fs.readFileSync(path.join(projectRoot, "public/js/cardImport.js"), "utf8");

  assert.match(importHtml, /class="importSelectValid">중복 제외하고 선택/);
  assert.match(importHtml, /<button type="button" class="importCancel">취소<\/button>/);
  assert.doesNotMatch(importHtml, /<a href="\.\/BCM\.html" class="importCancel">취소<\/a>/);
  assert.match(importSource, /card\.selected = card\.valid && card\.duplicateIds\.length === 0/);
  assert.match(importSource, /importCancel\.addEventListener\("click", resetImport\)/);
});

test("선택 명함의 그룹 지정과 삭제 요청은 ID 전체를 전송한다", async () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const inertElement = {
    value: "",
    innerHTML: "",
    open: false,
    hidden: true,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    insertAdjacentHTML() {},
    setAttribute() {},
    removeAttribute() {},
    showModal() {},
    close() {},
    focus() {},
    querySelectorAll() { return []; }
  };
  const requests = [];
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector: () => inertElement
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({ success: true, cards: [] })
      };
    },
    location: { assign() {} },
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);
  requests.length = 0;

  await context.requestGroupAssignment([9, 7], "거래처");
  await context.requestGroupAssignment([9, 7], "");
  await context.requestBulkDelete([9, 7]);

  assert.equal(requests[0].url, "/api/cards/groups");
  assert.equal(requests[0].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    cardIds: [9, 7],
    groupName: "거래처"
  });
  assert.equal(requests[1].url, "/api/cards/groups");
  assert.equal(requests[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[1].options.body), { cardIds: [9, 7], groupName: "" });
  assert.equal(requests[2].url, "/api/cards/bulk-delete");
  assert.equal(requests[2].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[2].options.body), { cardIds: [9, 7] });
  assert.match(source, /function renderGroupedCards/);
});

test("모든 화면의 CSV 옆에 전체 주소록 vCard 내보내기를 제공한다", () => {
  for (const page of ["index.html", "BCM.html", "cardAdd.html"]) {
    const html = fs.readFileSync(path.join(projectRoot, "public", page), "utf8");

    assert.match(
      html,
      /class="csvExport"[\s\S]*class="vcardExport"[^>]*>vCard Export</
    );
  }

  const footerSource = fs.readFileSync(
    path.join(projectRoot, "public/js/footerStatus.js"),
    "utf8"
  );
  assert.match(footerSource, /querySelector\("\.vcardExport"\)/);
  assert.match(footerSource, /\/api\/cards\/export\/vcard/);
});

test("vCard API는 macOS 연락처용 UTF-8 vCard 3.0 파일을 생성한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");

  assert.match(source, /app\.get\("\/api\/cards\/export\/vcard"/);
  assert.match(source, /BEGIN:VCARD/);
  assert.match(source, /VERSION:3\.0/);
  assert.match(source, /text\/vcard; charset=utf-8/);
  assert.match(source, /filename=business_cards\.vcf/);
  assert.match(source, /res\.send\(vcard\)/);
  assert.match(source, /function vcardValue/);
  assert.match(source, /vcardPhoneLines\(row\.mobile, "CELL"\)/);
  assert.match(source, /vcardPhoneLines\(row\.phone, "WORK,VOICE"\)/);
});

test("긴 직책을 두 줄 미리보기로 정리해 기본 명함 카드 높이를 유지한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.bcmBoard\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*305px\)/
  );
  assert.match(
    css,
    /\.duplicateCards\s*\{[\s\S]*grid-auto-columns:\s*305px/
  );
  assert.match(
    css,
    /\.profileCard\s*\{[\s\S]*width:\s*305px;[\s\S]*height:\s*228px;/
  );
  assert.match(css, /\.profileCard \.role\s*\{[\s\S]*-webkit-line-clamp:\s*2;/);
});

test("목록 명함의 여러 이메일은 저장된 줄바꿈대로 표시한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(source, /class="meta emailMeta"/);
  assert.match(css, /\.profileCard \.emailMeta\s*\{[\s\S]*white-space:\s*pre-line;/);
});

test("중복 후보와 일반 그룹은 세로 2장씩 채운 뒤 다음 열로 배치한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");
  const groupModeRule = css.match(/\.bcmBoard\.groupMode\s*\{([^}]*)\}/)?.[1] || "";
  const cardGroupRule = css.match(/\.cardGroup\s*\{([^}]*)\}/)?.[1] || "";
  const duplicateGroupRule = css.match(/\.duplicateGroup\s*\{([^}]*)\}/)?.[1] || "";
  const groupedCardsRule = css.match(/\.groupedCards,\s*\.duplicateCards\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(
    css,
    /\.bcmBoard\.duplicateMode\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*justify-content:\s*center;/
  );
  assert.match(
    css,
    /\.duplicateGroup\s*\{[\s\S]*flex:\s*0 1 auto;[\s\S]*width:\s*fit-content;[\s\S]*max-width:\s*100%;/
  );
  assert.match(groupModeRule, /display:\s*flex;/);
  assert.match(groupModeRule, /flex-wrap:\s*wrap;/);
  assert.match(groupModeRule, /justify-content:\s*center;/);
  assert.match(cardGroupRule, /flex:\s*0 1 auto;/);
  assert.match(cardGroupRule, /width:\s*fit-content;/);
  assert.match(cardGroupRule, /max-width:\s*100%;/);
  assert.doesNotMatch(cardGroupRule, /box-shadow/);
  assert.doesNotMatch(duplicateGroupRule, /box-shadow/);
  assert.match(groupedCardsRule, /overflow:\s*visible;/);
  assert.doesNotMatch(css, /\.groupedCards \.profileCard|\.duplicateCards \.profileCard/);
  assert.match(
    css,
    /\.groupedCards,[\s\S]*\.duplicateCards\s*\{[\s\S]*grid-template-rows:\s*repeat\(2,\s*auto\);[\s\S]*grid-auto-flow:\s*column;[\s\S]*overflow:\s*visible;/
  );
  assert.match(css, /\.duplicateCards\s*\{[\s\S]*padding:\s*6px 4px 17px;/);
  assert.match(
    css,
    /@media \(max-width:\s*680px\)[\s\S]*\.groupedCards,[\s\S]*\.duplicateCards\s*\{[\s\S]*grid-auto-columns:\s*305px;[\s\S]*overflow-x:\s*auto;/
  );
});

test("그룹 명함은 화면 폭에 맞춰 2줄 단위로 나누고 넘치는 카드는 다음 줄로 보낸다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(source, /function groupCardChunkSize\(\)/);
  assert.match(source, /board\.clientWidth/);
  assert.match(source, /Math\.min\(5, columnCount\)\) \* 2/);
  assert.match(source, /const primaryCards = groupCards\.slice\(0, cardsPerChunk\)/);
  assert.match(source, /const overflowCards = groupCards\.slice\(cardsPerChunk\)/);
  assert.match(source, /class="groupedCards groupedCardsOverflow" style="--group-column-count:\$\{cardsPerChunk \/ 2\}"/);
  assert.match(css, /\.groupedCardsOverflow\s*\{[\s\S]*grid-template-rows:\s*none;[\s\S]*grid-auto-flow:\s*row;[\s\S]*grid-template-columns:\s*repeat\(var\(--group-column-count\), var\(--group-card-width\)\);/);
});

test("어두운 명함은 선택 시 밝은 테두리로 구분한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.profileCard\.card-dark\.is-selected,[\s\S]*\.profileCard\.card-dark-grey\.is-selected\s*\{[\s\S]*border-color:\s*#2d6cdf;/
  );
});

test("목록 도구는 4px 더 넓고 명함 보드 안쪽에 정렬된다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(css, /\.cardListControls\s*\{[\s\S]*width:\s*min\(1207px,\s*100%\);/);
  assert.match(
    css,
    /@media \(min-width:\s*1200px\) and \(max-width:\s*1599px\)[\s\S]*\.cardListControls\s*\{[\s\S]*width:\s*min\(1367px,\s*100%\);/
  );
  assert.match(
    css,
    /@media \(min-width:\s*1600px\)[\s\S]*\.cardListControls\s*\{[\s\S]*width:\s*min\(1607px,\s*100%\);/
  );
});

test("중복 후보 그룹 병합 API는 트랜잭션으로 갱신과 삭제를 함께 처리한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");

  assert.match(source, /app\.post\("\/api\/cards\/merge-group"/);
  assert.match(source, /cardIds[^\n]*length < 2/);
  assert.match(source, /BEGIN TRANSACTION/);
  assert.match(source, /COMMIT/);
  assert.match(source, /ROLLBACK/);
  assert.match(source, /deletedCount/);
});

test("중복 후보 그룹은 병합 버튼으로 선택한 명함 ID 전체를 전송한다", async () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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
    innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    setAttribute() {}
  };
  const requests = [];
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector(selector) {
        if (selector === ".bcmBoard") return board;
        return inertElement;
      }
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({ success: true, cards: [] })
      };
    },
    confirm: () => true,
    alert() {},
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);
  requests.length = 0;

  context.renderDuplicateGroups([[
    { id: 9, name: "최근 명함", company: "회사" },
    { id: 7, name: "이전 명함", company: "회사" }
  ]]);

  assert.match(board.innerHTML, /class="duplicateMergeButton"/);
  assert.match(board.innerHTML, /data-card-ids="9,7"/);

  await context.requestDuplicateMerge([9, 7]);

  assert.equal(requests[0].url, "/api/cards/merge-group");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(requests[0].options.body), { cardIds: [9, 7] });
});

test("그룹별 보기 헤더에는 그룹 전체 해제 버튼과 해당 명함 ID가 표시된다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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
    innerHTML: "",
    hidden: true,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    setAttribute() {},
    querySelectorAll() { return []; }
  };
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector(selector) {
        if (selector === ".bcmBoard") return board;
        return inertElement;
      },
      querySelectorAll: () => []
    },
    fetch: async () => ({ ok: true, json: async () => ({ success: true, cards: [] }) }),
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);
  context.renderGroupedCards([
    { id: 9, name: "홍길동", company: "회사", group_name: "거래처" },
    { id: 7, name: "김철수", company: "회사", group_name: "거래처" }
  ]);

  assert.match(board.innerHTML, /class="groupRemoveButton"/);
  assert.match(board.innerHTML, /data-group-name="거래처"/);
  assert.match(board.innerHTML, /data-card-ids="9,7"/);
});

test("중복 병합 버튼은 장수 표시 옆에 배치되고 처리 중 상태를 구분한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.duplicateGroupMeta\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/
  );
  assert.match(
    css,
    /\.duplicateMergeButton,\s*\.groupRemoveButton\s*\{[\s\S]*cursor:\s*pointer;/
  );
  assert.match(css, /\.duplicateMergeButton:disabled,\s*\.groupRemoveButton:disabled\s*\{/);
  assert.match(css, /\.cardGroupMeta\s*\{[\s\S]*display:\s*flex;/);
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
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");

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
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");

  assert.match(source, /class="profileCard[^\"]*"[^>]*tabindex="0"/);
  assert.match(source, /board\.addEventListener\("click"/);
  assert.match(source, /board\.addEventListener\("keydown"/);
  assert.match(source, /event\.key !== "Enter"/);
  assert.match(source, /event\.key !== " "/);
  assert.match(source, /event\.key === "Escape"/);
});

test("명함 상세 팝업은 작은 카드 디자인을 이어받고 빈 필드는 없음으로 표시한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    source,
    /class="cardDetailCompanyLine"[\s\S]*class="pill"[\s\S]*class="cardDetailId"/
  );
  assert.match(
    css,
    /\.cardDetailCompanyLine\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/
  );
  const detailIdRule = css.match(/\.cardDetailId\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(detailIdRule, /position:\s*absolute;/);
});

test("어두운 상세 명함의 회사명 배지는 밝은 배경과 테두리로 구분한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.cardDetailCard\.card-dark \.pill,[\s\S]*\.cardDetailCard\.card-dark-grey \.pill\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*\.18\);[\s\S]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*\.32\);/
  );
});

test("상세 명함 홈페이지는 안전한 새 탭 링크로 표시한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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

test("명함 상세 편집 화면은 저장하는 9개 필드와 저장·취소 버튼을 제공한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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

  const editor = context.createCardEditor({
    id: 18,
    name: "권준",
    company: "(주)더비엔",
    department: "편집국",
    position: "상무이사",
    mobile: "010-4264-7376",
    phone: "070-5031-5329",
    email: "editor@boannews.com",
    website: "https://www.boannews.com",
    address: "서울시 마포구"
  });

  for (const field of [
    "name",
    "company",
    "department",
    "position",
    "mobile",
    "phone",
    "email",
    "website",
    "address"
  ]) {
    assert.match(editor, new RegExp(`name="${field}"`));
  }
  assert.match(editor, /class="cardDetailEditForm"/);
  assert.match(editor, /data-action="save"/);
  assert.match(editor, /data-action="cancel"/);
});

test("명함 수정과 삭제 요청은 선택한 명함 API에 올바른 메서드로 전송한다", async () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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
  const requests = [];
  const context = {
    console,
    document: {
      body: { classList: { add() {}, remove() {} } },
      querySelector: () => inertElement
    },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, cards: [] })
      };
    },
    setTimeout,
    clearTimeout
  };

  vm.runInNewContext(source, context);
  requests.length = 0;

  const payload = {
    name: "수정 이름",
    company: "수정 회사",
    department: "개발팀",
    position: "팀장",
    mobile: "010-1111-2222",
    phone: "02-111-2222",
    email: "edit@example.com",
    website: "https://example.com",
    address: "서울시",
    image_path: "/uploads/card.jpg"
  };

  await context.requestCardUpdate(18, payload);
  await context.requestCardDelete(18);

  assert.equal(requests[0].url, "/api/cards/18");
  assert.equal(requests[0].options.method, "PUT");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(requests[0].options.body), payload);
  assert.equal(requests[1].url, "/api/cards/18");
  assert.equal(requests[1].options.method, "DELETE");
});

test("명함 상세 모달은 읽기 상태에서 수정과 삭제 동작을 제공한다", () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardManagement.js"), "utf8");
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
  const detail = context.createCardDetail({
    id: 3,
    name: "홍길동",
    company: "예시회사"
  });

  assert.match(detail, /class="cardDetailActions"/);
  assert.match(detail, /data-action="edit"/);
  assert.match(detail, /data-action="delete"/);
  assert.match(source, /function showCardEditor/);
  assert.match(source, /function saveCardEdits/);
  assert.match(source, /function deleteCurrentCard/);
  assert.match(source, /detailContent\.addEventListener\("click"/);
  assert.match(source, /detailContent\.addEventListener\("submit"/);
});

test("명함 상세 수정 입력과 작업 버튼은 데스크톱과 모바일에 맞게 배치된다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.cardDetailInput\s*\{[\s\S]*width:\s*100%;[\s\S]*font:\s*inherit;/
  );
  assert.match(
    css,
    /\.cardDetailActions\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/
  );
  assert.match(
    css,
    /\.cardDetailActions button\s*\{[\s\S]*cursor:\s*pointer;/
  );
  assert.match(
    css,
    /@media \(max-width:\s*680px\)[\s\S]*\.cardDetailActions button\s*\{[\s\S]*flex:\s*1 1 120px;/
  );
});

test("어두운 상세 명함에서도 수정 버튼의 테두리가 배경과 구분된다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/BCM.css"), "utf8");

  assert.match(
    css,
    /\.cardDetailCard\.card-dark \.cardDetailActions button:not\(\.danger\),[\s\S]*\.cardDetailCard\.card-dark-grey \.cardDetailActions button:not\(\.danger\)\s*\{[\s\S]*border-color:\s*rgba\(255,\s*255,\s*255,\s*\.7\);/
  );
});
