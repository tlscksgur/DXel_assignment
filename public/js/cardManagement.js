const board = document.querySelector(".bcmBoard");
const searchForm = document.querySelector(".cardSearchForm");
const searchInput = document.querySelector("#cardSearch");
const allViewToggle = document.querySelector(".allViewToggle");
const groupViewToggle = document.querySelector(".groupViewToggle");
const tagViewToggle = document.querySelector(".tagViewToggle");
const duplicateToggle = document.querySelector(".duplicateToggle");
const duplicateCountBadge = document.querySelector(".duplicateCountBadge");
const cardSortSelect = document.querySelector(".cardSortSelect");
const myCardsOnlyOption = document.querySelector('.cardSortSelect option[value="mine"]');
const tagFilterSelect = document.querySelector(".tagFilterSelect");
const favoriteViewToggle = document.querySelector(".favoriteViewToggle");
const sortDirectionButtons = [
  document.querySelector('[data-sort-direction="asc"]'),
  document.querySelector('[data-sort-direction="desc"]')
].filter((button) => button?.dataset?.sortDirection);
const selectionToggle = document.querySelector(".selectionToggle");
const selectionInlineCount = document.querySelector(".selectionInlineCount");
const selectionActionBar = document.querySelector(".selectionActionBar");
const selectionBarCountValue = document.querySelector(".selectionBarCountValue");
const deleteSelectedButton = document.querySelector('[data-selection-action="delete"]');
const groupRemoveSelectedButton = document.querySelector('[data-selection-action="remove-from-group"]');
const resultSummary = document.querySelector(".resultSummary");
const visibilityFilterSelect = document.querySelector(".visibilityFilterSelect");
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
let visibilityFilter = "all";

function filterCardsByVisibility(cards, scope = visibilityFilter) {
  return scope === "mine" ? filterCardsByCurrentUser(cards) : cards;
}
let viewMode = "all";
let sortKey = "recent";
let sortDirection = "desc";
let myCardsOnly = false;
let currentUser = null;
let favoritesOnly = false;
let tagFilter = "";
const selectionModeByView = new Map([
  ["all", false],
  ["groups", false],
  ["tags", false],
  ["duplicates", false]
]);
let selectionMode = selectionModeByView.get(viewMode);
const selectedCardIdsByView = new Map([
  ["all", new Set()],
  ["groups", new Set()],
  ["tags", new Set()],
  ["duplicates", new Set()]
]);
let selectedCardIds = selectedCardIdsByView.get(viewMode);
let searchTimer;
let requestSequence = 0;
let activeCardId = null;
let cardOpenTimer;
let detailStatusTimer;
let hasPendingTagViewUpdate = false;
const pendingTagUpdates = new Map();
const CARD_TAG_OPTIONS = ["고객", "잠재 고객", "협력사", "공급업체", "파트너사", "내부", "기타"];

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

function meetingTimestamp(value) {
  const meetingDate = String(value || "").trim();
  if (!meetingDate) return null;

  const timestamp = Date.parse(meetingDate);
  return Number.isFinite(timestamp) ? timestamp : null;
}

// 정렬 비교마다 localeCompare 옵션을 해석하지 않도록 재사용한다.
const cardTextCollator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function sortCards(cards, key = sortKey, direction = sortDirection) {
  const directionMultiplier = direction === "asc" ? 1 : -1;

  return [...cards].sort((first, second) => {
    if (key === "recent") {
      return (Number(first.id) - Number(second.id)) * directionMultiplier;
    }

    if (key === "meeting") {
      const firstTimestamp = meetingTimestamp(first.meeting_date);
      const secondTimestamp = meetingTimestamp(second.meeting_date);
      const firstHasMeeting = firstTimestamp !== null;
      const secondHasMeeting = secondTimestamp !== null;

      if (firstHasMeeting !== secondHasMeeting) {
        return firstHasMeeting ? -1 : 1;
      }

      if (firstHasMeeting && firstTimestamp !== secondTimestamp) {
        return (firstTimestamp - secondTimestamp) * directionMultiplier;
      }

      return (Number(first.id) - Number(second.id)) * directionMultiplier;
    }

    const firstValue = normalizedText(first[key]);
    const secondValue = normalizedText(second[key]);
    const comparison = cardTextCollator.compare(firstValue, secondValue);

    if (comparison !== 0) {
      return comparison * directionMultiplier;
    }

    return (Number(first.id) - Number(second.id)) * directionMultiplier;
  });
}

