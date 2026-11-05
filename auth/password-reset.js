const {
  createOpaqueToken,
  hashPassword,
  hashToken,
  isOpaqueToken,
  normalizeEmail,
  validEmail,
  validPassword
} = require("./security");
const { get, run, withTransaction } = require("../database/operations");
const { publicPageUrl } = require("../deployment");

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function createPasswordResetService({ db, sendMail, appBaseUrl, now = () => new Date() }) {
  async function requestReset(value) {
    const email = normalizeEmail(value);
    if (!validEmail(email)) return true;

    const user = await get(db,
      "SELECT id, email FROM users WHERE email = ? AND email_verified_at IS NOT NULL",
      [email]
    );
    if (!user) return true;
    if (typeof sendMail !== "function" || !appBaseUrl) {
      const error = new Error("비밀번호 재설정 메일 서비스를 사용할 수 없습니다.");
      error.code = "MAIL_UNAVAILABLE";
      throw error;
    }

    const requestedAt = now();
    const token = createOpaqueToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(requestedAt.getTime() + RESET_TOKEN_TTL_MS).toISOString();
    const issued = await withTransaction(db, async (transactionDb) => {
      const currentUser = await get(transactionDb,
        "SELECT id FROM users WHERE id = ? AND email_verified_at IS NOT NULL",
        [user.id]
      );
      if (!currentUser) return false;

      const recentRequest = await get(transactionDb,
        `SELECT 1 AS recent FROM password_reset_tokens
          WHERE user_id = ? AND datetime(created_at) >= datetime(?) LIMIT 1`,
        [user.id, new Date(requestedAt.getTime() - 60 * 1000).toISOString()]
      );
      if (recentRequest) return false;

      await run(transactionDb, "DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id]);
      await run(transactionDb,
        "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        [tokenHash, user.id, expiresAt, requestedAt.toISOString()]
      );
      return true;
    });
    if (!issued) return true;

    const resetUrl = publicPageUrl(appBaseUrl, "reset-password.html");
    resetUrl.searchParams.set("token", token);
    try {
      await sendMail({
        to: user.email,
        subject: "명함관리 비밀번호 재설정",
        text: `아래 링크에서 새 비밀번호를 설정해 주세요.\n\n${resetUrl}\n\n링크는 30분 동안 한 번만 사용할 수 있습니다.`,
        url: resetUrl.toString()
      });
    } catch (error) {
      await run(db, "DELETE FROM password_reset_tokens WHERE token_hash = ?", [tokenHash]);
      throw error;
    }
    return true;
  }

  async function completeReset(tokenValue, newPassword) {
    if (!isOpaqueToken(tokenValue) || !validPassword(newPassword)) return false;

    const tokenHash = hashToken(tokenValue);
    const timestamp = now().toISOString();
    const stored = await get(db,
      "SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?",
      [tokenHash]
    );
    if (!stored || new Date(stored.expires_at).getTime() <= now().getTime()) return false;

    const passwordHash = await hashPassword(newPassword);
    return withTransaction(db, async (transactionDb) => {
      const current = await get(transactionDb,
        "SELECT user_id, expires_at FROM password_reset_tokens WHERE token_hash = ?",
        [tokenHash]
      );
      if (
        !current
        || current.user_id !== stored.user_id
        || new Date(current.expires_at).getTime() <= now().getTime()
      ) return false;

      const consumed = await run(transactionDb, "DELETE FROM password_reset_tokens WHERE token_hash = ?", [tokenHash]);
      if (consumed.changes !== 1) return false;
      const updated = await run(transactionDb,
        "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND email_verified_at IS NOT NULL",
        [passwordHash, timestamp, current.user_id]
      );
      if (updated.changes !== 1) return false;
      await run(transactionDb, "DELETE FROM password_reset_tokens WHERE user_id = ?", [current.user_id]);
      await run(transactionDb, "DELETE FROM sessions WHERE user_id = ?", [current.user_id]);
      return true;
    });
  }

  return { requestReset, completeReset };
}

module.exports = { createPasswordResetService };
