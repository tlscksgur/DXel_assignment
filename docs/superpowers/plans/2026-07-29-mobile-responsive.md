# Mobile Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 휴대폰에서 홈, 명함 등록, 명함관리 화면을 정상적으로 사용할 수 있는 반응형 레이아웃을 만든다.

**Architecture:** 기존 HTML과 JavaScript는 유지하고 공통 CSS와 페이지별 CSS에 미디어 쿼리를 추가한다. 900px에서는 큰 레이아웃을 한 열로 전환하고 680px에서는 모바일 간격과 폼 배치를 적용한다.

**Tech Stack:** HTML, CSS, Node.js 내장 테스트 러너

---

### Task 1: 반응형 요구사항 고정

**Files:**
- Create: `test/responsive-layout.test.js`

- [ ] 모바일 viewport 설정과 CSS 미디어 쿼리를 검사하는 실패 테스트를 작성한다.
- [ ] `node --test test/responsive-layout.test.js`를 실행해 미디어 쿼리 부재로 실패하는지 확인한다.

### Task 2: 공통 화면 반응형

**Files:**
- Modify: `public/css/style.css`

- [ ] 900px 이하에서 공통 간격을 줄인다.
- [ ] 680px 이하에서 헤더를 줄바꿈하고 홈 카드와 푸터를 모바일 너비로 바꾼다.

### Task 3: 명함 등록 및 관리 반응형

**Files:**
- Modify: `public/css/cardAdd.css`
- Modify: `public/css/BCM.css`

- [ ] 등록 화면을 900px 이하에서 한 열로 변경한다.
- [ ] 등록 폼을 680px 이하에서 한 열로 변경한다.
- [ ] BCM 검색 도구와 중복 그룹이 모바일 너비에 맞도록 조정한다.

### Task 4: 검증

**Files:**
- Test: `test/responsive-layout.test.js`
- Test: `test/card-management.test.js`
- Test: `test/upload-flow.test.js`

- [ ] `npm test`를 실행해 전체 테스트가 통과하는지 확인한다.
- [ ] `git diff --check`로 CSS 공백 오류를 확인한다.
