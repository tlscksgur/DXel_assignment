# 명함 상세 모달 수정·삭제 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BCM 상세 모달에서 9개 연락처 필드를 수정하고 명함을 삭제할 수 있게 한다.

**Architecture:** 기존 `card.js`의 상세 렌더링을 읽기·편집 두 상태로 확장하고, 기존 Express PUT/DELETE API를 호출한다. 성공 후 목록을 다시 불러와 서버에서 정규화된 값을 화면에 반영하며, 실패 시 모달과 입력값을 유지한다.

**Tech Stack:** Vanilla JavaScript, HTML dialog, CSS, Node.js built-in test runner

---

### Task 1: 수정·삭제 요청 계약 테스트

**Files:**
- Modify: `test/card-management.test.js`
- Modify: `public/js/card.js`

- [ ] **Step 1: 실패 테스트 작성**

`createCardEditor()`가 9개 필드와 저장·취소 버튼을 만들고, `requestCardUpdate()`와 `requestCardDelete()`가 올바른 HTTP 요청을 보내는 테스트를 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test test/card-management.test.js`

Expected: `createCardEditor is not a function` 또는 요청 함수 부재로 FAIL.

- [ ] **Step 3: 최소 요청·렌더링 함수 구현**

`card.js`에 HTML 이스케이프된 입력 필드 렌더링, JSON PUT 요청, DELETE 요청 함수를 추가한다. PUT 본문에는 9개 필드, 기존 `image_path`, 필요 시 `allowDuplicate`를 포함한다.

- [ ] **Step 4: 통과 확인**

Run: `node --test test/card-management.test.js`

Expected: 새 테스트와 기존 테스트가 모두 PASS.

### Task 2: 모달 상호작용 연결

**Files:**
- Modify: `test/card-management.test.js`
- Modify: `public/js/card.js`

- [ ] **Step 1: 실패 테스트 작성**

읽기 모달에 수정·삭제 버튼이 있고 편집 모달에 저장·취소 버튼과 상태 영역이 존재하는지 검사한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test test/card-management.test.js`

Expected: `.cardDetailActions` 또는 `data-action` 마크업 부재로 FAIL.

- [ ] **Step 3: 이벤트와 상태 구현**

현재 명함 ID를 보관하고 이벤트 위임으로 수정 전환, 취소, 저장, 삭제를 처리한다. 저장 성공 후 `loadCards()`로 목록을 새로 불러오고 상세 모달을 갱신한다. 409 중복이면 확인 후 `allowDuplicate: true`로 재요청한다. 삭제는 확인 후 실행하고 성공 시 모달을 닫아 목록을 갱신한다.

- [ ] **Step 4: 통과 확인**

Run: `node --test test/card-management.test.js`

Expected: 전체 PASS.

### Task 3: 반응형 스타일과 전체 회귀 검증

**Files:**
- Modify: `test/card-management.test.js`
- Modify: `public/css/BCM.css`

- [ ] **Step 1: 실패 테스트 작성**

작업 버튼 영역, 입력 필드, 모바일 단일 열 및 버튼 줄바꿈 스타일을 검사한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test test/card-management.test.js`

Expected: `.cardDetailActions`와 `.cardDetailInput` 스타일 부재로 FAIL.

- [ ] **Step 3: 최소 스타일 구현**

현재 명함 색상과 대비되는 반투명 필드, 남색 기본 버튼, 테두리 삭제 버튼을 추가한다. 680px 이하에서는 입력 필드를 한 열로 유지하고 작업 버튼을 화면 폭에 맞춰 배치한다.

- [ ] **Step 4: 전체 테스트 실행**

Run: `npm test`

Expected: 실패 0개.

- [ ] **Step 5: 문법과 변경 범위 확인**

Run: `node --check public/js/card.js && git diff --check && git status --short`

Expected: 문법 오류와 공백 오류가 없고, 사용자 소유 `명함` 파일 외에는 계획된 파일만 변경됨.

