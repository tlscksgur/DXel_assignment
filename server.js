const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("./database/db");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

function checkSqlite() {
  return new Promise((resolve) => {
    db.get("SELECT 1 AS ok", (err) => {
      resolve(!err);
    });
  });
}

async function checkLocalAi() {
  const statusUrl = process.env.LOCAL_AI_STATUS_URL;

  if (!statusUrl) {
    return false;
  }

  try {
    const url = new URL(statusUrl);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (!isLocalhost) {
      return false;
    }

    const response = await fetch(statusUrl, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch (err) {
    return false;
  }
}

app.get("/api/status", async (req, res) => {
  const [sqlite, localAi] = await Promise.all([
    checkSqlite(),
    checkLocalAi()
  ]);

  res.json({
    localAi,
    sqlite
  });
});


app.post("/api/cardStorage", (req, res) => {
  const {
    name,
    company,
    department,
    position,
    mobile,
    phone,
    fax,
    email,
    address,
    website,
    other_text
  } = req.body;

  const sql = `
    INSERT INTO business_cards (
      name, company, department, position, mobile, phone, fax, email, address, website, other_text
    )
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(
    sql, [
      name || "",
      company || "",
      department || "",
      position || "",
      mobile || "",
      phone || "",
      fax || "",
      email || "",
      address || "",
      website || "",
      other_text || ""
    ],
    function (err) {
      if(err){
        console.error(err.message)

        return res.status(500).json({
          success: false,
          message: "명함 저장 실패"
        });

        res.status(201).json({
          success: true,
          message: "명함 저장 완료",
          id: this.lastID
        });
        
      }
    }
  )
  
})

app.get("/api/cardSelect", (req, res) => {
  const sql = "select * from businness_cards order by created_at desc";

  db.all(sql, (err, rows) => {
    if(err) {
      console.error(err.message);

      return res.status(500).json({
        success: false,
        message: "명함 목록 조회 실패"
      });

      res.json({
        success: true,
        cards: rows
      })
      
    }
  })
  
})

app.use(express.static("public"));


app.listen(PORT, (err) => {
  if (err) {
    console.error(`Server failed: ${err.message}`);
    return;
  }
  
  console.log(`Server running at http://localhost:${PORT}`);
})


// app.get("/", (req, res) => {
//   res.send("Business Card Backend Server");
// })