const board = document.querySelector(".bcmBoard");
const searchForm = document.querySelector(".cardSearchForm");
const searchInput = document.querySelector("#cardSearch");
const duplicateToggle = document.querySelector(".duplicateToggle");
const resultSummary = document.querySelector(".resultSummary");
const detailModal = document.querySelector(".cardDetailModal");
const detailContent = document.querySelector(".cardDetailContent");
const detailClose = document.querySelector(".cardDetailClose");

let visibleCards = [];
let showDuplicatesOnly = false;
let searchTimer;
let requestSequence = 0;
let activeCardId = null;

function normalizedPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizedText(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function areDuplicateCards(first, second) {
  const firstPhone = normalizedPhone(first.mobile);
  const secondPhone = normalizedPhone(second.mobile);
  const samePhone = firstPhone && firstPhone === secondPhone;

  const firstName = normalizedText(first.name);
  const secondName = normalizedText(second.name);
  const firstCompany = normalizedText(first.company);
  const secondCompany = normalizedText(second.company);
  const sameNameAndCompany =
    firstName &&
    firstCompany &&
    firstName === secondName &&
    firstCompany === secondCompany;

  return Boolean(samePhone || sameNameAndCompany);
}

function groupDuplicateCards(cards) {
  const visited = new Set();
  const groups = [];

  cards.forEach((card, index) => {
    if (visited.has(index)) {
      return;
    }

    const groupIndexes = [];
    const queue = [index];
    visited.add(index);

    while (queue.length > 0) {
      const currentIndex = queue.shift();
      groupIndexes.push(currentIndex);

      cards.forEach((candidate, candidateIndex) => {
        if (
          !visited.has(candidateIndex) &&
          areDuplicateCards(cards[currentIndex], candidate)
        ) {
          visited.add(candidateIndex);
          queue.push(candidateIndex);
        }
      });
    }

    if (groupIndexes.length > 1) {
      groups.push(groupIndexes.map((groupIndex) => cards[groupIndex]));
    }
  });

  return groups;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createWebsiteLink(value) {
  const website = String(value || "").trim();
  const safeValue = escapeHtml(website);
  if (!/^https?:\/\/[^\s]+$/i.test(website)) {
    return safeValue;
  }

  return `<a class="cardDetailWebsiteLink" href="${safeValue}" target="_blank" rel="noopener noreferrer">${safeValue}</a>`;
}

const cardVariants = [
  "card-light tilt-left",
  "card-dark tilt-right featured",
  "card-framed tilt-left",
  "card-cream tilt-right wide",
  "card-portrait tilt-right",
  "card-dark-grey tilt-left compact"
];

function getCardVariant(contact) {
  const cardId = Number(contact.id);
  const variantIndex = Number.isInteger(cardId) && cardId > 0
    ? (cardId - 1) % cardVariants.length
    : 0;
  return cardVariants[variantIndex];
}

function createCard(contact) {
  const classes = getCardVariant(contact);
  const name = escapeHtml(contact.name || "이름 없음");
  const company = escapeHtml(contact.company);
  const position = escapeHtml(contact.position);
  const mobile = escapeHtml(contact.mobile);
  const email = escapeHtml(contact.email);

  return `
    <article class="profileCard ${classes}" data-card-id="${Number(contact.id) || 0}" tabindex="0" role="button" aria-label="${name} 명함 상세 보기">
      <span class="pill">${company || "BUSINESS CARD"}</span>
      <span class="cardId">#${Number(contact.id) || "-"}</span>
      <h2>${name}</h2>
      <p class="role">${[position, company].filter(Boolean).join(" · ")}</p>
      ${mobile ? `<p class="meta strong">${mobile}</p>` : ""}
      ${email ? `<p class="meta">${email}</p>` : ""}
    </article>
  `;
}

function createCardDetail(contact) {
  const classes = getCardVariant(contact);
  const fields = [
    ["이름", contact.name],
    ["회사", contact.company],
    ["부서", contact.department],
    ["직책", contact.position],
    ["휴대폰", contact.mobile],
    ["유선전화", contact.phone],
    ["이메일", contact.email],
    ["홈페이지", contact.website],
    ["주소", contact.address]
  ];
  const details = fields.map(([label, value]) => {
    const content = String(value || "").trim();
    const displayValue = label === "홈페이지"
      ? createWebsiteLink(content)
      : escapeHtml(content);
    return `
      <div class="cardDetailField${label === "주소" ? " cardDetailAddress" : ""}">
        <dt>${label}</dt>
        <dd${content ? "" : ' class="isEmpty"'}>${content ? displayValue : "없음"}</dd>
      </div>
    `;
  }).join("");

  return `
    <article class="cardDetailCard ${classes}">
      <div class="cardDetailHeader">
        <div class="cardDetailCompanyLine">
          <span class="pill">${escapeHtml(contact.company) || "BUSINESS CARD"}</span>
          <span class="cardDetailId">#${Number(contact.id) || "-"}</span>
        </div>
        <p class="cardDetailEyebrow">BUSINESS CARD DETAIL</p>
        <h2 id="cardDetailTitle">${escapeHtml(contact.name || "이름 없음")}</h2>
      </div>
      <dl class="cardDetailGrid">${details}</dl>
      <div class="cardDetailActions">
        <p class="cardDetailStatus" aria-live="polite"></p>
        <button type="button" data-action="edit">수정</button>
        <button type="button" class="danger" data-action="delete">삭제</button>
      </div>
    </article>
  `;
}

function createCardEditor(contact, statusMessage = "") {
  const classes = getCardVariant(contact);
  const fields = [
    ["name", "이름", contact.name],
    ["company", "회사", contact.company],
    ["department", "부서", contact.department],
    ["position", "직책", contact.position],
    ["mobile", "휴대폰", contact.mobile],
    ["phone", "유선전화", contact.phone],
    ["email", "이메일", contact.email],
    ["website", "홈페이지", contact.website],
    ["address", "주소", contact.address]
  ];
  const inputs = fields.map(([name, label, value]) => {
    const safeValue = escapeHtml(value);
    const input = name === "address"
      ? `<textarea class="cardDetailInput" name="${name}" rows="2">${safeValue}</textarea>`
      : `<input class="cardDetailInput" name="${name}" value="${safeValue}">`;

    return `
      <label class="cardDetailField${name === "address" ? " cardDetailAddress" : ""}">
        <span>${label}</span>
        ${input}
      </label>
    `;
  }).join("");

  return `
    <article class="cardDetailCard ${classes}">
      <form class="cardDetailEditForm" data-card-id="${Number(contact.id) || 0}">
        <div class="cardDetailHeader">
          <div class="cardDetailCompanyLine">
            <span class="pill">${escapeHtml(contact.company) || "BUSINESS CARD"}</span>
            <span class="cardDetailId">#${Number(contact.id) || "-"}</span>
          </div>
          <p class="cardDetailEyebrow">BUSINESS CARD EDIT</p>
          <h2 id="cardDetailTitle">명함 정보 수정</h2>
        </div>
        <div class="cardDetailGrid">${inputs}</div>
        <div class="cardDetailActions">
          <p class="cardDetailStatus" aria-live="polite">${escapeHtml(statusMessage)}</p>
          <button type="submit" data-action="save">저장</button>
          <button type="button" data-action="cancel">취소</button>
        </div>
      </form>
    </article>
  `;
}

async function requestCardUpdate(cardId, card, allowDuplicate = false) {
  const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(allowDuplicate ? { ...card, allowDuplicate: true } : card)
  });
  const result = await response.json();

  if (!response.ok) {
    const error = new Error(result.message || "명함을 수정하지 못했습니다.");
    error.status = response.status;
    error.result = result;
    throw error;
  }

  return result;
}

