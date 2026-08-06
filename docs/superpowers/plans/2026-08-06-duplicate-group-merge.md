# Duplicate Group Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 중복 모아보기의 각 후보 그룹을 최근 명함 기준으로 안전하게 한 장으로 병합한다.

**Architecture:** 브라우저는 그룹의 ID 배열만 전송하고, 서버가 SQLite 트랜잭션 안에서 대표 명함 선택·빈 필드 보충·중복 삭제를 모두 처리한다. 성공 후 브라우저는 전체 목록을 다시 조회한다.

**Tech Stack:** Node.js, Express, sqlite3, Vanilla JavaScript, CSS, Node test runner

---

### Task 1: 그룹 병합 API

**Files:**
- Modify: `test/card-management.test.js`
- Modify: `server.js`

- [ ] **Step 1: Write the failing API contract tests**

`test/card-management.test.js`에서 서버 소스를 검사해 `POST /api/cards/merge-group`, 두 개 이상의 `cardIds` 검증, `BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK`이 존재하는지 확인한다.

```js
assert.match(source, /app\.post\("\/api\/cards\/merge-group"/);
assert.match(source, /BEGIN TRANSACTION/);
assert.match(source, /ROLLBACK/);
assert.match(source, /COMMIT/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/card-management.test.js`

Expected: 새 그룹 병합 라우트가 없어서 FAIL.

- [ ] **Step 3: Implement the transaction-backed endpoint**

`server.js`에 `POST /api/cards/merge-group`를 추가한다. 정수 ID를 중복 제거하고 2개 이상인지 검증한다. 모든 레코드를 `created_at DESC, id DESC`로 조회하고 첫 행을 대표 명함으로 선택한다. 아래 필드를 대표 명함 우선으로 합친다.

```js
const MERGE_FIELDS = [
  "name", "company", "department", "position", "mobile",
  "phone", "email", "address", "website", "image_path"
];
```

`BEGIN TRANSACTION` 후 대표 명함을 갱신하고 나머지 ID를 삭제한 뒤 `COMMIT`한다. 어느 단계든 실패하면 `ROLLBACK`하고 오류를 반환한다.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/card-management.test.js`

Expected: PASS.

### Task 2: 중복 그룹 병합 버튼과 요청 흐름

**Files:**
- Modify: `test/card-management.test.js`
- Modify: `public/js/card.js`

- [ ] **Step 1: Write failing browser behavior tests**

병합 버튼 렌더링, ID 배열 직렬화, 올바른 API 요청을 검사한다.

```js
assert.match(html, /class="duplicateMergeButton"/);
await context.requestDuplicateMerge([9, 7]);
assert.equal(requests[0].url, "/api/cards/merge-group");
assert.deepEqual(JSON.parse(requests[0].options.body), { cardIds: [9, 7] });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/card-management.test.js`

Expected: 병합 버튼과 요청 함수가 없어 FAIL.

- [ ] **Step 3: Implement minimal browser behavior**

`renderDuplicateGroups()`에서 그룹 ID를 `data-card-ids`에 넣은 병합 버튼을 만든다. 보드 클릭 위임에서 버튼 클릭을 명함 상세 열기보다 먼저 처리한다. 확인창 승인 후 요청하고, 처리 중 버튼을 비활성화하며 성공 시 `loadCards()`를 호출한다.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test test/card-management.test.js`

Expected: PASS.

### Task 3: 병합 버튼 스타일 및 전체 검증

**Files:**
- Modify: `test/card-management.test.js`
- Modify: `public/css/BCM.css`

- [ ] **Step 1: Write failing CSS test**

`.duplicateGroupMeta`와 `.duplicateMergeButton`의 배치, hover, disabled 상태가 정의되는지 검사한다.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/card-management.test.js`

Expected: 새 CSS 선택자가 없어 FAIL.

- [ ] **Step 3: Implement responsive button styles**

그룹 제목 오른쪽에 장수와 병합 버튼을 나란히 배치하고 작은 화면에서는 자연스럽게 줄바꿈한다. 버튼은 기존 적갈색 강조색을 사용하고 비활성 상태를 시각적으로 구분한다.

- [ ] **Step 4: Run all tests**

Run: `npm test`

Expected: 전체 PASS, 경고와 구문 오류 없음.

- [ ] **Step 5: Run static and manual verification**

Run: `node --check server.js && node --check public/js/card.js && git diff --check`

브라우저에서 중복 그룹 병합 확인창, 병합 결과 한 장 유지, 중복 그룹 제거를 확인한다.
