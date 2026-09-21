const trashBoard = document.querySelector(".trashBoard");
const trashCount = document.querySelector(".trashCount");
const trashSelectAllInput = document.querySelector(".trashSelectAllInput");
const trashBulkActions = [...document.querySelectorAll("[data-trash-bulk]")];

let trashedCards = [];
const selectedTrashIds = new Set();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function requestTrash(path, options = {}) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "휴지통 작업에 실패했습니다.");
  return result;
}

function selectedIds() {
  return [...selectedTrashIds];
}

function formatDeletedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "삭제 날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderTrash() {
  trashCount.textContent = `${trashedCards.length}장 보관 중`;
  const hasSelection = selectedTrashIds.size > 0;
  trashSelectAllInput.checked = trashedCards.length > 0 && selectedTrashIds.size === trashedCards.length;
  trashSelectAllInput.indeterminate = hasSelection && selectedTrashIds.size < trashedCards.length;
  trashBulkActions.forEach((button) => { button.disabled = !hasSelection; });

  if (trashedCards.length === 0) {
    trashBoard.innerHTML = '<div class="trashEmpty"><strong>휴지통이 비어 있습니다.</strong><p>삭제한 명함은 이곳에서 복원하거나 영구 삭제할 수 있습니다.</p><a href="./BCM.html">명함관리로 돌아가기</a></div>';
    return;
  }

  trashBoard.innerHTML = trashedCards.map((card) => {
    const id = Number(card.id);
    const selected = selectedTrashIds.has(id);
    return `
      <article class="trashCard${selected ? " is-selected" : ""}" data-card-id="${id}">
        <label class="trashCardSelect"><input type="checkbox" data-trash-select="${id}"${selected ? " checked" : ""} aria-label="${escapeHtml(card.name || "이름 없는 명함")} 선택"></label>
        <div class="trashCardInfo">
          <span>${escapeHtml(card.company || "BUSINESS CARD")}</span>
          <h2>${escapeHtml(card.name || "-")}</h2>
          <p>${escapeHtml(card.position || card.department || "직책 정보 없음")}</p>
          <small>${escapeHtml(card.mobile || card.phone || card.email || "연락처 정보 없음")}</small>
          <time>삭제됨 · ${escapeHtml(formatDeletedAt(card.deleted_at))}</time>
        </div>
        <div class="trashCardActions">
          <button type="button" data-trash-action="restore" data-card-id="${id}">복원</button>
          <button type="button" data-trash-action="permanent-delete" data-card-id="${id}">영구 삭제</button>
        </div>
      </article>`;
  }).join("");
}

async function loadTrash() {
  const result = await requestTrash("/api/cards?trash=1");
  trashedCards = Array.isArray(result.cards) ? result.cards : [];
  const availableIds = new Set(trashedCards.map((card) => Number(card.id)));
  selectedTrashIds.forEach((id) => { if (!availableIds.has(id)) selectedTrashIds.delete(id); });
  renderTrash();
}

async function restoreCards(cardIds) {
  if (cardIds.length === 0) return;
  if (cardIds.length === 1) {
    await requestTrash(`/api/cards/${encodeURIComponent(cardIds[0])}/restore`, { method: "PATCH" });
  } else {
    await requestTrash("/api/cards/bulk-restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardIds }) });
  }
  cardIds.forEach((id) => selectedTrashIds.delete(id));
  await loadTrash();
}

async function permanentlyDeleteCards(cardIds) {
  if (cardIds.length === 0 || !window.confirm(`선택한 명함 ${cardIds.length}장을 영구 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
  if (cardIds.length === 1) {
    await requestTrash(`/api/cards/${encodeURIComponent(cardIds[0])}/permanent`, { method: "DELETE" });
  } else {
    await requestTrash("/api/cards/bulk-permanent-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardIds }) });
  }
  cardIds.forEach((id) => selectedTrashIds.delete(id));
  await loadTrash();
}

trashBoard.addEventListener("change", (event) => {
  const input = event.target.closest("[data-trash-select]");
  if (!input) return;
  const id = Number(input.dataset.trashSelect);
  if (input.checked) selectedTrashIds.add(id);
  else selectedTrashIds.delete(id);
  renderTrash();
});

trashBoard.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-trash-action]");
  if (!button) return;
  button.disabled = true;
  try {
    const id = Number(button.dataset.cardId);
    if (button.dataset.trashAction === "restore") await restoreCards([id]);
    else await permanentlyDeleteCards([id]);
  } catch (error) {
    window.alert(error.message);
    button.disabled = false;
  }
});

trashSelectAllInput.addEventListener("change", () => {
  if (trashSelectAllInput.checked) trashedCards.forEach((card) => selectedTrashIds.add(Number(card.id)));
  else selectedTrashIds.clear();
  renderTrash();
});

trashBulkActions.forEach((button) => {
  button.addEventListener("click", async () => {
    const ids = selectedIds();
    try {
      if (button.dataset.trashBulk === "restore") await restoreCards(ids);
      else await permanentlyDeleteCards(ids);
    } catch (error) {
      window.alert(error.message);
    }
  });
});

loadTrash().catch((error) => {
  trashBoard.innerHTML = `<div class="trashEmpty"><strong>휴지통을 불러오지 못했습니다.</strong><p>${escapeHtml(error.message)}</p></div>`;
});
