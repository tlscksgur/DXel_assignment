const fs = require("fs");

async function extractBusinessCard(imageDataUrl) {
  const response = await fetch(process.env.LM_STUDIO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.LM_STUDIO_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
            명함 이미지에서 정보를 추출하세요.
            이미지에 없는 정보는 추측하지 말고 빈 문자열로 반환하세요.
            설명이나 마크다운 없이 JSON 객체만 반환하세요.

            반환 방식:
            {
              "name": "",
              "company": "",
              "department": "",
              "position": "",
              "mobile": "",
              "phone": "",
              "email": "",
              "address": "",
              "website": ""
            }
          `.trim()
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "이 이미지가 명함이라면 정보를 추출하세요."
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`LM Studio 요청 실패: ${response.status}`);
  }

  return response.json();
}

function imageToDataUrl(file) {
  const base64 = fs.readFileSync(file.path).toString("base64");
  return `data:${file.mimetype};base64,${base64}`;
}

function parseModelJson(content) {
  const text = String(content || "").trim();
  const fencedJson = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedJson) {
    return JSON.parse(fencedJson[1].trim());
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace < firstBrace) {
    throw new Error("모델 응답에서 JSON 객체를 찾을 수 없습니다.");
  }

  return JSON.parse(text.slice(firstBrace, lastBrace + 1));
}

module.exports = {
  extractBusinessCard,
  imageToDataUrl,
  parseModelJson
};