function groupDuplicateCards(cards) {
  const parents = cards.map((_, index) => index);
  const phoneIndexes = new Map();
  const nameIndexes = new Map();
  const rootOf = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const connect = (first, second) => {
    const firstRoot = rootOf(first);
    const secondRoot = rootOf(second);
    if (firstRoot !== secondRoot) parents[Math.max(firstRoot, secondRoot)] = Math.min(firstRoot, secondRoot);
  };

  cards.forEach((card, index) => {
    const phone = normalizedPhone(card.mobile);
    if (phone) {
      if (phoneIndexes.has(phone)) connect(index, phoneIndexes.get(phone));
      else phoneIndexes.set(phone, index);
    }

    const name = normalizedText(card.name);
    const company = normalizedText(card.company);
    if (name && company) {
      if (!nameIndexes.has(name)) nameIndexes.set(name, new Map());
      const companyIndexes = nameIndexes.get(name);
      if (companyIndexes.has(company)) connect(index, companyIndexes.get(company));
      else companyIndexes.set(company, index);
    }
  });

  const groups = new Map();
  cards.forEach((card, index) => {
    const root = rootOf(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(card);
  });
  return Array.from(groups.values()).filter((group) => group.length > 1);
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

function safeUploadSrc(value) {
  const imagePath = String(value || "").trim();
  return /^\/uploads\/[A-Za-z0-9._-]+$/.test(imagePath) ? escapeHtml(`.${imagePath}`) : "";
}

function parseCardTags(value) {
  try {
    const tags = JSON.parse(String(value || "[]"));
    return Array.isArray(tags)
      ? tags.filter((tag) => CARD_TAG_OPTIONS.includes(tag))
      : [];
  } catch {
    return [];
  }
}

function createCardTagDrawer(contact) {
  const selectedTags = parseCardTags(contact.tags);
  const buttons = CARD_TAG_OPTIONS.map((tag, index) => {
    const selected = selectedTags.includes(tag);
    return `<button type="button" class="cardTag cardTag-${index}${selected ? " is-selected" : ""}" data-action="toggle-tag" data-tag="${tag}" aria-pressed="${selected}"><span>${tag}</span></button>`;
  }).join("");

  return `<section class="cardTagDrawer${selectedTags.length ? " has-selected" : ""}" aria-label="명함 분류 태그"><div class="cardTagRail">${buttons}</div></section>`;
}

function createProfileCardTags(contact) {
  const selectedTags = parseCardTags(contact.tags);
  if (selectedTags.length === 0) return "";

  const markers = selectedTags.map((tag) => {
    const index = CARD_TAG_OPTIONS.indexOf(tag);
    return `<span class="profileCardTag profileCardTag-${index}" title="${tag}" aria-label="${tag}"></span>`;
  }).join("");

  return `<div class="profileCardTags" aria-label="선택된 명함 태그">${markers}</div>`;
}

function syncProfileCardTags(cardId, tags) {
  document.querySelectorAll(".profileCard").forEach((card) => {
    if (Number(card.dataset.cardId) !== Number(cardId)) return;

    card.querySelector(".profileCardTags")?.remove();
    const markers = createProfileCardTags({ tags: JSON.stringify(tags) });
    if (markers) card.insertAdjacentHTML("beforeend", markers);
  });
}

function createWebsiteLink(value) {
  const website = String(value || "").trim();
  const safeValue = escapeHtml(website);
  if (!/^https?:\/\/[^\s]+$/i.test(website)) {
    return safeValue;
  }

  return `<a class="cardDetailWebsiteLink" href="${safeValue}" target="_blank" rel="noopener noreferrer">${safeValue}</a>`;
}

async function copyText(value) {
  const content = String(value || "").trim();
  if (!content) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      // 권한이나 브라우저 설정으로 Clipboard API를 쓸 수 없으면 선택 영역을 복사한다.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  const previousFocus = document.activeElement;
  // 모달 바깥은 비활성이라 복사용 입력을 선택할 수 없다.
  (detailModal.open ? detailModal : document.body).append(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, content.length);
    return document.execCommand("copy");
  } finally {
    textarea.remove();
    previousFocus?.focus({ preventScroll: true });
  }
}

function cardInfoFields(contact) {
  return [
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
}

function createCopyAllCardText(contact) {
  return cardInfoFields(contact)
    .filter(([, value]) => String(value || "").trim())
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join("\n");
}

function createCardOriginalImage(contact) {
  const safeImagePath = safeUploadSrc(contact.image_path);
  const imageContent = safeImagePath
    ? `<img src="${safeImagePath}" alt="${escapeHtml(contact.name || "명함")} 원본 이미지" loading="eager" decoding="async">`
    : "<span>원본 이미지 없음</span>";

  if (!safeImagePath) {
    return `<div class="cardDetailOriginalImage is-empty" aria-label="명함 원본 이미지">${imageContent}</div>`;
  }

  return `<button type="button" class="cardDetailOriginalImage" data-action="view-image" aria-label="${escapeHtml(contact.name || "명함")} 원본 이미지 크게 보기">${imageContent}<span class="cardDetailImageHint">원본 크게 보기</span></button>`;
}

function createCardImageLightbox(contact) {
  const safeImagePath = safeUploadSrc(contact.image_path);
  if (!safeImagePath) return "";

  const imageAlt = escapeHtml(contact.name || "명함");
  return `<div class="cardImageLightbox" hidden role="dialog" aria-modal="true" aria-label="${imageAlt} 원본 이미지 크게 보기"><img src="${safeImagePath}" alt="${imageAlt} 원본 이미지" decoding="async"></div>`;
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

function canManagePersonalData(contact) {
  return contact.can_manage_personal !== 0 && contact.can_manage_personal !== false;
}

function canEditCard(contact) {
  return contact.can_edit !== 0 && contact.can_edit !== false;
}

function filterCardsByCurrentUser(cards) {
  return cards.filter((card) => card.is_mine === true || Number(card.is_mine) === 1);
}

function createCard(contact) {
  const classes = getCardVariant(contact);
  const cardId = Number(contact.id) || 0;
  const isSelected = selectedCardIds.has(cardId);
  const canManagePersonal = canManagePersonalData(contact);
  const isFavorite = canManagePersonal && Boolean(Number(contact.is_favorite));
  const name = escapeHtml(contact.name || "-");
  const company = escapeHtml(contact.company);
  const position = escapeHtml(contact.position);
  const mobile = escapeHtml(contact.mobile);
  const emails = String(contact.email || "").split(/\r?\n/).map((email) => email.trim()).filter(Boolean);
  const safeLogoPath = safeUploadSrc(contact.logo_path);
  const canAdjustLogo = canEditCard(contact) && safeUploadSrc(contact.image_path);
  const logoControl = canAdjustLogo ? ' data-logo-editor tabindex="0" role="button" title="클릭하여 로고 위치 수정" aria-label="로고 위치 수정"' : "";

  return `
    <article class="profileCard ${classes}${isSelected ? " is-selected" : ""}${isFavorite ? " has-favorite" : ""}" data-card-id="${cardId}" tabindex="0" role="button" aria-pressed="${isSelected}" aria-label="${name} 명함 ${selectionMode ? "선택" : "상세 보기"}">
      ${isFavorite ? '<span class="profileCardFavoriteMarker" aria-hidden="true">★</span>' : ""}
      <span class="pill">${company || "BUSINESS CARD"}</span>
      <span class="cardId">#${Number(contact.display_number) || "-"}</span>
      ${safeLogoPath ? `<img class="profileCardLogo" src="${safeLogoPath}" alt="${company || name} 로고" loading="lazy" decoding="async" draggable="false"${logoControl}>` : ""}
      <h2>${name}</h2>
      <p class="role">${[position, company].filter(Boolean).join(" · ")}</p>
      ${mobile ? `<p class="meta strong">${mobile}</p>` : ""}
      ${emails.length ? `<p class="meta emailMeta" title="${escapeHtml(emails.join("\n"))}">${emails.slice(0, 2).map((email) => `<span>${escapeHtml(email)}</span>`).join("")}</p>` : ""}
      ${createProfileCardTags(contact)}
    </article>
  `;
}

// ===== 명함 상세 보기 및 수정 폼 생성 =====
function formatMeetingDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)?(\d{2})?:?(\d{2})?/);
  if (!match) return raw;
  const date = `${match[1]}.${match[2]}.${match[3]}`;
  return match[4] && match[5] ? `${date} ${match[4]}:${match[5]}` : date;
}

function createCardRegistrationInfo(contact) {
  const name = String(contact.created_by_name || "").trim();
  const rawDate = String(contact.created_at || "").trim();
  // SQLite CURRENT_TIMESTAMP는 시간대 표기 없는 UTC 날짜를 반환한다.
  const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(rawDate)
    ? `${rawDate.replace(" ", "T")}Z` : rawDate);
  const createdDate = rawDate && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replace(/-/g, ".")
    : "";
  return `<p class="cardRegistrationInfo">${name ? `등록자 ${escapeHtml(name)}` : "등록자 정보 없음"}${createdDate ? ` · 등록일 ${createdDate}` : ""}</p>`;
}

function createMeetingJournal(contact) {
  const fields = [
    ["만난 날짜", formatMeetingDate(contact.meeting_date)],
    ["만난 장소", contact.meeting_place],
    ["만남 목적", contact.meeting_purpose],
    ["메모", contact.meeting_note]
  ];
  const details = fields.map(([label, value]) => {
    const content = String(value || "").trim();
    return `<div class="meetingJournalField"><dt>${label}</dt><dd${content ? "" : ' class="isEmpty"'}>${content ? escapeHtml(content) : "기록 없음"}</dd></div>`;
  }).join("");
  return `<section class="meetingJournal" aria-label="만남 기록 및 메모"><header><div><span class="meetingJournalIcon" aria-hidden="true">↗</span><div><h3>만남 기록 &amp; 메모</h3><span>MEETING JOURNAL</span></div></div></header><dl class="meetingJournalGrid">${details}</dl></section>`;
}

