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
    </article>
  `;
}

function openCardDetail(cardId) {
  const contact = visibleCards.find((card) => Number(card.id) === Number(cardId));
  if (!contact) {
    return;
  }

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

    board.insertAdjacentHTML(
      "beforeend",
      `
        <section class="duplicateGroup" aria-label="중복 후보 ${groupIndex + 1}">
          <div class="duplicateGroupHeader">
            <strong>중복 후보 ${groupIndex + 1}</strong>
            <span>${group.length}장</span>
          </div>
          <div class="duplicateCards">${cards}</div>
        </section>
      `
    );
  });
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
