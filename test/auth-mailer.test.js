const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createSmtpMailer } = require("../auth/mailer");

function smtpEnvironment(overrides = {}) {
  return {
    SMTP_HOST: "mail.company.test",
    SMTP_PORT: "587",
    SMTP_USER: "cards@company.test",
    SMTP_PASSWORD: "smtp-password",
    MAIL_FROM: "명함관리 <cards@company.test>",
    ...overrides
  };
}

function fakeNodemailer() {
  const calls = { options: null, messages: [] };
  return {
    calls,
    nodemailer: {
      createTransport(options) {
        calls.options = options;
        return {
          async sendMail(message) {
            calls.messages.push(message);
            return { messageId: "test-message" };
          }
        };
      }
    }
  };
}

test("SMTP 미설정이면 메일 전송기를 만들지 않는다", () => {
  const { nodemailer, calls } = fakeNodemailer();
  assert.equal(createSmtpMailer({}, nodemailer), null);
  assert.equal(calls.options, null);
});

test("SMTP 587은 STARTTLS 설정으로 연결하고 발신 주소를 공통 적용한다", async () => {
  const { nodemailer, calls } = fakeNodemailer();
  const mailer = createSmtpMailer(smtpEnvironment(), nodemailer);
  await mailer.sendMail({ to: "user@example.com", subject: "인증", text: "링크" });

  assert.equal(calls.options.host, "mail.company.test");
  assert.equal(calls.options.port, 587);
  assert.equal(calls.options.secure, false);
  assert.deepEqual(calls.options.auth, {
    user: "cards@company.test",
    pass: "smtp-password"
  });
  assert.deepEqual(calls.messages[0], {
    from: "명함관리 <cards@company.test>",
    to: "user@example.com",
    subject: "인증",
    text: "링크"
  });
});

test("SMTP 465는 TLS를 사용하고 일부만 입력된 인증 정보는 거부한다", () => {
  const { nodemailer, calls } = fakeNodemailer();
  createSmtpMailer(smtpEnvironment({ SMTP_PORT: "465" }), nodemailer);
  assert.equal(calls.options.secure, true);
  assert.throws(
    () => createSmtpMailer(smtpEnvironment({ SMTP_PASSWORD: "" }), nodemailer),
    /SMTP_USER와 SMTP_PASSWORD/,
  );
});
