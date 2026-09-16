const board = document.querySelector(".bcmBoard");
const searchForm = document.querySelector(".cardSearchForm");
const searchInput = document.querySelector("#cardSearch");
const allViewToggle = document.querySelector(".allViewToggle");
const groupViewToggle = document.querySelector(".groupViewToggle");
const duplicateToggle = document.querySelector(".duplicateToggle");
const duplicateCountBadge = document.querySelector(".duplicateCountBadge");
const cardSortSelect = document.querySelector(".cardSortSelect");
const favoriteViewToggle = document.querySelector(".favoriteViewToggle");
const sortDirectionButtons = [
  document.querySelector('[data-sort-direction="asc"]'),
  document.querySelector('[data-sort-direction="desc"]')
].filter((button) => button?.dataset?.sortDirection);
const selectionToggle = document.querySelector(".selectionToggle");
const selectionInlineCount = document.querySelector(".selectionInlineCount");
const selectionActionBar = document.querySelector(".selectionActionBar");
const selectionBarCountValue = document.querySelector(".selectionBarCountValue");
const groupRemoveSelectedButton = document.querySelector('[data-selection-action="remove-from-group"]');
const resultSummary = document.querySelector(".resultSummary");
const detailModal = document.querySelector(".cardDetailModal");
const detailContent = document.querySelector(".cardDetailContent");
const detailClose = document.querySelector(".cardDetailClose");
const groupAssignModal = document.querySelector(".groupAssignModal");
const groupAssignForm = document.querySelector(".groupAssignForm");
const groupNameInput = document.querySelector("#groupName");
const groupAssignStatus = document.querySelector(".groupAssignStatus");
const groupAssignSelectedCards = document.querySelector(".groupAssignSelectedCards");
const groupAssignExistingCount = document.querySelector(".groupAssignExistingCount");
const groupQuickList = document.querySelector(".groupQuickList");

let visibleCards = [];
let viewMode = "all";
let sortKey = "recent";
let sortDirection = "desc";
let favoritesOnly = false;
const selectionModeByView = new Map([
  ["all", false],
  ["groups", false],
  ["duplicates", false]
]);
let selectionMode = selectionModeByView.get(viewMode);
const selectedCardIdsByView = new Map([
  ["all", new Set()],
  ["groups", new Set()],
  ["duplicates", new Set()]
]);
let selectedCardIds = selectedCardIdsByView.get(viewMode);
let searchTimer;
let requestSequence = 0;
let activeCardId = null;
let cardOpenTimer;

function usesFinePointer() {
  return Boolean(
    globalThis.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches
  );
}

function syncVisualViewportHeight() {
  const viewportHeight = Number(
    globalThis.visualViewport?.height || globalThis.innerHeight
  );

  if (
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !document.documentElement?.style
  ) {
    return;
  }

  document.documentElement.style.setProperty(
    "--visual-viewport-height",
    `${Math.round(viewportHeight)}px`
  );
}

syncVisualViewportHeight();

if (typeof globalThis.visualViewport?.addEventListener === "function") {
  globalThis.visualViewport.addEventListener("resize", syncVisualViewportHeight);
  globalThis.visualViewport.addEventListener("scroll", syncVisualViewportHeight);
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("resize", syncVisualViewportHeight);
}

