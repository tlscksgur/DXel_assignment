const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function screen({ token = 'a'.repeat(43), pending = '', responseStatus = 200, password = 'owner-final-password' } = {}) {
  const forms = ['verify', 'verification-resend'].map((name) => ({
    dataset: { authForm: name }, hidden: false,
    button: { disabled: false },
    querySelector() { return this.button; },
    resetCalled: false,
    reset() { this.resetCalled = true; },
    addEventListener(event, handler) { this.submit = handler; }
  }));
  const message = { textContent: '' };
  const status = { dataset: {}, querySelector: () => message };
  let calls = 0;
  const requests = [];
  vm.runInNewContext(fs.readFileSync('public/js/authPages.js', 'utf8'), {
    document: {
      querySelector: (selector) => ({
        '.authStatus': status,
        '[data-verification-resend-button]': forms[1].button,
        '[data-auth-form="verify"]': forms[0],
        '[data-auth-form="verification-resend"]': forms[1]
      })[selector] || null,
      querySelectorAll: () => forms,
      body: { classList: { contains: () => false } }
    },
    window: {
      location: { search: token ? `?token=${token}` : '', assign() {} },
      localStorage: { getItem: () => pending, removeItem() {} },
      setTimeout() {}
    },
    URLSearchParams,
    FormData: class { get(name) { return name === 'newPassword' ? password : null; } },
    fetch: async (url, options) => {
      calls += 1;
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: responseStatus === 200, status: responseStatus, json: async () => ({ message: '서버 응답' }) };
    }
  });
  return { verify: forms[0], resend: forms[1], calls: () => calls, requests };
}

test('인증 링크에서는 재전송을 숨기고 인증 완료 후에도 표시하지 않는다', async () => {
  const ui = screen();
  assert.equal(ui.resend.hidden, true);
  assert.equal(ui.verify.hidden, false);
  await ui.verify.submit({ preventDefault() {}, currentTarget: ui.verify });
  assert.equal(ui.resend.hidden, true);
  assert.equal(ui.verify.hidden, true);
});

test('인증 요청은 비밀번호 없이 토큰만 전달하고 완료 후 폼을 숨긴다', async () => {
  const ui = screen();
  await ui.verify.submit({ preventDefault() {}, currentTarget: ui.verify });
  assert.equal(ui.requests[0].url, './api/auth/verify');
  assert.deepEqual(ui.requests[0].body, { token: 'a'.repeat(43) });
  assert.equal(ui.verify.resetCalled, true);
});

test('인증 요청의 입력 오류는 폼을 숨기거나 링크를 만료시키지 않는다', async () => {
  const ui = screen({ responseStatus: 422 });
  await ui.verify.submit({ preventDefault() {}, currentTarget: ui.verify });
  assert.equal(ui.verify.hidden, false);
  assert.equal(ui.resend.hidden, true);
  assert.equal(ui.verify.button.disabled, false);
  assert.equal(ui.verify.resetCalled, false);
});

test('회원가입에서 비밀번호를 입력하고 이메일 인증 화면에는 인증하기 버튼만 표시한다', () => {
  const html = fs.readFileSync('public/verify-email.html', 'utf8');
  const signup = fs.readFileSync('public/signup.html', 'utf8');
  assert.doesNotMatch(html, /type="password"|name="newPassword"/);
  assert.match(html, /class="authPrimaryButton" type="submit">\s*인증하기/);
  assert.match(signup, /name="password" type="password"/);
  assert.match(signup, />인증 메일 받기<\/button>/);
});

test('만료되거나 무효인 링크를 서버에서 확인하면 재전송으로 전환한다', async () => {
  const ui = screen({ responseStatus: 400 });
  await ui.verify.submit({ preventDefault() {}, currentTarget: ui.verify });
  assert.equal(ui.resend.hidden, false);
  assert.equal(ui.verify.hidden, true);
  assert.equal(ui.resend.button.disabled, false);
});

test('일시적인 서버 오류는 만료로 취급하지 않고 인증 재시도를 허용한다', async () => {
  const ui = screen({ responseStatus: 503 });
  await ui.verify.submit({ preventDefault() {}, currentTarget: ui.verify });
  assert.equal(ui.resend.hidden, true);
  assert.equal(ui.verify.hidden, false);
  assert.equal(ui.verify.button.disabled, false);
});

test('가입 직후에는 메일 미수신에 대비해 재전송만 표시한다', () => {
  const ui = screen({ token: '', pending: 'person@example.com' });
  assert.equal(ui.verify.hidden, true);
  assert.equal(ui.resend.hidden, false);
  assert.equal(ui.resend.button.disabled, false);
});

test('토큰도 가입 이메일도 없으면 두 동작을 숨긴다', () => {
  const ui = screen({ token: '' });
  assert.equal(ui.verify.hidden, true);
  assert.equal(ui.resend.hidden, true);
  assert.equal(ui.calls(), 0);
});

test('자바스크립트 실행 전에도 재전송이 깜빡이지 않고 숨김 스타일이 적용된다', () => {
  assert.match(fs.readFileSync('public/verify-email.html', 'utf8'), /data-auth-form="verification-resend" hidden/);
  assert.match(fs.readFileSync('public/css/auth.css', 'utf8'), /\.authVerificationActions \.authForm\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
});
