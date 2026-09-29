const assert = require("node:assert/strict");
const { test } = require("node:test");
const { extractBusinessCard } = require("../localAi");

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
