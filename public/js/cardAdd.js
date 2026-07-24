const cardImageInput = document.querySelector("#cardImage");
const runningBadge = document.querySelector(".runningBadge");
const saveButton = document.querySelector(".mainAction");

let uploadedImagePath = "";

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

cardImageInput.addEventListener("change", async (event) => {
  const files = [...event.target.files];

  if (files.length === 0) {
    return;
  }

  const file = files[0];

  const previewUrl = URL.createObjectURL(file);
  document.querySelector(".previewFrame").innerHTML = `
    <img src="${previewUrl}" alt="업로드한 명함">
  `;

  const formData = new FormData();
  formData.append("image", file);

  runningBadge.textContent = "이미지 분석 중";

  try {
    const response = await fetch("/api/cards/extract", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || "업로드에 실패했습니다.");
    }

    uploadedImagePath = result.file.path;

    fieldIds.forEach((field) => {
      document.querySelector(`#${field}`).value = result.extracted[field] || "";
    });

    document.querySelector("#homepage").value = result.extracted.website || "";
    runningBadge.textContent = "분석 완료";
  } catch (error) {
    console.error(error);
    runningBadge.textContent = "분석 실패";
    alert(error.message);
  }
});

function getCardFormData() {
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

    image_path: uploadedImagePath
  };
}

async function handleDuplicates(duplicates) {
  const existingCard = duplicates[0];

  const registerSeparately = confirm(
    `중복 가능성이 있는 명함입니다.\n\n` +
    `기존 이름: ${existingCard.name || "없음"}\n` +
    `기존 회사: ${existingCard.company || "없음"}\n` +
    `기존 전화번호: ${existingCard.mobile || "없음"}\n\n` +
    `별도 항목으로 저장하시겠습니까?`
  );

  if(registerSeparately) {
    await submitCard(true);
  }

}

async function submitCard(allowDuplicate = false) {
  if(!uploadedImagePath) {
    alert("먼저 명함 이미지를 업로드하세요.");
    return;
  }

  const card = {
    ...getCardFormData(), allowDuplicate
  }

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

    if(response.status === 409) {
      await handleDuplicates(result.duplicates);
      return;
    }

    if(!response.ok){
      throw new Error(result.message || "명함 저장에 실패했습니다.");
    }

    alert("명함이 저장되었습니다.");
    window.location.href = "./BCM.html";
  } catch(error) {
    console.error(error);
    alert(error.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent =  "확인 후 저장";
  }

}

saveButton.addEventListener("click", () => {
  submitCard(false);
})
