# Duplicate Group Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 중복 후보 그룹을 가운데에서 시작해 한 줄에 최대 3개씩 배치한다.

**Architecture:** 기존 HTML 생성 로직은 유지하고 `duplicateMode` 컨테이너를 가운데 정렬된 flex-wrap 레이아웃으로 변경한다. 그룹 너비를 400px로 유지해 1280px 컨테이너에는 최대 3개가 들어가며, 나머지는 다음 줄로 자동 배치한다.

**Tech Stack:** HTML, CSS, Node.js 내장 테스트 러너

---

### Task 1: 반응형 중복 그룹 배치

**Files:**
- Modify: `test/card-management.test.js`
- Modify: `public/css/BCM.css`

- [ ] **Step 1: 실패하는 CSS 회귀 테스트 작성**

`duplicateMode`가 가운데 정렬된 flex-wrap이고 그룹 기준 너비가 400px인지 정규식으로 검사한다.

- [ ] **Step 2: 테스트가 올바르게 실패하는지 확인**

Run: `node --test test/card-management.test.js`

Expected: 기존 고정 열 그리드 때문에 가운데에서 시작하는 flex-wrap 테스트가 실패한다.

- [ ] **Step 3: 최소 CSS 구현**

`.bcmBoard.duplicateMode`를 가운데 정렬된 flex-wrap으로 바꾼다. `.duplicateGroup`은 400px 기준 너비와 100% 최대 너비를 사용하며 기존 카드 크기는 유지한다.

- [ ] **Step 4: 전체 테스트 실행**

Run: `npm test`

Expected: 모든 테스트가 통과한다.

- [ ] **Step 5: 정적 검증**

Run: `git diff --check`

Expected: 공백 오류가 없다.
