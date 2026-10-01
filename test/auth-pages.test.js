const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const projectRoot = path.join(__dirname, "..");

test("비밀번호 재설정 토큰이 없으면 새 비밀번호 입력 폼을 숨긴다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/reset-password.html"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");

  assert.match(html, /data-auth-form="reset-complete" hidden/);
  assert.match(styles, /\.authForm\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});

test("로그인, 회원가입, 비밀번호 찾기는 인증 화면과 같은 점무늬 배경을 쓴다", () => {
  const styles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");
  const pageFiles = ["login.html", "signup.html", "reset-password.html"];

  for (const file of pageFiles) {
    const html = fs.readFileSync(path.join(projectRoot, "public", file), "utf8");
    assert.match(html, /<body class="authPage">/);
  }

  assert.match(
    styles,
    /\.authPage:not\(\.profile-page\):not\(\.authVerificationPage\)\s*\{[^}]*background-color:\s*#fdfbf8;[^}]*background-image:\s*radial-gradient\(rgba\(128, 116, 96, \.23\) \.8px, transparent \.8px\);[^}]*background-size:\s*28px 28px;/s,
  );
});

test("비밀번호 생성·재설정·변경 화면은 최소 5자를 안내한다", () => {
  const pages = ["signup.html", "reset-password.html", "profile.html"];

  for (const file of pages) {
    const html = fs.readFileSync(path.join(projectRoot, "public", file), "utf8");
    assert.match(html, /type="password"[^>]*minlength="5" maxlength="128"/);
    assert.doesNotMatch(html, /minlength="10"/);
  }

  const signup = fs.readFileSync(path.join(projectRoot, "public/signup.html"), "utf8");
  assert.match(signup, /5자 이상 입력해 주세요\./);
});

test("로그인 후에도 명함 등록과 계정 메뉴를 헤더에 표시한다", () => {
  const styles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, "public/js/authUI.js"), "utf8");

  assert.match(source, /classList\.toggle\("isAuthenticated", Boolean\(user\)\)/);
  assert.doesNotMatch(styles, /\.isAuthenticated \.authHeaderActions\s*\{\s*display:\s*none;\s*\}/);
  assert.match(styles, /\.authHeaderActions\s*\{[^}]*display:\s*inline-flex;/s);
  assert.match(source, /const registerLink = headerActions\?\.querySelector\("\.cardAdd"\);[\s\S]*?headerActions\.append\(createAccountMenu\(user\)\)/);
});

test("계정 메뉴는 화살표 없이 계정 칩 전체를 클릭 가능한 버튼으로 둔다", () => {
  const styles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, "public/js/authUI.js"), "utf8");

  assert.match(source, /trigger\.className = "accountMenuTrigger";[\s\S]*?trigger\.type = "button";[\s\S]*?trigger\.innerHTML\s*=\s*'[^']*class="accountAvatar"[^']*class="accountTriggerName"[^']*'/);
  assert.doesNotMatch(source, /accountChevron/);
  assert.doesNotMatch(styles, /\.accountChevron/);
  assert.match(styles, /\.accountMenuTrigger:hover,\s*\.accountMenuTrigger\[aria-expanded="true"\]\s*\{[^}]*background-color:/s);
  assert.match(styles, /\.accountMenuTrigger:focus-visible\s*\{[^}]*outline:/s);
  assert.match(source, /trigger\.addEventListener\("click"[\s\S]*?trigger\.setAttribute\("aria-expanded", String\(!menu\.hidden\)\)/);
});

test("계정 메뉴 패널은 헤더 버튼 묶음의 전체 너비에 맞춘다", () => {
  const styles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");

  assert.match(styles, /\.authHeaderActions\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*20;/s);
  assert.doesNotMatch(styles, /\.accountMenu\s*\{[^}]*position:\s*relative;/s);
  assert.match(styles, /\.accountMenuPanel\s*\{[^}]*left:\s*-1px;[^}]*right:\s*-1px;[^}]*width:\s*auto;/s);
  assert.doesNotMatch(styles, /\.accountMenuPanel\s*\{[^}]*width:\s*260px;/s);
  assert.doesNotMatch(styles, /\.accountMenuPanel\s*\{[^}]*width:\s*min\(260px,/s);
});

