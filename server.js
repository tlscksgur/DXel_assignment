const express = require("express");
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

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send("Business Card Backend Server");
})

app.listen(PORT, (err) => {
  if (err) {
    console.error(`Server failed: ${err.message}`);
    return;
  }

  console.log(`Server running at http://localhost:${PORT}`);
})
