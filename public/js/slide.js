const cardTrack = document.querySelector("#cardTrack");
const searchInput = document.querySelector(".searchBox input");
const searchBtn = document.querySelector(".searchBox button");

// ===== 최근 명함 목록 렌더링 =====
function renderCards(data){
  cardTrack.classList.remove("slide");
  cardTrack.classList.remove("is-empty");
  cardTrack.innerHTML = "";

  if(data.length === 0){
    cardTrack.classList.add("is-empty");
    cardTrack.innerHTML = `
      <div class="emptyBox">
        <p class="emptyText">등록된 명함이 없습니다.</p>
        <p class="emptyText" style="margin-top: 5px">명함을 등록해주세요!</p>
      </div>
    `;
    return;
  }

  cardTrack.innerHTML = data.map(createCard).join("");

  requestAnimationFrame(() => {
    checkSlide(data);
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function createCard(contact){
  const logoText = contact.company ? String(contact.company).slice(0, 2).toUpperCase() : "BC";

  return `
    <div class="contactCard">
      <div class="cardImage">${escapeHtml(logoText)}</div>
      <div class="cardInfo">
        <span class="date">${escapeHtml(contact.date)}</span>
        <h2>${escapeHtml(contact.name || "이름 없음")}</h2>
        <p>${escapeHtml(contact.position)}</p>
        <p>${escapeHtml(contact.company)}</p>
        <div class="cardContact">
          <span>${escapeHtml(contact.mobile)}</span>
          <span>${escapeHtml(contact.email)}</span>
        </div>
      </div>
    </div>
  `;
}

// ===== 화면 너비에 따른 슬라이드 표시 수 계산 =====
function checkSlide(data){
  const cardArea = document.querySelector(".cardArea");
  const areaWidth = cardArea.offsetWidth;
  const trackWidth = cardTrack.scrollWidth;

  if(trackWidth > areaWidth){
    cardTrack.innerHTML += data.map(createCard).join("");

    cardTrack.classList.add("slide");
  }
}

// ===== SQLite 명함 데이터 불러오기 =====
async function loadCards() {
  try {
    const response = await fetch("./api/cards", {
      cache: "no-store"
    });

    const result = await response.json();

    if (response.status === 401) {
      contacts = [];
      cardTrack.classList.remove("slide");
      cardTrack.classList.add("is-empty");
      cardTrack.innerHTML = '<div class="emptyBox"><p class="emptyText">로그인 후 명함을 확인할 수 있습니다.</p></div>';
      return;
    }

    if (!response.ok) {
      throw new Error(result.message || "명함을 불러오지 못했습니다.");
    }

    contacts = result.cards || [];
    renderCards(contacts);
  } catch (error) {
    console.error(error);
    contacts = [];
    renderCards(contacts);
  }
}

window.addEventListener("resize", () => {
  // 로그인 안내를 빈 목록 안내로 덮어쓰지 않는다.
  if (contacts.length > 0) renderCards(contacts);
});


loadCards();
