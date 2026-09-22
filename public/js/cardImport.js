const importFile = document.querySelector("#importFile");
const importDropzone = document.querySelector(".importDropzone");
const importFileInfo = document.querySelector(".importFileInfo");
const importFileType = document.querySelector(".importFileType");
const importFileName = document.querySelector(".importFileName");
const importFileMeta = document.querySelector(".importFileMeta");
const importFileClear = document.querySelector(".importFileClear");
const previewTable = document.querySelector(".importPreview table");
const previewEmpty = document.querySelector(".importEmpty");
const previewRows = document.querySelector(".importPreviewRows");
const mappingStatus = document.querySelector(".importMappingStatus");
const importSummary = document.querySelector(".importSummary");
const selectAll = document.querySelector(".selectAllImportCards");
const previewFooter = document.querySelector(".importPreviewFooter");
const selectedCount = document.querySelector(".importSelectedCount");
const selectValid = document.querySelector(".importSelectValid");
const importSubmit = document.querySelector(".importSubmit");
const importCancel = document.querySelector(".importCancel");
const importGroup = document.querySelector(".importGroup");
const importGroupName = document.querySelector(".importGroupName");
const duplicateChoices = document.querySelector(".importDuplicateChoices");

let previewCards = [];
let duplicateAction = "skip";
let importGroups = [];

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

async function readImportResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("불러오기 기능을 반영하려면 서버를 다시 시작해 주세요.");
  }
  return response.json();
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_\-()]/g, "");
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("헤더와 한 줄 이상의 데이터가 있는 CSV 파일이 필요합니다.");
  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const aliases = { name:["이름","name","성명"], company:["회사","company","organization","조직"], department:["부서","department","team"], position:["직책","position","title"], mobile:["휴대폰","mobile","cell","mobilephone"], phone:["유선전화","전화번호","전화","phone","tel","telephone"], email:["이메일","email","emailaddress"], website:["홈페이지","website","url","web"], address:["주소","address"] };
  const positions = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((header) => names.includes(header))]));
  if (positions.name === -1 && positions.company === -1 && positions.email === -1 && positions.mobile === -1) throw new Error("이름, 회사, 휴대폰 또는 이메일 열을 찾지 못했습니다.");
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(Object.entries(positions).map(([field, position]) => [field, position < 0 ? "" : values[position] || ""]));
  });
}

function unfoldVcard(text) { return text.replace(/\r?\n[ \t]/g, ""); }
function parseVcard(text) {
  const cards = unfoldVcard(text).split(/END:VCARD/i).map((block) => block.trim()).filter(Boolean);
  if (!cards.length) throw new Error("vCard 연락처를 찾지 못했습니다.");
  return cards.map((block) => {
    const card = { name:"", company:"", department:"", position:"", mobile:"", phone:"", email:"", website:"", address:"" };
    block.split(/\r?\n/).forEach((line) => {
      const separator = line.indexOf(":"); if (separator < 0) return;
      const key = line.slice(0, separator).toUpperCase(); const value = line.slice(separator + 1).replace(/\\n/g, "\n");
      if (key.startsWith("FN")) card.name = value;
      else if (key.startsWith("ORG")) { const [company, department] = value.split(";"); card.company = company || ""; card.department = department || ""; }
      else if (key.startsWith("TITLE")) card.position = value;
      else if (key.startsWith("EMAIL")) card.email = card.email ? `${card.email}\n${value}` : value;
      else if (key.startsWith("URL")) card.website = value;
      else if (key.startsWith("ADR")) card.address = value.replace(/;/g, " ").replace(/\s+/g, " ").trim();
      else if (key.startsWith("TEL")) { if (/CELL|MOBILE/i.test(key)) card.mobile = card.mobile ? `${card.mobile} / ${value}` : value; else card.phone = card.phone ? `${card.phone} / ${value}` : value; }
    });
    return card;
  });
}

