const uploadTrigger = document.querySelector(".uploadTrigger");
const cameraInput = document.querySelector("#cardCameraInput");
const galleryInput = document.querySelector("#cardGalleryInput");
const uploadSourceSheet = document.querySelector(".uploadSourceSheet");
const uploadSourceCamera = document.querySelector(".uploadSourceCamera");
const uploadSourceGallery = document.querySelector(".uploadSourceGallery");
const uploadSourceCancel = document.querySelector(".uploadSourceCancel");
const uploadSourceBackdrop = document.querySelector(".uploadSourceBackdrop");
const runningBadge = document.querySelector(".runningBadge");
const saveButton = document.querySelector(".mainAction");
const nextButton = document.querySelector(".subAction");
const cancelButton = document.querySelector(".ghostAction");
const previewFrame = document.querySelector(".previewFrame");
const queueBox = document.querySelector(".queueBox");
const emailInput = document.querySelector("#email");
const cardTags = document.querySelector(".addCardTags");
const CARD_TAG_OPTIONS = ["고객", "잠재 고객", "협력사", "공급업체", "파트너사", "내부", "기타"];

// ===== 입력 필드 설정 =====
const fieldIds = [
  "name",
  "company",
  "department",
  "position",
  "mobile",
  "phone",
  "email",
  "address",
  "meeting_date",
  "meeting_place",
  "meeting_purpose",
  "meeting_note"
];

const MAX_ANALYSIS_IMAGE_EDGE = 1600;
const IMAGE_RESIZE_THRESHOLD = 1024 * 1024;

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

function syncEmailFieldHeight() {
  emailInput.classList.toggle(
    "has-multiple-lines",
    emailInput.value.includes("\n")
  );
}

// ===== 업로드 큐 데이터 생성 및 표시 =====
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

function createQueueItem(file, shouldRotatePortrait = true) {
  return {
    id: createQueueId(),
    file,
    previewUrl: URL.createObjectURL(file),
    status: "waiting",
    imagePath: "",
    logoPath: "",
    logoPreviewUrl: "",
    extracted: null,
    tags: [],
    analysisDurationMs: null,
    shouldRotatePortrait,
    error: ""
  };
}

function completedAnalysisLabel(item) {
  if (!Number.isFinite(item?.analysisDurationMs)) {
    return "분석 완료";
  }

  return `분석 완료 · ${(item.analysisDurationMs / 1000).toFixed(1)}초`;
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

// ===== 명함 미리보기 및 추출 결과 폼 표시 =====
function clearCardForm(message = "명함 사진을 업로드하면 이곳에 표시됩니다.") {
  fieldIds.forEach((field) => {
    document.querySelector(`#${field}`).value = "";
  });
  document.querySelector("#homepage").value = "";
  syncEmailFieldHeight();
  renderCardTags();

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
    ${item.logoPreviewUrl ? `<div class="logoResult"><span>추출된 로고</span><img src="${item.logoPreviewUrl}" alt="추출된 명함 로고"></div>` : ""}
  `;

  const extracted = item.extracted || {};

  fieldIds.forEach((field) => {
    document.querySelector(`#${field}`).value = extracted[field] || "";
  });
  document.querySelector("#homepage").value = extracted.website || "";
  syncEmailFieldHeight();
  renderCardTags();
}

function renderCardTags() {
  const currentItem = uploadQueue[currentQueueIndex];
  cardTags.innerHTML = CARD_TAG_OPTIONS.map((tag, index) => {
    const selected = currentItem?.tags.includes(tag) || false;
    return `<button type="button" class="addCardTag addCardTag-${index}${selected ? " is-selected" : ""}" data-tag="${tag}" aria-pressed="${selected}"${currentItem ? "" : " disabled"}>${tag}</button>`;
  }).join("");
}

cardTags.addEventListener("click", (event) => {
  const tag = event.target.closest("[data-tag]")?.dataset.tag;
  const currentItem = uploadQueue[currentQueueIndex];
  if (!currentItem || !CARD_TAG_OPTIONS.includes(tag)) return;

  currentItem.tags = currentItem.tags.includes(tag)
    ? currentItem.tags.filter((selectedTag) => selectedTag !== tag)
    : [...currentItem.tags, tag];
  renderCardTags();
});

renderCardTags();

function updateActionState() {
  const currentItem = uploadQueue[currentQueueIndex];
  saveButton.disabled = !currentItem || currentItem.status !== "ready" || isAnalyzing;
  nextButton.disabled = !currentItem || remainingQueueCount() <= 1 || isAnalyzing;
  cancelButton.disabled = !currentItem || isAnalyzing;
}

