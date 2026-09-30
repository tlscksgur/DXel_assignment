const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const DERIVED_KEY_LENGTH = 64;
const MAX_SCRYPT_MEMORY = 64 * 1024 * 1024;
const DEFAULT_SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

async function derivePassword(password, salt) {
  return scrypt(password, salt, DERIVED_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: MAX_SCRYPT_MEMORY
  });
}

async function hashPassword(password) {
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") > 1024) {
    throw new TypeError("Password must be a string under 1024 bytes");
  }

  const salt = crypto.randomBytes(16);
  const derived = await derivePassword(password, salt);
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

async function verifyPassword(password, encodedHash) {
  if (typeof password !== "string" || typeof encodedHash !== "string") return false;

  const parts = encodedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  if (
    Number(parts[1]) !== SCRYPT_COST
    || Number(parts[2]) !== SCRYPT_BLOCK_SIZE
    || Number(parts[3]) !== SCRYPT_PARALLELIZATION
    || !/^[A-Za-z0-9_-]{22}$/.test(parts[4])
    || !/^[A-Za-z0-9_-]{86}$/.test(parts[5])
    || Buffer.byteLength(password, "utf8") > 1024
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    if (salt.length !== 16 || expected.length !== DERIVED_KEY_LENGTH) return false;
    const actual = await derivePassword(password, salt);
    return crypto.timingSafeEqual(actual, expected);
  } catch (error) {
    return false;
  }
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function sessionCookie(token, { secure = false, maxAge = DEFAULT_SESSION_AGE_SECONDS } = {}) {
  const safeMaxAge = Number.isInteger(maxAge) && maxAge >= 0 ? maxAge : DEFAULT_SESSION_AGE_SECONDS;
  const attributes = [
    `bcm_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${safeMaxAge}`
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function parseCookies(header = "") {
  const cookies = Object.create(null);
  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (!name || Object.hasOwn(cookies, name)) continue;
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch (error) {
      cookies[name] = value;
    }
  }
  return cookies;
}

module.exports = {
  createOpaqueToken,
  hashPassword,
  hashToken,
  parseCookies,
  sessionCookie,
  verifyPassword
};
