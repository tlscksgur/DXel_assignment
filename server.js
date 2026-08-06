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

function text(value) {
  return String(value || "").trim();
}

function singleLineText(value) {
  return text(value).replace(/\s+/g, " ");
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

function normalizePhone(value) {
  if (!value) return "";

  const original = text(value);

  if (original.startsWith("+") && !original.startsWith("+82")) {
    return original.replace(/\s+/g, " ");
  }

  const digits = original
    .replace(/^\+82/, "0")
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

function normalizeWebsite(value) {
  const website = text(value);

  if (!website) return "";
  if (website.startsWith("http://") || website.startsWith("https://")) {
    return website;
  }

  return `https://${website}`;
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    email: text(body.email).toLowerCase(),
    address: normalizeAddress(body.address),
    website: normalizeWebsite(body.website),
    image_path: text(body.image_path || body.imagePath)
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

function csvValue(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

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
    email: text(value.email).toLowerCase(),
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

function checkDuplicate(card, excludeId, callback) {
  const sql = `
    SELECT *
    FROM business_cards
    WHERE id != ?
      AND (
        (? != '' AND mobile = ?)
        OR
        (? != '' AND ? != '' AND name = ? AND company = ?)
      )
    ORDER BY created_at DESC
  `;

  db.all(sql, [
    excludeId || 0,
    card.mobile,
    card.mobile,
    card.name,
    card.company,
    card.name,
    card.company
  ], callback);
}

function checkSqliteStatus() {
  return new Promise((resolve) => {
    db.get("SELECT 1 AS ok", (error) => resolve(!error));
  });
}

async function checkLocalAiStatus() {
  if (!process.env.LM_STUDIO_STATUS_URL) {
    return false;
  }

  try {
    const response = await fetch(process.env.LM_STUDIO_STATUS_URL, {
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
        email, address, website, image_path
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      card.image_path
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

app.get("/api/cards/export/csv", (req, res) => {
  const sql = `
    SELECT *
    FROM business_cards
    ORDER BY created_at DESC
  `;

  db.all(sql, (error, rows) => {
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

app.get("/api/cards", (req, res) => {
  const keyword = String(req.query.q || req.query.keyword || "").trim();
  let sql = "SELECT * FROM business_cards";
  const params = [];

  if (keyword) {
    sql += " WHERE name LIKE ? OR company LIKE ?";
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

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
  db.all("SELECT * FROM business_cards ORDER BY created_at DESC", (error, rows) => {
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

app.get("/api/cards/:id", (req, res) => {
  db.get("SELECT * FROM business_cards WHERE id = ?", [req.params.id], (error, row) => {
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
          image_path = ?
      WHERE id = ?
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
    WHERE id IN (${placeholders})
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
      "image_path"
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
          image_path = ?
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

app.post("/api/cards/:id/merge", (req, res) => {
  db.get("SELECT * FROM business_cards WHERE id = ?", [req.params.id], (error, oldCard) => {
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
      image_path: newCard.image_path || oldCard.image_path || ""
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
          image_path = ?
      WHERE id = ?
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

app.delete("/api/cards/:id", (req, res) => {
  db.run("DELETE FROM business_cards WHERE id = ?", [req.params.id], function (error) {
    if (error) {
      return res.status(500).json({
        success: false,
        message: "명함 삭제 실패"
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 명함을 찾을 수 없습니다."
      });
    }

    res.json({
      success: true,
      message: "명함 삭제 완료"
    });
  });
});

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