// ===== 분석 전 이미지 방향 및 크기 최적화 =====
async function prepareImageForAnalysis(file, shouldRotatePortrait = true) {
  if (typeof createImageBitmap !== "function") {
    return {
      blob: file,
      filename: file.name,
      rotatedPortrait: false
    };
  }

  const image = await createImageBitmap(file, {
    imageOrientation: "from-image"
  });

  try {
    const shouldRotate = shouldRotatePortrait && image.height > image.width;
    const orientedWidth = shouldRotate ? image.height : image.width;
    const orientedHeight = shouldRotate ? image.width : image.height;
    const longestEdge = Math.max(orientedWidth, orientedHeight);
    const shouldResize = file.size > IMAGE_RESIZE_THRESHOLD &&
      longestEdge > MAX_ANALYSIS_IMAGE_EDGE;

    if (!shouldRotate && !shouldResize) {
      return {
        blob: file,
        filename: file.name,
        rotatedPortrait: false
      };
    }

    const scale = shouldResize
      ? MAX_ANALYSIS_IMAGE_EDGE / longestEdge
      : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(orientedWidth * scale);
    canvas.height = Math.round(orientedHeight * scale);

    const context = canvas.getContext("2d");
    if (shouldRotate) {
      const drawWidth = Math.round(image.width * scale);
      const drawHeight = Math.round(image.height * scale);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(-Math.PI / 2);
      context.drawImage(
        image,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
    } else {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    }

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
          return;
        }

        reject(new Error("이미지 크기를 줄이지 못했습니다."));
      }, "image/jpeg", 0.92);
    });
    const nameWithoutExtension = file.name.replace(/\.[^.]+$/, "");

    return {
      blob,
      filename: `${nameWithoutExtension}.jpg`,
      rotatedPortrait: shouldRotate
    };
  } finally {
    image.close();
  }
}

async function rotatePreparedImage(preparedImage, degrees) {
  const image = await createImageBitmap(preparedImage.blob, {
    imageOrientation: "from-image"
  });

  try {
    const quarterTurn = degrees === 90 || degrees === 270;
    const canvas = document.createElement("canvas");
    canvas.width = quarterTurn ? image.height : image.width;
    canvas.height = quarterTurn ? image.width : image.height;

    const context = canvas.getContext("2d");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(degrees * Math.PI / 180);
    context.drawImage(image, -image.width / 2, -image.height / 2);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("이미지 방향을 바로잡지 못했습니다."));
      }, "image/jpeg", 0.92);
    });

    return {
      blob,
      filename: preparedImage.filename.replace(/\.[^.]+$/, "-upright.jpg")
    };
  } finally {
    image.close();
  }
}

async function requestCardAnalysis(preparedImage, temporary = false) {
  const formData = new FormData();
  formData.append("image", preparedImage.blob, preparedImage.filename);
  if (temporary) formData.append("temporary", "true");

  const response = await fetch("/api/cards/extract", {
    method: "POST",
    body: formData
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "업로드에 실패했습니다.");
  }

  return result;
}

function e8ightLogoBounds(cardBounds) {
  if (!cardBounds) return null;

  const x = Number(cardBounds.x);
  const y = Number(cardBounds.y);
  const width = Number(cardBounds.width);
  const height = Number(cardBounds.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: x + width * 0.06,
    y: y + height * 0.025,
    width: width * 0.25,
    height: height * 0.10
  };
}

async function cropImageToBounds(blob, bounds, filename) {
  if (!bounds || typeof createImageBitmap !== "function") return null;

  const image = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const sourceX = Math.round(image.width * bounds.x);
    const sourceY = Math.round(image.height * bounds.y);
    const sourceWidth = Math.round(image.width * bounds.width);
    const sourceHeight = Math.round(image.height * bounds.height);
    if (sourceWidth < 1 || sourceHeight < 1) return null;

    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    canvas.getContext("2d").drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    const croppedBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
          return;
        }
        reject(new Error("명함 이미지를 자르지 못했습니다."));
      }, "image/jpeg", 0.94);
    });
    const nameWithoutExtension = filename.replace(/\.[^.]+$/, "");
    return {
      blob: croppedBlob,
      filename: `${nameWithoutExtension}-card.jpg`,
      width: sourceWidth,
      height: sourceHeight
    };
  } finally {
    image.close();
  }
}