test("모바일 헤더는 불러오기를 계정 메뉴로 옮기고 데스크톱 내비게이션은 유지한다", () => {
  const headerStyles = fs.readFileSync(path.join(projectRoot, "public/css/style.css"), "utf8");
  const authStyles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, "public/js/authUI.js"), "utf8");
  const mobileHeader = headerStyles.slice(
    headerStyles.indexOf("@media (max-width: 680px)"),
    headerStyles.indexOf("@media (max-width: 380px)")
  );

  assert.match(source, /const importLink = makeMenuItem\(\s*"불러오기",[\s\S]*?"\.\/cardImport\.html",\s*null,[\s\S]*?"import"\s*\)/);
  assert.match(source, /importLink\.classList\.add\("accountMenuImport"\)/);
  assert.doesNotMatch(source, /데이터 백업|backup:/);
  assert.match(authStyles, /\.accountMenuImport\s*\{\s*display:\s*none;\s*\}/);
  assert.ok(authStyles.lastIndexOf(".accountMenuImport { display: flex; }") > authStyles.lastIndexOf("@media (max-width: 680px)"));
  assert.match(mobileHeader, /\.headerBox1 ul li:nth-child\(3\)\s*\{\s*display:\s*none;\s*\}/);
  assert.doesNotMatch(mobileHeader, /li:nth-child\(3\) a::after/);
});

test("인증 관련 화면은 홈 링크를 기존 페이지 링크와 같은 가로 줄에 둔다", () => {
  const signup = fs.readFileSync(path.join(projectRoot, "public/signup.html"), "utf8");
  const reset = fs.readFileSync(path.join(projectRoot, "public/reset-password.html"), "utf8");
  const verification = fs.readFileSync(path.join(projectRoot, "public/verify-email.html"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");

  assert.match(signup, /<nav class="authLinks"><a href="\.\/index\.html">홈으로<\/a><a href="\.\/login\.html">로그인으로 돌아가기<\/a><\/nav>/);
  assert.match(reset, /<nav class="authLinks"><a href="\.\/index\.html">홈으로<\/a><a href="\.\/login\.html">로그인으로 돌아가기<\/a><\/nav>/);
  assert.match(verification, /<nav class="authLinks authVerificationLinks">\s*<a href="\.\/index\.html">홈으로<\/a>\s*<span class="authVerificationLinkGroup"><a href="\.\/login\.html">[\s\S]*?<\/a><span class="authVerificationHelp">도움이 필요하신가요\?<\/span><\/span>\s*<\/nav>/);
  assert.doesNotMatch(styles, /authHomeLinks/);
  assert.doesNotMatch(styles, /\.authHomeButton/);
  assert.match(styles, /\.authVerificationLinkGroup\s*\{[^}]*display:\s*flex;[^}]*gap:\s*12px;/s);
});

test("프로필 설정 헤더는 다른 페이지와 같은 세 가지 이동 메뉴를 제공한다", () => {
  const profile = fs.readFileSync(path.join(projectRoot, "public/profile.html"), "utf8");

  assert.match(profile, /<a class="logo" href="\.\/index\.html">명함관리<\/a>/);
  assert.match(profile, /<ul><li><a href="\.\/index\.html">홈<\/a><\/li><li><a href="\.\/BCM\.html">명함관리<\/a><\/li><li><a href="\.\/cardImport\.html">명함 데이터 불러오기<\/a><\/li><\/ul>/);
  assert.doesNotMatch(profile, /<nav class="authLinks"><a href="\.\/index\.html">홈으로<\/a><a href="\.\/BCM\.html">명함관리로 돌아가기<\/a><\/nav>/);
});

test("로그인 화면은 홈 링크를 왼쪽에, 비밀번호 찾기와 회원가입을 오른쪽에 나란히 둔다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/login.html"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");

  assert.match(
    html,
    /<nav class="authLinks authLoginLinks">\s*<a href="\.\/index\.html">홈으로<\/a>\s*<span class="authLoginLinkGroup"><a href="\.\/reset-password\.html">비밀번호 찾기<\/a><a href="\.\/signup\.html">회원가입<\/a><\/span>\s*<\/nav>/
  );
  assert.match(styles, /\.authLoginLinkGroup\s*\{[^}]*display:\s*flex;[^}]*gap:\s*12px;/s);
});

