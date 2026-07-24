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

function namedImage(name) {
  const image = new Blob([Buffer.from(name)], { type: "image/png" });
  Object.defineProperty(image, "name", { value: name });
  return image;
}

function createCardAddBrowser(fetchImplementation) {
  const elements = new Map();
  const handlers = new Map();
  const alerts = [];

  function element(selector) {
    if (!elements.has(selector)) {
      const classNames = new Set();
      elements.set(selector, {
        value: "",
        textContent: "",
        innerHTML: "",
        disabled: false,
        addEventListener(event, handler) {
          handlers.set(`${selector}:${event}`, handler);
        },
        classList: {
          add(name) { classNames.add(name); },
          remove(name) { classNames.delete(name); },
          toggle(name, enabled) {
            if (enabled) classNames.add(name);
            else classNames.delete(name);
          }
        }
      });
    }
    return elements.get(selector);
  }

  const context = {
    console,
    Blob,
    FormData,
    crypto: { randomUUID: () => `queue-${Math.random()}` },
    URL: {
      createObjectURL: (file) => `blob:${file.name}`,
      revokeObjectURL: () => {}
    },
    alert: (message) => alerts.push(message),
    confirm: () => true,
    document: { querySelector: element },
    fetch: fetchImplementation
  };

  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardAdd.js"), "utf8");
  vm.runInNewContext(source, context);

  return {
    alerts,
    element,
    handler(selector, event) {
      return handlers.get(`${selector}:${event}`);
    }
  };
}

test("여러 이미지를 큐에 추가하고 첫 번째 이미지만 순차 분석한다", async () => {
  let extractRequests = 0;
  const browser = createCardAddBrowser(async (url) => {
    assert.equal(url, "/api/cards/extract");
    extractRequests += 1;

    return {
      ok: true,
      json: async () => ({
        file: { path: `/uploads/card-${extractRequests}.png` },
        extracted: {
          name: `명함 ${extractRequests}`,
          company: "예시회사",
          department: "",
          position: "",
          mobile: "",
          phone: "",
          email: "",
          address: "",
          website: ""
        }
      })
    };
  });

  const changeHandler = browser.handler("#cardImage", "change");
  assert.equal(typeof changeHandler, "function");

  await changeHandler({
    target: {
      files: [namedImage("first.png"), namedImage("second.png")],
      value: "selected"
    }
  });

  assert.equal(extractRequests, 1);
  assert.match(browser.element(".queueBox").innerHTML, /first\.png/);
  assert.match(browser.element(".queueBox").innerHTML, /second\.png/);
  assert.equal(browser.element("#name").value, "명함 1");
  assert.equal(browser.element(".runningBadge").textContent, "분석 완료");
});

test("현재 명함을 저장하면 다음 대기 명함을 자동 분석한다", async () => {
  let extractRequests = 0;
  let saveRequests = 0;
  const browser = createCardAddBrowser(async (url) => {
    if (url === "/api/cards/extract") {
      extractRequests += 1;
      return {
        ok: true,
        json: async () => ({
          file: { path: `/uploads/card-${extractRequests}.png` },
          extracted: {
            name: `명함 ${extractRequests}`,
            company: "예시회사",
            department: "",
            position: "",
            mobile: "",
            phone: "",
            email: "",
            address: "",
            website: ""
          }
        })
      };
    }

    if (url === "/api/cards") {
      saveRequests += 1;
      return {
        ok: true,
        status: 201,
        json: async () => ({ success: true, id: saveRequests })
      };
    }

    throw new Error(`예상하지 않은 요청: ${url}`);
  });

  await browser.handler("#cardImage", "change")({
    target: {
      files: [namedImage("first.png"), namedImage("second.png")],
      value: "selected"
    }
  });

  await browser.handler(".mainAction", "click")();

  assert.equal(saveRequests, 1);
  assert.equal(extractRequests, 2);
  assert.equal(browser.element("#name").value, "명함 2");
  assert.match(browser.element(".queueBox").innerHTML, /저장 완료/);
});

test("다음 명함 버튼은 현재 항목을 건너뛰고 다음 이미지를 분석한다", async () => {
  let extractRequests = 0;
  const browser = createCardAddBrowser(async () => {
    extractRequests += 1;
    return {
      ok: true,
      json: async () => ({
        file: { path: `/uploads/card-${extractRequests}.png` },
        extracted: {
          name: `명함 ${extractRequests}`,
          company: "",
          department: "",
          position: "",
          mobile: "",
          phone: "",
          email: "",
          address: "",
          website: ""
        }
      })
    };
  });

  await browser.handler("#cardImage", "change")({
    target: {
      files: [namedImage("first.png"), namedImage("second.png")],
      value: "selected"
    }
  });
  await browser.handler(".subAction", "click")();

  assert.equal(extractRequests, 2);
  assert.equal(browser.element("#name").value, "명함 2");
  assert.match(browser.element(".queueBox").innerHTML, /건너뜀/);
});

test("취소 버튼은 현재 항목을 제거하고 다음 이미지를 분석한다", async () => {
  let extractRequests = 0;
  const browser = createCardAddBrowser(async () => {
    extractRequests += 1;
    return {
      ok: true,
      json: async () => ({
        file: { path: `/uploads/card-${extractRequests}.png` },
        extracted: {
          name: `명함 ${extractRequests}`,
          company: "",
          department: "",
          position: "",
          mobile: "",
          phone: "",
          email: "",
          address: "",
          website: ""
        }
      })
    };
  });

  await browser.handler("#cardImage", "change")({
    target: {
      files: [namedImage("first.png"), namedImage("second.png")],
      value: "selected"
    }
  });
  await browser.handler(".ghostAction", "click")();

  assert.equal(extractRequests, 2);
  assert.equal(browser.element("#name").value, "명함 2");
  assert.doesNotMatch(browser.element(".queueBox").innerHTML, /first\.png/);
  assert.match(browser.element(".queueBox").innerHTML, /second\.png/);
});

test("상태 API가 LM Studio 연결 상태를 반환한다", async () => {
  let statusRequests = 0;
  const mockLmStudio = http.createServer((req, res) => {
    statusRequests += 1;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ id: "test-vision-model" }] }));
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
      LM_STUDIO_STATUS_URL: `http://127.0.0.1:${lmPort}/v1/models`
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(app);
    const response = await fetch(`http://127.0.0.1:${appPort}/api/status`);
    const status = await response.json();

    assert.equal(response.status, 200);
    assert.equal(status.sqlite, true);
    assert.equal(status.localAi, true);
    assert.equal(statusRequests, 1);
  } finally {
    app.kill("SIGTERM");
    await close(mockLmStudio);
  }
});

test("명함 등록 화면에 검증 및 중복 안내 블록을 표시하지 않는다", () => {
  const html = fs.readFileSync(path.join(projectRoot, "public/cardAdd.html"), "utf8");

  assert.doesNotMatch(html, /validationStrip/);
  assert.doesNotMatch(html, /duplicateBox/);
  assert.doesNotMatch(html, /DUPLICATE CHECK/);
  assert.doesNotMatch(html, /기존 항목 보기/);
  assert.doesNotMatch(html, /별도 등록/);
});

test("연속 업로드 큐는 스크롤과 현재 항목 강조 스타일을 제공한다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/cardAdd.css"), "utf8");

  assert.match(css, /\.queueList\s*\{[^}]*max-height:\s*240px;[^}]*overflow-y:\s*auto;/);
  assert.match(css, /\.queueItem\.current\s*\{[^}]*background:/);
  assert.match(css, /\.queueItem-error\s+b\s*\{[^}]*color:/);
});
