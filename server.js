// ===== 환경설정 및 외부 모듈 =====
require("dotenv").config();

const express = require("express");
const fs = require("fs");
const db = require("./database/db");
const { UPLOAD_DIR, upload } = require("./upload");
const {
  extractBusinessCard,
  verifyCriticalFields,
  imageToDataUrl,
  parseModelJson
} = require("./localAi");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ===== 공통 문자열 및 주소 정규화 =====
function text(value) {
  return String(value || "").trim();
}

function singleLineText(value) {
  return text(value).replace(/\s+/g, " ");
}

const MEETING_PURPOSE_MAX_LENGTH = 50;
const MEETING_NOTE_MAX_LENGTH = 500;

function limitText(value, maxLength) {
  return Array.from(text(value)).slice(0, maxLength).join("");
}

function normalizeAddress(value) {
  const address = singleLineText(value);
  const headOfficeMarker = /(?:^|\s)(?:본사|본점|headquarters|head office|hq)\s*[:：.]?\s*/i;
  const headOfficeMatch = headOfficeMarker.exec(address);

  if (!headOfficeMatch) {
    return address;
  }

  const headOfficeStart = headOfficeMatch.index + headOfficeMatch[0].length;
  const afterHeadOffice = address.slice(headOfficeStart);
  const otherOfficeMarker = /(?:\s*[\/|]\s*|\s+)(?:지사|지점|branch(?: office)?)\s*[:：.]?\s*/i;
  const otherOfficeMatch = otherOfficeMarker.exec(afterHeadOffice);
  const headOfficeAddress = otherOfficeMatch
    ? afterHeadOffice.slice(0, otherOfficeMatch.index)
    : afterHeadOffice;

  return headOfficeAddress.trim();
}

const JOB_TITLES = new Set([
  "사원",
  "주임",
  "책임",
  "선임",
  "수석",
  "대리",
  "과장",
  "차장",
  "부장",
  "이사",
  "상무",
  "전무",
  "대표",
  "팀장",
  "실장",
  "본부장"
]);

function normalizeDepartmentAndPosition(departmentValue, positionValue) {
  const department = text(departmentValue);
  const position = text(positionValue);

  if (position || !/[\/|]/.test(department)) {
    return { department, position };
  }

  const parts = department
    .split(/\s*[\/|]\s*/)
    .map(text)
    .filter(Boolean);
  const titleIndex = parts.findIndex((part) => JOB_TITLES.has(part));

  if (titleIndex === -1 || parts.length < 2) {
    return { department, position };
  }

  const departmentParts = parts.filter((_, index) => index !== titleIndex);

  return {
    department: departmentParts.join(" / "),
    position: parts[titleIndex]
  };
}

function comparableOrganization(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^(?:\(주\)|주식회사)\s*/, "")
    .replace(/\s*(?:주식회사|co\.?[,]?\s*ltd\.?|inc\.?)$/, "")
    .replace(/[\s·.,]/g, "");
}

function clearDuplicateDepartment(card) {
  const company = comparableOrganization(card.company);
  const department = comparableOrganization(card.department);
  const position = comparableOrganization(card.position);

  if (
    department
    && (
      (company && company === department)
      || (position && position === department)
    )
  ) {
    card.department = "";
  }

  return card;
}

// ===== 전화번호 정규화 및 휴대폰·유선전화 분류 =====
function normalizePhone(value) {
  if (!value) return "";

  const original = text(value).replace(/[‐‑‒–—―﹘﹣－]/g, "-");

  if (original.startsWith("+") && !original.startsWith("+82")) {
    return original.replace(/[.\-\s]+/g, " ").trim();
  }

  const digits = original
    .replace(/^\+?82[\s.-]*/, "0")
    .replace(/\D/g, "");

  if (digits.startsWith("010") && digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.startsWith("02") && digits.length === 10) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.startsWith("02") && digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return original;
}

function phoneIdentity(value) {
  const digits = text(value)
    .replace(/[‐‑‒–—―﹘﹣－]/g, "-")
    .replace(/^\+?82[\s.-]*/, "0")
    .replace(/\D/g, "");

  return digits.startsWith("0") ? digits : digits;
}

function isKoreanMobile(value) {
  const digits = text(value)
    .replace(/^\+82/, "0")
    .replace(/\D/g, "");

  return /^010\d{8}$/.test(digits);
}

