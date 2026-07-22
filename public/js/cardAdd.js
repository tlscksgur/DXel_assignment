const cardImageInput = document.querySelector("#cardImage");
const runningBadge = document.querySelector(".runningBadge");

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