function createCardDetail(contact) {
  const classes = getCardVariant(contact);
  const copyableLabels = new Set(["휴대폰", "유선전화", "이메일", "홈페이지", "주소"]);
  const details = cardInfoFields(contact).map(([label, value]) => {
    const content = String(value || "").trim();
    const copyButton = copyableLabels.has(label) && content
      ? `<button type="button" class="cardDetailCopyButton" data-action="copy-field" data-copy-value="${escapeHtml(content)}" aria-label="${label} 복사">복사</button>`
      : "";
    const displayValue = label === "홈페이지"
      ? createWebsiteLink(content)
      : escapeHtml(content);
    return `
      <div class="cardDetailField${label === "주소" ? " cardDetailAddress" : ""}${label === "이메일" ? " cardDetailEmails" : ""}">
        <dt><span>${label}</span>${copyButton}</dt>
        <dd${content ? "" : ' class="isEmpty"'}>${content ? displayValue : "없음"}</dd>
      </div>
    `;
  }).join("");
  const favoriteButton = canManagePersonalData(contact)
    ? `<button
          class="cardDetailFavoriteButton${Number(contact.is_favorite) ? " is-favorite" : ""}"
          type="button"
          data-action="toggle-favorite"
          aria-pressed="${Number(contact.is_favorite) ? "true" : "false"}"
          aria-label="${Number(contact.is_favorite) ? "즐겨찾기 해제" : "즐겨찾기 추가"}"
        >${Number(contact.is_favorite) ? "★" : "☆"}</button>`
    : "";
  const tagDrawer = canEditCard(contact) ? createCardTagDrawer(contact) : "";
  const detailActions = `<div class="cardDetailActions">
        ${createCardRegistrationInfo(contact)}
        ${canEditCard(contact) ? `<button type="button" data-action="edit">수정</button>
        <button type="button" class="danger" data-action="delete">휴지통으로 이동</button>` : ""}
      </div>`;
  const detailStatus = canManagePersonalData(contact) || canEditCard(contact)
    ? '<p class="cardDetailStatus" aria-live="polite"></p>'
    : "";

  return `
    <article class="cardDetailCard ${classes}">
      <div class="cardDetailHeader">
        <div class="cardDetailCompanyLine">
          <span class="pill">${escapeHtml(contact.company) || "BUSINESS CARD"}</span>
          <span class="cardDetailId">#${Number(contact.display_number) || "-"}</span>
        </div>
        <p class="cardDetailEyebrow">BUSINESS CARD DETAIL</p>
        <h2 id="cardDetailTitle">${escapeHtml(contact.name || "-")}</h2>
        <button type="button" class="cardDetailCopyAllButton" data-action="copy-all">전체 복사</button>
        ${favoriteButton}
      </div>
      <dl class="cardDetailGrid">${details}</dl>
      ${tagDrawer}
      ${detailStatus}
      <aside class="cardDetailSidebar">
        ${createCardOriginalImage(contact)}
        ${createMeetingJournal(contact)}
      </aside>
      ${createCardImageLightbox(contact)}
      ${detailActions}
    </article>
  `;
}