function normalizePhoneFields(mobileValue, phoneValue) {
  const mobileNumbers = text(mobileValue)
    .split(/\s*\/\s*/)
    .map(normalizePhone)
    .filter(Boolean);
  const phoneNumbers = text(phoneValue)
    .split(/\s*\/\s*/)
    .map(normalizePhone)
    .filter(Boolean);
  const remainingPhoneNumbers = [];

  phoneNumbers.forEach((phoneNumber) => {
    if (isKoreanMobile(phoneNumber)) {
      mobileNumbers.push(phoneNumber);
    } else {
      remainingPhoneNumbers.push(phoneNumber);
    }
  });

  return {
    mobile: [...new Set(mobileNumbers)].join(" / "),
    phone: [...new Set(remainingPhoneNumbers)].join(" / ")
  };
}

// ===== 이메일·홈페이지 정규화 및 명함 데이터 검증 =====
function normalizeWebsite(value) {
  const website = text(value);

  if (!website) return "";
  if (website.startsWith("http://") || website.startsWith("https://")) {
    return website;
  }

  return `https://${website}`;
}

function normalizeEmails(value) {
  return [...new Set(
    text(value)
      .split(/\r?\n/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )].join("\n");
}

function isValidEmail(email) {
  return text(email)
    .split(/\r?\n/)
    .map((address) => address.trim())
    .filter(Boolean)
    .every((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address));
}

function makeCard(body = {}) {
  const phones = normalizePhoneFields(body.mobile, body.phone);
  const organization = normalizeDepartmentAndPosition(
    body.department,
    body.position
  );

  return clearDuplicateDepartment({
    name: text(body.name),
    company: text(body.company),
    department: organization.department,
    position: organization.position,
    mobile: phones.mobile,
    phone: phones.phone,
    email: normalizeEmails(body.email),
    address: normalizeAddress(body.address),
    website: normalizeWebsite(body.website),
    image_path: text(body.image_path || body.imagePath),
    meeting_date: text(body.meeting_date || body.meetingDate),
    meeting_place: singleLineText(body.meeting_place || body.meetingPlace),
    meeting_purpose: limitText(
      singleLineText(body.meeting_purpose || body.meetingPurpose),
      MEETING_PURPOSE_MAX_LENGTH
    ),
    meeting_note: limitText(
      body.meeting_note || body.meetingNote,
      MEETING_NOTE_MAX_LENGTH
    )
  });
}

function validateCard(card) {
  if (!card.name && !card.company && !card.mobile && !card.email) {
    return "name, company, mobile, email 중 하나 이상은 필요합니다.";
  }

  if (!isValidEmail(card.email)) {
    return "이메일 형식이 올바르지 않습니다.";
  }

  return "";
}

function allowDuplicate(body = {}) {
  return body.allowDuplicate === true || body.allowDuplicate === "true";
}

function parseCardIds(value) {
  const requestedIds = Array.isArray(value)
    ? value
    : String(value || "").split(",").filter(Boolean);
  const cardIds = [...new Set(
    requestedIds
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  return cardIds.length > 0 && cardIds.length === requestedIds.length
    ? cardIds
    : [];
}

function selectCardsForExport(req, res, callback) {
  const hasSelection = req.query.ids !== undefined;
  const cardIds = hasSelection ? parseCardIds(req.query.ids) : [];

  if (hasSelection && cardIds.length === 0) {
    res.status(400).json({
      success: false,
      message: "내보낼 명함을 올바르게 선택해 주세요."
    });
    return;
  }

  const whereParts = ["deleted_at IS NULL"];
  if (hasSelection) {
    whereParts.push(`id IN (${cardIds.map(() => "?").join(", ")})`);
  }
  const sql = `
    SELECT *
    FROM business_cards
    WHERE ${whereParts.join(" AND ")}
    ORDER BY created_at DESC
  `;

  db.all(sql, cardIds, callback);
}

// ===== CSV 및 vCard 변환 =====
function csvValue(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function vcardValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function vcardPhoneLines(value, type) {
  return String(value || "")
    .split(/\s*\/\s*/)
    .map((phone) => phone.trim())
    .filter(Boolean)
    .map((phone) => `TEL;TYPE=${type}:${vcardValue(phone)}`);
}

function vcardEmailLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => `EMAIL;TYPE=INTERNET:${vcardValue(email)}`);
}

function createVcard(row) {
  const displayName = row.name || row.company || `명함 ${row.id}`;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${vcardValue(displayName)}`,
    `N:;${vcardValue(row.name)};;;`
  ];

  if (row.company || row.department) {
    lines.push(
      `ORG:${vcardValue(row.company)};${vcardValue(row.department)}`
    );
  }
  if (row.position) lines.push(`TITLE:${vcardValue(row.position)}`);
  lines.push(...vcardPhoneLines(row.mobile, "CELL"));
  lines.push(...vcardPhoneLines(row.phone, "WORK,VOICE"));
  lines.push(...vcardEmailLines(row.email));
  if (row.address) {
    lines.push(`ADR;TYPE=WORK:;;${vcardValue(row.address)};;;;`);
  }
  if (row.website) lines.push(`URL:${vcardValue(row.website)}`);
  lines.push("END:VCARD");

  return lines.join("\r\n");
}

// ===== Local AI 추출 결과 정리 및 비명함 차단 =====
function sanitizeExtractedCard(value = {}) {
  const phones = normalizePhoneFields(value.mobile, value.phone);
  const organization = normalizeDepartmentAndPosition(
    value.department,
    value.position
  );

  return clearDuplicateDepartment({
    name: text(value.name),
    company: text(value.company),
    department: organization.department,
    position: organization.position,
    mobile: phones.mobile,
    phone: phones.phone,
    email: normalizeEmails(value.email),
    address: normalizeAddress(value.address),
    website: normalizeWebsite(value.website)
  });
}

function hasBusinessCardEvidence(card) {
  const hasIdentity = Boolean(card.name || card.company);
  const hasContact = Boolean(
    card.mobile || card.phone || card.email || card.address || card.website
  );

  return hasIdentity && hasContact;
}

function rejectNonBusinessCard(req, res) {
  if (req.file?.path) {
    fs.unlink(req.file.path, (error) => {
      if (error && error.code !== "ENOENT") {
        console.warn("비명함 이미지 삭제 실패:", error.message);
      }
    });
  }

  return res.status(422).json({
    success: false,
    message: "명함 사진이 아닙니다. 명함이 화면에 잘 보이도록 다시 촬영해 주세요."
  });
}

// ===== 중복 명함 조회 =====
function cardsAreDuplicates(card, row) {
  const mobileKeys = new Set(
    text(card.mobile)
      .split(/\s*\/\s*/)
      .map(phoneIdentity)
      .filter(Boolean)
  );
  const rowMobileKeys = text(row.mobile)
    .split(/\s*\/\s*/)
    .map(phoneIdentity)
    .filter(Boolean);
  const sameMobile = [...mobileKeys].some((key) => rowMobileKeys.includes(key));
  const samePerson = card.name && card.company
    && card.name === row.name
    && card.company === row.company;

  return sameMobile || samePerson;
}

function checkDuplicate(card, excludeId, callback) {
  const sql = `
    SELECT *
    FROM business_cards
    WHERE id != ? AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;

  db.all(sql, [excludeId || 0], (error, rows = []) => {
    if (error) return callback(error);

    const duplicates = rows.filter((row) => cardsAreDuplicates(card, row));

    callback(null, duplicates);
  });
}

// ===== SQLite 및 Local AI 연결 상태 확인 =====
function checkSqliteStatus() {
  return new Promise((resolve) => {
    db.get("SELECT 1 AS ok", (error) => resolve(!error));
  });
}

async function checkLocalAiStatus() {
  if (!process.env.AI_SERVER_STATUS_URL) {
    return false;
  }

  try {
    const response = await fetch(process.env.AI_SERVER_STATUS_URL, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

app.get("/api/status", async (req, res) => {
  const [sqlite, localAi] = await Promise.all([
    checkSqliteStatus(),
    checkLocalAiStatus()
  ]);

  res.json({ sqlite, localAi });
});

// ===== 명함 이미지 업로드 및 Local AI 분석 API =====
app.post("/api/cards/extract", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "이미지 파일이 없습니다."
    });
  }

  try {
    const imageDataUrl = imageToDataUrl(req.file);
    const modelResponse = await extractBusinessCard(imageDataUrl);
    const content = modelResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("모델 응답에 추출 결과가 없습니다.");
    }

    const parsed = parseModelJson(content);

    if (parsed.is_business_card !== true) {
      return rejectNonBusinessCard(req, res);
    }

    const extracted = sanitizeExtractedCard(parsed);
    const criticalFields = [
      "name",
      "department",
      "position",
      "email",
      "address",
      "website"
    ];

    if (criticalFields.some((field) => !extracted[field])) {
      try {
        const verificationResponse = await verifyCriticalFields(imageDataUrl);
        const verificationContent = verificationResponse
          .choices?.[0]?.message?.content;

        if (verificationContent) {
          const verified = sanitizeExtractedCard(
            parseModelJson(verificationContent)
          );

          criticalFields.forEach((field) => {
            if (verified[field]) {
              extracted[field] = verified[field];
            }
          });
        }
      } catch (verificationError) {
        console.warn("핵심 필드 재확인 실패:", verificationError.message);
      }
    }

    clearDuplicateDepartment(extracted);

    if (!hasBusinessCardEvidence(extracted)) {
      return rejectNonBusinessCard(req, res);
    }

    res.json({
      success: true,
      message: "명함 분석 완료",
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: `/uploads/${req.file.filename}`,
        size: req.file.size
      },
      extracted
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({
      success: false,
      message: "명함 이미지 분석에 실패했습니다."
    });
  }
});

// ===== 명함 저장 API =====
function saveCard(req, res) {
  const card = makeCard(req.body);
  const validationMessage = validateCard(card);

  if (validationMessage) {
    return res.status(400).json({
      success: false,
      message: validationMessage
    });
  }

  checkDuplicate(card, 0, (error, duplicates) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "중복 확인 실패"
      });
    }

    if (duplicates.length > 0 && !allowDuplicate(req.body)) {
      return res.status(409).json({
        success: false,
        message: "중복 가능성이 있는 명함이 있습니다.",
        duplicates
      });
    }

    const sql = `
      INSERT INTO business_cards (
        name, company, department, position, mobile, phone,
        email, address, website, image_path,
        meeting_date, meeting_place, meeting_purpose, meeting_note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [
      card.name,
      card.company,
      card.department,
      card.position,
      card.mobile,
      card.phone,
      card.email,
      card.address,
      card.website,
      card.image_path,
      card.meeting_date,
      card.meeting_place,
      card.meeting_purpose,
      card.meeting_note
    ], function (error) {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "명함 저장 실패"
        });
      }

      res.status(201).json({
        success: true,
        message: "명함 저장 완료",
        id: this.lastID
      });
    });
  });
}

app.post("/api/cards", saveCard);
app.post("/api/cardStorage", saveCard);

// ===== 명함 데이터 파일 미리보기·일괄 불러오기 =====
function parseImportCards(value, defaultGroupName = "") {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "불러올 명함 데이터를 선택해 주세요." };
  }

  if (value.length > 500) {
    return { error: "한 번에 최대 500장까지 불러올 수 있습니다." };
  }

  const rows = value.map((raw, index) => {
    const card = makeCard(raw);
    const groupName = singleLineText(
      Object.prototype.hasOwnProperty.call(raw || {}, "groupName")
        ? raw.groupName
        : defaultGroupName
    );
    return {
      index,
      card,
      groupName,
      error: validateCard(card) || (groupName.length > 40 ? "그룹 이름은 40자 이내로 입력해 주세요." : "")
    };
  });

  return { rows };
}

app.post("/api/cards/import/preview", (req, res) => {
  const parsed = parseImportCards(req.body?.cards);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }

  db.all("SELECT * FROM business_cards WHERE deleted_at IS NULL ORDER BY created_at DESC", (error, existingCards) => {
    if (error) {
      return res.status(500).json({ success: false, message: "중복 확인에 실패했습니다." });
    }

    const cards = parsed.rows.map(({ index, card, error: validationError }) => {
      const duplicates = validationError
        ? []
        : existingCards.filter((existing) => cardsAreDuplicates(card, existing));
      return {
        index,
        ...card,
        valid: !validationError,
        message: validationError || "",
        duplicateIds: duplicates.map((duplicate) => duplicate.id)
      };
    });

    res.json({ success: true, cards });
  });
});

app.post("/api/cards/import", (req, res) => {
  const defaultGroupName = singleLineText(req.body?.groupName);
  const parsed = parseImportCards(req.body?.cards, defaultGroupName);
  const importDuplicates = req.body?.duplicateAction === "add";
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }
  if (defaultGroupName.length > 40) {
    return res.status(400).json({ success: false, message: "그룹 이름은 40자 이내로 입력해 주세요." });
  }

  db.all("SELECT * FROM business_cards WHERE deleted_at IS NULL ORDER BY created_at DESC", (selectError, existingCards) => {
    if (selectError) {
      return res.status(500).json({ success: false, message: "중복 확인에 실패했습니다." });
    }

    const skipped = [];
    const pendingCards = [];
    const acceptedCards = [];
    parsed.rows.forEach(({ index, card, groupName, error }) => {
      if (error) {
        skipped.push({ index, reason: error });
        return;
      }

      const duplicate = existingCards.some((existing) => cardsAreDuplicates(card, existing))
        || acceptedCards.some((accepted) => cardsAreDuplicates(card, accepted));
      if (duplicate && !importDuplicates) {
        skipped.push({ index, reason: "기존 명함과 중복" });
        return;
      }

      acceptedCards.push(card);
      pendingCards.push({ index, card, groupName });
    });

    if (pendingCards.length === 0) {
      return res.json({ success: true, savedCount: 0, skipped });
    }

    const insertSql = `
      INSERT INTO business_cards (
        name, company, department, position, mobile, phone,
        email, address, website, image_path, group_name,
        meeting_date, meeting_place, meeting_purpose, meeting_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const savedIds = [];
    let cursor = 0;

    db.run("BEGIN TRANSACTION", (beginError) => {
      if (beginError) {
        return res.status(500).json({ success: false, message: "명함 저장을 시작하지 못했습니다." });
      }

      const rollback = () => db.run("ROLLBACK", () => {
        res.status(500).json({ success: false, message: "명함 데이터 불러오기에 실패했습니다." });
      });
      const insertNext = () => {
        if (cursor >= pendingCards.length) {
          return db.run("COMMIT", (commitError) => {
            if (commitError) return rollback();
            res.status(201).json({
              success: true,
              savedCount: savedIds.length,
              savedIds,
              skipped
            });
          });
        }

        const { card, groupName } = pendingCards[cursor];
        cursor += 1;
        db.run(insertSql, [
          card.name, card.company, card.department, card.position,
          card.mobile, card.phone, card.email, card.address,
          card.website, card.image_path, groupName,
          card.meeting_date, card.meeting_place,
          card.meeting_purpose, card.meeting_note
        ], function (insertError) {
          if (insertError) return rollback();
          savedIds.push(this.lastID);
          insertNext();
        });
      };

      insertNext();
    });
  });
});

