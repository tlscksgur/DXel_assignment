const fs = require("fs");

const systemPrompt = `
You are a specialist that accurately extracts contact information from business card images.

Extract only text that is actually visible in the image.
Use an empty string ("") only when a field is absent or genuinely unreadable after careful inspection. Small but readable text must not be left empty.
Never guess text that cannot actually be read.
Return exactly one valid JSON object with no explanation, markdown code block, or additional text.

First decide whether the image clearly contains a business card or contact card.
Set is_business_card to true only when the image shows a card designed to identify a person or company and contains readable contact information such as a phone number, email address, physical address, or website.
A company-only card without a person's name is still a business card when a company name and contact information are visibly printed.
Set is_business_card to false for an ordinary photo, scenery, product, receipt, poster, document, screenshot, blank image, or any non-business-card image. Do not classify an image as a business card merely because it contains incidental text.
When is_business_card is false, return an empty string for every contact field.

Follow these rules:

1. If the business card is rotated, interpret the text in its correct upright orientation.
2. Recognize Korean and English text and preserve every character exactly as printed.
3. Silently inspect the entire card twice before returning the result. On the first pass, scan the top, middle, and bottom areas in order. On the second pass, verify that every readable contact line has been assigned to a field or intentionally excluded as fax or unrelated partner text.
4. Read the person's name character by character. Pay special attention to visually similar Hangul syllables and final consonants. Do not infer or correct a name from the email address, common names, or context. If even one name character is genuinely unreadable, return an empty string for name instead of substituting a similar-looking character.
5. Preserve company suffixes such as (주), 주식회사, Co., Ltd., and Inc.
6. Extract an organization or team name into department. Text ending in 팀, 부, 실, 센터, 본부, 연구소, 사업부, or Division is usually a department. Never copy the company name into department; when no separate department is printed, return an empty string for department. For example, in "융합보안팀 | 책임", department is "융합보안팀". In "수석/기업부설연구소", department is "기업부설연구소".
7. Extract a printed job title into position. Check Korean titles such as 사원, 주임, 책임, 선임, 수석, 수석연구원, 대리, 과장, 차장, 부장, 이사, 상무, 전무, 대표, 팀장, 실장, and 본부장. For example, in "융합보안팀 | 책임", position is "책임". In "수석/기업부설연구소", position is "수석" and department is "기업부설연구소". Never return the same text in both department and position. If only "수석연구원" is printed, put it in position only and leave department empty. Do not put a job title into department or a department name into position, even when they are printed on the same line separated by / or |.
8. Extract text labeled E, Email, E-mail, or E-Mail, or printed next to an envelope icon, into email. Carefully inspect small text near phone numbers and the bottom of the card.
9. Extract text labeled A, Address, or 주소, or printed next to a location-pin icon, into address. Also extract an unlabeled line that clearly begins with a postal code or geographic address.
10. Extract a printed domain labeled W or W., Web, Website, Homepage, or URL, printed next to a globe icon, beginning with http://, https://, or www, or shown as a bare printed domain such as 3ds.com into website. For example, "W. daejoheavy.com" means website is "daejoheavy.com". A domain appearing only inside an email address is not a printed website; do not invent a website from the email domain.
11. Preserve the leading + sign and country code in telephone numbers.
12. Keep the structure of international numbers. For example, do not turn +82 2 6410 2800 into 822-6410-2800.
13. Classify numbers labeled TEL, T, Phone, Switchboard, Direct, or Office, or printed next to a telephone or desk-phone icon, as phone.
14. Classify numbers labeled MOBILE, M, H.P, or CELL, or printed next to a mobile-phone icon, as mobile.
15. Do not place numbers labeled FAX or F into mobile or phone. Omit fax numbers because fax is not an output field.
16. If multiple numbers belong to the same field, include all of them separated by " / ".
17. Lines belonging to the same physical address are one address. Treat a line break as visual formatting and concatenate those lines with a single space. Do not insert " / " between a street address and its building, floor, suite, or unit line.
18. When both a headquarters address and a branch address are printed, extract only the headquarters address. Prefer labels such as 본사, 본점, Headquarters, Head Office, or HQ over 지사, 지점, or Branch. Do not include the location label itself in address. If there is no headquarters address, extract the single printed office address normally.
19. For a company-only card or the back side of a card with no person's name, return an empty string for name.
20. Never invent an email address or website that is not printed on the card.
21. Preserve postal codes, floor numbers, suite or unit numbers, and country names in addresses.
22. Do not place the same telephone number in more than one field.
23. Do not classify a fax number as a general telephone number.

Before returning the JSON, perform this final field check:
- If a readable title such as 대리 is printed next to the person's name, position must contain it.
- If a readable E-mail or E-Mail label and value are printed, email must contain the complete printed value.
- If a readable W or W. label, globe icon, URL prefix, www address, or bare printed domain is present, website must contain that complete printed domain.
- If a readable line begins with a five-digit postal code, or contains an administrative area and street/building information, address must contain the entire physical-address line. A line such as "31791, 충청남도 당진시 ..." is an address even when no A or Address label is printed.
- Do not return any of these fields as empty merely because its text is smaller than the name or company text.

Use exactly this JSON structure and no additional fields:

{
  "is_business_card": true,
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

const businessCardResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "business_card_contact",
    strict: true,
    schema: {
      type: "object",
      properties: {
        is_business_card: { type: "boolean" },
        name: { type: "string" },
        company: { type: "string" },
        department: { type: "string" },
        position: { type: "string" },
        mobile: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        address: { type: "string" },
        website: { type: "string" }
      },
      required: [
        "is_business_card",
        "name",
        "company",
        "department",
        "position",
        "mobile",
        "phone",
        "email",
        "address",
        "website"
      ],
      additionalProperties: false
    }
  }
};

const criticalFieldResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "critical_business_card_fields",
    strict: true,
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        department: { type: "string" },
        position: { type: "string" },
        email: { type: "string" },
        address: { type: "string" },
        website: { type: "string" }
      },
      required: [
        "name",
        "department",
        "position",
        "email",
        "address",
        "website"
      ],
      additionalProperties: false
    }
  }
};

async function requestChatCompletion(body) {
  const response = await fetch(process.env.LM_STUDIO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`LM Studio 요청 실패: ${response.status}`);
  }

  return response.json();
}

async function extractBusinessCard(imageDataUrl) {
  return requestChatCompletion({
    model: process.env.LM_STUDIO_MODEL,
    temperature: 0,
    reasoning_effort: "low",
    max_tokens: 768,
    response_format: businessCardResponseFormat,
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
            text: "먼저 이 이미지가 명함인지 판정하세요. 명함이면 보이는 정보만 추출하고, 명함이 아니면 is_business_card를 false로 반환하세요."
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
  });
}

async function verifyCriticalFields(imageDataUrl) {
  return requestChatCompletion({
    model: process.env.LM_STUDIO_MODEL,
    temperature: 0,
    reasoning_effort: "none",
    max_tokens: 384,
    response_format: criticalFieldResponseFormat,
    messages: [
      {
        role: "system",
        content: `Verify six critical fields from the business card image.