// ===== Local AI 분석 및 큐 이동 =====
async function analyzeCurrentCard() {
  const item = uploadQueue[currentQueueIndex];

  if (!item || isAnalyzing) {
    return;
  }

  if (item.status === "ready") {
    showQueueItem(item);
    runningBadge.textContent = completedAnalysisLabel(item);
    updateActionState();
    return;
  }

  if (item.status === "saved" || item.status === "skipped") {
    return;
  }

  isAnalyzing = true;
  const analysisStartedAt = Date.now();
  item.status = "processing";
  item.error = "";
  showQueueItem(item);
  runningBadge.textContent = "이미지 분석 중";
  renderQueue();
  updateActionState();

  try {
    runningBadge.textContent = "이미지 최적화 중";
    const preparedImage = await prepareImageForAnalysis(
      item.file,
      item.shouldRotatePortrait
    );

    if (preparedImage.blob !== item.file) {
      URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = URL.createObjectURL(preparedImage.blob);
      showQueueItem(item);
    }

    runningBadge.textContent = "이미지 분석 중";
    const result = await requestCardAnalysis(preparedImage);
    let logoImageSource = preparedImage;
    let logoBounds = result.logoBounds;
    const companyName = (result.extracted?.company || "").replace(/\s+/g, "");
    const isE8ight = /이에이트|e8ight/i.test(companyName)
      || /@[^\s]*e8ight\.co\.kr/i.test(result.extracted?.email || "");

    if (preparedImage.rotatedPortrait && (result.uprightRotation || isE8ight)) {
      logoBounds = null;
      try {
        logoImageSource = await prepareImageForAnalysis(item.file, false);
        const logoAnalysis = await requestCardAnalysis(logoImageSource, true);
        logoBounds = isE8ight
          ? e8ightLogoBounds(logoAnalysis.cropBounds)
          : logoAnalysis.logoBounds;
      } catch (logoError) {
        console.warn("로고 방향 확인에 실패해 명함 정보만 사용합니다:", logoError);
      }
    }

    let imagePath = result.file.path;
    if (result.cropBounds) {
      try {
        const croppedImage = await cropImageToBounds(
          preparedImage.blob,
          result.cropBounds,
          preparedImage.filename
        );
        if (croppedImage) {
          const croppedFormData = new FormData();
          croppedFormData.append("image", croppedImage.blob, croppedImage.filename);
          croppedFormData.append("originalPath", result.file.path);
          const croppedResponse = await fetch("/api/cards/cropped-image", {
            method: "POST",
            body: croppedFormData
          });
          const croppedResult = await croppedResponse.json();
          if (!croppedResponse.ok) {
            throw new Error(croppedResult.message || "크롭한 이미지를 저장하지 못했습니다.");
          }
          imagePath = croppedResult.file.path;
          URL.revokeObjectURL(item.previewUrl);
          item.previewUrl = URL.createObjectURL(croppedImage.blob);
        }
      } catch (cropError) {
        console.warn("명함 자동 크롭에 실패해 원본 이미지를 사용합니다:", cropError);
      }
    }

    let logoPath = "";
    if (logoBounds) {
      try {
        let logoImage = await cropImageToBounds(
          logoImageSource.blob,
          logoBounds,
          logoImageSource.filename
        );
        if (logoImage) {
          if (preparedImage.rotatedPortrait && logoImage.height > logoImage.width) {
            logoImage = await rotatePreparedImage(logoImage, 270);
          }
          const logoFormData = new FormData();
          logoFormData.append("image", logoImage.blob, logoImageSource.filename.replace(/\.[^.]+$/, "-logo.jpg"));
          const logoResponse = await fetch("/api/cards/logo-image", {
            method: "POST",
            body: logoFormData
          });
          const logoResult = await logoResponse.json();
          if (!logoResponse.ok) throw new Error(logoResult.message || "로고를 저장하지 못했습니다.");
          logoPath = logoResult.file.path;
          if (item.logoPreviewUrl) URL.revokeObjectURL(item.logoPreviewUrl);
          item.logoPreviewUrl = URL.createObjectURL(logoImage.blob);
        }
      } catch (logoError) {
        console.warn("로고 자동 추출에 실패해 명함 정보만 저장합니다:", logoError);
      }
    }

    item.status = "ready";
    item.imagePath = imagePath;
    item.logoPath = logoPath;
    item.extracted = result.extracted;
    item.analysisDurationMs = Date.now() - analysisStartedAt;

    showQueueItem(item);

    runningBadge.textContent = completedAnalysisLabel(item);
  } catch (error) {
    console.error(error);

    item.status = "error";
    item.analysisDurationMs = Date.now() - analysisStartedAt;
    item.error = error.message;
    runningBadge.textContent = `분석 실패 · ${(item.analysisDurationMs / 1000).toFixed(1)}초`;

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
  const item = uploadQueue[currentQueueIndex];

  if (item.status === "skipped") {
    item.status = "waiting";
    item.imagePath = "";
    item.logoPath = "";
    if (item.logoPreviewUrl) URL.revokeObjectURL(item.logoPreviewUrl);
    item.logoPreviewUrl = "";
    item.extracted = null;
    item.analysisDurationMs = null;
    item.error = "";
  }

  renderQueue();

  if (item.status === "ready") {
    showQueueItem(item);
    runningBadge.textContent = completedAnalysisLabel(item);
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

// ===== 모바일 촬영·사진 선택창 =====
function syncUploadSourceViewportHeight() {
  const viewport = globalThis.visualViewport;
  // Toolbar transitions can leave visualViewport.height one update behind.
  // This sheet has no keyboard inputs, so use the larger visible window size.
  const height = Math.max(Number(viewport?.height) || 0, Number(globalThis.innerHeight) || 0);
  const pageTop = Number(viewport?.pageTop) || Number(globalThis.scrollY) || 0;
  uploadSourceSheet.style?.setProperty("--upload-source-page-top", `${pageTop}px`);
  if (Number.isFinite(height) && height > 0) {
    uploadSourceSheet.style?.setProperty(
      "--upload-source-viewport-height",
      `${Math.ceil(height)}px`
    );
  }
}

function openUploadSourceSheet() {
  syncUploadSourceViewportHeight();
  uploadSourceSheet.hidden = false;
}

function closeUploadSourceSheet() {
  uploadSourceSheet.hidden = true;
}

function openFilePicker(input) {
  input.value = "";
  input.click();
}

async function handleSelectedFiles(event, shouldRotatePortrait = true) {
  const files = [...event.target.files];

  if (files.length === 0) {
    return;
  }

  uploadQueue.push(...files.map((file) => {
    return createQueueItem(file, shouldRotatePortrait);
  }));
  event.target.value = "";
  renderQueue();
  updateActionState();

  if (currentQueueIndex === -1) {
    const firstPendingIndex = uploadQueue.findIndex((item) => {
      return item.status === "waiting" || item.status === "error";
    });

    if (firstPendingIndex !== -1) {
      await activateQueueItem(firstPendingIndex);
    }
  }
}

// ===== 업로드 관련 이벤트 =====
uploadTrigger.addEventListener("click", () => {
  const isMobile = matchMedia("(max-width: 680px)").matches;

  if (isMobile) {
    openUploadSourceSheet();
    return;
  }

  openFilePicker(galleryInput);
});

uploadSourceCamera.addEventListener("click", () => {
  closeUploadSourceSheet();
  openFilePicker(cameraInput);
});

uploadSourceGallery.addEventListener("click", () => {
  closeUploadSourceSheet();
  openFilePicker(galleryInput);
});

uploadSourceCancel.addEventListener("click", closeUploadSourceSheet);
uploadSourceBackdrop.addEventListener("click", closeUploadSourceSheet);
globalThis.visualViewport?.addEventListener?.("resize", syncUploadSourceViewportHeight);
globalThis.visualViewport?.addEventListener?.("scroll", syncUploadSourceViewportHeight);
globalThis.addEventListener?.("resize", syncUploadSourceViewportHeight);
globalThis.addEventListener?.("scroll", syncUploadSourceViewportHeight, { passive: true });
cameraInput.addEventListener("change", (event) => {
  return handleSelectedFiles(event, false);
});
galleryInput.addEventListener("change", (event) => {
  return handleSelectedFiles(event, true);
});
emailInput.addEventListener("input", syncEmailFieldHeight);

// ===== 수정한 명함 정보 수집 및 SQLite 저장 =====
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
    meeting_date: document.querySelector("#meeting_date").value.trim(),
    meeting_place: document.querySelector("#meeting_place").value.trim(),
    meeting_purpose: document.querySelector("#meeting_purpose").value.trim(),
    meeting_note: document.querySelector("#meeting_note").value.trim(),
    image_path: currentItem?.imagePath || "",
    logo_path: currentItem?.logoPath || "",
    tags: [...(currentItem?.tags || [])]
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

// ===== 저장·다음 명함·취소 버튼 이벤트 =====
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
  if (currentItem.logoPreviewUrl) URL.revokeObjectURL(currentItem.logoPreviewUrl);
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

// ===== 업로드 큐 항목 재선택 =====
queueBox.addEventListener("click", async (event) => {
  const queueItem = event.target.closest("[data-queue-index]");

  if (!queueItem || isAnalyzing) {
    return;
  }

  const index = Number(queueItem.dataset.queueIndex);
  const item = uploadQueue[index];

  if (!item || item.status === "saved") {
    return;
  }

  await activateQueueItem(index);
});

// ===== 페이지 종료 및 초기 화면 설정 =====
globalThis.addEventListener?.("beforeunload", () => {
  uploadQueue.forEach((item) => {
    URL.revokeObjectURL(item.previewUrl);
    if (item.logoPreviewUrl) URL.revokeObjectURL(item.logoPreviewUrl);
  });
});

renderQueue();
updateActionState();
