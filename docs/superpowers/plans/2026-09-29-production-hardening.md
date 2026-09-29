# Production Hardening Implementation Plan

> **For agentic workers:** Use superpowers:test-driven-development for each behavior change; run the focused test red, then green. Do not alter access control or duplicate-merge metadata behavior.

**Goal:** Resolve the remaining findings from the production-readiness review without changing authentication policy or duplicate-merge field semantics.

**Architecture:** Keep the existing Express/SQLite and browser-JavaScript architecture. Isolate validation and transaction behavior at the server boundary, keep per-card draft state in the upload queue, and render untrusted content safely in the browser. Tests must use disposable state rather than the working SQLite database and uploaded images.

**Tech Stack:** Node.js, Express, sqlite3, browser JavaScript, `node:test`.

---

### Task 1: Upload and homepage safety

**Files:** `upload.js`, `public/js/slide.js`, focused tests under `test/`.

- [x] Add a failing test that submits an image MIME with an HTML/SVG extension and verifies rejection, plus a test that renders markup-like contact text without creating HTML elements.
- [x] Run the focused tests and confirm the expected failures.
- [x] Validate image extension/MIME/content consistently; render contact fields as text and avoid repeated `innerHTML +=` re-parsing.
- [x] Re-run focused tests and syntax checks.

### Task 2: Server data integrity and lifecycle

**Files:** `server.js`, `localAi.js`, focused tests under `test/`.

- [x] Add failing tests for all-or-nothing bulk actions, image path ownership and cleanup, transaction isolation, and AI request timeout.
- [x] Run focused tests and confirm expected failures.
- [x] Validate requested IDs before bulk updates/deletes, prevent arbitrary cropped-image source deletion, make import/merge transaction statements contiguous, remove only unreferenced images after permanent delete, and bound AI request duration.
- [x] Re-run focused tests and syntax checks.

### Task 3: Registration queue correctness

**Files:** `public/js/cardAdd.js`, focused tests under `test/`.

- [x] Add failing tests for draft preservation, saving while switching queue items, and finding pending items before the current index.
- [x] Run focused tests and confirm expected failures.
- [x] Keep item-specific draft fields, bind save completion to the submitted item, prevent unsafe movement during save, and search the whole queue for remaining work.
- [x] Re-run focused tests and syntax checks.

### Task 4: Import and management correctness

**Files:** `public/js/cardImport.js`, `public/js/cardManagement.js`, focused tests under `test/`.

- [x] Add failing tests for quoted multiline CSV, rapid tag toggles, and stale search failures.
- [x] Run focused tests and confirm expected failures.
- [x] Parse CSV as records with quote state, serialize/coordinate tag updates, and guard both success and failure search responses by request sequence.
- [x] Re-run focused tests and syntax checks.

### Task 5: Deployment verification

**Files:** `README.md`, tests as needed.

- [x] Document that SQLite and uploads are persistent operational data outside Git; include a paired backup/restore procedure and deployment prerequisites.
- [x] Run lint/typecheck/static analysis if configured; run safe focused tests and the full suite only in an isolated copy or after proving it cannot mutate working data.
- [x] Review the diff for the explicitly excluded access-control and duplicate-merge-field changes; report residual risks honestly.
