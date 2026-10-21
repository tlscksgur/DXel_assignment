const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const { extractBusinessCard, verifyCriticalFields } = require("../localAi");

test("AI 응답이 멈추면 설정한 시간 안에 요청을 중단한다", async () => {
  const originalFetch = global.fetch;
  const originalEndpoint = process.env.AI_SERVER_ENDPOINT;
  const originalTimeout = process.env.AI_REQUEST_TIMEOUT_MS;
  process.env.AI_SERVER_ENDPOINT = "http://127.0.0.1:1/test";
  process.env.AI_REQUEST_TIMEOUT_MS = "20";
  global.fetch = (_url, options) => new Promise((_resolve, reject) => {
    if (!options.signal) {
      reject(new Error("AI 요청에 중단 신호가 없습니다."));
      return;
    }
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });

  try {
    await assert.rejects(extractBusinessCard("data:image/png;base64,AA=="), /timeout|aborted|초과/i);
  } finally {
    global.fetch = originalFetch;
    if (originalEndpoint === undefined) delete process.env.AI_SERVER_ENDPOINT;
    else process.env.AI_SERVER_ENDPOINT = originalEndpoint;
    if (originalTimeout === undefined) delete process.env.AI_REQUEST_TIMEOUT_MS;
    else process.env.AI_REQUEST_TIMEOUT_MS = originalTimeout;
  }
});

async function withAiRequest(fetchImpl, work, timeoutMs = 30) {
  const originalFetch = global.fetch;
  const originalEndpoint = process.env.AI_SERVER_ENDPOINT;
  const originalTimeout = process.env.AI_REQUEST_TIMEOUT_MS;
  global.fetch = fetchImpl;
  process.env.AI_SERVER_ENDPOINT = "http://127.0.0.1:1/test";
  process.env.AI_REQUEST_TIMEOUT_MS = String(timeoutMs);
  try { await work(); }
  finally {
    global.fetch = originalFetch;
    if (originalEndpoint === undefined) delete process.env.AI_SERVER_ENDPOINT;
    else process.env.AI_SERVER_ENDPOINT = originalEndpoint;
    if (originalTimeout === undefined) delete process.env.AI_REQUEST_TIMEOUT_MS;
    else process.env.AI_REQUEST_TIMEOUT_MS = originalTimeout;
  }
}

for (const [name, request] of [["전체 추출", extractBusinessCard], ["핵심 필드 재확인", verifyCriticalFields]]) {
  test(`${name}: 헤더가 도착해도 본문이 멈추면 제한 시간에 중단한다`, async () => {
    let bodySignal;
    let rejectBody;
    const fetchImpl = async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        bodySignal = signal;
        rejectBody = reject;
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })
    });
    await withAiRequest(fetchImpl, async () => {
      let deadline;
      try {
        const result = await Promise.race([
          request("data:image/png;base64,AA==").then(() => "resolved", (error) => error),
          new Promise((resolve) => { deadline = setTimeout(() => resolve("still-pending"), 250); })
        ]);
        assert.notEqual(result, "still-pending", "응답 본문에도 AI 요청 제한 시간이 적용되어야 합니다.");
        assert.match(result.message, /timeout|aborted|초과/i);
        assert.equal(bodySignal.aborted, true);
      } finally {
        clearTimeout(deadline);
        rejectBody?.(new Error("테스트 정리"));
      }
    });
  });
}

test("응답 본문을 정상 수신하면 타이머가 해제되어 뒤늦게 중단하지 않는다", async () => {
  let requestSignal;
  await withAiRequest(async (_url, { signal }) => {
    requestSignal = signal;
    return { ok: true, json: async () => ({ choices: [] }) };
  }, async () => {
    assert.deepEqual(await extractBusinessCard("data:image/png;base64,AA=="), { choices: [] });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(requestSignal.aborted, false);
  });
});

for (const scenario of ["HTTP 오류", "JSON 오류"]) {
  test(`${scenario} 후에는 타임아웃 타이머를 남기지 않는다`, async () => {
    let requestSignal;
    await withAiRequest(async (_url, { signal }) => {
      requestSignal = signal;
      return { ok: scenario !== "HTTP 오류", status: 503, json: async () => { throw new SyntaxError("잘못된 JSON"); } };
    }, async () => {
      await assert.rejects(extractBusinessCard("data:image/png;base64,AA=="), /503|JSON/);
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(requestSignal.aborted, false);
    });
  });
}

test("실제 HTTP 응답이 헤더 후 본문을 멈추어도 요청을 중단한다", async () => {
  let headersSent = false;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.flushHeaders();
    res.write('{"choices":');
    headersSent = true;
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  let deadline;
  try {
    await withAiRequest(global.fetch, async () => {
      process.env.AI_SERVER_ENDPOINT = `http://127.0.0.1:${server.address().port}/test`;
      const result = await Promise.race([
        extractBusinessCard("data:image/png;base64,AA==").then(() => "resolved", (error) => error),
        new Promise((resolve) => { deadline = setTimeout(() => resolve("still-pending"), 1500); })
      ]);
      assert.equal(headersSent, true, "실제 헤더와 일부 본문이 전송된 상황을 검증해야 합니다.");
      assert.notEqual(result, "still-pending");
      assert.match(result.message, /timeout|aborted|초과/i);
    }, 250);
  } finally {
    clearTimeout(deadline);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
