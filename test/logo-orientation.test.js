const assert = require("node:assert/strict");
const { test } = require("node:test");
const { normalizeLogoOrientation } = require("../logoOrientation");
const { analyzeLogoOrientation } = require("../localAi");

test("로고 문자가 확실하면 45도와 작은 각도, 180도 보정을 허용한다", () => {
  for (const angle of [-45, 45, -3.5, 90, 180]) {
    assert.deepEqual(normalizeLogoOrientation({ has_text: true, clockwise_rotation: angle, confidence: 0.95 }),
      { hasText: true, rotation: angle, applied: true });
  }
});

test("문자 없음·낮은 신뢰도·잘못된 각도는 로고를 회전하지 않는다", () => {
  for (const value of [
    null, {}, { has_text: false, clockwise_rotation: 45, confidence: 1 },
    { has_text: true, clockwise_rotation: 45, confidence: 0.89 },
    { has_text: true, clockwise_rotation: 45, confidence: Infinity },
    { has_text: true, clockwise_rotation: "45", confidence: 1 },
    { has_text: true, clockwise_rotation: NaN, confidence: 1 },
    { has_text: true, clockwise_rotation: 181, confidence: 1 },
    { has_text: true, clockwise_rotation: 0.7, confidence: 1 }
  ]) assert.equal(normalizeLogoOrientation(value).rotation, 0);
});

test("방향 확인은 글자 줄을 기준으로 요청하며 이탤릭·심벌의 모양을 기준으로 삼지 않는다", async () => {
  const nativeFetch = global.fetch;
  let request;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) };
  };
  try {
    await analyzeLogoOrientation("data:image/png;base64,dGVzdA==");
    assert.match(request.messages[0].content, /baseline of the full word/);
    assert.match(request.messages[0].content, /Italic DASSAULT SYSTEMES.*needs 0/);
    assert.match(request.messages[0].content, /symbol-only/);
    assert.equal(request.response_format.json_schema.schema.additionalProperties, false);
    assert.equal(request.messages[1].content[1].image_url.url, "data:image/png;base64,dGVzdA==");
  } finally { global.fetch = nativeFetch; }
});