// ===== 전체 주소록 CSV·vCard 내보내기 API =====
app.get("/api/cards/export/csv", (req, res) => {
  selectCardsForExport(req, res, (error, rows) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "CSV 생성 실패"
      });
    }

    const headers = [
      "id",
      "name",
      "company",
      "department",
      "position",
      "mobile",
      "phone",
      "email",
      "address",
      "website"
    ];
    const csvRows = rows.map((row) => {
      return headers.map((header) => csvValue(row[header])).join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=business_cards.csv");
    res.send(`\uFEFF${csv}`);
  });
});

app.get("/api/cards/export/vcard", (req, res) => {
  selectCardsForExport(req, res, (error, rows) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "vCard 생성 실패"
      });
    }

    const vcard = rows.map(createVcard).join("\r\n");

    res.setHeader("Content-Type", "text/vcard; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=business_cards.vcf");
    res.send(vcard);
  });
});

// ===== 중복 후보 조회 API =====
app.get("/api/cards/duplicates", (req, res) => {
  const card = makeCard(req.query);
  const excludeId = Number(req.query.excludeId || 0);

  checkDuplicate(card, excludeId, (error, duplicates) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "중복 확인 실패"
      });
    }

    res.json({
      success: true,
      duplicates
    });
  });
});

// ===== 명함 목록 및 검색 API =====
app.get("/api/cards", (req, res) => {
  const keyword = String(req.query.q || req.query.keyword || "").trim();
  const trashOnly = req.query.trash === "1";
  let sql = "SELECT * FROM business_cards";
  const params = [];
  const whereParts = [trashOnly ? "deleted_at IS NOT NULL" : "deleted_at IS NULL"];

  if (keyword) {
    whereParts.push("(name LIKE ? OR company LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  sql += ` WHERE ${whereParts.join(" AND ")}`;
  sql += " ORDER BY created_at DESC";

  db.all(sql, params, (error, rows) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "명함 목록 조회 실패"
      });
    }

    res.json({
      success: true,
      cards: rows
    });
  });
});

