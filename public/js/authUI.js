(() => {
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  const protectedPaths = new Set(["cardAdd.html", "cardImport.html", "cardTrash.html", "profile.html"]);

  const menuIcons = {
    profile: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.2 3.1-5 7-5s6.4 1.8 7 5"/>',
    share: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19c.4-3.3 2.3-5 5.5-5s5.1 1.7 5.5 5M14 14c3.4-.8 6 .8 6.5 4"/>',
    backup: '<path d="M12 3.5 14 5l2.5-.2.8 2.4 2.2 1.3-.8 2.4.8 2.4-2.2 1.3-.8 2.4-2.5-.2-2 1.5-2-1.5-2.5.2-.8-2.4-2.2-1.3.8-2.4-.8-2.4 2.2-1.3.8-2.4L10 5z"/><circle cx="12" cy="11.8" r="3"/>',
    logout: '<path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 16l4-4-4-4M18 12H9"/>',
  };

  function makeMenuItem(label, description, href, action, iconName) {
    const item = href ? document.createElement("a") : document.createElement("button");
    item.className = "accountMenuItem";
    const icon = document.createElement("span");
    icon.className = "accountMenuIcon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${menuIcons[iconName]}</svg>`;
    const text = document.createElement("span");
    text.textContent = label;
    item.append(icon, text);
    if (description) item.setAttribute("aria-label", `${label}, ${description}`);
    if (href) item.href = href;
    if (action) {
      item.type = "button";
      item.addEventListener("click", action);
    }
    return item;
  }

  function createAccountMenu(user) {
    const wrapper = document.createElement("div");
    wrapper.className = "accountMenu";

    const trigger = document.createElement("button");
    trigger.className = "accountMenuTrigger";
    trigger.type = "button";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="accountAvatar" aria-hidden="true">계</span><span class="accountTriggerName"></span><span class="accountChevron" aria-hidden="true">⌄</span>';
    trigger.querySelector(".accountAvatar").textContent = Array.from(user.displayName || "계정")[0] || "계";
    trigger.querySelector(".accountTriggerName").textContent = user.displayName || "내 계정";

    const menu = document.createElement("div");
    menu.className = "accountMenuPanel";
    menu.hidden = true;
    menu.setAttribute("role", "menu");

    const identity = document.createElement("div");
    identity.className = "accountMenuIdentity";
    const identityAvatar = document.createElement("span");
    identityAvatar.className = "accountAvatar";
    identityAvatar.setAttribute("aria-hidden", "true");
    identityAvatar.textContent = Array.from(user.displayName || "계정")[0] || "계";
    const identityDetails = document.createElement("span");
    identityDetails.className = "accountMenuIdentityDetails";
    const name = document.createElement("strong");
    name.textContent = user.displayName || "내 계정";
    const email = document.createElement("span");
    email.textContent = user.email || "";
    identityDetails.append(name, email);
    identity.append(identityAvatar, identityDetails);

    const logout = makeMenuItem("로그아웃", "현재 계정에서 나가기", null, async () => {
      logout.disabled = true;
      try {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok) throw new Error("로그아웃하지 못했습니다.");
        window.location.assign("./BCM.html");
      } catch (error) {
        logout.disabled = false;
        window.alert(error.message || "로그아웃하지 못했습니다.");
      }
    }, "logout");
    logout.classList.add("accountMenuLogout");

    menu.append(
      identity,
      makeMenuItem("내 프로필 설정", "이름과 비밀번호 변경", "./profile.html", null, "profile"),
      makeMenuItem("명함 공유", "준비 중", null, () => window.alert("명함 공유 기능은 준비 중입니다."), "share"),
      makeMenuItem("데이터 백업", "준비 중", null, () => window.alert("데이터 백업 기능은 준비 중입니다."), "backup"),
      logout
    );
    wrapper.append(trigger, menu);

    trigger.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
      trigger.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", (event) => {
      if (!wrapper.contains(event.target)) {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    return wrapper;
  }

  function applyAccessState(user) {
    const headerActions = document.querySelector(".headerBox2");
    const registerLink = headerActions?.querySelector(".cardAdd");
    if (headerActions) {
      headerActions.classList.add("authHeaderActions");
      if (!user) {
        registerLink?.remove();
        const loginLink = document.createElement("a");
        loginLink.className = "authLoginLink";
        loginLink.href = `./login.html?next=${encodeURIComponent(currentPath)}`;
        loginLink.textContent = "로그인";
        headerActions.append(loginLink);
      } else {
        headerActions.append(createAccountMenu(user));
      }
    }

    if (!user) {
      document.querySelectorAll(
        '.headerBox1 a[href="./cardImport.html"], .trashFooterLink, .csvExport, .vcardExport, .selectionToggle, .selectionActionBar, .favoriteViewToggle, .groupViewToggle, .duplicateToggle, [data-auth-only]'
      ).forEach((element) => { element.hidden = true; });
    }

    document.body.classList.toggle("isAnonymous", !user);
    document.dispatchEvent(new CustomEvent("auth:ready", { detail: { user } }));
  }

  async function initializeAuthUi() {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) throw new Error("계정 정보를 확인할 수 없습니다.");
      const result = await response.json();
      const user = result.user || null;
      applyAccessState(user);

      if (protectedPaths.has(currentPath) && !user) {
        const next = encodeURIComponent(currentPath);
        window.location.replace(`./login.html?next=${next}`);
      }
    } catch (error) {
      applyAccessState(null);
      if (protectedPaths.has(currentPath)) {
        window.location.replace(`./login.html?next=${encodeURIComponent(currentPath)}`);
      }
    }
  }

  initializeAuthUi();
})();
