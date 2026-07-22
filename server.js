const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("./database/db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use(express.json());

async function extarctBusinessCard(imageDataUrl) {
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
  if(!response.ok) {
    throw new Error(`LM Studio 요청 실패: ${response.status}`);
  }
  return response.json();
}

function normalizePhone(value) {
  if (!value) return "";

  const digits = String(value)
    .trim()
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

  return String(value).trim();
}

function normalizeWebsite(value) {
  if (!value) return "";

  const website = String(value).trim();

  if (!website) return "";
  if (website.startsWith("http://") || website.startsWith("https://")) return website;

  return `https://${website}`;
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function makeCard(body) {
  return {
    name: String(body.name || "").trim(),
    company: String(body.company || "").trim(),
    department: String(body.department || "").trim(),
    position: String(body.position || "").trim(),
    mobile: normalizePhone(body.mobile),
    phone: normalizePhone(body.phone),
    email: String(body.email || "").trim().toLowerCase(),
    address: String(body.address || "").trim(),
    website: normalizeWebsite(body.website),
    image_path: String(body.image_path || body.imagePath || "").trim()
  };
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

function allowDuplicate(body) {
  return body.allowDuplicate === true || body.allowDuplicate === "true";
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

function csvValue(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function imageToDataUrl() {
  const base64 = fs.readFileSync(file.path).toString("base64");
  return `data:${file.mimetype};base64,${base64}`
}

function parseModelJson(content) {
  const cleaned = String(content || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/\s*```$/, "")
    .trim();

  return JSON.parse(cleaned);
}

function sanitizeExtractedCard(value = {}) {
  return {
    name: String(value.name || "").trim(),
    company: String(value.company || "").trim(),
    department: String(value.department || "").trim(),
    position: String(value.position || "").trim(),
    mobile: normalizePhone(value.mobile),
    phone: normalizePhone(value.phone),
    email: String(value.email || "").trim().toLowerCase(),
    address: String(value.address || "").trim(),
    website: normalizeWebsite(value.website)
  };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }

    cb(new Error("이미지 파일만 업로드할 수 있습니다."));
  }
});

app.get("/api/status", (req, res) => {
  db.get("SELECT 1 AS ok", (err) => {
    res.json({
      sqlite: !err,
      localAi: false
    });
  });
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
    const extracted = sanitizeExtractedCard(parsed);

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

  checkDuplicate(card, 0, (err, duplicates) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "중복 확인 실패"
      });
    }

    if (duplicates.length > 0 && !allowDuplicate(req.body)) {
      return res.status(409).json({
        success: false,
        message: "중복 가능성이 있는 명함이 있습니다.",
        duplicates: duplicates
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
    ], function (err) {
      if (err) {
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

  db.all(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "CSV 생성 실패"
      });
    }

    const headers = [
      "id", "name", "company", "department", "position", "mobile", "phone",
      "email", "address", "website", "image_path", "created_at"
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

  checkDuplicate(card, excludeId, (err, duplicates) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "중복 확인 실패"
      });
    }

    res.json({
      success: true,
      duplicates: duplicates
    });
  });
});

app.get("/api/cards", (req, res) => {
  const keyword = String(req.query.q || req.query.keyword || "").trim();

  let sql = `
    SELECT *
    FROM business_cards
  `;
  const params = [];

  if (keyword) {
    sql += " WHERE name LIKE ? OR company LIKE ?";
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  sql += " ORDER BY created_at DESC";

  db.all(sql, params, (err, rows) => {
    if (err) {
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
  db.all("SELECT * FROM business_cards ORDER BY created_at DESC", (err, rows) => {
    if (err) {
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
  db.get("SELECT * FROM business_cards WHERE id = ?", [req.params.id], (err, row) => {
    if (err) {
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

  checkDuplicate(card, Number(req.params.id), (err, duplicates) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "중복 확인 실패"
      });
    }

    if (duplicates.length > 0 && !allowDuplicate(req.body)) {
      return res.status(409).json({
        success: false,
        message: "중복 가능성이 있는 명함이 있습니다.",
        duplicates: duplicates
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
    ], function (err) {
      if (err) {
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

app.post("/api/cards/:id/merge", (req, res) => {
  db.get("SELECT * FROM business_cards WHERE id = ?", [req.params.id], (err, oldCard) => {
    if (err) {
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
    ], (err) => {
      if (err) {
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
  db.run("DELETE FROM business_cards WHERE id = ?", [req.params.id], function (err) {
    if (err) {
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

app.use((err, req, res, next) => {
  console.error(err.message);

  res.status(500).json({
    success: false,
    message: err.message || "서버 오류가 발생했습니다."
  });
});

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  console.error(`Server failed: ${err.message}`);
});
