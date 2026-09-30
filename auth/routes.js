const {
  createOpaqueToken,
  hashPassword,
  hashToken,
  parseCookies,
  sessionCookie,
  verifyPassword
} = require("./security");
const { withTransaction } = require("./database");
const { createPasswordResetService } = require("./password-reset");

const EMAIL_VERIFICATION_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$${"A".repeat(86)}`;
const LOGIN_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const loginFailureBuckets = new Map();
const verificationResendBuckets = new Map();
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (error) {
    error ? reject(error) : resolve(this);
  }));
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => {
    error ? reject(error) : resolve(row);
  }));
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function loginLimitKeys(req, email) {
  const address = String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 128);
  return [
    { key: `ip:${hashToken(address)}`, limit: 50 },
    { key: `pair:${hashToken(`${address}\0${email}`)}`, limit: 10 }
  ];
}

function getLoginRetryAfter(req, email, now = Date.now()) {
  let retryAfter = 0;
  for (const { key, limit } of loginLimitKeys(req, email)) {
    const bucket = loginFailureBuckets.get(key);
    if (!bucket) continue;
    if (bucket.resetAt <= now) {
      loginFailureBuckets.delete(key);
      continue;
    }
    if (bucket.attempts >= limit) {
      retryAfter = Math.max(retryAfter, Math.ceil((bucket.resetAt - now) / 1000));
    }
  }
  return retryAfter;
}

function recordLoginFailure(req, email, now = Date.now()) {
  for (const { key } of loginLimitKeys(req, email)) {
    const bucket = loginFailureBuckets.get(key);
    if (bucket && bucket.resetAt > now) {
      bucket.attempts += 1;
    } else {
      loginFailureBuckets.set(key, { attempts: 1, resetAt: now + LOGIN_LIMIT_WINDOW_MS });
    }
  }

  if (loginFailureBuckets.size > 5000) {
    for (const [key, bucket] of loginFailureBuckets) {
      if (bucket.resetAt <= now) loginFailureBuckets.delete(key);
    }
    while (loginFailureBuckets.size > 5000) {
      loginFailureBuckets.delete(loginFailureBuckets.keys().next().value);
    }
  }
}

function clearLoginPairFailures(req, email) {
  const pair = loginLimitKeys(req, email).find(({ key }) => key.startsWith("pair:"));
  if (pair) loginFailureBuckets.delete(pair.key);
}

function validDisplayName(value) {
  if (typeof value !== "string") return "";
  const displayName = value.trim().replace(/\s+/g, " ");
  const length = Array.from(displayName).length;
  return length > 0 && length <= 60 ? displayName : "";
}

function validPassword(value) {
  if (typeof value !== "string") return false;
  const length = Array.from(value).length;
  return length >= 10 && length <= 128 && Buffer.byteLength(value, "utf8") <= 512;
}

function requestHasSameOrigin(req, appBaseUrl) {
  const origin = req.headers?.origin;
  if (!origin || !appBaseUrl) return false;
  try {
    return new URL(origin).origin === new URL(appBaseUrl).origin;
  } catch (error) {
    return false;
  }
}

function createVerificationMessage(email, verificationUrl) {
  return {
    to: email,
    subject: "명함관리 계정 이메일 인증",
    text: `아래 링크를 열어 이메일 인증을 완료해 주세요.\n\n${verificationUrl}\n\n링크는 30분 동안 한 번만 사용할 수 있습니다.`,
    url: verificationUrl
  };
}

function verificationResendMessage() {
  return {
    success: true,
    message: "인증이 필요한 계정이라면 새 인증 링크를 이메일로 보냈습니다. 받은 편지함을 확인해 주세요."
  };
}

function createSessionMiddleware(db, { now = () => new Date() } = {}) {
  return async (req, res, next) => {
    const token = parseCookies(req.headers?.cookie).bcm_session;
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return next();

    const tokenHash = hashToken(token);
    try {
      const session = await get(db,
        `SELECT sessions.expires_at, users.id, users.display_name, users.email, users.email_verified_at
          FROM sessions JOIN users ON users.id = sessions.user_id
          WHERE sessions.token_hash = ?`,
        [tokenHash]
      );
      if (!session) return next();
      if (new Date(session.expires_at).getTime() <= now().getTime() || !session.email_verified_at) {
        await run(db, "DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
        return next();
      }

      req.user = {
        id: session.id,
        displayName: session.display_name,
        email: session.email
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function registerAuthRoutes(app, { db, sendMail, appBaseUrl, secureCookie = false, now = () => new Date() }) {
  const passwordReset = createPasswordResetService({ db, sendMail, appBaseUrl, now });

  app.post("/api/auth/signup", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }

    const displayName = validDisplayName(req.body?.displayName);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (
      !displayName
      || email.length > 254
      || !EMAIL_PATTERN.test(email)
      || !validPassword(password)
    ) {
      return res.status(400).json({ success: false, message: "이름, 이메일, 비밀번호를 확인해 주세요." });
    }

    if (typeof sendMail !== "function" || !appBaseUrl) {
      return res.status(503).json({ success: false, message: "이메일 서비스를 사용할 수 없습니다." });
    }

    let userId;
    const token = createOpaqueToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(now().getTime() + EMAIL_VERIFICATION_TTL_MS).toISOString();

    try {
      const passwordHash = await hashPassword(password);
      userId = await withTransaction(db, async (transactionDb) => {
        const existingUser = await get(transactionDb, "SELECT id FROM users WHERE email = ?", [email]);
        if (existingUser) {
          const error = new Error("duplicate email");
          error.code = "DUPLICATE_EMAIL";
          throw error;
        }

        const inserted = await run(transactionDb,
          "INSERT INTO users (display_name, email, password_hash) VALUES (?, ?, ?)",
          [displayName, email, passwordHash]
        );
        await run(transactionDb,
          "INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
          [tokenHash, inserted.lastID, expiresAt]
        );
        return inserted.lastID;
      });
    } catch (error) {
      if (error.code === "DUPLICATE_EMAIL" || String(error.message).includes("users.email")) {
        return res.status(409).json({ success: false, message: "이 이메일은 이미 가입되어 있습니다." });
      }
      console.error("계정 생성 실패:", error.message);
      return res.status(500).json({ success: false, message: "계정을 만들지 못했습니다." });
    }

    const verificationUrl = new URL("/verify-email.html", appBaseUrl);
    verificationUrl.searchParams.set("token", token);
    try {
      await sendMail(createVerificationMessage(email, verificationUrl.toString()));
    } catch (error) {
      await run(db, "DELETE FROM users WHERE id = ? AND email_verified_at IS NULL", [userId]);
      return res.status(503).json({ success: false, message: "인증 이메일을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요." });
    }

    return res.status(201).json({
      success: true,
      message: "인증 링크를 이메일로 보냈습니다.",
      user: { displayName, email }
    });
  });

  app.post("/api/auth/verify", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }

    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return res.status(400).json({ success: false, message: "인증 링크가 올바르지 않거나 만료되었습니다." });
    }

    const tokenHash = hashToken(token);
    const verifiedAt = now().toISOString();
    try {
      await withTransaction(db, async (transactionDb) => {
        const stored = await get(transactionDb,
          "SELECT user_id, expires_at FROM email_verification_tokens WHERE token_hash = ?",
          [tokenHash]
        );
        if (!stored || new Date(stored.expires_at).getTime() <= now().getTime()) {
          const error = new Error("invalid or expired verification token");
          error.code = "INVALID_TOKEN";
          throw error;
        }

        const deleted = await run(transactionDb,
          "DELETE FROM email_verification_tokens WHERE token_hash = ?",
          [tokenHash]
        );
        if (deleted.changes !== 1) {
          const error = new Error("verification token already consumed");
          error.code = "INVALID_TOKEN";
          throw error;
        }

        const updated = await run(transactionDb,
          "UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ? AND email_verified_at IS NULL",
          [verifiedAt, verifiedAt, stored.user_id]
        );
        if (updated.changes !== 1) {
          const error = new Error("account is already verified");
          error.code = "INVALID_TOKEN";
          throw error;
        }
      });
    } catch (error) {
      return res.status(error.code === "INVALID_TOKEN" ? 400 : 500).json({
        success: false,
        message: error.code === "INVALID_TOKEN"
          ? "인증 링크가 올바르지 않거나 만료되었습니다."
          : "이메일 인증을 완료하지 못했습니다."
      });
    }

    return res.json({ success: true, message: "이메일 인증이 완료되었습니다. 로그인해 주세요." });
  });

  app.post("/api/auth/verification/resend", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }
    if (typeof sendMail !== "function" || !appBaseUrl) {
      return res.status(503).json({ success: false, message: "이메일 서비스를 사용할 수 없습니다." });
    }

    const email = normalizeEmail(req.body?.email);
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return res.status(202).json(verificationResendMessage());
    }

    try {
      const user = await get(db,
        "SELECT id, email FROM users WHERE email = ? AND email_verified_at IS NULL",
        [email]
      );
      if (!user) return res.status(202).json(verificationResendMessage());

      const cooldownKey = hashToken(email);
      const timestamp = now().getTime();
      const retryAt = verificationResendBuckets.get(cooldownKey) || 0;
      if (retryAt > timestamp) return res.status(202).json(verificationResendMessage());

      const token = createOpaqueToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(timestamp + EMAIL_VERIFICATION_TTL_MS).toISOString();
      const tokenCreated = await withTransaction(db, async (transactionDb) => {
        const currentUser = await get(transactionDb,
          "SELECT id FROM users WHERE id = ? AND email_verified_at IS NULL",
          [user.id]
        );
        if (!currentUser) return false;

        const recentRequest = await get(transactionDb,
          `SELECT 1 AS recent FROM email_verification_tokens
            WHERE user_id = ? AND datetime(created_at) >= datetime(?) LIMIT 1`,
          [user.id, new Date(timestamp - VERIFICATION_RESEND_COOLDOWN_MS).toISOString()]
        );
        if (recentRequest) return false;

        await run(transactionDb, "DELETE FROM email_verification_tokens WHERE user_id = ?", [user.id]);
        await run(transactionDb,
          "INSERT INTO email_verification_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
          [tokenHash, user.id, expiresAt, new Date(timestamp).toISOString()]
        );
        return true;
      });
      if (!tokenCreated) return res.status(202).json(verificationResendMessage());

      const verificationUrl = new URL("/verify-email.html", appBaseUrl);
      verificationUrl.searchParams.set("token", token);
      verificationResendBuckets.set(cooldownKey, timestamp + VERIFICATION_RESEND_COOLDOWN_MS);
      try {
        await sendMail(createVerificationMessage(email, verificationUrl.toString()));
      } catch (error) {
        await run(db, "DELETE FROM email_verification_tokens WHERE token_hash = ?", [tokenHash]);
        console.error("인증 이메일 재발송 실패:", error.message);
      }
      if (verificationResendBuckets.size > 5000) {
        for (const [key, until] of verificationResendBuckets) {
          if (until <= timestamp) verificationResendBuckets.delete(key);
        }
      }
      return res.status(202).json(verificationResendMessage());
    } catch (error) {
      console.error("인증 이메일 재발송 요청 실패:", error.message);
      return res.status(202).json(verificationResendMessage());
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }

    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const retryAfter = getLoginRetryAfter(req, email);
    if (retryAfter > 0) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false, message: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." });
    }
    let user;
    try {
      user = EMAIL_PATTERN.test(email) && email.length <= 254
        ? await get(db,
          "SELECT id, display_name, email, password_hash, email_verified_at FROM users WHERE email = ?",
          [email]
        )
        : null;
      const passwordMatches = await verifyPassword(
        typeof password === "string" ? password : "",
        user?.password_hash || DUMMY_PASSWORD_HASH
      );
      if (!user || !user.email_verified_at || !passwordMatches) {
        recordLoginFailure(req, email);
        return res.status(401).json({ success: false, message: "이메일 또는 비밀번호를 확인해 주세요." });
      }

      clearLoginPairFailures(req, email);

      const token = createOpaqueToken();
      const expiresAt = new Date(now().getTime() + SESSION_TTL_MS).toISOString();
      await run(db,
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        [hashToken(token), user.id, expiresAt]
      );
      res.setHeader("Set-Cookie", sessionCookie(token, {
        secure: secureCookie,
        maxAge: SESSION_TTL_SECONDS
      }));
      return res.json({
        success: true,
        user: { id: user.id, displayName: user.display_name, email: user.email }
      });
    } catch (error) {
      console.error("로그인 처리 실패:", error.message);
      return res.status(500).json({ success: false, message: "로그인하지 못했습니다." });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }

    const token = parseCookies(req.headers?.cookie).bcm_session;
    try {
      if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
        await run(db, "DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
      }
      res.setHeader("Set-Cookie", sessionCookie("", { secure: secureCookie, maxAge: 0 }));
      return res.json({ success: true, message: "로그아웃했습니다." });
    } catch (error) {
      console.error("로그아웃 처리 실패:", error.message);
      return res.status(500).json({ success: false, message: "로그아웃하지 못했습니다." });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    return res.json({ success: true, user: req.user || null });
  });

  app.patch("/api/auth/profile", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }

    const displayName = validDisplayName(req.body?.displayName);
    if (!displayName) {
      return res.status(400).json({ success: false, message: "이름을 확인해 주세요." });
    }

    try {
      const updatedAt = now().toISOString();
      const updated = await run(db,
        "UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?",
        [displayName, updatedAt, req.user.id]
      );
      if (updated.changes !== 1) {
        return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
      }
      return res.json({
        success: true,
        user: { id: req.user.id, displayName, email: req.user.email }
      });
    } catch (error) {
      console.error("프로필 변경 실패:", error.message);
      return res.status(500).json({ success: false, message: "프로필을 변경하지 못했습니다." });
    }
  });

  app.patch("/api/auth/password", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    if (!validPassword(req.body?.newPassword)) {
      return res.status(400).json({ success: false, message: "새 비밀번호는 10~128자로 입력해 주세요." });
    }

    try {
      const user = await get(db, "SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
      if (!user || !(await verifyPassword(req.body?.currentPassword, user.password_hash))) {
        return res.status(400).json({ success: false, message: "현재 비밀번호를 확인해 주세요." });
      }

      const passwordHash = await hashPassword(req.body.newPassword);
      const token = createOpaqueToken();
      const tokenHash = hashToken(token);
      const timestamp = now().toISOString();
      const expiresAt = new Date(now().getTime() + SESSION_TTL_MS).toISOString();
      await withTransaction(db, async (transactionDb) => {
        const currentUser = await get(transactionDb, "SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
        if (!currentUser || !(await verifyPassword(req.body.currentPassword, currentUser.password_hash))) {
          throw new Error("current password changed during update");
        }
        const updated = await run(transactionDb,
          "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND password_hash = ?",
          [passwordHash, timestamp, req.user.id, currentUser.password_hash]
        );
        if (updated.changes !== 1) throw new Error("account no longer exists");
        await run(transactionDb, "DELETE FROM sessions WHERE user_id = ?", [req.user.id]);
        await run(transactionDb,
          "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
          [tokenHash, req.user.id, expiresAt]
        );
      });
      res.setHeader("Set-Cookie", sessionCookie(token, {
        secure: secureCookie,
        maxAge: SESSION_TTL_SECONDS
      }));
      return res.json({ success: true, message: "비밀번호를 변경했습니다." });
    } catch (error) {
      console.error("비밀번호 변경 실패:", error.message);
      return res.status(500).json({ success: false, message: "비밀번호를 변경하지 못했습니다." });
    }
  });

  app.post("/api/auth/password-reset/request", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }
    if (typeof sendMail !== "function" || !appBaseUrl) {
      return res.status(503).json({ success: false, message: "비밀번호 재설정 메일 서비스를 사용할 수 없습니다." });
    }

    try {
      await passwordReset.requestReset(req.body?.email);
    } catch (error) {
      if (error.code === "MAIL_UNAVAILABLE") {
        return res.status(503).json({ success: false, message: "비밀번호 재설정 메일 서비스를 사용할 수 없습니다." });
      }
      console.error("비밀번호 재설정 메일 전송 실패:", error.message);
      // 계정 존재 여부를 응답으로 구분하지 않도록 메일 전송 실패도 동일한 접수 응답을 돌려준다.
    }
    return res.status(202).json({
      success: true,
      message: "가입된 이메일이라면 비밀번호 재설정 링크를 보냈습니다. 이메일을 확인해 주세요."
    });
  });

  app.post("/api/auth/password-reset/complete", async (req, res) => {
    if (!requestHasSameOrigin(req, appBaseUrl)) {
      return res.status(403).json({ success: false, message: "요청 출처를 확인할 수 없습니다." });
    }

    try {
      const completed = await passwordReset.completeReset(req.body?.token, req.body?.newPassword);
      if (!completed) {
        return res.status(400).json({ success: false, message: "재설정 링크가 올바르지 않거나 만료되었습니다." });
      }
      return res.json({ success: true, message: "비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요." });
    } catch (error) {
      console.error("비밀번호 재설정 처리 실패:", error.message);
      return res.status(500).json({ success: false, message: "비밀번호를 재설정하지 못했습니다." });
    }
  });
}

module.exports = { createSessionMiddleware, registerAuthRoutes };
