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

async function updateFooterStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });

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
setInterval(updateFooterStatus, 10000);
