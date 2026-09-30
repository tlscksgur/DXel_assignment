const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const projectRoot = path.join(__dirname, "..");

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
