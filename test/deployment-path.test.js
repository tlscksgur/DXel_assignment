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
const { createOpaqueToken, hashToken } = require('../auth/security');
const sqlite3 = require('sqlite3');

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

test('실제 서버의 보호 페이지 이동과 계정 API도 하위 경로를 따른다', async (t) => {
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
      CARD_ADMIN_EMAIL: 'chshin@dxel.co.kr',
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
    const db = new sqlite3.Database(path.join(dir, 'cards.db'));
    const execute = (sql, params = []) => new Promise((resolve, reject) => {
      db.run(sql, params, (error) => error ? reject(error) : resolve());
    });
    const tokens = [createOpaqueToken(), createOpaqueToken(), createOpaqueToken()];
    try {
      for (const [index, email] of ['chshin@dxel.co.kr', 'owner@example.test', 'viewer@example.test'].entries()) {
        await execute('INSERT INTO users (id, display_name, email, password_hash, email_verified_at) VALUES (?, ?, ?, ?, ?)',
          [index + 1, '권한 테스트', email, 'unused', new Date().toISOString()]);
        await execute('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
          [hashToken(tokens[index]), index + 1, new Date(Date.now() + 60000).toISOString()]);
      }
      await execute('INSERT INTO business_cards (id, name, created_by) VALUES (1, ?, 2)', ['다른 사람 명함']);
      await execute('INSERT INTO business_cards (id, name, created_by) VALUES (3, ?, 1)', ['관리자 본인 명함']);
      await execute('INSERT INTO business_cards (id, name, created_by, deleted_at) VALUES (2, ?, 2, ?)', ['휴지통 명함', new Date().toISOString()]);
      await execute('INSERT INTO card_favorites (user_id, card_id) VALUES (2, 1)');
      await execute('INSERT INTO user_card_groups (user_id, card_id, group_name) VALUES (2, 1, ?)', ['등록자 개인 그룹']);
    } finally { await new Promise((resolve) => db.close(resolve)); }
    const request = (token, url, method = 'GET', body) => fetch(`${origin}/businessCard/api/cards${url}`, {
      method, headers: { Cookie: `bcm_session=${token}`, Origin: origin, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const apiRequest = (apiPath, method, token, body) => fetch(`${origin}/businessCard${apiPath}`, {
      method, headers: { ...(token ? { Cookie: `bcm_session=${token}` } : {}), Origin: origin, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const paths = ['/API/CARDS/1', '/api/cards/1/', '/api/cards/01', '/api/cards/%31', '/api/cards/1.0', '/api/cards/1e0'];
    for (const apiPath of paths) {
      await t.test(`비로그인 변경 거부: ${apiPath}`, async () => {
        assert.equal((await apiRequest(apiPath, 'DELETE')).status, 401);
      });
      await t.test(`타인 변경 거부: ${apiPath}`, async () => {
        assert.ok([400, 403].includes((await apiRequest(apiPath, 'DELETE', tokens[2])).status));
      });
    }
    for (const [method, suffix] of [['PUT', ''], ['PATCH', '/tags'], ['POST', '/merge'], ['PATCH', '/restore'], ['DELETE', '/permanent']]) {
      await t.test(`타인 라우트 변경 거부: ${method} ${suffix}`, async () => {
        assert.equal((await apiRequest(`/API/cards/%31${suffix}/`, method, tokens[2], { name: '금지', tags: [] })).status, 403);
      });
    }
    for (const endpoint of ['bulk-delete', 'bulk-restore', 'bulk-permanent-delete', 'merge-group']) {
      for (const cardIds of ['1', '1,3', ['1'], [1, 3]]) {
        await t.test(`타인 일괄 변경 거부: ${endpoint} ${JSON.stringify(cardIds)}`, async () => {
          assert.equal((await apiRequest(`/api/cards/${endpoint}/`, 'POST', tokens[2], { cardIds })).status, 403);
        });
      }
      for (const cardIds of [[], [1, 1], [1, 'invalid'], {}, true, 1, '1,', '1e0', '1.0', [null], '9007199254740993']) {
        await t.test(`잘못된 일괄 ID 거부: ${endpoint} ${JSON.stringify(cardIds)}`, async () => {
          assert.equal((await apiRequest(`/api/cards/${endpoint}`, 'POST', tokens[0], { cardIds })).status, 400);
        });
      }
    }
    await t.test('대소문자가 바뀐 등록 API도 인증 필요', async () => {
      assert.equal((await apiRequest('/API/CARDSTORAGE/', 'POST', null, { name: '금지' })).status, 401);
    });
    await t.test('대소문자가 바뀐 개인 데이터 및 휴지통 조회도 인증 필요', async () => {
      for (const apiPath of ['/API/CARDS/GROUPS', '/API/CARDS/?trash=1', '/API/CARDS/EXPORT/CSV']) {
        assert.equal((await apiRequest(apiPath, 'GET')).status, 401);
      }
    });
    for (const idPath of ['1', '01', '%31']) {
      for (const [role, token] of [['등록자', tokens[1]], ['관리자', tokens[0]]]) {
        await t.test(`${role}의 유효한 변형 경로 변경은 허용: ${idPath}`, async () => {
          assert.equal((await apiRequest(`/API/CARDS/${idPath}/TAGS/`, 'PATCH', token, { tags: ['고객'] })).status, 200);
        });
      }
    }
    await t.test('관리자도 변형 경로의 출처 검사를 우회할 수 없다', async () => {
      const response = await fetch(`${origin}/businessCard/API/CARDS/01/TAGS/`, {
        method: 'PATCH', headers: { Cookie: `bcm_session=${tokens[0]}`, Origin: 'https://attacker.test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [] })
      });
      assert.equal(response.status, 403);
    });
    await t.test('우회 요청은 원본 명함 데이터를 변경하지 않는다', async () => {
      const card = (await (await request(tokens[1], '/1')).json()).card;
      assert.equal(card.name, '다른 사람 명함');
      assert.equal((await (await request(tokens[1], '')).json()).cards.length, 2);
    });
    const adminCards = (await (await request(tokens[0], '')).json()).cards;
    const otherCardForAdmin = adminCards.find((card) => card.id === 1);
    assert.equal(otherCardForAdmin.can_edit, 1);
    assert.equal(otherCardForAdmin.is_mine, 0);
    assert.equal(adminCards.find((card) => card.id === 3).is_mine, 1);
    assert.equal(otherCardForAdmin.is_favorite, 0);
    assert.equal(otherCardForAdmin.group_name, '');
    const ownerCards = (await (await request(tokens[1], '')).json()).cards;
    assert.equal(ownerCards.find((card) => card.id === 1).is_favorite, 1);
    assert.equal(ownerCards.find((card) => card.id === 1).group_name, '등록자 개인 그룹');
    assert.equal(ownerCards.find((card) => card.id === 3).can_edit, 0);
    assert.equal((await request(tokens[1], '/3', 'PUT', { name: '권한 위조', isAdmin: true })).status, 403);
    assert.equal((await request(tokens[1], '/3', 'DELETE')).status, 403);
    assert.equal((await (await request(tokens[0], '?trash=1')).json()).cards.length, 1);
    assert.equal((await request(tokens[0], '/2/restore', 'PATCH', {})).status, 200);
    assert.equal((await request(tokens[0], '/1', 'PUT', { name: '관리자 수정' })).status, 200);
    assert.equal((await request(tokens[0], '/1', 'DELETE')).status, 200);
    await t.test('CSV API는 수식 접두를 보호하지만 저장된 명함 값은 바꾸지 않는다', async () => {
      assert.equal((await request(tokens[0], '/3', 'PUT', { name: '=1+1' })).status, 200);
      const csvResponse = await request(tokens[0], '/export/csv');
      assert.equal(csvResponse.status, 200);
      assert.match(await csvResponse.text(), /"\t=1\+1"/);
      const original = (await (await request(tokens[0], '/3')).json()).card;
      assert.equal(original.name, '=1+1');
    });
    // 소유권을 넘기거나 개인 분류를 조회하는 권한은 부여하지 않는다.
    assert.equal((await (await request(tokens[1], '?trash=1')).json()).cards[0].name, '관리자 수정');
  } finally {
    child.kill('SIGTERM');
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
