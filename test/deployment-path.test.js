const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
let deployment = {};
try { deployment = require('../deployment'); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const { sessionCookie } = require('../auth/security');

test('공개 주소의 하위 경로를 메일 링크에서도 보존한다', () => {
  assert.equal(typeof deployment.publicPageUrl, 'function');
  assert.equal(deployment.publicPageUrl('http://61.39.70.66:7777/businessCard', '/verify-email.html').href,
    'http://61.39.70.66:7777/businessCard/verify-email.html');
  assert.equal(deployment.publicPageUrl('https://cards.example/businessCard/', 'reset-password.html').href,
    'https://cards.example/businessCard/reset-password.html');
  assert.equal(deployment.applicationBasePath('http://localhost:3000'), '');
  assert.throws(() => deployment.applicationBasePath('https://example.test/app?secret=1'));
  assert.deepEqual(deployment.additionalOrigins('http://192.168.210.10:7777'), ['http://192.168.210.10:7777']);
  assert.throws(() => deployment.additionalOrigins('http://192.168.210.10:7777/path'));
});

test('세션 쿠키는 명함 앱 경로로 제한한다', () => {
  assert.match(sessionCookie('token', { path: '/businessCard/', secure: true }), /Path=\/businessCard\//);
  assert.match(sessionCookie('', { path: '/businessCard/', maxAge: 0 }), /Path=\/businessCard\/;.*Max-Age=0/);
  assert.throws(() => sessionCookie('token', { path: '/bad; Path=/' }));
});

test('브라우저 API·내보내기·이미지 주소는 현재 앱 경로 안에서 해석된다', () => {
  const directory = path.join(__dirname, '../public/js');
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    assert.doesNotMatch(source, /["'`]\/api\//, file);
  }
  const source = fs.readFileSync(path.join(directory, 'cardManagement.js'), 'utf8');
  const context = { escapeHtml: (value) => value };
  const imageFunction = source.match(/function createCardOriginalImage\(contact\) \{[\s\S]*?\n\}/)[0];
  vm.runInNewContext(imageFunction, context);
  const html = context.createCardOriginalImage({ image_path: '/uploads/test.jpg', name: '확인' });
  assert.match(html, /src="\.\/uploads\/test.jpg"/);
  assert.equal(new URL('./api/cards/export/csv', 'http://cards.test/businessCard/BCM.html').pathname,
    '/businessCard/api/cards/export/csv');
  assert.equal(new URL('./uploads/test.jpg', 'http://cards.test/businessCard/BCM.html').pathname,
    '/businessCard/uploads/test.jpg');
  assert.doesNotMatch(context.createCardOriginalImage({ image_path: 'https://attacker.test/image.jpg' }), /<img/);
});

test('페이지와 API는 앱 경로 안에서 제공하고 뒤 슬래시를 정규화한다', async () => {
  assert.equal(typeof deployment.mountApplication, 'function');
  const app = express();
  app.get('/api/check', (req, res) => res.json({ path: req.path }));
  app.use(express.static('public'));
  const host = deployment.mountApplication(express, app, '/businessCard');
  const server = await new Promise((resolve) => {
    const listening = host.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const redirect = await fetch(`${origin}/businessCard?token=test`, { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/businessCard/?token=test');
    assert.equal((await fetch(`${origin}/businessCard/`)).status, 200);
    assert.equal((await fetch(`${origin}/businessCard/js/authPages.js`)).status, 200);
    assert.equal((await fetch(`${origin}/businessCard/api/check`)).status, 200);
    assert.equal((await fetch(`${origin}/api/check`)).status, 404);
    assert.equal((await fetch(`${origin}/other-web/`)).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('실제 서버의 보호 페이지 이동과 계정 API도 하위 경로를 따른다', async () => {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcm-subpath-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test',
      APP_BASE_URL: `${origin}/businessCard`, APP_ALLOWED_ORIGINS: '', TRUST_PROXY: '',
      DATABASE_PATH: path.join(dir, 'cards.db'),
      SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASSWORD: '', MAIL_FROM: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('하위 경로 서버 시작 시간 초과')), 5000);
      child.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('Server running')) { clearTimeout(timeout); resolve(); }
      });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('하위 경로 서버가 종료되었습니다.')); });
    });
    const protectedPage = await fetch(`${origin}/businessCard/cardAdd.html`, { redirect: 'manual' });
    assert.equal(protectedPage.status, 302);
    assert.equal(protectedPage.headers.get('location'), '/businessCard/login.html?next=cardAdd.html');
    const account = await fetch(`${origin}/businessCard/api/auth/me`);
    assert.equal(account.status, 200);
    assert.equal((await account.json()).user, null);
    assert.equal((await fetch(`${origin}/businessCard/api/cards`)).status, 200);
    assert.equal((await fetch(`${origin}/api/cards`)).status, 404);
    assert.equal((await fetch(`${origin}/businessCard/api/cards/extract`, { method: 'POST' })).status, 401);
  } finally {
    child.kill('SIGTERM');
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
