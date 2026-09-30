# 명함 공유·계정 기능 구현 계획

> 구현은 이 계획의 순서대로 한 항목씩 진행하고, 각 항목의 테스트를 통과한 뒤 다음으로 넘어간다.

## 이어서 작업한 상태 (2026-09-30)

- 계정 스키마/API, 명함 소유권 및 사용자별 그룹·즐겨찾기, 로그인·가입·이메일 인증·비밀번호 재설정 화면과 SMTP 메일러를 코드에 반영했다.
- 만료된 가입 인증 링크를 다시 받을 수 있도록 인증 메일 재발송을 추가했고, 비밀번호 재설정 및 인증 링크 재발송은 1분 간격으로 제한한다.
- 헤더 계정 메뉴의 캡슐·아이콘을 참고 화면에 맞췄다. 1400×1000 및 393×852 화면에서 가로 넘침은 관찰되지 않았다.
- JavaScript 구문 검사와 `git diff --check`는 통과했다. 이번 세션에서는 테스트 실행을 하지 않아, 테스트가 포함된 체크박스는 통과로 표시하지 않는다.
- 실제 회사 SMTP 발송과 운영 HTTPS 환경은 아직 확인하지 않았다. 다중 Node 프로세스 배포 전에는 메모리 기반 로그인 제한을 공유 저장소 기반으로 바꿔야 한다.

**목표:** 비로그인 사용자는 공유 명함을 조회만 할 수 있고, 로그인 사용자는 본인이 등록한 명함 및 계정별 그룹·즐겨찾기를 관리할 수 있도록 한다.

**구조:** SQLite 스키마 변경과 인증 기반을 먼저 만들고, 인증 API 및 소유권 검사를 적용한다. 이후 로그인 전용 화면과 공통 헤더를 연결하고, 회사 SMTP 설정으로 이메일 인증 및 비밀번호 재설정 링크를 보낸다. 브라우저 UI는 권한을 표시할 뿐이며 모든 권한 검사는 서버가 수행한다.

**기술:** 기존 Express 5, SQLite, Node.js 내장 `crypto`와 테스트 러너를 유지한다. SMTP 메일 전송에는 Nodemailer를 추가하고, 운영 비밀값은 환경 변수로만 받는다.

---

## 변경 파일과 책임

- `database/schema.js` (신규): 기존 DB를 보존하면서 계정·세션·재설정·개인 분류 테이블과 필요한 열을 멱등하게 준비한다.
- `database/db.js`: 기존 스키마 준비 코드를 새 초기화 함수로 교체하고 DB 준비 완료 상태를 노출한다.
- `auth/security.js` (신규): 비밀번호 해시/검증, 세션 토큰 생성 및 쿠키 처리에 필요한 순수 보안 함수를 제공한다.
- `auth/routes.js` (신규): 가입, 로그인, 로그아웃, 현재 계정, 프로필 수정, 이메일 인증 및 재설정 API를 등록한다.
- `auth/mailer.js` (신규): Nodemailer SMTP 전송기를 구성하고 인증·재설정 이메일만 전송한다.
- `server.js`: 로그인 세션 읽기, 서버 권한 미들웨어, 명함 소유권 및 계정별 데이터 필터링을 연결한다.
- `test/database-auth-schema.test.js`, `test/auth-security.test.js`, `test/auth-routes.test.js`: 신규 스키마, 보안 함수, 계정 흐름을 분리 검증한다.
- `test/server-integrity.test.js`: 익명 읽기 전용, 명함 소유권, 일괄 작업 무부분 반영, 계정별 그룹·즐겨찾기를 검증한다.
- `public/login.html`, `public/signup.html`, `public/verify-email.html`, `public/reset-password.html`, `public/profile.html` (신규): 계정 화면을 제공한다.
- `public/js/authUI.js` 및 `public/css/auth.css` (신규): 공통 계정 메뉴와 인증 화면 동작·스타일을 제공한다.
- `public/index.html`, `public/BCM.html`, `public/cardAdd.html`, `public/cardImport.html`, `public/cardTrash.html`, `public/js/footerStatus.js`, `public/css/style.css`, `public/css/BCM.css`, `public/css/cardAdd.css`, `public/css/cardImport.css`: 공통 헤더 상태와 읽기 전용 UI를 연결한다.
- `test/auth-ui.test.js` (신규): 모든 페이지의 로그인/로그아웃 UI, 링크, 계정 메뉴를 확인한다.
- `package.json`, `package-lock.json`, `.env.example` (신규): Nodemailer 의존성과 비밀값이 아닌 환경 변수 이름을 기록한다.

