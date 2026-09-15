# Card Selection and Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 명함관리 디자인을 유지하면서 카드 다중 선택, 선택 항목 내보내기·그룹 지정·삭제, 그룹 보기와 중복 보기를 제공한다.

**Architecture:** SQLite 명함 테이블에 단일 `group_name` 열을 호환성 마이그레이션으로 추가한다. 서버는 그룹 일괄 지정, 일괄 삭제, 선택 ID 기반 CSV 내보내기를 제공하고, 브라우저는 보기 모드와 선택 ID를 별도 상태로 관리한다. 검색창과 기존 카드 마크업은 필요한 클래스 외에는 변경하지 않는다.

**Tech Stack:** Express, SQLite, vanilla JavaScript, HTML/CSS, Node.js test runner

---

### Task 1: UI 계약 회귀 테스트

**Files:**
- Modify: `test/card-management.test.js`
- Test: `test/card-management.test.js`

- [ ] **Step 1: Write the failing tests**

  검색창 옆 기존 중복 버튼이 제거되고, 별도 목록 도구에 `그룹보기`, `중복보기`, `선택`이 존재하는지 검사한다. 선택 작업 바에는 `내보내기`, `그룹 지정`, `삭제`만 있는지 검사한다. 카드 선택 상태가 원형 체크 요소가 아닌 `.is-selected` 테두리로 표현되는지 검사한다.

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test test/card-management.test.js`

  Expected: 새 도구 마크업과 선택 스타일이 없어서 FAIL.

### Task 2: 저장소 및 API 계약

**Files:**
- Modify: `database/db.js`
- Modify: `server.js`
- Modify: `test/card-management.test.js`

- [ ] **Step 1: Write the failing tests**

  `group_name` 생성·기존 DB 마이그레이션, `PATCH /api/cards/groups`, `POST /api/cards/bulk-delete`, CSV의 선택 ID 필터를 검사한다.

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test test/card-management.test.js`

  Expected: 스키마 열과 API가 없어서 FAIL.

- [ ] **Step 3: Implement the minimal server behavior**

  명함 ID는 양의 정수 배열만 허용하고 SQL 자리표시자를 사용한다. 그룹명은 공백을 정리해 저장하며, 선택 삭제는 요청한 모든 ID가 존재할 때만 트랜잭션으로 처리한다. CSV 내보내기는 `ids=1,2`가 있을 때 해당 명함만 포함하고 없으면 기존처럼 전체를 포함한다.

- [ ] **Step 4: Run test to verify it passes**

  Run: `node --test test/card-management.test.js`

### Task 3: 선택 및 보기 동작

**Files:**
- Modify: `public/BCM.html`
- Modify: `public/js/cardManagement.js`
- Modify: `public/css/BCM.css`
- Test: `test/card-management.test.js`

- [ ] **Step 1: Implement the minimal browser behavior**

  `전체`, `그룹`, `중복` 보기 상태와 선택 모드를 분리한다. 선택 모드의 카드 클릭은 상세 모달 대신 ID 선택을 토글하고, 선택 카드에는 `.is-selected`만 적용한다. 한 장 이상 선택됐을 때만 하단 작업 바를 표시한다.

- [ ] **Step 2: Implement bulk actions**

  선택 내보내기는 기존 CSV API에 ID를 전달한다. 그룹 지정은 기존 그룹명을 제안하는 입력 다이얼로그로 저장한다. 삭제는 확인 후 일괄 삭제 API를 호출한다.

- [ ] **Step 3: Implement grouped rendering**

  `group_name`별 섹션과 `그룹 미지정` 섹션을 렌더링한다. `그룹보기`와 `중복보기`는 상호 배타적으로 활성화되고 다시 누르면 전체 보기로 돌아간다.

- [ ] **Step 4: Preserve responsive behavior**

  새 도구 행, 그룹 섹션, 하단 작업 바와 그룹 다이얼로그만 반응형으로 추가한다. 기존 검색창 크기와 카드별 색상·크기·기울기는 변경하지 않는다.

### Task 4: 전체 검증

**Files:**
- Test: `test/card-management.test.js`
- Test: `test/responsive-layout.test.js`
- Test: `test/upload-flow.test.js`

- [ ] **Step 1: Run focused tests**

  Run: `node --test test/card-management.test.js test/responsive-layout.test.js`

  Expected: PASS.

- [ ] **Step 2: Run full suite**

  Run: `npm test`

  Expected: 모든 테스트 PASS, 경고와 미처리 오류 없음.

- [ ] **Step 3: Review the diff**

  Run: `git diff --check && git diff -- public/BCM.html public/js/cardManagement.js public/css/BCM.css database/db.js server.js test/card-management.test.js`

  Expected: 공백 오류가 없고 요청 범위 밖의 디자인 변경이 없음.
