const cardImageInput = document.querySelector("#cardImage");

cardImageInput.addEventListener("change", async (event) => {
  const files = [...event.target.files];

  if(files.length === 0) {
    return;
  }

  const file = files[0];

  const previewUrl = URL.createObjectURL(file);
  document.querySelector(".previewFrame").innerHTML = `
    <img src="${previewUrl}" alt="업로드한 명함">
  `;
  
  const formData = new FormData();
  formData.append("image", file);

  try {
    const responce = await fetch("/api/cards/extract", {
      method: "POST",
      body: formData
    });

    const result = await responce.json();
    
    if(!responce.ok) {
      throw new Error(result.message || "업로드에 실패했습니다.");
    }
    
  } catch(error) {
    console.error(error);
    alert(error.message)
  }
  
})