app.get("/api/cardSelect", (req, res) => {
  db.all("SELECT * FROM business_cards WHERE deleted_at IS NULL ORDER BY created_at DESC", (error, rows) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "명함 목록 조회 실패"
      });
    }

    res.json({
      success: true,
      cards: rows
    });
  });
});

// ===== 선택 명함 그룹 지정·일괄 삭제 API =====
app.get("/api/cards/groups", (req, res) => {
  db.all(
    "SELECT DISTINCT group_name FROM business_cards WHERE deleted_at IS NULL AND TRIM(COALESCE(group_name, '')) <> '' ORDER BY group_name COLLATE NOCASE",
    (error, rows) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "그룹 목록 조회 실패"
        });
      }

      res.json({
        success: true,
        groups: rows.map((row) => row.group_name)
      });
    }
  );
});

app.patch("/api/cards/groups", (req, res) => {
  const cardIds = parseCardIds(req.body.cardIds);
  const groupName = singleLineText(req.body.groupName);

  if (
    cardIds.length === 0 ||
    typeof req.body.groupName !== "string" ||
    groupName.length > 40
  ) {
    return res.status(400).json({
      success: false,
      message: "명함과 40자 이내의 그룹 이름을 확인해 주세요."
    });
  }

  const placeholders = cardIds.map(() => "?").join(", ");
  db.run(
    `UPDATE business_cards SET group_name = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    [groupName, ...cardIds],
    function (error) {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "그룹 지정에 실패했습니다."
        });
      }

      if (this.changes !== cardIds.length) {
        return res.status(404).json({
          success: false,
          message: "선택한 명함 일부를 찾을 수 없습니다."
        });
      }

      res.json({
        success: true,
        message: groupName ? "그룹 지정 완료" : "그룹 해제 완료",
        updatedCount: this.changes
      });
    }
  );
});

app.post("/api/cards/bulk-delete", (req, res) => {
  const cardIds = parseCardIds(req.body.cardIds);

  if (cardIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "삭제할 명함을 올바르게 선택해 주세요."
    });
  }

  const placeholders = cardIds.map(() => "?").join(", ");
  db.run(
    `UPDATE business_cards SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    cardIds,
    function (error) {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "선택한 명함을 휴지통으로 옮기지 못했습니다."
        });
      }

      if (this.changes !== cardIds.length) {
        return res.status(404).json({
          success: false,
          message: "선택한 명함 일부를 찾을 수 없습니다."
        });
      }

      res.json({
        success: true,
        message: "선택한 명함을 휴지통으로 옮겼습니다.",
        deletedCount: this.changes
      });
    }
  );
});