async function requestCardDelete(cardId) {
  const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
    method: "DELETE"
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "명함을 삭제하지 못했습니다.");
  }

  return result;
}

function getActiveCard() {
  return visibleCards.find((card) => Number(card.id) === Number(activeCardId));
}

function showCardEditor() {
  const contact = getActiveCard();
  if (!contact) {
    return;
  }

  detailContent.innerHTML = createCardEditor(contact);
  const firstInput = detailContent.querySelector('[name="name"]');
  if (firstInput) {
    firstInput.focus();
  }
}

function showCardDetail() {
  const contact = getActiveCard();
  if (contact) {
    detailContent.innerHTML = createCardDetail(contact);
  }
}

function setEditorBusy(form, isBusy, message = "") {
  form.querySelectorAll("button, input, textarea").forEach((element) => {
    element.disabled = isBusy;
  });
  const status = form.querySelector(".cardDetailStatus");
  if (status) {
    status.textContent = message;
  }
}

function setDetailStatus(message) {
  const status = detailContent.querySelector(".cardDetailStatus");
  if (status) {
    status.textContent = message;
  }
}

async function saveCardEdits(form) {
  const contact = getActiveCard();
  if (!contact) {
    return;
  }

  const formData = new FormData(form);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    company: String(formData.get("company") || "").trim(),
    department: String(formData.get("department") || "").trim(),
    position: String(formData.get("position") || "").trim(),
    mobile: String(formData.get("mobile") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    website: String(formData.get("website") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    image_path: contact.image_path || ""
  };

  setEditorBusy(form, true, "저장 중입니다.");

  try {
    try {
      await requestCardUpdate(activeCardId, payload);
    } catch (error) {
      if (
        error.status !== 409 ||
        !window.confirm("중복 가능성이 있는 명함입니다. 그래도 수정 내용을 저장할까요?")
      ) {
        throw error;
      }
      await requestCardUpdate(activeCardId, payload, true);
    }

    const savedCardId = activeCardId;
    await loadCards();
    activeCardId = savedCardId;
    if (getActiveCard()) {
      showCardDetail();
    } else {
      closeCardDetail();
    }
  } catch (error) {
    console.error(error);
    setEditorBusy(form, false, error.message || "명함을 수정하지 못했습니다.");
  }
}

async function deleteCurrentCard() {
  const contact = getActiveCard();
  if (!contact || !window.confirm(`'${contact.name || "이름 없음"}' 명함을 삭제할까요?`)) {
    return;
  }

  setDetailStatus("삭제 중입니다.");

  try {
    await requestCardDelete(activeCardId);
    closeCardDetail();
    await loadCards();
  } catch (error) {
    console.error(error);
    setDetailStatus(error.message || "명함을 삭제하지 못했습니다.");
  }
}

function openCardDetail(cardId) {
  const contact = visibleCards.find((card) => Number(card.id) === Number(cardId));
  if (!contact) {
    return;
  }

  activeCardId = Number(cardId);
  detailContent.innerHTML = createCardDetail(contact);
  document.body.classList.add("detailOpen");
  if (typeof detailModal.showModal === "function") {
    detailModal.showModal();
  } else {
    detailModal.setAttribute("open", "");
  }
  detailClose.focus();
}

function closeCardDetail() {
  if (typeof detailModal.close === "function") {
    detailModal.close();
  } else {
    detailModal.removeAttribute("open");
  }
  document.body.classList.remove("detailOpen");
  activeCardId = null;
}

function renderAllCards(cards) {
  board.classList.remove("duplicateMode");
  board.innerHTML = "";

  if (cards.length === 0) {
    board.innerHTML = '<p class="emptyCards">검색 결과가 없습니다.</p>';
    return;
  }

  cards.forEach((card) => {
    board.insertAdjacentHTML("beforeend", createCard(card));
  });
}

function renderDuplicateGroups(groups) {
  board.classList.add("duplicateMode");
  board.innerHTML = "";

  if (groups.length === 0) {
    board.innerHTML = '<p class="emptyCards">중복으로 판단된 명함이 없습니다.</p>';
    return;
  }

  groups.forEach((group, groupIndex) => {
    const cards = group
      .map((card) => createCard(card))
      .join("");
    const cardIds = group
      .map((card) => Number(card.id))
      .filter((id) => Number.isInteger(id) && id > 0)
      .join(",");

    board.insertAdjacentHTML(
      "beforeend",
      `
        <section class="duplicateGroup" aria-label="중복 후보 ${groupIndex + 1}">
          <div class="duplicateGroupHeader">
            <strong>중복 후보 ${groupIndex + 1}</strong>
            <div class="duplicateGroupMeta">
              <span>${group.length}장</span>
              <button
                type="button"
                class="duplicateMergeButton"
                data-card-ids="${cardIds}"
              >병합</button>
            </div>
          </div>
          <div class="duplicateCards">${cards}</div>
        </section>
      `
    );
  });
}

async function requestDuplicateMerge(cardIds) {
  const response = await fetch("/api/cards/merge-group", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cardIds })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "중복 명함 병합에 실패했습니다.");
  }

  return result;
}

