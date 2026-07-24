# Multi-Card Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select several business-card images, review them one at a time, save each confirmed card, and automatically continue through the queue.

**Architecture:** Keep the existing single-image backend endpoints. Add a browser-side queue whose items own the selected `File`, preview URL, extraction result, server image path, and lifecycle status. Process only the active item so the local vision model never receives concurrent requests.

**Tech Stack:** Browser JavaScript, Fetch/FormData, Express APIs already present, Node built-in test runner.

---

### Task 1: Lock the queue lifecycle with tests

**Files:**
- Modify: `test/upload-flow.test.js`

- [ ] Add a browser test that selects two files and asserts both appear in the queue while only the first is analyzed.
- [ ] Add a browser test that saves the first ready card and asserts the second becomes active and is analyzed.
- [ ] Add a browser test for skipping/removing the active queue item.
- [ ] Run `node --test test/upload-flow.test.js` and verify the new tests fail because queue behavior is absent.

### Task 2: Implement queue state and sequential extraction

**Files:**
- Modify: `public/js/cardAdd.js`

- [ ] Replace `uploadedImagePath` with `uploadQueue`, `currentQueueIndex`, and `isAnalyzing`.
- [ ] Convert selected files into queue items with `waiting`, `processing`, `ready`, `saved`, or `error` status.
- [ ] Add `renderQueue()`, `showQueueItem()`, and `analyzeCurrentCard()` so only the active item calls `/api/cards/extract`.
- [ ] Clear the file input after enqueueing so the same file can be selected again.
- [ ] Run `node --test test/upload-flow.test.js` and verify extraction and queue tests pass.

### Task 3: Advance the queue after confirmation

**Files:**
- Modify: `public/js/cardAdd.js`

- [ ] Read `image_path` from the active queue item in `getCardFormData()`.
- [ ] Make `submitCard()` return a success boolean and preserve the existing 409 duplicate flow.
- [ ] On successful save, mark the active item `saved` and advance to the next unsaved item.
- [ ] Wire “다음 명함” to skip the active item after confirmation.
- [ ] Wire “취소” to remove the active item and revoke its preview URL.
- [ ] Show an all-complete state without redirecting away from the upload page.

### Task 4: Style and verify the queue

**Files:**
- Modify: `public/css/cardAdd.css`
- Test: `test/upload-flow.test.js`

- [ ] Add scrollable queue-list styles, active-row emphasis, and status colors.
- [ ] Run `npm test` and expect zero failures.
- [ ] Run `node --check public/js/cardAdd.js` and `git diff --check`.
- [ ] Verify a two-file flow: select, analyze first, save, analyze second, save, complete.