function createCardEditor(contact, statusMessage = "") {
  const classes = getCardVariant(contact);
  const contactFields = [
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
  const meetingFields = [
    ["meeting_date", "만난 날짜", contact.meeting_date],
    ["meeting_place", "만난 장소", contact.meeting_place],
    ["meeting_purpose", "만남 목적", contact.meeting_purpose],
    ["meeting_note", "만남 메모", contact.meeting_note]
  ];
  const renderFields = (fields) => fields.map(([name, label, value]) => {
    const safeValue = escapeHtml(value);
    const isTextarea = ["address", "email", "meeting_note"].includes(name);
    const maxLength = name === "meeting_purpose" ? 50 : name === "meeting_note" ? 500 : null;
    const maxLengthAttribute = maxLength ? ` maxlength="${maxLength}"` : "";
    const input = isTextarea
      ? `<textarea class="cardDetailInput" name="${name}" rows="1"${maxLengthAttribute}>${safeValue}</textarea>`
      : `<input class="cardDetailInput" name="${name}" type="${name === "meeting_date" ? "datetime-local" : "text"}" value="${safeValue}"${maxLengthAttribute}>`;

    return `
      <label class="cardDetailField${["address", "meeting_purpose", "meeting_note"].includes(name) ? " cardDetailAddress" : ""}${name === "name" ? " cardDetailName" : ""}">
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
            <span class="cardDetailId">#${Number(contact.display_number) || "-"}</span>
          </div>
          <p class="cardDetailEyebrow">BUSINESS CARD EDIT</p>
          <h2 id="cardDetailTitle">명함 정보 수정</h2>
        </div>
        <div class="cardDetailEditTabs" role="tablist" aria-label="수정 항목">
          <button type="button" role="tab" id="cardEditContactTab" aria-controls="cardEditContact" aria-selected="true" data-action="edit-tab" data-edit-tab="contact">기본 정보</button>
          <button type="button" role="tab" id="cardEditMeetingTab" aria-controls="cardEditMeeting" aria-selected="false" tabindex="-1" data-action="edit-tab" data-edit-tab="meeting">만남 기록</button>
        </div>
        <div class="cardDetailEditPanels">
          <div class="cardDetailGrid cardDetailEditPanel" role="tabpanel" id="cardEditContact" aria-labelledby="cardEditContactTab" data-edit-panel="contact">${renderFields(contactFields)}</div>
          <div class="cardDetailGrid cardDetailEditPanel" role="tabpanel" id="cardEditMeeting" aria-labelledby="cardEditMeetingTab" data-edit-panel="meeting" hidden inert>${renderFields(meetingFields)}</div>
        </div>
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
async function requestJson(url, options, fallbackMessage) {
  const response = await fetch(url, options);
  let result;
  try {
    result = await response.json();
  } catch {
    const error = new Error(`${fallbackMessage} (서버가 JSON을 반환하지 않았습니다. HTTP ${response.status})`);
    error.status = response.status;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(result.message || fallbackMessage);
    error.status = response.status;
    error.result = result;
    throw error;
  }

  return result;
}

function jsonRequest(method, body) {
  return {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

function requestCardUpdate(cardId, card, allowDuplicate = false) {
  return requestJson(
    `./api/cards/${encodeURIComponent(cardId)}`,
    jsonRequest("PUT", allowDuplicate ? { ...card, allowDuplicate: true } : card),
    "명함을 수정하지 못했습니다."
  );
}

function requestCardDelete(cardId) {
  return requestJson(`./api/cards/${encodeURIComponent(cardId)}`, { method: "DELETE" }, "명함을 삭제하지 못했습니다.");
}

function requestFavoriteUpdate(cardId, isFavorite) {
  return requestJson(
    `./api/cards/${encodeURIComponent(cardId)}/favorite`,
    jsonRequest("PATCH", { isFavorite }),
    "즐겨찾기를 변경하지 못했습니다."
  );
}

function requestTagUpdate(cardId, tags) {
  return requestJson(
    `./api/cards/${encodeURIComponent(cardId)}/tags`,
    jsonRequest("PATCH", { tags }),
    "태그를 저장하지 못했습니다."
  );
}

function syncCardTagDrawer(tags) {
  const drawer = detailContent.querySelector(".cardTagDrawer");
  if (!drawer) return;

  drawer.classList.toggle("has-selected", tags.length > 0);
  drawer.querySelectorAll('[data-action="toggle-tag"]').forEach((button) => {
    const selected = tags.includes(button.dataset.tag);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

// ===== 상세 모달 조회·수정·삭제 동작 =====
function getActiveCard() {
  return visibleCards.find((card) => Number(card.id) === Number(activeCardId));
}

function showCardEditor() {
  const contact = getActiveCard();
  if (!contact || !canEditCard(contact)) {
    return;
  }

  detailContent.innerHTML = createCardEditor(contact);
  const firstInput = detailContent.querySelector('[name="name"]');
  if (firstInput) {
    firstInput.focus();
  }
}

function selectCardEditTab(tab) {
  const form = tab.closest(".cardDetailEditForm");
  for (const button of form.querySelectorAll("[data-edit-tab]")) {
    button.setAttribute("aria-selected", String(button === tab));
    button.tabIndex = button === tab ? 0 : -1;
  }
  for (const panel of form.querySelectorAll("[data-edit-panel]")) {
    panel.inert = panel.hidden = panel.dataset.editPanel !== tab.dataset.editTab;
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

async function copyFromDetail(button, value) {
  const originalLabel = button.textContent;
  try {
    const copied = await copyText(value);
    if (!copied) throw new Error("복사에 실패했습니다.");
    button.textContent = "복사됨";
    setDetailStatus("클립보드에 복사되었습니다.");
    window.clearTimeout(detailStatusTimer);
    detailStatusTimer = window.setTimeout(() => {
      setDetailStatus("");
    }, 2000);
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1400);
  } catch (error) {
    console.error(error);
    setDetailStatus("복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
  }
}

function syncFavoriteCard(cardId, isFavorite) {
  const numericId = Number(cardId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return;
  }

  board.querySelectorAll(`.profileCard[data-card-id="${numericId}"]`).forEach((card) => {
    card.classList.toggle("has-favorite", isFavorite);
    const marker = card.querySelector(".profileCardFavoriteMarker");

    if (isFavorite && !marker) {
      card.insertAdjacentHTML(
        "afterbegin",
        '<span class="profileCardFavoriteMarker" aria-hidden="true">★</span>'
      );
    } else if (!isFavorite && marker) {
      marker.remove();
    }
  });
}

function findLogoCrop(source, template) {
  const aspect = template.width / template.height;
  const maxWidth = Math.min(source.width, source.height * aspect);
  const samples = [];
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const u = (column + 0.5) / 8;
      const v = (row + 0.5) / 6;
      const i = (Math.floor(v * template.height) * template.width + Math.floor(u * template.width)) * 4;
      samples.push({ u, v, r: template.data[i], g: template.data[i + 1], b: template.data[i + 2] });
    }
  }
  const average = samples.reduce((sum, pixel) => sum + pixel.r + pixel.g + pixel.b, 0) / (3 * samples.length);
  if (samples.every((pixel) => Math.abs((pixel.r + pixel.g + pixel.b) / 3 - average) < 7)) return null;

  let best = null;
  let lowestError = 24 * samples.length * 3;
  function compare(x, y, width, height) {
    if (x < 0 || y < 0 || x + width > source.width || y + height > source.height) return;
    let error = 0;
    for (const pixel of samples) {
      const i = (Math.floor(y + pixel.v * height) * source.width + Math.floor(x + pixel.u * width)) * 4;
      error += Math.abs(source.data[i] - pixel.r) + Math.abs(source.data[i + 1] - pixel.g) + Math.abs(source.data[i + 2] - pixel.b);
      if (error >= lowestError) return;
    }
    lowestError = error;
    best = { x, y, width, height, error: error / (samples.length * 3) };
  }

  const minWidth = Math.max(10, 10 * aspect);
  for (let width = maxWidth; width >= minWidth; width /= 1.15) {
    const height = width / aspect;
    const dx = Math.max(1, Math.floor(width / 10));
    const dy = Math.max(1, Math.floor(height / 10));
    const maxX = source.width - width;
    const maxY = source.height - height;
    for (let y = 0; y < maxY + dy; y += dy) {
      for (let x = 0; x < maxX + dx; x += dx) {
        compare(Math.min(x, maxX), Math.min(y, maxY), width, height);
      }
    }
  }
  if (!best) return null;

  const seed = best;
  for (let ratio = 0.88; ratio <= 1.13; ratio += 0.025) {
    const width = seed.width * ratio;
    const height = seed.height * ratio;
    for (let dy = -Math.ceil(seed.height / 10); dy <= Math.ceil(seed.height / 10); dy += 1) {
      for (let dx = -Math.ceil(seed.width / 10); dx <= Math.ceil(seed.width / 10); dx += 1) {
        compare(seed.x + dx, seed.y + dy, width, height);
      }
    }
  }
  // 드문 점 몇 개가 맞아도 다른 글자나 배경일 수 있으므로 별도 격자로 후보 전체를 확인한다.
  let totalError = 0;
  let mismatches = 0;
  const gridSize = 24;
  for (let row = 0; row < gridSize; row += 1) {
    const v = (row + 0.5) / gridSize;
    for (let column = 0; column < gridSize; column += 1) {
      const u = (column + 0.5) / gridSize;
      const i = (Math.floor(best.y + v * best.height) * source.width + Math.floor(best.x + u * best.width)) * 4;
      const j = (Math.floor(v * template.height) * template.width + Math.floor(u * template.width)) * 4;
      const error = (Math.abs(source.data[i] - template.data[j])
        + Math.abs(source.data[i + 1] - template.data[j + 1])
        + Math.abs(source.data[i + 2] - template.data[j + 2])) / 3;
      totalError += error;
      if (error > 30) mismatches += 1;
    }
  }
  const count = gridSize * gridSize;
  return totalError / count <= 14 && mismatches / count <= 0.15 ? best : null;
}

function locateSavedLogo(photo, logo) {
  const raster = document.createElement("canvas");
  const context = raster.getContext("2d", { willReadFrequently: true });
  function pixels(image, edge) {
    const scale = edge / Math.max(image.naturalWidth, image.naturalHeight);
    raster.width = Math.max(1, Math.round(image.naturalWidth * scale));
    raster.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.drawImage(image, 0, 0, raster.width, raster.height);
    return context.getImageData(0, 0, raster.width, raster.height);
  }

  const source = pixels(photo, 220);
  const best = findLogoCrop(source, pixels(logo, 64));
  if (!best) return null;
  return { x: best.x / source.width, y: best.y / source.height, width: best.width / source.width, height: best.height / source.height };
}

function resizeLogoFrame(frame, edge, dx, dy) {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const minWidth = Math.min(24, frame.width);
  const minHeight = Math.min(24, frame.height);
  const maxSize = 1600;
  const left = edge.includes("w") ? clamp(Math.round(dx), Math.min(0, Math.max(frame.width - maxSize, Math.ceil(frame.x))), frame.width - minWidth) : 0;
  const top = edge.includes("n") ? clamp(Math.round(dy), Math.min(0, Math.max(frame.height - maxSize, Math.ceil(frame.y))), frame.height - minHeight) : 0;
  const right = edge.includes("e") ? clamp(frame.width + Math.round(dx), minWidth, Math.min(maxSize, Math.max(frame.width, Math.floor(frame.x + frame.imageWidth)))) : frame.width;
  const bottom = edge.includes("s") ? clamp(frame.height + Math.round(dy), minHeight, Math.min(maxSize, Math.max(frame.height, Math.floor(frame.y + frame.imageHeight)))) : frame.height;
  return { x: frame.x - left, y: frame.y - top, width: right - left, height: bottom - top };
}

function logoExportSize(width, height) {
  const scale = Math.max(1, 300 / width, 120 / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function openLogoEditor(cardId) {
  const contact = visibleCards.find((card) => Number(card.id) === Number(cardId));
  if (!contact || !canEditCard(contact)) return;
  const source = contact.image_path;
  if (!safeUploadSrc(source) || !safeUploadSrc(contact.logo_path)) return;

  const dialog = document.querySelector(".cardLogoModal");
  if (dialog.open) return;
  const form = dialog.querySelector("form");
  const frame = form.querySelector(".cardLogoFrame");
  const canvas = form.querySelector("canvas");
  const zoom = form.querySelector('input[type="range"]');
  const rotate = form.querySelector(".cardLogoRotate");
  const save = form.querySelector('button[type="submit"]');
  const cancel = form.querySelector('[data-group-action="cancel"]');
  const choosePosition = form.querySelector(".cardLogoReposition");
  const currentLogo = new Image();
  const status = form.querySelector(".cardLogoStatus");
  const context = canvas.getContext("2d");
  const photo = new Image();
  let image = photo;
  let x = 0;
  let y = 0;
  let scale = 0;
  let turns = 0;
  let drag;
  let resizing;
  let saving = false;

  function paint(target, outputScaleX = 1, outputScaleY = 1) {
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    const width = turns % 2 ? imageHeight : imageWidth;
    const height = turns % 2 ? imageWidth : imageHeight;
    x = Math.max(canvas.width - width, Math.min(0, x));
    y = Math.max(canvas.height - height, Math.min(0, y));
    target.save();
    target.scale(outputScaleX, outputScaleY);
    target.clearRect(0, 0, canvas.width, canvas.height);
    target.translate(x + width / 2, y + height / 2);
    target.rotate(turns * Math.PI / 2);
    target.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    target.restore();
  }

  function draw() {
    const displayScale = resizing ? 1 / resizing.scaleX : 1;
    frame.style.width = `${canvas.width * displayScale}px`;
    frame.style.setProperty("--logo-frame-ratio", canvas.width / canvas.height);
    frame.style.marginInlineStart = resizing?.edge.includes("w") ? `${Math.max(0, resizing.displayWidth - canvas.clientWidth)}px` : "";
    frame.style.marginBlockStart = resizing?.edge.includes("n") ? `${Math.max(0, resizing.displayHeight - canvas.clientHeight)}px` : "";
    paint(context);
  }

  function resize() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const width = turns % 2 ? photo.naturalHeight : photo.naturalWidth;
    const height = turns % 2 ? photo.naturalWidth : photo.naturalHeight;
    const nextScale = Math.max(canvas.width / width, canvas.height / height) * Number(zoom.value) / 100;
    x = scale ? centerX + (x - centerX) * nextScale / scale : centerX - width * nextScale / 2;
    y = scale ? centerY + (y - centerY) * nextScale / scale : centerY - height * nextScale / 2;
    scale = nextScale;
    draw();
  }

  form.reset();
  frame.hidden = choosePosition.hidden = true;
  frame.style.marginInlineStart = frame.style.marginBlockStart = "";
  currentLogo.src = `.${contact.logo_path.trim()}`;
  zoom.disabled = rotate.disabled = save.disabled = true;
  cancel.disabled = choosePosition.disabled = false;
  status.textContent = "사진을 불러오는 중입니다.";
  dialog.oncancel = (event) => { if (saving) event.preventDefault(); };
  let closed = false;
  dialog.onclose = () => {
    closed = true;
    photo.onload = photo.onerror = null;
  };
  cancel.onclick = () => dialog.close();
  function showFrame() {
    resize();
    choosePosition.hidden = true;
    frame.hidden = false;
    zoom.disabled = rotate.disabled = save.disabled = false;
    status.textContent = "";
    canvas.focus();
  }
  photo.onload = async () => {
    let crop;
    try {
      await currentLogo.decode();
      if (closed || !dialog.open) return;
      crop = locateSavedLogo(photo, currentLogo);
    } catch { /* 이전 로고를 불러오지 못해도 명함 사진으로 새 위치를 잡을 수 있다. */ }
    if (closed || !dialog.open) return;
    if (!crop) {
      if (currentLogo.naturalWidth) {
        image = currentLogo;
        scale = 600 / Math.max(image.naturalWidth, image.naturalHeight);
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        draw();
        frame.hidden = rotate.disabled = false;
      }
      choosePosition.hidden = false;
      status.textContent = "";
      return;
    }
    const width = crop.width * photo.naturalWidth;
    const height = crop.height * photo.naturalHeight;
    const ratio = 600 / Math.max(width, height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    scale = canvas.width / width;
    x = -crop.x * photo.naturalWidth * scale;
    y = -crop.y * photo.naturalHeight * scale;
    const base = Math.max(canvas.width / photo.naturalWidth, canvas.height / photo.naturalHeight);
    zoom.max = Math.max(500, Math.ceil(200 * scale / base));
    zoom.value = Math.round(100 * scale / base);
    showFrame();
  };
  choosePosition.onclick = () => {
    image = photo;
    turns = scale = 0;
    canvas.width = 600;
    canvas.height = 240;
    zoom.max = 500;
    zoom.value = 140;
    showFrame();
  };
  photo.onerror = () => { status.textContent = "명함 사진을 불러오지 못했습니다."; };
  zoom.oninput = resize;
  rotate.onclick = () => {
    const imageHeight = (turns % 2 ? image.naturalWidth : image.naturalHeight) * scale;
    // 프레임과 사진 좌표를 함께 돌려 선택 영역과 확대율을 유지한다.
    [x, y] = [canvas.height - y - imageHeight, x];
    [canvas.width, canvas.height] = [canvas.height, canvas.width];
    turns = (turns + 1) % 4;
    draw();
    save.disabled = false;
  };

  function frameBounds() {
    return {
      x, y, width: canvas.width, height: canvas.height,
      imageWidth: (turns % 2 ? image.naturalHeight : image.naturalWidth) * scale,
      imageHeight: (turns % 2 ? image.naturalWidth : image.naturalHeight) * scale
    };
  }

  function applyFrameSize(bounds, edge, dx, dy) {
    const next = resizeLogoFrame(bounds, edge, dx, dy);
    if (x === next.x && y === next.y && canvas.width === next.width && canvas.height === next.height) return;
    ({ x, y } = next);
    canvas.width = next.width;
    canvas.height = next.height;
    if (!zoom.disabled) {
      const value = Math.round(100 / Math.max(canvas.width / bounds.imageWidth, canvas.height / bounds.imageHeight));
      zoom.max = Math.max(Number(zoom.max), value);
      zoom.value = value;
    }
    draw();
    save.disabled = false;
  }

  frame.onpointerdown = (event) => {
    const edge = event.target.dataset.logoEdge;
    if (!edge || event.button !== 0 || saving || resizing || drag) return;
    resizing = {
      edge, id: event.pointerId, x: event.clientX, y: event.clientY, bounds: frameBounds(),
      displayWidth: canvas.clientWidth, displayHeight: canvas.clientHeight,
      scaleX: canvas.width / canvas.clientWidth, scaleY: canvas.height / canvas.clientHeight
    };
    event.target.setPointerCapture(event.pointerId);
  };
  frame.onpointermove = (event) => {
    if (resizing?.id !== event.pointerId || saving) return;
    applyFrameSize(resizing.bounds, resizing.edge,
      (event.clientX - resizing.x) * resizing.scaleX, (event.clientY - resizing.y) * resizing.scaleY);
  };
  frame.onlostpointercapture = (event) => {
    if (resizing?.id !== event.pointerId) return;
    resizing = null;
    draw();
  };
  frame.onkeydown = (event) => {
    const edge = event.target.dataset.logoEdge;
    const offset = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
    if (!edge || !Array.isArray(offset) || saving) return;
    event.preventDefault();
    applyFrameSize(frameBounds(), edge, ...offset);
  };

  function moveImage(dx, dy) {
    const previousX = x;
    const previousY = y;
    x += dx;
    y += dy;
    draw();
    if (x !== previousX || y !== previousY) save.disabled = false;
  }

  canvas.onpointerdown = (event) => {
    if (event.button !== 0 || drag || resizing || saving) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = (event) => {
    if (drag?.id !== event.pointerId || saving) return;
    moveImage((event.clientX - drag.x) * canvas.width / canvas.clientWidth,
      (event.clientY - drag.y) * canvas.height / canvas.clientHeight);
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  canvas.onlostpointercapture = () => { drag = null; };
  canvas.onkeydown = (event) => {
    const offset = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
    if (!Array.isArray(offset) || saving) return;
    event.preventDefault();
    moveImage(...offset);
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    saving = zoom.disabled = rotate.disabled = save.disabled = cancel.disabled = choosePosition.disabled = true;
    status.textContent = "로고를 저장하는 중입니다.";
    try {
      const output = document.createElement("canvas");
      ({ width: output.width, height: output.height } = logoExportSize(canvas.width, canvas.height));
      paint(output.getContext("2d"), output.width / canvas.width, output.height / canvas.height);
      const logo = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
      if (!logo) throw new Error("로고 이미지를 만들지 못했습니다.");
      const body = new FormData();
      body.append("image", logo, "logo.png");
      await requestJson(`./api/cards/${contact.id}/logo`, { method: "PATCH", body }, "로고를 저장하지 못했습니다.");
      dialog.close();
      await loadCards();
      board.querySelector(`.profileCard[data-card-id="${Number(cardId)}"] [data-logo-editor]`)?.focus();
    } catch (error) {
      status.textContent = error.message || "로고를 저장하지 못했습니다.";
      saving = rotate.disabled = save.disabled = cancel.disabled = choosePosition.disabled = false;
      zoom.disabled = image !== photo;
    }
  };

  dialog.showModal();
  photo.src = `.${source.trim()}`;
}

async function toggleFavorite(cardId) {
  const contact = visibleCards.find((card) => Number(card.id) === Number(cardId));
  if (!contact || !canManagePersonalData(contact)) {
    return;
  }

  const isFavorite = !Boolean(Number(contact.is_favorite));

  try {
    const result = await requestFavoriteUpdate(contact.id, isFavorite);
    contact.is_favorite = Number(result.is_favorite);
    if (Number(activeCardId) === Number(contact.id)) {
      showCardDetail();
    }
    if (favoritesOnly) {
      renderCurrentView();
    } else {
      syncFavoriteCard(contact.id, Boolean(contact.is_favorite));
    }
  } catch (error) {
    console.error(error);
    setDetailStatus(error.message || "즐겨찾기를 변경하지 못했습니다.");
  }
}

async function toggleCardTag(tag) {
  const contact = getActiveCard();
  if (!contact || !canEditCard(contact) || !CARD_TAG_OPTIONS.includes(tag)) return;

  const cardId = contact.id;
  const saveToggle = async () => {
    const currentTags = parseCardTags(contact.tags);
    const tags = currentTags.includes(tag)
      ? currentTags.filter((currentTag) => currentTag !== tag)
      : [...currentTags, tag];
    const result = await requestTagUpdate(cardId, tags);
    contact.tags = JSON.stringify(result.tags);
    if (Number(activeCardId) === Number(cardId)) syncCardTagDrawer(result.tags);
    syncProfileCardTags(cardId, result.tags);
    hasPendingTagViewUpdate = true;
  };
  const previous = pendingTagUpdates.get(cardId);
  const update = previous ? previous.catch(() => {}).then(saveToggle) : saveToggle();
  pendingTagUpdates.set(cardId, update);

  try {
    await update;
  } catch (error) {
    console.error(error);
    if (Number(activeCardId) === Number(cardId)) {
      setDetailStatus(error.message || "태그를 저장하지 못했습니다.");
    }
  } finally {
    if (pendingTagUpdates.get(cardId) === update) pendingTagUpdates.delete(cardId);
  }
}

async function saveCardEdits(form) {
  const contact = getActiveCard();
  if (!contact || !canEditCard(contact)) {
    return;
  }

  const cardId = contact.id;
  const isCurrentEditor = () => detailModal.open &&
    Number(activeCardId) === Number(cardId) && detailContent.contains(form);
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
    meeting_date: String(formData.get("meeting_date") || "").trim(),
    meeting_place: String(formData.get("meeting_place") || "").trim(),
    meeting_purpose: String(formData.get("meeting_purpose") || "").trim(),
    meeting_note: String(formData.get("meeting_note") || "").trim(),
    image_path: contact.image_path || ""
  };

  setEditorBusy(form, true, "저장 중입니다.");
  let errorMessage = "";

  try {
    try {
      await requestCardUpdate(cardId, payload);
    } catch (error) {
      if (!isCurrentEditor()) return;
      if (
        error.status !== 409 ||
        !window.confirm("중복 가능성이 있는 명함입니다. 그래도 수정 내용을 저장할까요?")
      ) {
        throw error;
      }
      if (!isCurrentEditor()) return;
      await requestCardUpdate(cardId, payload, true);
    }

    await loadCards();
    if (!isCurrentEditor()) return;
    if (getActiveCard()) {
      showCardDetail();
    } else {
      closeCardDetail();
    }
  } catch (error) {
    console.error(error);
    errorMessage = error.message || "명함을 수정하지 못했습니다.";
  } finally {
    setEditorBusy(form, false, errorMessage);
  }
}

async function deleteCurrentCard() {
  const contact = getActiveCard();
  if (!contact || !canEditCard(contact) || !window.confirm(`'${contact.name || "-"}' 명함을 휴지통으로 옮길까요?\n휴지통에서 다시 복원할 수 있습니다.`)) {
    return;
  }

  const cardId = contact.id;
  const detailView = detailContent.firstElementChild;
  const isCurrentDetail = () => detailModal.open &&
    Number(activeCardId) === Number(cardId) && detailContent.firstElementChild === detailView;
  setDetailStatus("휴지통으로 옮기는 중입니다.");

  try {
    await requestCardDelete(cardId);
    if (isCurrentDetail()) closeCardDetail();
    await loadCards();
  } catch (error) {
    console.error(error);
    if (isCurrentDetail()) {
      setDetailStatus(error.message || "명함을 휴지통으로 옮기지 못했습니다.");
    }
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
  if (hasPendingTagViewUpdate) {
    hasPendingTagViewUpdate = false;
    renderCurrentView();
  }
}

function openImageLightbox() {
  const lightbox = detailContent.querySelector(".cardImageLightbox");
  if (!lightbox) return;
  lightbox.hidden = false;
}

function closeImageLightbox() {
  const lightbox = detailContent.querySelector(".cardImageLightbox");
  if (lightbox) lightbox.hidden = true;
}

// ===== 전체 명함 및 중복 그룹 화면 렌더링 =====
function renderEmptyCards(message) {
  const isSearching = Boolean(String(searchInput.value || "").trim());
  const scopeEmptyMessage = visibilityFilter === "mine" ? "내가 등록한 명함이 없습니다." : message;
  const emptyMessage = isSearching ? "검색 결과가 없습니다."
    : message === "등록된 명함이 없습니다." ? scopeEmptyMessage : message;
  board.classList.remove("duplicateMode", "groupMode", "tagMode");
  board.innerHTML = `<p class="emptyCards">${escapeHtml(emptyMessage)}</p>`;
}

function renderAllCards(cards) {
  board.classList.remove("duplicateMode", "groupMode", "tagMode");
  board.innerHTML = "";

  if (cards.length === 0) {
    renderEmptyCards("등록된 명함이 없습니다.");
    return;
  }

  // 카드마다 삽입하면 브라우저가 매번 파싱하므로 한 번에 넣는다.
  board.insertAdjacentHTML("beforeend", cards.map((card) => createCard(card)).join(""));
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

function groupCardsByTag(cards) {
  const groups = new Map(CARD_TAG_OPTIONS.map((tag) => [tag, []]));

  cards.forEach((card) => {
    parseCardTags(card.tags).forEach((tag) => {
      groups.get(tag)?.push(card);
    });
  });

  return new Map(Array.from(groups).filter(([, taggedCards]) => taggedCards.length > 0));
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

function createGroupedCardsMarkup(groupCards, cardsPerChunk) {
  const primaryCards = groupCards.slice(0, cardsPerChunk);
  const overflowCards = groupCards.slice(cardsPerChunk);
  const cardsMarkup = primaryCards.map((card) => createCard(card)).join("");
  const overflowCardsMarkup = overflowCards.map((card) => createCard(card)).join("");

  return `<div class="groupedCards">${cardsMarkup}</div>
          ${overflowCardsMarkup ? `<div class="groupedCards groupedCardsOverflow" style="--group-column-count:${cardsPerChunk / 2}">${overflowCardsMarkup}</div>` : ""}`;
}

function renderGroupedCards(cards) {
  board.classList.remove("duplicateMode", "tagMode");
  board.classList.add("groupMode");
  board.innerHTML = "";
  const groups = groupCardsByName(cards);

  if (groups.size === 0) {
    renderEmptyCards(cards.length === 0 ? "등록된 명함이 없습니다." : "지정된 그룹이 없습니다.");
    return;
  }

  const cardsPerChunk = groupCardChunkSize();
  groups.forEach((groupCards, groupName) => {
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
          ${createGroupedCardsMarkup(groupCards, cardsPerChunk)}
        </section>
      `
    );
  });
}

