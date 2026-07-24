const board = document.querySelector(".bcmBoard");
const searchForm = document.querySelector(".cardSearchForm");
const searchInput = document.querySelector("#cardSearch");
const duplicateToggle = document.querySelector(".duplicateToggle");
const resultSummary = document.querySelector(".resultSummary");

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

function createCard(contact, index) {
  const variants = [
    "card-light tilt-left",
    "card-dark tilt-right featured",
    "card-framed tilt-left",
    "card-cream tilt-right wide",
    "card-portrait tilt-right",
    "card-dark-grey tilt-left compact"
  ];
  const classes = variants[index % variants.length];
  const name = escapeHtml(contact.name || "이름 없음");
  const company = escapeHtml(contact.company);
  const position = escapeHtml(contact.position);
  const mobile = escapeHtml(contact.mobile);
  const email = escapeHtml(contact.email);

  return `
    <article class="profileCard ${classes}" data-card-id="${Number(contact.id) || 0}">
      <span class="pill">${company || "BUSINESS CARD"}</span>
      <span class="cardId">#${Number(contact.id) || "-"}</span>
      <h2>${name}</h2>
      <p class="role">${[position, company].filter(Boolean).join(" · ")}</p>
      ${mobile ? `<p class="meta strong">${mobile}</p>` : ""}
      ${email ? `<p class="meta">${email}</p>` : ""}
    </article>
  `;
}

function renderAllCards(cards) {
  board.classList.remove("duplicateMode");
  board.innerHTML = "";

  if (cards.length === 0) {
    board.innerHTML = '<p class="emptyCards">검색 결과가 없습니다.</p>';
    return;
  }

  cards.forEach((card, index) => {
    board.insertAdjacentHTML("beforeend", createCard(card, index));
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
      .map((card, cardIndex) => createCard(card, cardIndex))
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

loadCards();
