(() => {
  const status = document.querySelector(".authStatus");
  const token = new URLSearchParams(window.location.search).get("token") || "";

  function showStatus(message, state = "") {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  async function requestJson(path, method, body) {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "요청을 처리하지 못했습니다.");
    return result;
  }

  document.querySelector("[data-auth-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type=submit]");
    const data = new FormData(form);
    if (submit) submit.disabled = true;
    showStatus("처리 중입니다.");

    try {
      if (form.dataset.authForm === "login") {
        await requestJson("/api/auth/login", "POST", {
          email: data.get("email"), password: data.get("password")
        });
        const next = new URLSearchParams(window.location.search).get("next") || "BCM.html";
        const safeNext = new Set(["index.html", "BCM.html", "cardAdd.html", "cardImport.html", "cardTrash.html", "profile.html"]);
        window.location.assign(`./${safeNext.has(next) ? next : "BCM.html"}`);
      } else if (form.dataset.authForm === "signup") {
        const result = await requestJson("/api/auth/signup", "POST", {
          displayName: data.get("displayName"),
          email: data.get("email"),
          password: data.get("password")
        });
        showStatus(result.message || "인증 링크를 이메일로 보냈습니다.", "success");
        form.reset();
      } else if (form.dataset.authForm === "verify") {
        const result = await requestJson("/api/auth/verify", "POST", { token });
        showStatus(result.message || "이메일 인증이 완료되었습니다.", "success");
        window.setTimeout(() => window.location.assign("./login.html"), 1200);
      } else if (form.dataset.authForm === "verification-resend") {
        const result = await requestJson("/api/auth/verification/resend", "POST", {
          email: data.get("email")
        });
        showStatus(result.message || "인증이 필요한 계정이라면 새 인증 링크를 보냈습니다.", "success");
        form.reset();
      } else if (form.dataset.authForm === "reset-request") {
        const result = await requestJson("/api/auth/password-reset/request", "POST", {
          email: data.get("email")
        });
        showStatus(result.message || "가입된 이메일이라면 재설정 링크를 보냈습니다.", "success");
        form.reset();
      } else if (form.dataset.authForm === "reset-complete") {
        const result = await requestJson("/api/auth/password-reset/complete", "POST", {
          token,
          newPassword: data.get("newPassword")
        });
        showStatus(result.message || "비밀번호를 재설정했습니다.", "success");
        window.setTimeout(() => window.location.assign("./login.html"), 1200);
      } else if (form.dataset.authForm === "profile") {
        const result = await requestJson("/api/auth/profile", "PATCH", {
          displayName: data.get("displayName")
        });
        showStatus("이름을 변경했습니다.", "success");
        const name = document.querySelector('[name="displayName"]');
        if (name && result.user?.displayName) name.value = result.user.displayName;
        const updatedName = result.user?.displayName;
        if (updatedName) {
          const avatar = Array.from(updatedName)[0] || "계";
          document.querySelectorAll(".accountTriggerName").forEach((element) => { element.textContent = updatedName; });
          document.querySelectorAll(".accountAvatar").forEach((element) => { element.textContent = avatar; });
          document.querySelectorAll(".accountMenuIdentity strong").forEach((element) => { element.textContent = updatedName; });
        }
      } else if (form.dataset.authForm === "password") {
        const result = await requestJson("/api/auth/password", "PATCH", {
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword")
        });
        showStatus(result.message || "비밀번호를 변경했습니다.", "success");
        form.reset();
      }
    } catch (error) {
      showStatus(error.message || "요청을 처리하지 못했습니다.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  const verifyForm = document.querySelector('[data-auth-form="verify"]');
  if (verifyForm && !token) {
    const button = verifyForm.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    showStatus("인증 토큰이 없습니다. 이메일의 인증 링크를 다시 확인해 주세요.", "error");
  }

  if (document.body.classList.contains("profile-page")) {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (!result.user) return;
        const name = document.querySelector('[name="displayName"]');
        const email = document.querySelector(".profileEmail");
        if (name) name.value = result.user.displayName || "";
        if (email) email.textContent = result.user.email || "";
      })
      .catch(() => showStatus("계정 정보를 불러오지 못했습니다.", "error"));
  }
})();