function selectedCards() { return previewCards.filter((card) => card.selected).map(({ selected, duplicateIds, valid, message, index, ...card }) => card); }
function updateSelection() {
  const count = previewCards.filter((card) => card.selected).length;
  selectedCount.textContent = `${count}장 선택됨`;
  importSubmit.disabled = count === 0;
  importSubmit.textContent = count ? `선택한 명함 불러오기 (${count}건)` : "선택한 명함 불러오기";
  const selectable = previewCards.filter((card) => card.valid);
  selectAll.checked = selectable.length > 0 && selectable.every((card) => card.selected);
  selectAll.indeterminate = selectable.some((card) => card.selected) && !selectAll.checked;
}

function groupOptions(selectedGroup) {
  const groups = [...new Set([...importGroups, selectedGroup].filter(Boolean))];
  return `<option value="">그룹 지정 안 함</option>${groups.map((group) => (
    `<option value="${escapeHtml(group)}" ${group === selectedGroup ? "selected" : ""}>${escapeHtml(group)}</option>`
  )).join("")}`;
}

function renderPreview() {
  const validCount = previewCards.filter((card) => card.valid).length;
  const duplicateCount = previewCards.filter((card) => card.duplicateIds.length).length;
  previewEmpty.hidden = true; previewTable.hidden = false; previewFooter.hidden = false; importSummary.hidden = false;
  mappingStatus.textContent = `필드 자동 매핑 완료 (${validCount}/${previewCards.length})`; mappingStatus.classList.add("ready");
  importSummary.textContent = `총 ${previewCards.length}건 · 중복 의심 ${duplicateCount}건`;
  previewRows.innerHTML = previewCards.map((card) => {
    const state = !card.valid ? ["invalid", card.message] : card.duplicateIds.length ? ["duplicate", "중복 의심"] : ["", "정상"];
    return `<tr><td><input data-import-index="${card.index}" type="checkbox" ${card.selected ? "checked" : ""} ${card.valid ? "" : "disabled"}></td><td>${escapeHtml(card.name || "-")}</td><td>${escapeHtml(card.company || "-")}</td><td>${escapeHtml([card.position, card.department].filter(Boolean).join(" / ") || "-")}</td><td>${escapeHtml(card.mobile || card.phone || "-")}</td><td>${escapeHtml(card.email || "-")}</td><td><select class="importRowGroup" data-import-group-index="${card.index}" aria-label="${escapeHtml(card.name || "명함")} 그룹">${groupOptions(card.groupName)}</select></td><td><span class="importState ${state[0]}">${escapeHtml(state[1])}</span></td></tr>`;
  }).join("");
  updateSelection();
}