## 작업 1: DB 초기화 및 인증용 스키마

**파일:** `database/schema.js`, `database/db.js`, `test/database-auth-schema.test.js`

- [x] **1단계: 실패하는 스키마 테스트 작성**

`initializeSchema(db)`를 메모리 SQLite DB에 실행했을 때 계정·세션·비밀번호 재설정·개인 그룹·즐겨찾기 테이블과 `business_cards.created_by`가 생기고, 두 번 실행해도 성공해야 한다. 기존 명함 행은 삭제되지 않아야 한다.

테스트 파일에서는 SQLite 콜백 API를 Promise로 감싼다. 다음 헬퍼도 같은 테스트 파일에 둔다.

```js
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) {
    error ? reject(error) : resolve(this);
  }));
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params,
    (error, row) => error ? reject(error) : resolve(row)));
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params,
    (error, rows) => error ? reject(error) : resolve(rows)));
}
function close(db) {
  return new Promise((resolve, reject) => db.close(
    (error) => error ? reject(error) : resolve()));
}
async function createLegacyBusinessCardsTable(db) {
  await run(db, `CREATE TABLE business_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT, group_name TEXT, is_favorite INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]')`);
}
```

```js
test("인증 스키마 초기화는 기존 명함을 보존하고 반복 실행할 수 있다", async () => {
  const db = new sqlite3.Database(":memory:");
  await createLegacyBusinessCardsTable(db);
  await run(db, "INSERT INTO business_cards (name) VALUES (?)", ["테스트 명함"]);

  await initializeSchema(db);
  await initializeSchema(db);

  assert.equal((await get(db, "SELECT name FROM business_cards WHERE id = 1")).name, "테스트 명함");
  assert.ok(await get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"));
  assert.ok((await all(db, "PRAGMA table_info(business_cards)")).some((column) => column.name === "created_by"));
  await close(db);
});
```

- [x] **2단계: 테스트가 예상대로 실패하는지 확인**

실행: `node --test test/database-auth-schema.test.js`

예상: `initializeSchema`가 없거나 인증용 테이블/열이 없어 실패한다.

- [x] **3단계: 멱등 초기화 구현**

`users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`, `card_favorites`, `user_card_groups`를 만든다. `created_by`가 없는 기존 DB에만 열을 추가한다. 기존 `group_name`, `is_favorite`, 명함 행은 이 단계에서 삭제하거나 임의 계정에 할당하지 않는다. 서버는 `db.ready` 완료 후 포트를 연다.

- [x] **4단계: 스키마 테스트와 기존 전체 테스트 실행**

실행: `node --test test/database-auth-schema.test.js`, 이어서 `npm test`

예상: 스키마 테스트와 기존 130개 테스트 모두 통과한다. 테스트가 로컬 포트 바인딩 권한 오류를 내면 동일 테스트 명령을 로컬 바인딩 권한으로 다시 실행한다.

## 작업 2: 비밀번호·세션 보안과 계정 API

**파일:** `auth/security.js`, `auth/routes.js`, `server.js`, `test/auth-security.test.js`, `test/auth-routes.test.js`

- [ ] **1단계: 비밀번호/세션 테스트 먼저 작성**

같은 비밀번호라도 해시가 매번 다르고, 올바른 비밀번호만 검증되며, 저장되는 세션 토큰은 원문이 아닌 해시인지 검사한다. 만료되거나 폐기된 세션은 사용자를 반환하지 않아야 한다.

```js
test("비밀번호 해시는 매번 달라도 같은 비밀번호만 검증한다", async () => {
  const first = await hashPassword("strong-password-123");
  const second = await hashPassword("strong-password-123");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("strong-password-123", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
});
```

- [ ] **2단계: 인증 테스트가 올바른 이유로 실패하는지 확인**

실행: `node --test test/auth-security.test.js`

예상: 아직 보안 유틸이 없어 실패한다.

- [ ] **3단계: 최소 보안 함수 구현**

Node `crypto.scrypt`와 타이밍 안전 비교를 사용한다. 세션은 무작위 토큰을 쿠키에만 전달하고 DB에는 토큰 해시, 사용자 ID, 만료 시각을 저장한다. 쿠키 속성은 `HttpOnly`, `SameSite=Lax`, HTTPS에서는 `Secure`로 제한한다.

- [ ] **4단계: 계정 API 동작 테스트 작성 및 RED 확인**

`POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/profile`, `PATCH /api/auth/password`에 대해 중복 이메일, 잘못된 입력, 로그인 쿠키 생성, 로그아웃 후 세션 무효화, 프로필 갱신, 현재 비밀번호 확인을 검증한다. 이메일은 trim 후 소문자 정규화하고 가입 필드는 표시 이름·이메일·비밀번호만 받는다.

가입은 이메일 인증을 요청하고, 인증 링크는 `GET /api/auth/verify?token=...`로 처리한다. 비밀번호 변경은 현재 비밀번호 확인을 요구한다.

- [ ] **5단계: API 최소 구현 후 테스트 통과 확인**

라우트는 요청의 `userId`나 `created_by`를 신뢰하지 않는다. 계정 존재 여부를 추측할 수 있는 오류 메시지를 피하고 로그인 횟수를 제한한다. 변경 요청은 동일 출처 검사를 적용한다. 구현 뒤 `node --test test/auth-security.test.js test/auth-routes.test.js`를 실행한다.

## 작업 3: 소유권·읽기 전용 공개 조회·개인 분류

**파일:** `server.js`, `test/server-integrity.test.js`

- [ ] **1단계: 권한 회귀 테스트 작성**

세션 없는 사용자의 명함 조회는 성공하고 생성·수정·태그 변경·즐겨찾기·그룹 지정·휴지통·가져오기·내보내기는 거부되어야 한다. 사용자 A는 사용자 B의 명함을 변경할 수 없어야 한다. 일괄 작업에서 소유권이 섞이면 어느 행도 변경되지 않아야 한다.

```js
test("익명 사용자는 명함을 읽을 수 있지만 변경할 수 없다", async () => {
  await isolatedServer(async ({ request, card }) => {
    const id = await card("공유 명함");
    assert.equal((await request("GET", "/api/cards")).status, 200);
    assert.equal((await request("DELETE", "/api/cards/:id", {}, { id })).status, 401);
  });
});
```

- [ ] **2단계: 테스트가 현재의 공개 쓰기 허점을 재현하는지 확인**

실행: `node --test test/server-integrity.test.js`

예상: 현재 서버가 로그인 정보를 요구하지 않아 신규 권한 테스트가 실패한다.

- [ ] **3단계: 서버 권한 연결 및 사용자별 데이터 분리**

모든 쓰기·가져오기·휴지통·내보내기 경로에서 서버 세션을 검사한다. 명함 생성 시 `created_by`를 세션 계정으로 기록한다. 익명 목록/상세/이미지 조회는 유지한다. 즐겨찾기와 그룹을 사용자 관계 테이블로 읽고 쓴다. 과거 `group_name`과 `is_favorite` 값은 사용자를 추측해 이전하지 않는다.

로그인 필수 경로는 `/api/cards`, `/api/cards/:id`의 변경 메서드 전체, `/api/cards/:id/tags`, `/api/cards/:id/favorite`, `/api/cards/groups`의 변경·조회, `/api/cards/bulk-*`, `/api/cards/merge*`, `/api/cards/import*`, `/api/cards/export/*`, `/api/cards/extract`, `/api/cards/cropped-image`, `/api/cards/logo-image`다. `GET /api/cards`와 `GET /api/cardSelect`는 활성 공유 명함에 한해 공개한다. `GET /api/cards?trash=1` 및 `/api/cards/:id`의 휴지통 데이터는 로그인 필수다. `/uploads/...` 이미지는 명함 조회와 같은 공개 읽기 정책을 유지한다. 비로그인 상태에서 `/cardAdd.html`, `/cardImport.html`, `/cardTrash.html`, `/profile.html`에 직접 접근해도 로그인 페이지로 보낸다.

- [ ] **4단계: 각 소유권 경계와 기존 무부분 반영 테스트 실행**

단건/일괄 삭제, 복원, 완전 삭제, 태그 수정, 중복 병합을 각각 검사한다. `node --test test/server-integrity.test.js`와 `npm test`를 실행한다. 실패가 나면 해당 경로 테스트를 먼저 수정하지 않고 서버 권한 로직을 고친다.

## 작업 4: 로그인 화면·계정 메뉴·읽기 전용 UI

**파일:** 계정 HTML 5개, `public/js/authUI.js`, `public/css/auth.css`, `public/index.html`, `public/BCM.html`, `public/cardAdd.html`, `public/cardImport.html`, `public/cardTrash.html`, `public/js/footerStatus.js`, `public/css/style.css`, `public/css/BCM.css`, `public/css/cardAdd.css`, `public/css/cardImport.css`, `test/auth-ui.test.js`

- [ ] **1단계: 로그인 상태별 UI 테스트 작성**

모든 페이지에 공통 계정 UI 스크립트가 있고, 로그아웃 상태는 로그인 버튼, 로그인 상태는 이름과 프로필 메뉴를 보여야 한다. 공유·백업은 ‘준비 중’으로만 보인다. 비로그인 화면에서 등록·수정·그룹·즐겨찾기·휴지통·내보내기 동작은 노출되지 않는다.

- [ ] **2단계: 테스트 실패 확인 후 계정 페이지와 공통 헤더 구현**

전달된 헤더 디자인에 맞춰 로그인/가입/프로필/재설정 화면을 만들고, 앱 전체에 공통 계정 메뉴를 붙인다. 인증 API가 권한의 기준이며 UI 숨김은 사용성 용도로만 쓴다.

화면은 참고 헤더와 실제 렌더링 결과를 비교한다. 시각 수정 반복마다 `visual-verdict` 기준으로 확인하고 데스크톱과 모바일 폭을 모두 살핀다.

- [ ] **3단계: 화면 테스트 및 전체 회귀 테스트 실행**

실행: 관련 UI 테스트와 `npm test`

예상: 키보드 접근성, 모바일 너비, 현재 페이지 메뉴, 로그아웃 전환, 임시 메뉴 안내, 비로그인 모드가 모두 통과한다.

## 작업 5: 이메일 인증 및 분실 비밀번호 재설정

**파일:** `auth/mailer.js`, `auth/routes.js`, `package.json`, `package-lock.json`, `.env.example`, `test/auth-routes.test.js`

- [ ] **1단계: 메일 발송 없이도 재설정 보안 규칙을 검사할 수 있는 테스트 작성**

메일러는 테스트용 주입 가능한 전송 인터페이스를 사용한다. 가입 확인 및 재설정 토큰은 DB에 해시로만 저장되고, 토큰은 30분 내 한 번만 성공한다. 등록되지 않은 이메일과 등록된 이메일의 재설정 응답은 같은 모양이어야 한다.

메일러를 인자로 받는 `createPasswordResetService({ db, sendMail, appBaseUrl, now })`를 만든다. 이 서비스는 `requestReset(email)`과 `completeReset(token, newPassword)`를 제공한다. 테스트용 메일러가 받은 URL의 토큰을 꺼내 사용한다.

```js
test("재설정 토큰은 한 번 사용한 뒤 다시 거부된다", async () => {
  let resetUrl = "";
  const service = createPasswordResetService({
    db,
    appBaseUrl: "https://cards.example.test",
    sendMail: async (message) => { resetUrl = message.url; },
    now: () => new Date("2026-09-29T00:00:00Z")
  });
  await service.requestReset("user@example.test");
  const token = new URL(resetUrl).searchParams.get("token");
  assert.equal(await service.completeReset(token, "new-password-123"), true);
  assert.equal(await service.completeReset(token, "another-password-123"), false);
});
```

- [ ] **2단계: 테스트가 실패하는지 확인하고 SMTP 메일 전송 구현**

회사 SMTP 서버, 포트, TLS 설정, 인증 정보, 발신 주소, 앱 기본 URL은 각각 `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `APP_BASE_URL`로 설정한다. 비밀값이 없는 `.env.example`에 변수 이름과 예시 형식만 적는다. 메일 설정이 없거나 전송에 실패하면 API는 재사용 가능한 토큰을 남기지 않고 서비스 이용 불가 응답을 반환한다. 사용자는 요청을 다시 제출할 수 있다.

- [ ] **3단계: 이메일 인증 및 비밀번호 재설정 화면/API 구현**

가입 후 이메일 인증 링크, 분실 재설정 요청, 토큰 검증 및 새 비밀번호 저장 흐름을 제공한다. 만료·재사용·무효 토큰은 거부하고, 이메일 존재 여부는 응답이나 로그에 노출하지 않는다.

- [ ] **4단계: 주입 메일러 테스트와 전체 회귀 테스트 실행**

`node --test test/auth-routes.test.js`와 `npm test`를 실행한다. SMTP 자격 증명이 없는 개발 환경에서는 실제 메일 송수신을 성공했다고 표시하지 않는다.

## 작업 6: 배포 전 권한·설정 최종 확인

**파일:** 인증 관련 전체 변경 파일, `.env.example`, `docs` 설정 문서

- [ ] **1단계: 기능별 권한 표에 맞춰 테스트를 재검토**

익명 읽기와 모든 거부 경로, 두 계정 간 그룹·즐겨찾기 분리, 등록자만 수정 가능, 일괄 변경 원자성을 확인한다.

- [ ] **2단계: 전체 테스트 및 정적 검사 실행**

실행: `npm test`, `git diff --check`

예상: 테스트 전체 통과, 공백 오류 없음, 실 SMTP 비밀값 없음.

- [ ] **3단계: 운영 설정 및 남은 준비사항 기록**

메일 서버와 `APP_BASE_URL`, HTTPS 쿠키, 회사 네트워크 접근 제어, 운영용 빈 DB 준비 절차를 문서화한다. 운영 SMTP가 연결되지 않았다면 이메일 인증 및 분실 복구가 아직 운영 준비 전임을 명확히 표시한다.

## 실행 순서 및 계획 자체 검토

- 설계의 모든 요구사항은 작업 1–6에 연결되어 있다: 최소 가입 정보와 계정 API(2), 등록자 권한과 익명 조회(3), 개인 그룹·즐겨찾기(3), 화면 메뉴 및 임시 버튼(4), 메일 인증 및 1회 재설정(5), 배포 전 검증(6).
- 데이터 삭제나 기존 명함 자동 소유권 이전은 하지 않는다.
- 코드 작성은 각 작업의 실패 테스트를 확인한 뒤에만 시작한다.
- SMTP 비밀값은 저장소에 넣지 않는다. 실제 SMTP 자격 증명이 없으면 전송 통합 시험은 운영 배포 전 남은 검증 항목이다.
- 진행 방식은 사용자 요청에 따라 별도 작업자를 나누지 않고 현재 작업 공간에서 한 단계씩 실행한다.