async function mergeDuplicateGroup(button) {
  const cardIds = String(button.dataset.cardIds || "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  if (cardIds.length < 2) {
    alert("병합할 중복 명함이 부족합니다.");
    return;
  }

  const approved = confirm(
    `최근 등록된 명함을 기준으로 ${cardIds.length}장을 병합합니다.\n` +
    "빈 정보는 이전 명함에서 채우고, 나머지 중복 명함은 삭제합니다."
  );

  if (!approved) {
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "병합 중";

  try {
    const result = await requestDuplicateMerge(cardIds);
    alert(`${result.deletedCount}장의 중복 명함을 병합했습니다.`);
    await loadCards();
  } catch (error) {
    console.error(error);
    alert(error.message);
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderCurrentView() {
  if (showDuplicatesOnly) {
    const groups = groupDuplicateCards(visibleCards);
    renderDuplicateGroups(groups);
    const duplicateCount = groups.reduce((total, group) => total + group.length, 0);
    resultSummary.textContent = `중복 후보 ${groups.length}개 그룹 · ${duplicateCount}장`;
    return;
  }

  renderAllCards(visibleCards);
  resultSummary.textContent = `최근 등록순 ${visibleCards.length}장`;
}

async function loadCards() {
  const sequence = ++requestSequence;
  const keyword = searchInput.value.trim();
  const query = keyword ? `?q=${encodeURIComponent(keyword)}` : "";

  resultSummary.textContent = "명함을 불러오는 중입니다.";

  try {
    const response = await fetch(`/api/cards${query}`, { cache: "no-store" });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "명함 목록을 불러오지 못했습니다.");
    }

    if (sequence !== requestSequence) {
      return;
    }

    visibleCards = result.cards || [];
    renderCurrentView();
  } catch (error) {
    console.error(error);
    visibleCards = [];
    board.classList.remove("duplicateMode");
    board.innerHTML = `<p class="emptyCards">${escapeHtml(error.message)}</p>`;
    resultSummary.textContent = "목록 조회 실패";
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadCards();
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadCards, 250);
});