Copy only clearly visible text and preserve every character exactly.
Read the Korean name character by character.
The department field must contain only an organization or team name. Text ending in 팀, 부, 실, 센터, 본부, 연구소, 사업부, or Division usually belongs in department. Never repeat the company name in department; if no separate department is visible, return an empty string for department. In "융합보안팀 | 책임", department is "융합보안팀".
The position field must contain only a job rank or title such as 수석, 수석연구원, or 대리 and must not contain department or team text. Never return the same text in both department and position. If only "수석연구원" is printed, put it in position only and leave department empty. In "수석/기업부설연구소", position is "수석" and department is "기업부설연구소". Split title and department even when they share one line separated by / or |.
Copy the complete value labeled E-mail or E-Mail, or printed next to an envelope icon, into email.
Copy the entire physical address labeled A or printed next to a location-pin icon, including any five-digit postal code, administrative area, street, building, floor, or unit. When both a headquarters address and a branch address are printed, return only the headquarters address and omit the location label itself.
Copy the complete domain labeled W or W., printed next to a globe icon, beginning with http://, https://, or www, or shown as a bare printed domain such as 3ds.com into website. Do not derive it from an email address unless the domain is separately printed on the card.
Return an empty string only when the field is truly absent.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Recheck name, department, position, email, address, and website. Inspect the name area, every bottom line, and all contact icons."
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
  });
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
  verifyCriticalFields,
  imageToDataUrl,
  parseModelJson
};
