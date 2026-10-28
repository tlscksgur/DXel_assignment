const { all } = require("../database/operations");

function isCardApi(path) {
  return path === "/api/cardstorage" || path === "/api/cardselect"
    || path === "/api/cards" || path.startsWith("/api/cards/");
}

function sameOrigin(req, appBaseUrl, allowRequestOrigin, allowedOrigins) {
  try {
    const origin = new URL(req.headers?.origin).origin;
    if (origin === new URL(appBaseUrl).origin || allowedOrigins.includes(origin)) return true;
    if (!allowRequestOrigin || !req.protocol || !req.headers?.host) return false;

    return origin === new URL(`${req.protocol}://${req.headers.host}`).origin;
  } catch (error) {
    return false;
  }
}

function parseCardIds(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  if (values.length === 0) return [];
  if (values.some((id) => typeof id !== "number" && typeof id !== "string")) return [];
  if (values.some((id) => !/^\d+$/.test(String(id).trim()))) return [];
  const ids = values.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return [];
  return new Set(ids).size === ids.length ? ids : [];
}

function isCardAdmin(user, adminEmail) {
  const configuredEmail = typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";
  return Boolean(user?.id && configuredEmail && typeof user.email === "string"
    && user.email.trim().toLowerCase() === configuredEmail);
}

function createCardAccessMiddleware(db, { appBaseUrl, allowRequestOrigin = false, allowedOrigins = [] }) {
  return async (req, res, next) => {
    // Express는 기본적으로 경로 대소문자를 구분하지 않고 끝 슬래시를 허용한다.
    let path;
    try { path = decodeURIComponent(req.path).toLowerCase().replace(/\/+$/, ""); }
    catch { return res.status(400).json({ success: false, message: "요청 경로를 확인해 주세요." }); }
    if (!isCardApi(path)) return next();
    res.setHeader?.("Cache-Control", "no-store");
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    if (req.method !== "GET" && !sameOrigin(req, appBaseUrl, allowRequestOrigin, allowedOrigins)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }

    // 개인 명함은 관리자도 등록자 외에는 접근할 수 없다.
    const single = path.match(/^\/api\/cards\/(\d+)(?:\/|$)/);
    const ids = single ? parseCardIds([single[1]]) : parseCardIds(req.body?.cardIds);
    if (ids.length) {
      try {
        const rows = await all(db,
          `SELECT id FROM business_cards WHERE id IN (${ids.map(() => "?").join(", ")})
            AND visibility = 'private' AND (created_by IS NULL OR created_by != ?)`,
          [...ids, req.user.id]);
        if (rows.length) return res.status(404).json({ success: false, message: "명함을 찾을 수 없습니다." });
      } catch (error) { return next(error); }
    }
    // 다른 사람의 개인 이미지 경로를 새 공유 명함에 붙이는 우회도 막는다.
    if (req.method !== "GET") {
      const cards = Array.isArray(req.body?.cards) ? req.body.cards : [req.body];
      const paths = [...new Set(cards.flatMap((card) => [card?.image_path, card?.imagePath, card?.logo_path, card?.logoPath])
        .filter((value) => typeof value === "string" && value).map((value) => {
          try { return decodeURIComponent(new URL(value.trim(), "http://local.invalid").pathname); }
          catch { return value; }
        }))];
      try {
        for (const imagePath of paths) {
          const refs = await all(db,
            "SELECT visibility, created_by FROM business_cards WHERE image_path = ? OR logo_path = ?",
            [imagePath, imagePath]);
          if (refs.length && !refs.some((card) => card.visibility === "shared" || card.created_by === req.user.id)) {
            return res.status(404).json({ success: false, message: "이미지를 찾을 수 없습니다." });
          }
        }
      } catch (error) { return next(error); }
    }
    return next();
  };
}

function createCardOwnerMiddleware(db, { adminEmail = "", bulk = false } = {}) {
  return async (req, res, next) => {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    // 원시 URL이 아닌 실제 Express 라우트의 디코딩된 파라미터를 확인한다.
    const ids = parseCardIds(bulk ? req.body?.cardIds : [req.params?.id]);
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: "명함 ID를 올바르게 지정해 주세요." });
    }

    try {
      const placeholders = ids.map(() => "?").join(", ");
      const rows = await all(db,
        `SELECT id, created_by, visibility FROM business_cards WHERE id IN (${placeholders})`,
        ids
      );
      if (rows.some((row) => row.visibility === "private" && row.created_by !== req.user.id)) {
        return res.status(404).json({ success: false, message: "명함을 찾을 수 없습니다." });
      }
      if (!isCardAdmin(req.user, adminEmail) && rows.some((row) => row.created_by !== req.user.id)) {
        return res.status(403).json({ success: false, message: "등록자만 명함을 변경할 수 있습니다." });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createCardAccessMiddleware, createCardOwnerMiddleware, parseCardIds, isCardAdmin };
