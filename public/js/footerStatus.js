// ===== 서비스 상태 표시 설정 =====
const serviceLabels = {
  "local-ai": "Local AI",
  sqlite: "SQLite"
};

function setServiceStatus(service, isOnline) {
  const element = document.querySelector(`[data-service="${service}"]`);

  if (!element) {
    return;
  }

  element.classList.toggle("serviceStatusOn", isOnline);
  element.classList.toggle("serviceStatusOff", !isOnline);
  element.title = `${serviceLabels[service]} ${isOnline ? "connected" : "disconnected"}`;
}

// ===== Local AI 및 SQLite 실제 연결 상태 확인 =====
async function updateFooterStatus() {
  try {
    const response = await fetch("./api/status", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("status request failed");
    }

    const status = await response.json();

    setServiceStatus("local-ai", Boolean(status.localAi));
    setServiceStatus("sqlite", Boolean(status.sqlite));
  } catch (err) {
    setServiceStatus("local-ai", false);
    setServiceStatus("sqlite", false);
  }
}

updateFooterStatus();
// 보이지 않는 탭은 AI 서버 상태를 계속 확인하지 않는다.
setInterval(() => {
  if (!document.hidden) updateFooterStatus();
}, 10000);

// ===== CSV 주소록 다운로드 =====
const csvExportBtn = document.querySelector(".csvExport")

if(csvExportBtn) {
  csvExportBtn.addEventListener("click", () => {
    window.location.href = "./api/cards/export/csv";
  })
}

// ===== vCard 주소록 다운로드 =====
const vcardExportBtn = document.querySelector(".vcardExport");

if (vcardExportBtn) {
  vcardExportBtn.addEventListener("click", () => {
    window.location.href = "./api/cards/export/vcard";
  });
}
