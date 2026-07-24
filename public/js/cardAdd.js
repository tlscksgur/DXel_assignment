const cardImageInput = document.querySelector("#cardImage");
const runningBadge = document.querySelector(".runningBadge");
const saveButton = document.querySelector(".mainAction");
const nextButton = document.querySelector(".subAction");
const cancelButton = document.querySelector(".ghostAction");
const previewFrame = document.querySelector(".previewFrame");
const queueBox = document.querySelector(".queueBox");

const fieldIds = [
  "name",
  "company",
  "department",
  "position",
  "mobile",
  "phone",
  "email",
  "address"
];

const queueStatusLabels = {
  waiting: "분석 대기",
  processing: "분석 중",
  ready: "확인 대기",
  saved: "저장 완료",
  skipped: "건너뜀",
  error: "분석 실패"
};

let uploadQueue = [];
let currentQueueIndex = -1;
let isAnalyzing = false;

function createQueueId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createQueueItem(file) {
  return {
    id: createQueueId(),
    file,
    previewUrl: URL.createObjectURL(file),
    status: "waiting",
    imagePath: "",
    extracted: null,
    error: ""
  };
}

function remainingQueueCount() {
  return uploadQueue.filter((item) => {
    return item.status !== "saved" && item.status !== "skipped";
  }).length;
}

function renderQueue() {
  const remainingCount = remainingQueueCount();

  if (uploadQueue.length === 0) {
    queueBox.innerHTML = `
      <div class="queueHeader">
        <span>연속 업로드</span>
        <b>0장 대기</b>
      </div>
      <p class="emptyQueue">업로드한 명함이 없습니다.</p>
    `;
    return;
  }

  const queueItems = uploadQueue.map((item, index) => {
    const currentClass = index === currentQueueIndex ? "current" : "";

    return `
      <button
        class="queueItem ${currentClass} queueItem-${item.status}"
        type="button"
        data-queue-index="${index}"
      >
        <span>
          <strong>${index + 1}</strong>
          ${escapeHtml(item.file.name)}
        </span>
        <b>${queueStatusLabels[item.status]}</b>
      </button>
    `;
  }).join("");

  queueBox.innerHTML = `
    <div class="queueHeader">
      <span>연속 업로드</span>
      <b>${remainingCount}장 남음</b>
    </div>
    <div class="queueList">${queueItems}</div>
  `;
}

function clearCardForm(message = "명함 사진을 업로드하면 이곳에 표시됩니다.") {
  fieldIds.forEach((field) => {
    document.querySelector(`#${field}`).value = "";
  });
  document.querySelector("#homepage").value = "";

  previewFrame.innerHTML = `
    <div class="emptyPreview">
      <span>NO IMAGE</span>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function showQueueItem(item) {
  previewFrame.innerHTML = `
    <img src="${item.previewUrl}" alt="${escapeHtml(item.file.name)}">
  `;

  const extracted = item.extracted || {};

  fieldIds.forEach((field) => {
    document.querySelector(`#${field}`).value = extracted[field] || "";
  });
  document.querySelector("#homepage").value = extracted.website || "";
}

function updateActionState() {
  const currentItem = uploadQueue[currentQueueIndex];
  saveButton.disabled = !currentItem || currentItem.status !== "ready" || isAnalyzing;
  nextButton.disabled = !currentItem || isAnalyzing;
  cancelButton.disabled = !currentItem || isAnalyzing;
}

async function analyzeCurrentCard() {
  const item = uploadQueue[currentQueueIndex];

  if (!item || isAnalyzing) {
    return;
  }

  if (item.status === "ready") {
    showQueueItem(item);
    runningBadge.textContent = "분석 완료";
    updateActionState();
    return;
  }

  if (item.status === "saved" || item.status === "skipped") {
    return;
  }

  isAnalyzing = true;
  item.status = "processing";
  item.error = "";
  showQueueItem(item);
  runningBadge.textContent = "이미지 분석 중";
  renderQueue();
  updateActionState();

  const formData = new FormData();
  formData.append("image", item.file);

  try {
    const response = await fetch("/api/cards/extract", {
      method: "POST",
      body: formData
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "업로드에 실패했습니다.");
    }

    item.status = "ready";
    item.imagePath = result.file.path;
    item.extracted = result.extracted;

    showQueueItem(item);
    
    runningBadge.textContent = "분석 완료";
  } catch (error) {
    console.error(error);

    item.status = "error";
    item.error = error.message;
    runningBadge.textContent = "분석 실패";

    alert(error.message);
  } finally {
    isAnalyzing = false;
    
    renderQueue();
    updateActionState();
  }
}

async function activateQueueItem(index) {
  if (isAnalyzing || index < 0 || index >= uploadQueue.length) {
    return;
  }

  currentQueueIndex = index;
  renderQueue();

  const item = uploadQueue[currentQueueIndex];
  if (item.status === "ready") {
    showQueueItem(item);
    runningBadge.textContent = "분석 완료";
    updateActionState();
    return;
  }

  await analyzeCurrentCard();
}