// ===== 명함 단건 조회·수정 API =====
app.get("/api/cards/:id", (req, res) => {
  db.get("SELECT * FROM business_cards WHERE id = ? AND deleted_at IS NULL", [req.params.id], (error, row) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "명함 조회 실패"
      });
    }

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "명함을 찾을 수 없습니다."
      });
    }

    res.json({
      success: true,
      card: row
    });
  });
});

app.put("/api/cards/:id", (req, res) => {
  const card = makeCard(req.body);
  const validationMessage = validateCard(card);

  if (validationMessage) {
    return res.status(400).json({
      success: false,
      message: validationMessage
    });
  }

  checkDuplicate(card, Number(req.params.id), (error, duplicates) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "중복 확인 실패"
      });
    }

    if (duplicates.length > 0 && !allowDuplicate(req.body)) {
      return res.status(409).json({
        success: false,
        message: "중복 가능성이 있는 명함이 있습니다.",
        duplicates
      });
    }

    const sql = `
      UPDATE business_cards
      SET name = ?,
          company = ?,
          department = ?,
          position = ?,
          mobile = ?,
          phone = ?,
          email = ?,
          address = ?,
          website = ?,
          image_path = ?,
          meeting_date = ?,
          meeting_place = ?,
          meeting_purpose = ?,
          meeting_note = ?
      WHERE id = ? AND deleted_at IS NULL
    `;

    db.run(sql, [
      card.name,
      card.company,
      card.department,
      card.position,
      card.mobile,
      card.phone,
      card.email,
      card.address,
      card.website,
      card.image_path,
      card.meeting_date,
      card.meeting_place,
      card.meeting_purpose,
      card.meeting_note,
      req.params.id
    ], function (error) {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "명함 수정 실패"
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: "수정할 명함을 찾을 수 없습니다."
        });
      }

      res.json({
        success: true,
        message: "명함 수정 완료"
      });
    });
  });
});

