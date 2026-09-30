function parseSmtpConfig(env) {
  const host = typeof env.SMTP_HOST === "string" ? env.SMTP_HOST.trim() : "";
  const portText = typeof env.SMTP_PORT === "string" ? env.SMTP_PORT.trim() : "";
  const from = typeof env.MAIL_FROM === "string" ? env.MAIL_FROM.trim() : "";
  const user = typeof env.SMTP_USER === "string" ? env.SMTP_USER.trim() : "";
  const password = typeof env.SMTP_PASSWORD === "string" ? env.SMTP_PASSWORD : "";
  const isCompletelyUnset = !host && !portText && !from && !user && !password;
  if (isCompletelyUnset) return null;

  const port = Number(portText);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_HOST, 유효한 SMTP_PORT, MAIL_FROM 설정이 필요합니다.");
  }
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("SMTP_USER와 SMTP_PASSWORD는 함께 설정해야 합니다.");
  }

  const secureText = typeof env.SMTP_SECURE === "string" ? env.SMTP_SECURE.trim().toLowerCase() : "";
  if (secureText && secureText !== "true" && secureText !== "false") {
    throw new Error("SMTP_SECURE에는 true 또는 false만 설정할 수 있습니다.");
  }
  const secure = secureText ? secureText === "true" : port === 465;

  return {
    host,
    port,
    secure,
    from,
    auth: user ? { user, pass: password } : undefined
  };
}

function createSmtpMailer(env = process.env, nodemailer = require("nodemailer")) {
  const config = parseSmtpConfig(env);
  if (!config) return null;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: config.auth,
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });

  return {
    verify: () => transporter.verify(),
    sendMail: ({ to, subject, text }) => transporter.sendMail({
      from: config.from,
      to,
      subject,
      text
    })
  };
}

module.exports = { createSmtpMailer, parseSmtpConfig };
