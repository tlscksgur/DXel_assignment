const contacts = [
  {name: "신찬혁", position: "Frontend Developer", company: "DXel Corp.", mobile: "010-1234-5678", email: "sin@dxel.com", date: "2026.06.18"},
  {name: "김민수", position: "Backend Developer", company: "Archive Lab", mobile: "010-2222-3333", email: "minsu@archive.com", date: "2026.06.18"},
  {name: "이서연", position: "AI Engineer", company: "Local OCR Studio", mobile: "010-5555-7777", email: "seoyeon@ocr.io", date: "2026.06.18"},
  {name: "박지훈", position: "Product Designer", company: "Contact Works", mobile: "010-8888-9999", email: "jihun@contact.kr", date: "2026.06.18"},
  {name: "신찬투", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"},
  {name: "신찬쓰리", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"},
  {name: "신찬포", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"},
  {name: "신찬파이브", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"},
  {name: "신찬식스", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"},
  {name: "신찬세븐", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"},
  {name: "신찬에잇", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"},
  {name: "신찬나인", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"},
  {name: "신찬텐", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"}
];

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

// function searchCards(){
//   const keyword = searchInput.value.trim().toLowerCase();

//   const filtered = contacts.filter(contact => {
//     return (
//       contact.name.toLowerCase().includes(keyword) ||
//       contact.company.toLowerCase().includes(keyword)
//     );
//   });

//   renderCards(filtered);
// }
// searchBtn.addEventListener("click", searchCards);
// searchInput.addEventListener("input", searchCards);

window.addEventListener("resize", () => {
  renderCards(contacts);
});


renderCards(contacts);