// ===== 명함 즐겨찾기 토글 API =====
app.patch("/api/cards/:id/favorite", (req, res) => {
  if (typeof req.body.isFavorite !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "즐겨찾기 상태를 확인해 주세요."
    });
  }

  const isFavorite = req.body.isFavorite ? 1 : 0;
  db.run(
    "UPDATE business_cards SET is_favorite = ? WHERE id = ? AND deleted_at IS NULL",
    [isFavorite, req.params.id],
    function (error) {
      if (error) {
        return res.status(500).json({
          success: false,
          message: "즐겨찾기 변경에 실패했습니다."
        });
      }

      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: "즐겨찾기를 변경할 명함을 찾을 수 없습니다."
        });
      }

      res.json({
        success: true,
        is_favorite: isFavorite
      });
    }
  );
});

// ===== 중복 명함 그룹 병합 API =====
app.post("/api/cards/merge-group", (req, res) => {
  const requestedIds = Array.isArray(req.body.cardIds) ? req.body.cardIds : [];
  const cardIds = [...new Set(
    requestedIds
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (cardIds.length < 2 || cardIds.length !== requestedIds.length) {
    return res.status(400).json({
      success: false,
      message: "병합할 명함을 두 장 이상 올바르게 선택해 주세요."
    });
  }

  const placeholders = cardIds.map(() => "?").join(", ");
  const selectSql = `
    SELECT *
    FROM business_cards
    WHERE id IN (${placeholders}) AND deleted_at IS NULL
    ORDER BY datetime(created_at) DESC, id DESC
  `;

  db.all(selectSql, cardIds, (selectError, cards) => {
    if (selectError) {
      return res.status(500).json({
        success: false,
        message: "병합할 명함 조회에 실패했습니다."
      });
    }

    if (cards.length !== cardIds.length) {
      return res.status(404).json({
        success: false,
        message: "병합할 명함 일부를 찾을 수 없습니다."
      });
    }

    const representative = cards[0];
    const duplicateIds = cards.slice(1).map((card) => card.id);
    const mergeFields = [
      "name",
      "company",
      "department",
      "position",
      "mobile",
      "phone",
      "email",
      "address",
      "website",
      "image_path",
      "meeting_date",
      "meeting_place",
      "meeting_purpose",
      "meeting_note"
    ];
    const mergedCard = Object.fromEntries(
      mergeFields.map((field) => {
        const source = cards.find((card) => text(card[field]));
        return [field, source ? text(source[field]) : ""];
      })
    );
    const updateSql = `
      UPDATE business_cards
      SET name = ?,
          company = ?,
          department = ?,
          position = ?,
          mobile = ?,
          phone = ?,
          email = ?,
          address = ?,
          website = ?,
          image_path = ?,
          meeting_date = ?,
          meeting_place = ?,
          meeting_purpose = ?,
          meeting_note = ?
      WHERE id = ?
    `;
    const deletePlaceholders = duplicateIds.map(() => "?").join(", ");

    const rollback = (message) => {
      db.run("ROLLBACK", () => {
        res.status(500).json({ success: false, message });
      });
    };

    db.serialize(() => {
      db.run("BEGIN TRANSACTION", (beginError) => {
        if (beginError) {
          return res.status(500).json({
            success: false,
            message: "명함 병합을 시작하지 못했습니다."
          });
        }

        db.run(updateSql, [
          mergedCard.name,
          mergedCard.company,
          mergedCard.department,
          mergedCard.position,
          mergedCard.mobile,
          mergedCard.phone,
          mergedCard.email,
          mergedCard.address,
          mergedCard.website,
          mergedCard.image_path,
          mergedCard.meeting_date,
          mergedCard.meeting_place,
          mergedCard.meeting_purpose,
          mergedCard.meeting_note,
          representative.id
        ], (updateError) => {
          if (updateError) {
            return rollback("대표 명함 갱신에 실패했습니다.");
          }

          db.run(
            `DELETE FROM business_cards WHERE id IN (${deletePlaceholders})`,
            duplicateIds,
            function (deleteError) {
              if (deleteError || this.changes !== duplicateIds.length) {
                return rollback("중복 명함 삭제에 실패했습니다.");
              }

              db.run("COMMIT", (commitError) => {
                if (commitError) {
                  return rollback("명함 병합 완료 처리에 실패했습니다.");
                }

                res.json({
                  success: true,
                  message: "중복 명함 병합 완료",
                  representativeId: representative.id,
                  deletedCount: duplicateIds.length
                });
              });
            }
          );
        });
      });
    });
  });
});

// ===== 명함 단건 병합 및 삭제 API =====
app.post("/api/cards/:id/merge", (req, res) => {
  db.get("SELECT * FROM business_cards WHERE id = ? AND deleted_at IS NULL", [req.params.id], (error, oldCard) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "명함 조회 실패"
      });
    }

    if (!oldCard) {
      return res.status(404).json({
        success: false,
        message: "병합할 명함을 찾을 수 없습니다."
      });
    }

    const newCard = makeCard(req.body);
    const mergedCard = {
      name: newCard.name || oldCard.name || "",
      company: newCard.company || oldCard.company || "",
      department: newCard.department || oldCard.department || "",
      position: newCard.position || oldCard.position || "",
      mobile: newCard.mobile || oldCard.mobile || "",
      phone: newCard.phone || oldCard.phone || "",
      email: newCard.email || oldCard.email || "",
      address: newCard.address || oldCard.address || "",
      website: newCard.website || oldCard.website || "",
      image_path: newCard.image_path || oldCard.image_path || "",
      meeting_date: newCard.meeting_date || oldCard.meeting_date || "",
      meeting_place: newCard.meeting_place || oldCard.meeting_place || "",
      meeting_purpose: newCard.meeting_purpose || oldCard.meeting_purpose || "",
      meeting_note: newCard.meeting_note || oldCard.meeting_note || ""
    };
    const sql = `
      UPDATE business_cards
      SET name = ?,
          company = ?,
          department = ?,
          position = ?,
          mobile = ?,
          phone = ?,
          email = ?,
          address = ?,
          website = ?,
          image_path = ?,
          meeting_date = ?,
          meeting_place = ?,
          meeting_purpose = ?,
          meeting_note = ?
      WHERE id = ? AND deleted_at IS NULL
    `;

    db.run(sql, [
      mergedCard.name,
      mergedCard.company,
      mergedCard.department,
      mergedCard.position,
      mergedCard.mobile,
      mergedCard.phone,
      mergedCard.email,
      mergedCard.address,
      mergedCard.website,
      mergedCard.image_path,
      mergedCard.meeting_date,
      mergedCard.meeting_place,
      mergedCard.meeting_purpose,
      mergedCard.meeting_note,
      req.params.id
    ], (updateError) => {
      if (updateError) {
        return res.status(500).json({
          success: false,
          message: "명함 병합 실패"
        });
      }

      res.json({
        success: true,
        message: "명함 병합 완료"
      });
    });
  });
});

