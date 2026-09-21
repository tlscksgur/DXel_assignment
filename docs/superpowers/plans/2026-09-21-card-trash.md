# Card Trash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 삭제 명함을 휴지통으로 이동하고 복원 또는 영구 삭제할 수 있게 만든다.

**Architecture:** SQLite `deleted_at` 컬럼을 소프트 삭제 상태로 사용한다. 서버는 기본 조회와 파생 조회에서 휴지통 명함을 제외하며, 별도 휴지통 페이지가 복원과 영구 삭제 API를 사용한다.

**Tech Stack:** Node.js, Express, SQLite, vanilla HTML/CSS/JavaScript, node:test.

---

### Task 1: 데이터베이스와 서버 API

**Files:**
- Modify: `database/db.js`
- Modify: `server.js`
- Test: `test/card-management.test.js`

- [ ] **Step 1: 삭제 상태와 API 계약을 확인하는 실패 테스트를 작성한다.**

```js
assert.match(databaseSource, /deleted_at TEXT/);
assert.match(serverSource, /app\.patch\("\/api\/cards\/:id\/restore"/);
assert.match(serverSource, /app\.delete\("\/api\/cards\/:id\/permanent"/);
assert.match(serverSource, /deleted_at IS NULL/);
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다.**

Run: `node --test test/card-management.test.js`

- [ ] **Step 3: `deleted_at` 마이그레이션과 소프트 삭제·복원·영구 삭제 API를 구현한다.**

```js
db.run("UPDATE business_cards SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
db.run("UPDATE business_cards SET deleted_at = NULL WHERE id = ?", [id]);
db.run("DELETE FROM business_cards WHERE id = ?", [id]);
```

- [ ] **Step 4: 테스트를 다시 실행한다.**

Run: `node --test test/card-management.test.js`

### Task 2: 휴지통 페이지와 조작 UI

**Files:**
- Create: `public/cardTrash.html`
- Create: `public/js/cardTrash.js`
- Modify: `public/css/BCM.css`
- Modify: `public/BCM.html`
- Test: `test/card-management.test.js`

- [ ] **Step 1: 헤더의 휴지통 링크, 목록, 복원·영구 삭제 제어를 확인하는 실패 테스트를 작성한다.**

```js
assert.match(html, /href="\.\/cardTrash\.html"/);
assert.match(trashSource, /\/api\/cards\?trash=1/);
assert.match(trashSource, /\/restore/);
assert.match(trashSource, /\/permanent/);
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다.**

Run: `node --test test/card-management.test.js`

- [ ] **Step 3: 휴지통 전용 페이지와 명확한 복원·영구 삭제 버튼을 구현한다.**

```html
<button data-trash-action="restore">복원</button>
<button data-trash-action="permanent-delete">영구 삭제</button>
```

- [ ] **Step 4: 테스트를 다시 실행한다.**

Run: `node --test test/card-management.test.js`

### Task 3: 회귀 검증

**Files:**
- Test: `test/card-management.test.js`
- Test: `test/server-import.test.js`

- [ ] **Step 1: 관련 테스트와 형식 검사를 실행한다.**

Run: `node --test test/card-management.test.js && git diff --check`

- [ ] **Step 2: 일반 목록, 내보내기, 중복 판정에서 휴지통 명함이 제외되는지 코드 경로를 검토한다.**

```sql
WHERE deleted_at IS NULL
```