test("이메일 인증 화면은 입력칸 없이 가입 이메일로 재전송한다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/verify-email.html"), "utf8");
  const source = fs.readFileSync(path.join(projectRoot, "public/js/authPages.js"), "utf8");
  const styles = fs.readFileSync(path.join(projectRoot, "public/css/auth.css"), "utf8");

  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotMatch(html, /<input[^>]*name="email"/);
  assert.match(html, /class="authPage authVerificationPage"/);
  assert.match(html, /class="authSecurityBadge"/);
  assert.match(html, /class="authStatus authVerificationNotice"/);
  assert.match(html, /data-auth-status-message/);
  assert.match(html, /class="authHelpNote"/);
  assert.match(html, /class="authFooter"/);
  assert.doesNotMatch(html, /authVerificationRecipient/);
  assert.match(styles, /\.authVerificationCard\s*\{/);
  assert.match(styles, /\.authVerificationPage\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100svh;[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.authVerificationPage > main\s*\{[^}]*width:\s*min\(460px, calc\(100% - 32px\)\)/s);
  assert.match(styles, /\.authVerificationPage > main\s*\{[^}]*flex:\s*1 1 auto;[^}]*justify-content:\s*center/s);
  assert.match(styles, /\.authVerificationCard\s*\{[^}]*width:\s*100%/s);
  assert.doesNotMatch(styles, /\.authVerificationPage > header\s*\{[^}]*height:/s);
  assert.match(source, /querySelectorAll\("\[data-auth-form\]"\)/);
  assert.match(source, /pendingVerificationEmailKey = "bcmPendingVerificationEmail"/);
  assert.match(source, /localStorage\.setItem\(pendingVerificationEmailKey/);
  assert.match(source, /localStorage\.getItem\(pendingVerificationEmailKey\)/);
  assert.match(source, /email:\s*pendingVerificationEmail,[\s\S]*token:\s*hasVerificationToken \? token : ""/);
  assert.match(source, /window\.location\.assign\("\.\/verify-email\.html"\)/);
});

test("이미 가입 요청된 이메일은 인증 메일 재발송 화면으로 안내한다", async () => {
  const source = fs.readFileSync(path.join(projectRoot, "public/js/authPages.js"), "utf8");
  const localStorage = new Map();
  const assignedUrls = [];
  let submitHandler;
  const statusMessage = { textContent: "" };
  const status = { dataset: {}, querySelector: () => statusMessage };
  const submitButton = { disabled: false };
  const form = {
    dataset: { authForm: "signup" },
    addEventListener: (eventName, handler) => { submitHandler = handler; },
    querySelector: () => submitButton
  };
  const document = {
    querySelector: (selector) => selector === ".authStatus" ? status : null,
    querySelectorAll: (selector) => selector === "[data-auth-form]" ? [form] : [],
    body: { classList: { contains: () => false } }
  };
  const window = {
    location: { search: "", assign: (url) => assignedUrls.push(url) },
    localStorage: {
      getItem: (key) => localStorage.get(key) || null,
      setItem: (key, value) => localStorage.set(key, value),
      removeItem: (key) => localStorage.delete(key)
    },
    setTimeout: () => {}
  };
  const context = {
    document,
    window,
    URLSearchParams,
    FormData: class {
      get(key) {
        return { displayName: "신찬혁", email: " CHSHIN@DXEL.CO.KR ", password: "password123" }[key];
      }
    },
    fetch: async () => ({
      ok: false,
      status: 409,
      json: async () => ({ success: false, message: "이 이메일은 이미 가입되어 있습니다." })
    })
  };

  vm.runInNewContext(source, context);
  await submitHandler({ preventDefault() {}, currentTarget: form });

  assert.equal(localStorage.get("bcmPendingVerificationEmail"), "chshin@dxel.co.kr");
  assert.deepEqual(assignedUrls, ["./verify-email.html?resend=1"]);
});