app.post("/api/cards/bulk-restore", (req, res) => {
  const cardIds = parseCardIds(req.body.cardIds);
  if (cardIds.length === 0) {
    return res.status(400).json({ success: false, message: "복원할 명함을 올바르게 선택해 주세요." });
  }

  const placeholders = cardIds.map(() => "?").join(", ");
  db.run(
    `UPDATE business_cards SET deleted_at = NULL WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
    cardIds,
    function (error) {
      if (error) return res.status(500).json({ success: false, message: "명함 복원에 실패했습니다." });
      if (this.changes !== cardIds.length) return res.status(404).json({ success: false, message: "복원할 명함 일부를 찾을 수 없습니다." });
      res.json({ success: true, restoredCount: this.changes, message: "명함을 복원했습니다." });
    }
  );
});

app.post("/api/cards/bulk-permanent-delete", (req, res) => {
  const cardIds = parseCardIds(req.body.cardIds);
  if (cardIds.length === 0) {
    return res.status(400).json({ success: false, message: "영구 삭제할 명함을 올바르게 선택해 주세요." });
  }

  const placeholders = cardIds.map(() => "?").join(", ");
  db.run(
    `DELETE FROM business_cards WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
    cardIds,
    function (error) {
      if (error) return res.status(500).json({ success: false, message: "명함 영구 삭제에 실패했습니다." });
      if (this.changes !== cardIds.length) return res.status(404).json({ success: false, message: "영구 삭제할 명함 일부를 찾을 수 없습니다." });
      res.json({ success: true, deletedCount: this.changes, message: "명함을 영구 삭제했습니다." });
    }
  );
});