// ===== 중복 명함 판정 및 그룹화 =====
function normalizedPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizedText(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function sortCards(cards, key = sortKey, direction = sortDirection) {
  const directionMultiplier = direction === "asc" ? 1 : -1;

  return [...cards].sort((first, second) => {
    if (key === "recent") {
      return (Number(first.id) - Number(second.id)) * directionMultiplier;
    }

    const firstValue = normalizedText(first[key]);
    const secondValue = normalizedText(second[key]);
    const comparison = firstValue.localeCompare(secondValue, "ko", {
      numeric: true,
      sensitivity: "base"
    });

    if (comparison !== 0) {
      return comparison * directionMultiplier;
    }

    return (Number(first.id) - Number(second.id)) * directionMultiplier;
  });
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

// ===== 안전한 HTML·홈페이지 링크 처리 =====
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

// ===== 명함 디자인 선택 및 목록 카드 생성 =====
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
  const cardId = Number(contact.id) || 0;
  const isSelected = selectedCardIds.has(cardId);
  const isFavorite = Boolean(Number(contact.is_favorite));
  const name = escapeHtml(contact.name || "이름 없음");
  const company = escapeHtml(contact.company);
  const position = escapeHtml(contact.position);
  const mobile = escapeHtml(contact.mobile);
  const email = escapeHtml(contact.email);

  return `
    <article class="profileCard ${classes}${isSelected ? " is-selected" : ""}${isFavorite ? " has-favorite" : ""}" data-card-id="${cardId}" tabindex="0" role="button" aria-pressed="${isSelected}" aria-label="${name} 명함 ${selectionMode ? "선택" : "상세 보기"}">
      ${isFavorite ? '<span class="profileCardFavoriteMarker" aria-hidden="true">★</span>' : ""}
      <span class="pill">${company || "BUSINESS CARD"}</span>
      <span class="cardId">#${cardId || "-"}</span>
      <h2>${name}</h2>
      <p class="role">${[position, company].filter(Boolean).join(" · ")}</p>
      ${mobile ? `<p class="meta strong">${mobile}</p>` : ""}
      ${email ? `<p class="meta">${email}</p>` : ""}
    </article>
  `;
}

// ===== 명함 상세 보기 및 수정 폼 생성 =====
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
        <button
          class="cardDetailFavoriteButton${Number(contact.is_favorite) ? " is-favorite" : ""}"
          type="button"
          data-action="toggle-favorite"
          aria-pressed="${Number(contact.is_favorite) ? "true" : "false"}"
          aria-label="${Number(contact.is_favorite) ? "즐겨찾기 해제" : "즐겨찾기 추가"}"
        >${Number(contact.is_favorite) ? "★" : "☆"}</button>
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

// ===== 명함 수정·삭제 API 요청 =====
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

async function requestFavoriteUpdate(cardId, isFavorite) {
  const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}/favorite`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ isFavorite })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "즐겨찾기를 변경하지 못했습니다.");
  }

  return result;
}

// ===== 상세 모달 조회·수정·삭제 동작 =====
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

async function toggleFavorite(cardId) {
  const contact = visibleCards.find((card) => Number(card.id) === Number(cardId));
  if (!contact) {
    return;
  }

  const isFavorite = !Boolean(Number(contact.is_favorite));

  try {
    const result = await requestFavoriteUpdate(contact.id, isFavorite);
    contact.is_favorite = Number(result.is_favorite);
    if (Number(activeCardId) === Number(contact.id)) {
      showCardDetail();
    }
    renderCurrentView();
  } catch (error) {
    console.error(error);
    setDetailStatus(error.message || "즐겨찾기를 변경하지 못했습니다.");
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

// ===== 전체 명함 및 중복 그룹 화면 렌더링 =====
function renderEmptyCards(message) {
  const isSearching = Boolean(String(searchInput.value || "").trim());
  const emptyMessage = isSearching ? "검색 결과가 없습니다." : message;
  board.classList.remove("duplicateMode", "groupMode");
  board.innerHTML = `<p class="emptyCards">${escapeHtml(emptyMessage)}</p>`;
}

function renderAllCards(cards) {
  board.classList.remove("duplicateMode", "groupMode");
  board.innerHTML = "";

  if (cards.length === 0) {
    renderEmptyCards("등록된 명함이 없습니다.");
    return;
  }

  cards.forEach((card) => {
    board.insertAdjacentHTML("beforeend", createCard(card));
  });
}

function groupCardsByName(cards) {
  const groups = new Map();

  cards.forEach((card) => {
    const groupName = String(card.group_name || "").trim();
    if (!groupName) {
      return;
    }
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(card);
  });

  return groups;
}

function groupCardChunkSize() {
  const viewportWidth = Number(globalThis.innerWidth) || 1280;
  const cardWidth = viewportWidth >= 2200
    ? 393
    : viewportWidth >= 1600
      ? 348
      : viewportWidth >= 1200
        ? 323
        : 305;
  const groupPadding = 46;
  const groupGap = 24;
  const availableWidth = Number(board.clientWidth) || Math.min(viewportWidth, 1280);
  const columnCount = Math.floor(
    (availableWidth - groupPadding + groupGap) / (cardWidth + groupGap)
  );

  return Math.max(1, Math.min(5, columnCount)) * 2;
}

function renderGroupedCards(cards) {
  board.classList.remove("duplicateMode");
  board.classList.add("groupMode");
  board.innerHTML = "";
  const groups = groupCardsByName(cards);

  if (groups.size === 0) {
    renderEmptyCards(cards.length === 0 ? "등록된 명함이 없습니다." : "지정된 그룹이 없습니다.");
    return;
  }

  groups.forEach((groupCards, groupName) => {
    const cardsPerChunk = groupCardChunkSize();
    const primaryCards = groupCards.slice(0, cardsPerChunk);
    const overflowCards = groupCards.slice(cardsPerChunk);
    const cardsMarkup = primaryCards.map((card) => createCard(card)).join("");
    const overflowCardsMarkup = overflowCards.map((card) => createCard(card)).join("");
    const cardIds = groupCards
      .map((card) => Number(card.id))
      .filter((id) => Number.isInteger(id) && id > 0)
      .join(",");
    board.insertAdjacentHTML(
      "beforeend",
      `
        <section class="cardGroup" aria-label="${escapeHtml(groupName)} 그룹">
          <div class="cardGroupHeader">
            <strong>${escapeHtml(groupName)}</strong>
            <div class="cardGroupMeta">
              <span>${groupCards.length}장</span>
              <button type="button" class="groupRemoveButton" data-group-name="${escapeHtml(groupName)}" data-card-ids="${cardIds}">그룹 삭제</button>
            </div>
          </div>
          <div class="groupedCards">${cardsMarkup}</div>
          ${overflowCardsMarkup ? `<div class="groupedCards groupedCardsOverflow" style="--group-column-count:${cardsPerChunk / 2}">${overflowCardsMarkup}</div>` : ""}
        </section>
      `
    );
  });
}

function renderDuplicateGroups(groups) {
  board.classList.remove("groupMode");
  board.classList.add("duplicateMode");
  board.innerHTML = "";

  if (groups.length === 0) {
    renderEmptyCards(visibleCards.length === 0 ? "등록된 명함이 없습니다." : "중복으로 판단된 명함이 없습니다.");
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

// ===== 중복 명함 병합 =====
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

// ===== 선택 명함 그룹 지정·삭제 API 요청 =====
async function requestGroupAssignment(cardIds, groupName) {
  const response = await fetch("/api/cards/groups", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cardIds, groupName })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "그룹을 지정하지 못했습니다.");
  }

  return result;
}

async function requestGroupNames() {
  const response = await fetch("/api/cards/groups", { cache: "no-store" });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "그룹 목록을 불러오지 못했습니다.");
  }

  return Array.isArray(result.groups) ? result.groups : [];
}

async function requestBulkDelete(cardIds) {
  const response = await fetch("/api/cards/bulk-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cardIds })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "선택한 명함을 삭제하지 못했습니다.");
  }

  return result;
}

// ===== 선택 모드 및 하단 작업 바 =====
function selectedIds() {
  return Array.from(selectedCardIds);
}

function syncSelectionUi() {
  const hasSelection = selectedCardIds.size > 0;
  selectionActionBar.hidden = !hasSelection;
  groupRemoveSelectedButton.hidden = !(hasSelection && viewMode === "groups");
  selectionBarCountValue.textContent = String(selectedCardIds.size);
  selectionInlineCount.hidden = !hasSelection;
  selectionInlineCount.textContent = `(${selectedCardIds.size}개 선택됨)`;
  selectionToggle.classList.toggle("active", selectionMode);
  selectionToggle.setAttribute("aria-pressed", String(selectionMode));
}

function setSelectionMode(isActive) {
  selectionMode = isActive;
  selectionModeByView.set(viewMode, selectionMode);
  if (!selectionMode) {
    selectedCardIds.clear();
  }
  syncSelectionUi();
  renderCurrentView();
}

function toggleCardSelection(cardId) {
  const numericId = Number(cardId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return;
  }

  if (selectedCardIds.has(numericId)) {
    selectedCardIds.delete(numericId);
  } else {
    selectedCardIds.add(numericId);
  }

  const isSelected = selectedCardIds.has(numericId);
  board.querySelectorAll(`.profileCard[data-card-id="${numericId}"]`).forEach((card) => {
    card.classList.toggle("is-selected", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });
  syncSelectionUi();
}

function selectedCardsForGroupAssignment() {
  const selectedIdSet = new Set(selectedIds());
  return visibleCards.filter((card) => selectedIdSet.has(Number(card.id)));
}

function isSelectedCardsAlreadyInGroup(cards, groupName) {
  const targetGroupName = String(groupName || "").trim();
  return Boolean(targetGroupName) && cards.length > 0 && cards.every((card) => (
    String(card.group_name || "").trim() === targetGroupName
  ));
}

function renderGroupAssignmentOptions(groupNames) {
  const selectedCards = selectedCardsForGroupAssignment();

  groupAssignExistingCount.textContent = groupNames.length
    ? `등록된 그룹 ${groupNames.length}개`
    : "등록된 그룹 없음";
  groupAssignSelectedCards.innerHTML = selectedCards
    .map((card) => {
      const primary = escapeHtml(card.name || card.company || "이름 없음");
      const secondary = escapeHtml(card.company || "회사 미입력");
      return `<span class="groupAssignTargetChip"><b>${primary}</b><small>${secondary}</small></span>`;
    })
    .join("");
  groupQuickList.innerHTML = groupNames.length
    ? groupNames.map((groupName) => `
      <button type="button" class="groupQuickOption" data-group-name="${escapeHtml(groupName)}" role="listitem">
        ${escapeHtml(groupName)}
      </button>
    `).join("")
    : '<p class="groupQuickEmpty">아직 지정된 그룹이 없습니다. 새 그룹 이름을 입력해 주세요.</p>';
}

async function openGroupAssignment() {
  renderGroupAssignmentOptions([]);
  groupAssignStatus.textContent = "그룹 목록을 불러오는 중입니다.";
  groupNameInput.value = "";

  if (typeof groupAssignModal.showModal === "function") {
    groupAssignModal.showModal();
  } else {
    groupAssignModal.setAttribute("open", "");
  }
  groupNameInput.focus();

  try {
    const groupNames = await requestGroupNames();
    renderGroupAssignmentOptions(groupNames);
    groupAssignStatus.textContent = "";
  } catch (error) {
    console.error(error);
    groupAssignStatus.textContent = error.message;
  }
}

function closeGroupAssignment() {
  if (typeof groupAssignModal.close === "function") {
    groupAssignModal.close();
  } else {
    groupAssignModal.removeAttribute("open");
  }
}

async function assignSelectedGroup() {
  const groupName = groupNameInput.value.trim();
  if (!groupName) {
    groupAssignStatus.textContent = "그룹 이름을 입력해 주세요.";
    return;
  }

  const selectedCards = selectedCardsForGroupAssignment();
  if (isSelectedCardsAlreadyInGroup(selectedCards, groupName)) {
    window.alert(`선택한 명함은 이미 “${groupName}” 그룹에 속해 있습니다.`);
    return;
  }

  groupAssignForm.querySelectorAll("button, input").forEach((element) => {
    element.disabled = true;
  });
  groupAssignStatus.textContent = "그룹을 지정하는 중입니다.";

  try {
    await requestGroupAssignment(selectedIds(), groupName);
    closeGroupAssignment();
    selectedCardIds.clear();
    selectionMode = false;
    selectionModeByView.set(viewMode, selectionMode);
    syncSelectionUi();
    await loadCards();
  } catch (error) {
    console.error(error);
    groupAssignStatus.textContent = error.message;
  } finally {
    groupAssignForm.querySelectorAll("button, input").forEach((element) => {
      element.disabled = false;
    });
  }
}

async function deleteSelectedCards() {
  const cardIds = selectedIds();
  if (
    cardIds.length === 0 ||
    !window.confirm(`선택한 명함 ${cardIds.length}장을 삭제할까요?`)
  ) {
    return;
  }

  try {
    await requestBulkDelete(cardIds);
    selectedCardIds.clear();
    selectionMode = false;
    syncSelectionUi();
    await loadCards();
  } catch (error) {
    console.error(error);
    window.alert(error.message);
  }
}

async function removeSelectedFromGroup() {
  const cardIds = selectedIds();
  if (viewMode !== "groups" || cardIds.length === 0) {
    return;
  }

  if (!window.confirm(`선택한 명함 ${cardIds.length}장을 그룹에서 제거할까요?\n명함 정보는 삭제되지 않습니다.`)) {
    return;
  }

  try {
    await requestGroupAssignment(cardIds, "");
    cardIds.forEach((cardId) => selectedCardIds.delete(cardId));
    syncSelectionUi();
    await loadCards();
  } catch (error) {
    console.error(error);
    window.alert(error.message);
  }
}

async function removeGroupAssignment(button) {
  const cardIds = String(button.dataset.cardIds || "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  const groupName = String(button.dataset.groupName || "");

  if (cardIds.length === 0 || !window.confirm(
    `“${groupName}” 그룹을 삭제할까요?\n그룹에 속한 ${cardIds.length}장의 명함은 삭제되지 않고 그룹 미지정 상태가 됩니다.`
  )) {
    return;
  }

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "삭제 중";

  try {
    await requestGroupAssignment(cardIds, "");
    cardIds.forEach((cardId) => selectedCardIds.delete(cardId));
    syncSelectionUi();
    await loadCards();
  } catch (error) {
    console.error(error);
    window.alert(error.message);
    button.disabled = false;
    button.textContent = originalText;
  }
}

function selectedExportPath(format, cardIds) {
  const exportFormat = format === "vcard" ? "vcard" : "csv";
  const params = new URLSearchParams({ ids: cardIds.join(",") });
  return `/api/cards/export/${exportFormat}?${params.toString()}`;
}

function exportSelectedCards(format) {
  const cardIds = selectedIds();
  if (cardIds.length > 0) {
    window.location.assign(selectedExportPath(format, cardIds));
  }
}

// ===== 명함 목록 검색 및 불러오기 =====
function renderCurrentView() {
  syncSelectionUi();
  const cardsForView = favoritesOnly
    ? visibleCards.filter((card) => Boolean(Number(card.is_favorite)))
    : visibleCards;
  const sortedCards = sortCards(cardsForView);
  const duplicateGroups = groupDuplicateCards(sortedCards);
  duplicateCountBadge.textContent = String(duplicateGroups.length);
  duplicateCountBadge.hidden = duplicateGroups.length === 0;
  allViewToggle.classList.toggle("active", viewMode === "all");
  allViewToggle.setAttribute("aria-pressed", String(viewMode === "all"));
  groupViewToggle.classList.toggle("active", viewMode === "groups");
  groupViewToggle.setAttribute("aria-pressed", String(viewMode === "groups"));
  duplicateToggle.classList.toggle("active", viewMode === "duplicates");
  duplicateToggle.setAttribute("aria-pressed", String(viewMode === "duplicates"));
  favoriteViewToggle.classList.toggle("active", favoritesOnly);
  favoriteViewToggle.setAttribute("aria-pressed", String(favoritesOnly));
  favoriteViewToggle.textContent = favoritesOnly ? "★" : "☆";
  sortDirectionButtons.forEach((button) => {
    const isActive = button.dataset.sortDirection === sortDirection;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (viewMode === "duplicates") {
    renderDuplicateGroups(duplicateGroups);
    const duplicateCount = duplicateGroups.reduce((total, group) => total + group.length, 0);
    resultSummary.textContent = `중복 ${duplicateGroups.length}그룹 · ${duplicateCount}장`;
    return;
  }

  if (viewMode === "groups") {
    const groups = groupCardsByName(sortedCards);
    const groupedCardCount = Array.from(groups.values())
      .reduce((total, cards) => total + cards.length, 0);
    renderGroupedCards(sortedCards);
    resultSummary.textContent = `그룹 ${groups.size}개 · ${groupedCardCount}장`;
    return;
  }

  renderAllCards(sortedCards);
  resultSummary.textContent = favoritesOnly
    ? `즐겨찾기 ${sortedCards.length}장`
    : `전체 ${visibleCards.length}장`;
}

function setViewMode(nextViewMode) {
  if (!selectedCardIdsByView.has(nextViewMode)) {
    return;
  }

  if (selectedCardIds.size === 0) {
    selectionMode = false;
    selectionModeByView.set(viewMode, selectionMode);
  }

  viewMode = nextViewMode;
  selectedCardIds = selectedCardIdsByView.get(viewMode);
  selectionMode = selectionModeByView.get(viewMode);
  syncSelectionUi();
  renderCurrentView();
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
    const visibleIds = new Set(visibleCards.map((card) => Number(card.id)));
    selectedCardIds.forEach((cardId) => {
      if (!visibleIds.has(cardId)) {
        selectedCardIds.delete(cardId);
      }
    });
    syncSelectionUi();
    renderCurrentView();
  } catch (error) {
    console.error(error);
    visibleCards = [];
    board.classList.remove("duplicateMode");
    board.innerHTML = `<p class="emptyCards">${escapeHtml(error.message)}</p>`;
    resultSummary.textContent = "목록 조회 실패";
  }
}

// ===== 검색·보기 전환·명함 선택 이벤트 =====
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadCards();
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadCards, 250);
});

allViewToggle.addEventListener("click", () => {
  setViewMode("all");
});

groupViewToggle.addEventListener("click", () => {
  setViewMode(viewMode === "groups" ? "all" : "groups");
});

duplicateToggle.addEventListener("click", () => {
  setViewMode(viewMode === "duplicates" ? "all" : "duplicates");
});

cardSortSelect.addEventListener("change", () => {
  sortKey = cardSortSelect.value;
  renderCurrentView();
});

sortDirectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    sortDirection = button.dataset.sortDirection;
    renderCurrentView();
  });
});

favoriteViewToggle.addEventListener("click", () => {
  favoritesOnly = !favoritesOnly;
  renderCurrentView();
});

selectionToggle.addEventListener("click", () => {
  setSelectionMode(!selectionMode);
});

selectionActionBar.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-selection-action]");
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.selectionAction;
  if (action === "export-csv") {
    exportSelectedCards("csv");
  } else if (action === "export-vcard") {
    exportSelectedCards("vcard");
  } else if (action === "group") {
    openGroupAssignment();
  } else if (action === "remove-from-group") {
    removeSelectedFromGroup();
  } else if (action === "delete") {
    deleteSelectedCards();
  }
});

board.addEventListener("click", (event) => {
  const groupRemoveButton = event.target.closest(".groupRemoveButton");
  if (groupRemoveButton) {
    event.preventDefault();
    event.stopPropagation();
    removeGroupAssignment(groupRemoveButton);
    return;
  }

  const mergeButton = event.target.closest(".duplicateMergeButton");
  if (mergeButton) {
    event.preventDefault();
    event.stopPropagation();
    mergeDuplicateGroup(mergeButton);
    return;
  }

  const card = event.target.closest(".profileCard");
  if (card) {
    if (selectionMode) {
      toggleCardSelection(card.dataset.cardId);
    } else if (!usesFinePointer()) {
      openCardDetail(card.dataset.cardId);
    } else {
      clearTimeout(cardOpenTimer);
      cardOpenTimer = setTimeout(() => {
        openCardDetail(card.dataset.cardId);
      }, 200);
    }
  }
});

board.addEventListener("dblclick", (event) => {
  const card = event.target.closest(".profileCard");
  if (!card || selectionMode || !usesFinePointer()) {
    return;
  }

  clearTimeout(cardOpenTimer);
  toggleFavorite(card.dataset.cardId);
});

board.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest(".profileCard");
  if (card) {
    event.preventDefault();
    clearTimeout(cardOpenTimer);
    if (selectionMode) {
      toggleCardSelection(card.dataset.cardId);
    } else {
      openCardDetail(card.dataset.cardId);
    }
  }
});

groupAssignForm.addEventListener("submit", (event) => {
  event.preventDefault();
  assignSelectedGroup();
});

groupAssignModal.addEventListener("click", (event) => {
  const groupChoice = event.target.closest?.("[data-group-name]");
  if (groupChoice) {
    groupNameInput.value = groupChoice.dataset.groupName || "";
    groupNameInput.focus();
    return;
  }

  const cancelButton = event.target.closest?.('[data-group-action="cancel"]');
  if (cancelButton || event.target === groupAssignModal) {
    closeGroupAssignment();
  }
});

// ===== 상세 모달 이벤트 =====
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
  } else if (action === "toggle-favorite") {
    toggleFavorite(activeCardId);
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