function renderTagGroups(cards) {
  board.classList.remove("duplicateMode");
  board.classList.add("groupMode", "tagMode");
  board.innerHTML = "";
  const allGroups = groupCardsByTag(cards);
  const groups = tagFilter && allGroups.has(tagFilter)
    ? new Map([[tagFilter, allGroups.get(tagFilter)]])
    : tagFilter
      ? new Map()
      : allGroups;

  if (groups.size === 0) {
    renderEmptyCards(cards.length === 0 ? "등록된 명함이 없습니다." : "태그가 지정된 명함이 없습니다.");
    return;
  }

  const cardsPerChunk = groupCardChunkSize();
  groups.forEach((taggedCards, tag) => {
    const tagIndex = CARD_TAG_OPTIONS.indexOf(tag);

    board.insertAdjacentHTML(
      "beforeend",
      `
        <section class="cardGroup tagGroup tagGroup-${tagIndex}" aria-label="${escapeHtml(tag)} 태그">
          <div class="cardGroupHeader">
            <strong><i class="tagGroupSwatch" aria-hidden="true"></i>${escapeHtml(tag)}</strong>
            <div class="cardGroupMeta"><span>${taggedCards.length}장</span></div>
          </div>
          ${createGroupedCardsMarkup(taggedCards, cardsPerChunk)}
        </section>
      `
    );
  });
}

