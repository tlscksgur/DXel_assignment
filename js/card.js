const contacts = [
  {name: "신찬혁", position: "Frontend Developer", company: "DXel Corp.", mobile: "010-1234-5678", email: "sin@dxel.com", date: "2026.06.18"},
  {name: "김민수", position: "Backend Developer", company: "Archive Lab", mobile: "010-2222-3333", email: "minsu@archive.com", date: "2026.06.18"},
  {name: "이서연", position: "AI Engineer", company: "Local OCR Studio", mobile: "010-5555-7777", email: "seoyeon@ocr.io", date: "2026.06.18"},
  {name: "박지훈", position: "Product Designer", company: "Contact Works", mobile: "010-8888-9999", email: "jihun@contact.kr", date: "2026.06.18"},
  {name: "신찬투", position: "똥처리반", company: "DXel", mobile: "010-4890-0924", email: "12880924a@gmail.com", date: "2026.07.24"}
];

const board = document.querySelector(".bcmBoard");

if (board) {
  renderCards(contacts);
}

function renderCards(data) {
  board.innerHTML = "";

  data.forEach((contact, index) => {
    board.insertAdjacentHTML("beforeend", createCard(contact, index));
  });
}

function createCard(contact, index) {
  const variants = [
    "card-light tilt-left",
    "card-dark tilt-right featured",
    "card-framed tilt-left",
    "card-cream tilt-right wide",
    "card-portrait tilt-right",
    "card-dark-grey tilt-left compact"
  ];

  const classes = variants[index % variants.length];
  const badge = contact.kind ? contact.kind.toUpperCase() : "CARD";
  const initials = contact.name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (classes.includes("card-dark-grey")) {
    return `
      <article class="profileCard ${classes}">
        <div class="monogram">${initials || "A"}</div>
        <span class="pill pill-outline">Verified</span>
        <h2>${contact.name}</h2>
        <p class="role">${contact.position} - ${contact.company}</p>
        <p class="meta">${contact.mobile}</p>
        <p class="meta">${contact.email}</p>
      </article>
    `;
  }

  if (classes.includes("card-portrait")) {
    return `
      <article class="profileCard ${classes}">
        <div class="avatar">${initials || "JT"}</div>
        <h2>${contact.name}</h2>
        <p class="role">${contact.position}</p>
        <p class="footerLabel">${contact.company}</p>
      </article>
    `;
  }

  if (classes.includes("card-cream")) {
    return `
      <article class="profileCard ${classes}">
        <h2 class="scriptName">${contact.name}</h2>
        <p class="role">${contact.position}</p>
        <p class="summary">${contact.company} / ${contact.email}</p>
        <div class="smallIcons">
          <span>${badge.slice(0, 1)}</span>
          <span>${badge.slice(-1)}</span>
        </div>
      </article>
    `;
  }

  if (classes.includes("card-framed")) {
    return `
      <article class="profileCard ${classes}">
        <span class="miniIcon">{ }</span>
        <span class="cardId">ID: ${String(5820 + index).padStart(4, "0")}</span>
        <h2>${contact.name}</h2>
        <p class="role">${contact.position} - ${contact.company}</p>
        <p class="status">
          <i></i>
          Active Project: ${badge}
        </p>
      </article>
    `;
  }

  if (classes.includes("card-dark")) {
    return `
      <article class="profileCard ${classes}">
        <span class="pill pill-dark">Picture</span>
        <div class="cardStar">*</div>
        <h2>${contact.name}</h2>
        <p class="role">${contact.position} - ${contact.company}</p>
        <p class="meta">${contact.email}</p>
        <p class="meta strong">${contact.mobile}</p>
      </article>
    `;
  }

  return `
    <article class="profileCard ${classes}">
      <span class="pill">${badge}</span>
      <div class="cardMenu">...</div>
      <h2>${contact.name}</h2>
      <p class="role">${contact.position} - ${contact.company}</p>
      <p class="meta">${contact.email}</p>
      <p class="meta">${contact.mobile}</p>
    </article>
  `;
}
