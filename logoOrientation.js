// AI의 로고 문자 방향 추정값은 명확한 경우에만 적용한다.
function normalizeLogoOrientation(value) {
  const valid = value?.has_text === true
    && typeof value.clockwise_rotation === "number"
    && Number.isFinite(value.clockwise_rotation)
    && Math.abs(value.clockwise_rotation) <= 180
    && typeof value.confidence === "number"
    && value.confidence >= 0.9 && value.confidence <= 1;
  const rotation = valid && Math.abs(value.clockwise_rotation) >= 1
    ? Math.round(value.clockwise_rotation * 10) / 10 : 0;
  return { rotation, hasText: value?.has_text === true, applied: rotation !== 0 };
}

module.exports = { normalizeLogoOrientation };