async function showFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!file || !["csv", "vcf"].includes(extension)) throw new Error("CSV 또는 vCard(.vcf) 파일만 선택할 수 있습니다.");
  const rawCards = extension === "csv" ? parseCsv(await file.text()) : parseVcard(await file.text());
  const response = await fetch("/api/cards/import/preview", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ cards: rawCards }) });
  const result = await readImportResponse(response); if (!response.ok) throw new Error(result.message || "파일을 분석하지 못했습니다.");
  previewCards = result.cards.map((card) => ({ ...card, groupName: currentDefaultGroupName(), selected: card.valid }));
  importFileInfo.hidden = false; importFileType.textContent = extension.toUpperCase(); importFileName.textContent = file.name; importFileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB · ${previewCards.length}건 확인됨`;
  renderPreview();
}

function resetImport() {
  importFile.value = ""; previewCards = []; importFileInfo.hidden = true; previewTable.hidden = true; previewFooter.hidden = true; previewEmpty.hidden = false; importSummary.hidden = true; mappingStatus.textContent = "파일을 선택해 주세요"; mappingStatus.classList.remove("ready"); importSubmit.disabled = true; importSubmit.textContent = "선택한 명함 불러오기";
}

function toggleNewGroupInput() {
  const isNewGroup = importGroup.value === "__new__";
  importGroupName.hidden = !isNewGroup;
  if (!isNewGroup) importGroupName.value = "";
}

function currentDefaultGroupName() {
  return importGroup.value === "__new__" ? importGroupName.value.trim() : importGroup.value;
}

function applyDefaultGroupToPreview() {
  if (!previewCards.length) return;
  const groupName = currentDefaultGroupName();
  previewCards.forEach((card) => { card.groupName = groupName; });
  renderPreview();
}

async function loadImportGroups() {
  try {
    const response = await fetch("/api/cards/groups");
    const result = await readImportResponse(response);
    if (!response.ok) throw new Error(result.message);
    importGroups = result.groups;
    const newGroupOption = importGroup.querySelector('option[value="__new__"]');
    newGroupOption.insertAdjacentHTML("beforebegin", result.groups.map((group) => (
      `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`
    )).join(""));
  } catch (error) {
    console.warn("그룹 목록을 불러오지 못했습니다.", error);
  }
}

importFile.addEventListener("change", async () => { try { await showFile(importFile.files[0]); } catch (error) { resetImport(); alert(error.message); } });
importFileClear.addEventListener("click", resetImport);
importDropzone.addEventListener("dragover", (event) => { event.preventDefault(); importDropzone.classList.add("is-dragover"); });
importDropzone.addEventListener("dragleave", () => importDropzone.classList.remove("is-dragover"));
importDropzone.addEventListener("drop", async (event) => { event.preventDefault(); importDropzone.classList.remove("is-dragover"); try { await showFile(event.dataTransfer.files[0]); } catch (error) { alert(error.message); } });
previewRows.addEventListener("change", (event) => {
  const groupIndex = Number(event.target.dataset.importGroupIndex);
  if (event.target.matches(".importRowGroup")) {
    const card = previewCards.find((item) => item.index === groupIndex);
    if (card) card.groupName = event.target.value;
    return;
  }
  const index = Number(event.target.dataset.importIndex);
  const card = previewCards.find((item) => item.index === index);
  if (card) card.selected = event.target.checked;
  updateSelection();
});
selectAll.addEventListener("change", () => { previewCards.forEach((card) => { if (card.valid) card.selected = selectAll.checked; }); renderPreview(); });
selectValid.addEventListener("click", () => { previewCards.forEach((card) => { card.selected = card.valid && card.duplicateIds.length === 0; }); renderPreview(); });
importCancel.addEventListener("click", resetImport);
duplicateChoices.addEventListener("click", (event) => {
  const button = event.target.closest("[data-duplicate-action]");
  if (!button) return;
  duplicateAction = button.dataset.duplicateAction;
  duplicateChoices.querySelectorAll("button").forEach((choice) => choice.classList.toggle("active", choice === button));
});
importGroup.addEventListener("change", () => { toggleNewGroupInput(); applyDefaultGroupToPreview(); });
importGroupName.addEventListener("input", applyDefaultGroupToPreview);
importSubmit.addEventListener("click", async () => {
  const cards = selectedCards(); if (!cards.length) return;
  const isNewGroup = importGroup.value === "__new__";
  const groupName = isNewGroup ? importGroupName.value.trim() : importGroup.value;
  if (isNewGroup && !groupName) { alert("새 그룹 이름을 입력해 주세요."); importGroupName.focus(); return; }
  if (groupName.length > 40) { alert("그룹 이름은 40자 이내로 입력해 주세요."); return; }
  importSubmit.disabled = true; importSubmit.textContent = "저장 중…";
  try { const response = await fetch("/api/cards/import", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ cards, duplicateAction, groupName }) }); const result = await readImportResponse(response); if (!response.ok) throw new Error(result.message || "명함을 저장하지 못했습니다."); alert(`${result.savedCount}장을 저장했습니다.${result.skipped.length ? ` ${result.skipped.length}장은 건너뛰었습니다.` : ""}`); window.location.href = "./BCM.html"; } catch (error) { alert(error.message); updateSelection(); }
});

loadImportGroups();
toggleNewGroupInput();