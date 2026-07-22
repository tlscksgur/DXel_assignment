const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const { test } = require("node:test");

const projectRoot = path.join(__dirname, "..");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("서버 시작 시간 초과")), 5000);
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("Server running")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr.on("data", (chunk) => {
      output += chunk;
    });

    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`서버가 일찍 종료되었습니다 (${code}): ${output}`));
    });
  });
}

test("업로드한 이미지를 LM Studio에 전달하고 정규화된 필드를 반환한다", async () => {
  let uploadedFilePath = "";
  const mockLmStudio = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body);
      const imageUrl = request.messages[1].content[1].image_url.url;

      assert.match(imageUrl, /^data:image\/png;base64,/);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        choices: [{
          message: {
            content: `명함 정보를 분석했습니다.
</think>

\`\`\`json
${JSON.stringify({
  name: "홍길동",
  company: "예시회사",
  mobile: "+82 10-1234-5678",
  email: "HONG@EXAMPLE.COM",
  website: "example.com"
})}
\`\`\``
          }
        }]
      }));
    });
  });

  const lmPort = await listen(mockLmStudio);
  const probeServer = http.createServer();
  const appPort = await listen(probeServer);
  await close(probeServer);

  const app = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(appPort),
      LM_STUDIO_ENDPOINT: `http://127.0.0.1:${lmPort}/v1/chat/completions`,
      LM_STUDIO_MODEL: "test-vision-model"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(app);

    const form = new FormData();
    form.append("image", new Blob([Buffer.from("fake-png")], {
      type: "image/png"
    }), "card.png");

    const response = await fetch(`http://127.0.0.1:${appPort}/api/cards/extract`, {
      method: "POST",
      body: form
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.extracted.name, "홍길동");
    assert.equal(result.extracted.mobile, "010-1234-5678");
    assert.equal(result.extracted.email, "hong@example.com");
    assert.equal(result.extracted.website, "https://example.com");
    assert.match(result.file.path, /^\/uploads\//);
    uploadedFilePath = path.join(projectRoot, result.file.path);
  } finally {
    app.kill("SIGTERM");
    await close(mockLmStudio);
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
  }
});

test("업로드 응답을 입력 필드와 처리 상태에 반영한다", async () => {
  const elements = new Map();
  let changeHandler;

  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, { value: "", textContent: "", innerHTML: "" });
    }
    return elements.get(selector);
  }

  element("#cardImage").addEventListener = (event, handler) => {
    if (event === "change") changeHandler = handler;
  };

  const context = {
    console,
    Blob,
    FormData,
    URL: { createObjectURL: () => "blob:preview" },
    alert: () => {},
    document: { querySelector: element },
    fetch: async () => ({
      ok: true,
      json: async () => ({
        file: { path: "/uploads/card.png" },
        extracted: {
          name: "홍길동",
          company: "예시회사",
          department: "개발팀",
          position: "대리",
          mobile: "010-1234-5678",
          phone: "02-123-4567",
          email: "hong@example.com",
          address: "서울",
          website: "https://example.com"
        }
      })
    })
  };

  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardAdd.js"), "utf8");
  vm.runInNewContext(source, context);

  assert.equal(typeof changeHandler, "function");
  await changeHandler({
    target: {
      files: [new Blob([Buffer.from("image")], { type: "image/png" })]
    }
  });

  assert.equal(element("#name").value, "홍길동");
  assert.equal(element("#homepage").value, "https://example.com");
  assert.equal(element(".runningBadge").textContent, "분석 완료");
});
