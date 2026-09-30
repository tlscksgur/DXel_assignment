const { all } = require("../database/operations");

const BULK_OWNER_PATHS = new Set([
  "/api/cards/bulk-delete",
  "/api/cards/bulk-restore",
  "/api/cards/bulk-permanent-delete",
  "/api/cards/merge-group"
]);

function isCardApi(path) {
  return path === "/api/cardStorage" || path === "/api/cardSelect"
    || path === "/api/cards" || path.startsWith("/api/cards/");
}

function isPublicRead(req) {
  if (req.method !== "GET") return false;
  if (req.path === "/api/cardSelect" || req.path === "/api/cards/duplicates") return true;
  if (req.path === "/api/cards") return req.query?.trash !== "1";
  return /^\/api\/cards\/[1-9]\d*$/.test(req.path);
}

function sameOrigin(req, appBaseUrl) {
  try {
    return new URL(req.headers?.origin).origin === new URL(appBaseUrl).origin;
  } catch (error) {
    return false;
  }
}

function requestedBulkIds(value) {
  if (!Array.isArray(value) || value.length === 0) return [];
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return [];
  return new Set(ids).size === ids.length ? ids : [];
}

function createCardAccessMiddleware(db, { appBaseUrl }) {
  return async (req, res, next) => {
    if (!isCardApi(req.path) || isPublicRead(req)) return next();
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    if (req.method !== "GET" && !sameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }

    const singleCard = req.path.match(/^\/api\/cards\/([1-9]\d*)(?:\/(?:tags|merge|restore|permanent))?$/);
    const ids = singleCard ? [Number(singleCard[1])]
      : BULK_OWNER_PATHS.has(req.path) ? requestedBulkIds(req.body?.cardIds) : [];
    if (ids.length === 0) return next();

    try {
      const placeholders = ids.map(() => "?").join(", ");
      const rows = await all(db,
        `SELECT id, created_by FROM business_cards WHERE id IN (${placeholders})`,
        ids
      );
      if (rows.some((row) => row.created_by !== req.user.id)) {
        return res.status(403).json({ success: false, message: "등록자만 명함을 변경할 수 있습니다." });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createCardAccessMiddleware };