async function moveToNextCard() {
  const nextIndex = uploadQueue.findIndex((item, index) => {
    return (
      index > currentQueueIndex &&
      item.status !== "saved" &&
      item.status !== "skipped"
    );
  });

  if (nextIndex === -1) {
    currentQueueIndex = -1;
    clearCardForm("선택한 명함을 모두 처리했습니다.");
    runningBadge.textContent = "전체 처리 완료";
    renderQueue();
    updateActionState();
    alert("선택한 명함을 모두 처리했습니다.");
    return;
  }

  await activateQueueItem(nextIndex);
}

cardImageInput.addEventListener("change", async (event) => {
  const files = [...event.target.files];

  if (files.length === 0) {
    return;
  }

  uploadQueue.push(...files.map(createQueueItem));
  event.target.value = "";
  renderQueue();

  if (currentQueueIndex === -1) {
    const firstPendingIndex = uploadQueue.findIndex((item) => {
      return item.status === "waiting" || item.status === "error";
    });

    if (firstPendingIndex !== -1) {
      await activateQueueItem(firstPendingIndex);
    }
  }
});

function getCardFormData() {
  const currentItem = uploadQueue[currentQueueIndex];

  return {
    name: document.querySelector("#name").value.trim(),
    company: document.querySelector("#company").value.trim(),
    department: document.querySelector("#department").value.trim(),
    position: document.querySelector("#position").value.trim(),
    mobile: document.querySelector("#mobile").value.trim(),
    phone: document.querySelector("#phone").value.trim(),
    email: document.querySelector("#email").value.trim(),
    address: document.querySelector("#address").value.trim(),
    website: document.querySelector("#homepage").value.trim(),
    image_path: currentItem?.imagePath || ""
  };
}

async function handleDuplicates(duplicates) {
  const existingCard = duplicates[0];
  const registerSeparately = confirm(
    `중복 가능성이 있는 명함입니다.\n\n` +
    `기존 이름: ${existingCard?.name || "없음"}\n` +
    `기존 회사: ${existingCard?.company || "없음"}\n` +
    `기존 전화번호: ${existingCard?.mobile || "없음"}\n\n` +
    `별도 항목으로 저장하시겠습니까?`
  );

  if (!registerSeparately) {
    return false;
  }

  return submitCard(true);
}

async function submitCard(allowDuplicate = false) {
  const currentItem = uploadQueue[currentQueueIndex];

  if (!currentItem || currentItem.status !== "ready" || !currentItem.imagePath) {
    alert("분석이 완료된 명함이 없습니다.");
    return false;
  }

  const card = {
    ...getCardFormData(),
    allowDuplicate
  };

  saveButton.disabled = true;
  saveButton.textContent = "저장 중";

  try {
    const response = await fetch("/api/cards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(card)
    });
    const result = await response.json();

    if (response.status === 409) {
      return handleDuplicates(result.duplicates || []);
    }

    if (!response.ok) {
      throw new Error(result.message || "명함 저장에 실패했습니다.");
    }

    return true;
  } catch (error) {
    console.error(error);
    alert(error.message);
    return false;
  } finally {
    saveButton.textContent = "확인 후 저장";
    updateActionState();
  }
}

saveButton.addEventListener("click", async () => {
  const saved = await submitCard(false);

  if (!saved) {
    return;
  }

  const savedItem = uploadQueue[currentQueueIndex];
  savedItem.status = "saved";
  renderQueue();
  await moveToNextCard();
});

nextButton.addEventListener("click", async () => {
  const currentItem = uploadQueue[currentQueueIndex];

  if (!currentItem || isAnalyzing) {
    return;
  }

  const shouldSkip = confirm("현재 명함을 저장하지 않고 다음으로 이동하시겠습니까?");
  if (!shouldSkip) {
    return;
  }

  currentItem.status = "skipped";
  renderQueue();
  await moveToNextCard();
});

cancelButton.addEventListener("click", async () => {
  const currentItem = uploadQueue[currentQueueIndex];

  if (!currentItem || isAnalyzing) {
    return;
  }

  URL.revokeObjectURL(currentItem.previewUrl);
  uploadQueue.splice(currentQueueIndex, 1);

  if (uploadQueue.length === 0) {
    currentQueueIndex = -1;
    clearCardForm();
    runningBadge.textContent = "업로드 대기";
    renderQueue();
    updateActionState();
    return;
  }

  const nextIndex = Math.min(currentQueueIndex, uploadQueue.length - 1);
  currentQueueIndex = -1;
  await activateQueueItem(nextIndex);
});

queueBox.addEventListener("click", async (event) => {
  const queueItem = event.target.closest("[data-queue-index]");

  if (!queueItem || isAnalyzing) {
    return;
  }

  const index = Number(queueItem.dataset.queueIndex);
  const item = uploadQueue[index];

  if (!item || item.status === "saved" || item.status === "skipped") {
    return;
  }

  await activateQueueItem(index);
});

globalThis.addEventListener?.("beforeunload", () => {
  uploadQueue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
});

renderQueue();
updateActionState();
