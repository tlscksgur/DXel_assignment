const cardTrack = document.querySelector("#cardTrack");
const searchInput = document.querySelector(".searchBox input");
const searchBtn = document.querySelector(".searchBox button");

function renderCards(data){
  cardTrack.classList.remove("slide");
  cardTrack.innerHTML = "";

  if(data.length === 0){
    cardTrack.innerHTML = `
      <div class="emptyBox">
        <p class="emptyText">등록된 명함이 없습니다.</p>
        <p class="emptyText" style="margin-top: 5px">명함을 등록해주세요!</p>
      </div>
    `;
    return;
  }

  data.forEach(contact => {
    cardTrack.innerHTML += `
      ${createCard(contact)}
    `;

  });

  requestAnimationFrame(() => {
    checkSlide(data);
  });
}

function createCard(contact){
  const logoText = contact.company ? contact.company.slice(0, 2).toUpperCase() : "BC";

  return `
    <div class="contactCard">
      <div class="cardImage">${logoText}</div>
      <div class="cardInfo">
        <span class="date">${contact.date || ""}</span>
        <h2>${contact.name || "이름 없음"}</h2>
        <p>${contact.position || ""}</p>
        <p>${contact.company || ""}</p>
        <div class="cardContact">
          <span>${contact.mobile || ""}</span>
          <span>${contact.email || ""}</span>
        </div>
      </div>
    </div>
  `;
}

function checkSlide(data){
  const cardArea = document.querySelector(".cardArea");
  const areaWidth = cardArea.offsetWidth;
  const trackWidth = cardTrack.scrollWidth;

  if(trackWidth > areaWidth){
    data.forEach(contact => {
        cardTrack.innerHTML += `
        ${createCard(contact)}
      `;
    });

    cardTrack.classList.add("slide");
  }
}

async function loadCards() {
  try {
    const response = await fetch("/api/cards", {
      cache: "no-store"
    });

    const result = await response.json();

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
  renderCards(contacts);
});


loadCards();