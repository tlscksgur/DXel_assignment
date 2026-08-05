const fs = require("fs");

const systemPrompt = `
You are a specialist that accurately extracts contact information from business card images.

Extract only text that is actually visible in the image.
If any information is missing, unclear, or uncertain, never guess it. Return an empty string ("") instead.
Return exactly one valid JSON object with no explanation, markdown code block, or additional text.

Follow these rules:

1. If the business card is rotated, interpret the text in its correct upright orientation.
2. Recognize Korean and English text and preserve the original spelling.
3. Preserve company suffixes such as (주), 주식회사, Co., Ltd., and Inc.
4. Preserve the leading + sign and country code in telephone numbers.
5. Keep the structure of international numbers. For example, do not turn +82 2 6410 2800 into 822-6410-2800.
6. Classify numbers labeled TEL, T, or Phone as phone.
7. Classify numbers labeled MOBILE, M, H.P, or CELL as mobile.
8. Do not place numbers labeled FAX or F into mobile or phone. Omit fax numbers because fax is not an output field.
9. If multiple numbers belong to the same field, include all of them separated by " / ".
10. If both Korean and overseas addresses are present, include all of them separated by " / ".
11. For a company-only card or the back side of a card with no person's name, return an empty string for name.
12. Never invent an email address or website that is not printed on the card.
13. Preserve postal codes, floor numbers, suite or unit numbers, and country names in addresses.
14. Do not place the same telephone number in more than one field.
15. Do not classify a fax number as a general telephone number.

Use exactly this JSON structure and no additional fields:

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
`.trim();

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
          content: systemPrompt
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
  const parsedObjects = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"' && depth > 0) {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
      continue;
    }

    if (character !== "}" || depth === 0) {
      continue;
    }

    depth -= 1;
    if (depth !== 0 || objectStart === -1) {
      continue;
    }

    try {
      parsedObjects.push(JSON.parse(text.slice(objectStart, index + 1)));
    } catch {
      // 설명 속 불완전한 JSON 예시는 건너뛰고 다음 객체를 확인합니다.
    }
    objectStart = -1;
  }

  if (parsedObjects.length === 0) {
    throw new Error("모델 응답에서 JSON 객체를 찾을 수 없습니다.");
  }

  return parsedObjects[parsedObjects.length - 1];
}

module.exports = {
  extractBusinessCard,
  imageToDataUrl,
  parseModelJson
};