duplicateToggle.addEventListener("click", () => {
  showDuplicatesOnly = !showDuplicatesOnly;
  duplicateToggle.classList.toggle("active", showDuplicatesOnly);
  duplicateToggle.setAttribute("aria-pressed", String(showDuplicatesOnly));
  duplicateToggle.textContent = showDuplicatesOnly ? "전체 명함 보기" : "중복 모아보기";
  renderCurrentView();
});

board.addEventListener("click", (event) => {
  const mergeButton = event.target.closest(".duplicateMergeButton");
  if (mergeButton) {
    event.preventDefault();
    event.stopPropagation();
    mergeDuplicateGroup(mergeButton);
    return;
  }

  const card = event.target.closest(".profileCard");
  if (card) {
    openCardDetail(card.dataset.cardId);
  }
});

board.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest(".profileCard");
  if (card) {
    event.preventDefault();
    openCardDetail(card.dataset.cardId);
  }
});

detailClose.addEventListener("click", closeCardDetail);
detailContent.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action;
  if (action === "edit") {
    showCardEditor();
  } else if (action === "cancel") {
    showCardDetail();
  } else if (action === "delete") {
    deleteCurrentCard();
  }
});
detailContent.addEventListener("submit", (event) => {
  if (!event.target.matches(".cardDetailEditForm")) {
    return;
  }
  event.preventDefault();
  saveCardEdits(event.target);
});
detailModal.addEventListener("click", (event) => {
  if (event.target === detailModal) {
    closeCardDetail();
  }
});
detailModal.addEventListener("close", () => {
  document.body.classList.remove("detailOpen");
});

if (typeof document.addEventListener === "function") {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && detailModal.open) {
      closeCardDetail();
    }
  });
}

loadCards();