app.patch("/api/cards/:id/restore", (req, res) => {
  db.run("UPDATE business_cards SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL", [req.params.id], function (error) {
    if (error) return res.status(500).json({ success: false, message: "명함 복원에 실패했습니다." });
    if (this.changes === 0) return res.status(404).json({ success: false, message: "복원할 명함을 찾을 수 없습니다." });
    res.json({ success: true, message: "명함을 복원했습니다." });
  });
});

app.delete("/api/cards/:id/permanent", (req, res) => {
  db.run("DELETE FROM business_cards WHERE id = ? AND deleted_at IS NOT NULL", [req.params.id], function (error) {
    if (error) return res.status(500).json({ success: false, message: "명함 영구 삭제에 실패했습니다." });
    if (this.changes === 0) return res.status(404).json({ success: false, message: "영구 삭제할 명함을 찾을 수 없습니다." });
    res.json({ success: true, message: "명함을 영구 삭제했습니다." });
  });
});

app.delete("/api/cards/:id", (req, res) => {
  db.run("UPDATE business_cards SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL", [req.params.id], function (error) {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "명함을 휴지통으로 옮기지 못했습니다."
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "휴지통으로 옮길 명함을 찾을 수 없습니다."
      });
    }

    res.json({
      success: true,
      message: "명함을 휴지통으로 옮겼습니다."
    });
  });
});

// ===== 정적 파일 제공·오류 처리·서버 실행 =====
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static("public"));

app.use((error, req, res, next) => {
  console.error(error.message);
  res.status(500).json({
    success: false,
    message: error.message || "서버 오류가 발생했습니다."
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error(`Server failed: ${error.message}`);
});