function renderDuplicateGroups(groups) {
  board.classList.remove("groupMode", "tagMode");
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
function requestDuplicateMerge(cardIds) {
  return requestJson("./api/cards/merge-group", jsonRequest("POST", { cardIds }), "중복 명함 병합에 실패했습니다.");
}

function buttonCardIds(button) {
  return String(button.dataset.cardIds || "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function mergeDuplicateGroup(button) {
  const cardIds = buttonCardIds(button);

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
function requestGroupAssignment(cardIds, groupName) {
  return requestJson("./api/cards/groups", jsonRequest("PATCH", { cardIds, groupName }), "그룹을 지정하지 못했습니다.");
}

async function requestGroupNames() {
  const result = await requestJson("./api/cards/groups", { cache: "no-store" }, "그룹 목록을 불러오지 못했습니다.");
  return Array.isArray(result.groups) ? result.groups : [];
}

function requestBulkDelete(cardIds) {
  return requestJson("./api/cards/bulk-delete", jsonRequest("POST", { cardIds }), "선택한 명함을 휴지통으로 옮기지 못했습니다.");
}

// ===== 선택 모드 및 하단 작업 바 =====
function selectedIds() {
  return Array.from(selectedCardIds);
}

function pruneSelectedCardIds(visibleIds) {
  selectedCardIdsByView.forEach((cardIds, mode) => {
    cardIds.forEach((cardId) => {
      if (!visibleIds.has(cardId)) {
        cardIds.delete(cardId);
      }
    });

    if (cardIds.size === 0) {
      selectionModeByView.set(mode, false);
    }
  });
}

function syncSelectionUi() {
  const hasSelection = selectedCardIds.size > 0;
  const selectedOwnedCount = visibleCards.filter((card) => (
    selectedCardIds.has(Number(card.id)) && canEditCard(card)
  )).length;
  selectionActionBar.hidden = !hasSelection;
  if (deleteSelectedButton) deleteSelectedButton.hidden = selectedOwnedCount === 0;
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
      const primary = escapeHtml(card.name || card.company || "-");
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
  const cardIds = visibleCards
    .filter((card) => selectedCardIds.has(Number(card.id)) && canEditCard(card))
    .map((card) => Number(card.id));
  if (
    cardIds.length === 0 ||
    !window.confirm(`선택한 명함 ${cardIds.length}장을 휴지통으로 옮길까요?\n휴지통에서 다시 복원할 수 있습니다.`)
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
  const cardIds = buttonCardIds(button);
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
  return `./api/cards/export/${exportFormat}?${params.toString()}`;
}

function exportSelectedCards(format) {
  const cardIds = selectedIds();
  if (cardIds.length > 0) {
    window.location.assign(selectedExportPath(format, cardIds));
  }
}

// ===== 명함 목록 검색 및 불러오기 =====
function setToggleActive(button, isActive) {
  button.classList.toggle("active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
}

function renderCurrentView() {
  syncSelectionUi();
  const scopedCards = filterCardsByVisibility(visibleCards);
  const scopePrefix = visibilityFilter === "mine" ? "개인 · " : "";
  const ownedCards = myCardsOnly ? filterCardsByCurrentUser(scopedCards) : scopedCards;
  const cardsForView = favoritesOnly
    ? ownedCards.filter((card) => Boolean(Number(card.is_favorite)))
    : ownedCards;
  const sortedCards = sortCards(cardsForView);
  const duplicateGroups = groupDuplicateCards(sortedCards);
  duplicateCountBadge.textContent = String(duplicateGroups.length);
  duplicateCountBadge.hidden = duplicateGroups.length === 0;
  setToggleActive(allViewToggle, viewMode === "all");
  setToggleActive(groupViewToggle, viewMode === "groups");
  setToggleActive(tagViewToggle, viewMode === "tags");
  tagFilterSelect.hidden = viewMode !== "tags";
  setToggleActive(duplicateToggle, viewMode === "duplicates");
  setToggleActive(favoriteViewToggle, favoritesOnly);
  favoriteViewToggle.textContent = favoritesOnly ? "★" : "☆";
  sortDirectionButtons.forEach((button) => {
    setToggleActive(button, button.dataset.sortDirection === sortDirection);
  });

  if (viewMode === "duplicates") {
    renderDuplicateGroups(duplicateGroups);
    const duplicateCount = duplicateGroups.reduce((total, group) => total + group.length, 0);
    resultSummary.textContent = `${scopePrefix}중복 ${duplicateGroups.length}그룹 · ${duplicateCount}장`;
    return;
  }

  if (viewMode === "groups") {
    const groups = groupCardsByName(sortedCards);
    const groupedCardCount = Array.from(groups.values())
      .reduce((total, cards) => total + cards.length, 0);
    renderGroupedCards(sortedCards);
    resultSummary.textContent = `${scopePrefix}그룹 ${groups.size}개 · ${groupedCardCount}장`;
    return;
  }

  if (viewMode === "tags") {
    const allGroups = groupCardsByTag(sortedCards);
    if (tagFilter) {
      const taggedCards = allGroups.get(tagFilter) || [];
      renderAllCards(taggedCards);
      resultSummary.textContent = `${scopePrefix}${tagFilter} ${taggedCards.length}장`;
      return;
    }

    const groups = allGroups;
    const taggedCardIds = new Set(
      Array.from(groups.values()).flat().map((card) => Number(card.id))
    );
    renderTagGroups(sortedCards);
    resultSummary.textContent = `${scopePrefix}태그 ${groups.size}개 · ${taggedCardIds.size}장`;
    return;
  }

  renderAllCards(sortedCards);
  resultSummary.textContent = favoritesOnly
    ? `${scopePrefix}즐겨찾기 ${sortedCards.length}장`
    : myCardsOnly
      ? `${scopePrefix}내가 등록한 명함 ${sortedCards.length}장`
      : `${visibilityFilter === "mine" ? "개인 명함" : "전체"} ${sortedCards.length}장`;
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
    const response = await fetch(`./api/cards${query}`, { cache: "no-store" });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(response.status === 401
        ? "로그인 후 명함을 확인할 수 있습니다."
        : result.message || "명함 목록을 불러오지 못했습니다.");
    }

    if (sequence !== requestSequence) {
      return;
    }

    visibleCards = result.cards || [];
    const visibleIds = new Set(visibleCards.map((card) => Number(card.id)));
    pruneSelectedCardIds(visibleIds);
    syncSelectionUi();
    renderCurrentView();
  } catch (error) {
    if (sequence !== requestSequence) return;
    console.error(error);
    visibleCards = [];
    board.classList.remove("duplicateMode", "groupMode", "tagMode");
    board.innerHTML = `<p class="emptyCards">${escapeHtml(error.message)}</p>`;
    resultSummary.textContent = "목록 조회 실패";
  }
}

// ===== 검색·보기 전환·명함 선택 이벤트 =====
visibilityFilterSelect?.addEventListener("change", () => {
  const scope = visibilityFilterSelect.value;
  if (!["all", "mine"].includes(scope) || scope === visibilityFilter) return;
  visibilityFilter = scope;
  // 이전 범위에서 고른 명함이 숨은 상태로 일괄 작업에 포함되지 않게 한다.
  selectedCardIdsByView.forEach((ids) => ids.clear());
  selectionModeByView.forEach((_value, mode) => selectionModeByView.set(mode, false));
  selectionMode = false;
  renderCurrentView();
});

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

tagViewToggle.addEventListener("click", () => {
  setViewMode(viewMode === "tags" ? "all" : "tags");
});

tagFilterSelect.addEventListener("change", () => {
  tagFilter = tagFilterSelect.value;
  if (viewMode === "tags") {
    renderCurrentView();
  }
});

duplicateToggle.addEventListener("click", () => {
  setViewMode(viewMode === "duplicates" ? "all" : "duplicates");
});

cardSortSelect.addEventListener("change", () => {
  if (cardSortSelect.value === "mine") {
    myCardsOnly = Boolean(currentUser);
    if (!myCardsOnly) cardSortSelect.value = sortKey;
  } else {
    myCardsOnly = false;
    sortKey = cardSortSelect.value;
  }
  renderCurrentView();
});

document.addEventListener("auth:ready", (event) => {
  currentUser = event.detail?.user || null;
  myCardsOnlyOption.hidden = !currentUser;
  if (!currentUser && myCardsOnly) {
    myCardsOnly = false;
    cardSortSelect.value = sortKey;
    renderCurrentView();
  }
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
    } else if (event.target.closest("[data-logo-editor]")) {
      clearTimeout(cardOpenTimer);
      openLogoEditor(card.dataset.cardId);
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
  if (event.target.closest(".profileCardLogo")) return;
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
    } else if (event.target.closest("[data-logo-editor]")) {
      openLogoEditor(card.dataset.cardId);
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
  } else if (action === "edit-tab") {
    selectCardEditTab(actionButton);
  } else if (action === "cancel") {
    showCardDetail();
  } else if (action === "view-image") {
    openImageLightbox();
  } else if (action === "close-image-viewer") {
    closeImageLightbox();
  } else if (action === "delete") {
    deleteCurrentCard();
  } else if (action === "toggle-favorite") {
    toggleFavorite(activeCardId);
  } else if (action === "copy-field") {
    copyFromDetail(actionButton, actionButton.dataset.copyValue);
  } else if (action === "copy-all") {
    const contact = getActiveCard();
    if (contact) copyFromDetail(actionButton, createCopyAllCardText(contact));
  } else if (action === "toggle-tag") {
    toggleCardTag(actionButton.dataset.tag);
  }
});
detailContent.addEventListener("keydown", (event) => {
  const tab = event.target.closest("[data-edit-tab]");
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...tab.parentElement.querySelectorAll("[data-edit-tab]")];
  const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs.find((button) => button !== tab);
  event.preventDefault();
  selectCardEditTab(next);
  next.focus();
});
detailContent.addEventListener("submit", (event) => {
  if (!event.target.matches(".cardDetailEditForm")) {
    return;
  }
  event.preventDefault();
  saveCardEdits(event.target);
});
detailModal.addEventListener("click", (event) => {
  if (event.target.classList?.contains("cardImageLightbox")) {
    closeImageLightbox();
    return;
  }
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
      const lightbox = detailContent.querySelector(".cardImageLightbox");
      if (lightbox && !lightbox.hidden) closeImageLightbox();
      else closeCardDetail();
    }
  });
}

loadCards();
