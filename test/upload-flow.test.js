const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const { test } = require("node:test");
const { parseModelJson } = require("../localAi");

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

test("긴 설명에 잘못된 JSON 예시가 있어도 마지막 유효 객체를 추출한다", () => {
  const expected = {
    name: "정노응",
    company: "디엑셀(주)",
    department: "",
    position: "사원",
    mobile: "010. 6300. 0203",
    phone: "02. 2088. 2959",
    email: "nejeong@dxel.co.kr",
    address: "서울특별시 영등포구 신유로 114 / 양평자이비즈타워 907호",
    website: "www.dxel.co.kr"
  };
  const content = `
    JSON만 반환해야 합니다. 예: \`\`\`json ... \`\`\`
    중간 형식: {"name":"", "company":""}
    </think>
    ${JSON.stringify(expected)}
  `;

  assert.deepEqual(parseModelJson(content), expected);
});

test("명함 판정값을 구조화 응답에 포함하고 비명함 이미지는 서버에서 차단한다", () => {
  const localAiSource = fs.readFileSync(path.join(projectRoot, "localAi.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");

  assert.match(localAiSource, /is_business_card:\s*\{\s*type:\s*"boolean"\s*\}/);
  assert.match(localAiSource, /required:\s*\[[\s\S]*"is_business_card"/);
  assert.match(localAiSource, /ordinary photo|non-business-card image/i);
  assert.match(serverSource, /parsed\.is_business_card !== true/);
  assert.match(serverSource, /명함 사진이 아닙니다/);
  assert.match(serverSource, /status\(422\)/);
});

test("명함이 아닌 사진은 빈 추출 결과 대신 422 오류를 반환한다", async () => {
  let lmRequestCount = 0;
  const uploadsBefore = new Set(fs.readdirSync(path.join(projectRoot, "uploads")));
  const mockLmStudio = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      lmRequestCount += 1;
      const request = JSON.parse(body);
      const isCriticalFieldCheck = request.response_format
        .json_schema.name === "critical_business_card_fields";
      const content = isCriticalFieldCheck
        ? {
          name: "",
          department: "",
          position: "",
          email: "",
          address: "",
          website: ""
        }
        : {
          is_business_card: false,
          name: "",
          company: "",
          department: "",
          position: "",
          mobile: "",
          phone: "",
          email: "",
          address: "",
          website: ""
        };

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) } }]
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
    form.append("image", new Blob([Buffer.from("ordinary-photo")], {
      type: "image/png"
    }), "ordinary.png");

    const response = await fetch(`http://127.0.0.1:${appPort}/api/cards/extract`, {
      method: "POST",
      body: form
    });
    const result = await response.json();

    assert.equal(response.status, 422);
    assert.equal(result.success, false);
    assert.match(result.message, /명함 사진이 아닙니다/);
    assert.equal(lmRequestCount, 1);
  } finally {
    app.kill("SIGTERM");
    await close(mockLmStudio);
    const uploadsAfter = fs.readdirSync(path.join(projectRoot, "uploads"));
    uploadsAfter
      .filter((filename) => !uploadsBefore.has(filename))
      .forEach((filename) => fs.unlinkSync(path.join(projectRoot, "uploads", filename)));
  }
});

test("업로드한 이미지를 LM Studio에 전달하고 정규화된 필드를 반환한다", async () => {
  let uploadedFilePath = "";
  const receivedLmRequests = [];
  const mockLmStudio = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body);
      receivedLmRequests.push(request);
      const imageUrl = request.messages[1].content[1].image_url.url;

      assert.match(imageUrl, /^data:image\/png;base64,/);

      res.setHeader("Content-Type", "application/json");
      const isCriticalFieldCheck = request.response_format
        .json_schema.name === "critical_business_card_fields";
      const modelContent = isCriticalFieldCheck
        ? JSON.stringify({
          name: "홍길동",
          department: "수석/기업부설연구소",
          position: "",
          email: "hong@example.com",
          address: "본사. 31791,\n충청남도 당진시 예시로 1\n지사. 부산광역시 예시로 2",
          website: "example.com"
        })
        : `명함 정보를 분석했습니다.
</think>

\`\`\`json
${JSON.stringify({
  is_business_card: true,
  name: "홍길동",
  company: "예시회사",
  department: "수석/기업부설연구소",
  position: "",
  mobile: "+46 70 588 96 45",
  phone: "+46 141 20 36 30 / 010 1234 5678",
  email: "HONG@EXAMPLE.COM",
  website: "example.com"
})}
\`\`\``;

      res.end(JSON.stringify({
        choices: [{
          message: {
            content: modelContent
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
    assert.equal(
      result.extracted.mobile,
      "+46 70 588 96 45 / 010-1234-5678"
    );
    assert.equal(result.extracted.phone, "+46 141 20 36 30");
    assert.equal(result.extracted.email, "hong@example.com");
    assert.equal(result.extracted.department, "기업부설연구소");
    assert.equal(result.extracted.position, "수석");
    assert.equal(
      result.extracted.address,
      "31791, 충청남도 당진시 예시로 1"
    );
    assert.equal(result.extracted.website, "https://example.com");
    assert.match(result.file.path, /^\/uploads\//);
    assert.equal(receivedLmRequests.length, 2);
    const receivedLmRequest = receivedLmRequests[0];
    const systemPrompt = receivedLmRequest.messages[0].content;
    assert.match(systemPrompt, /only text that is actually visible/i);
    assert.match(systemPrompt, /never guess/i);
    assert.match(systemPrompt, /valid JSON object/i);
    assert.match(systemPrompt, /same physical address[\s\S]*single space/i);
    assert.match(
      systemPrompt,
      /headquarters[\s\S]*branch[\s\S]*only the headquarters address/i
    );
    assert.match(systemPrompt, /person'?s name[\s\S]*character by character/i);
    assert.match(systemPrompt, /empty string[\s\S]*absent or genuinely unreadable/i);
    assert.match(systemPrompt, /top[\s\S]*middle[\s\S]*bottom/i);
    assert.match(systemPrompt, /E-Mail/i);
    assert.match(systemPrompt, /labeled W or W\./i);
    assert.match(systemPrompt, /Switchboard[\s\S]*Direct[\s\S]*Office/i);
    assert.match(systemPrompt, /mobile-phone icon[\s\S]*mobile/i);
    assert.match(systemPrompt, /envelope icon[\s\S]*email/i);
    assert.match(systemPrompt, /location-pin icon[\s\S]*address/i);
    assert.match(systemPrompt, /globe icon[\s\S]*website/i);
    assert.match(systemPrompt, /bare printed domain[\s\S]*3ds\.com/i);
    assert.match(systemPrompt, /job title[\s\S]*대리/i);
    assert.match(
      systemPrompt,
      /never copy the company name into department[\s\S]*empty string/i
    );
    assert.match(
      systemPrompt,
      /same text in both department and position[\s\S]*수석연구원[\s\S]*position only/i
    );
    assert.match(
      systemPrompt,
      /"수석\/기업부설연구소"[\s\S]*position is "수석"[\s\S]*department is "기업부설연구소"/i
    );
    assert.doesNotMatch(systemPrompt, /On a Korean business card/i);
    assert.doesNotMatch(systemPrompt, /On a foreign business card/i);
    assert.match(systemPrompt, /small but readable[\s\S]*must not be left empty/i);
    assert.match(systemPrompt, /five-digit postal code[\s\S]*address must contain/i);
    assert.match(systemPrompt, /31791, 충청남도 당진시/i);
    assert.doesNotMatch(systemPrompt, /"fax":/);
    assert.doesNotMatch(systemPrompt, /"other_text":/);
    assert.equal(receivedLmRequest.reasoning_effort, "low");
    assert.equal(receivedLmRequest.max_tokens, 768);
    assert.equal(receivedLmRequest.response_format.type, "json_schema");
    assert.equal(receivedLmRequest.response_format.json_schema.strict, true);
    assert.deepEqual(
      Object.keys(receivedLmRequest.response_format.json_schema.schema.properties),
      [
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
      ]
    );
    assert.equal(
      receivedLmRequest.response_format.json_schema.schema.additionalProperties,
      false
    );
    const criticalFieldRequest = receivedLmRequests[1];
    assert.equal(criticalFieldRequest.reasoning_effort, "none");
    assert.equal(criticalFieldRequest.max_tokens, 384);
    assert.deepEqual(
      Object.keys(criticalFieldRequest.response_format.json_schema.schema.properties),
      ["name", "department", "position", "email", "address", "website"]
    );
    assert.match(
      criticalFieldRequest.messages[0].content,
      /position[\s\S]*must not contain department/i
    );
    assert.match(
      criticalFieldRequest.messages[0].content,
      /department[\s\S]*(팀|부|실|센터)/i
    );
    assert.match(
      criticalFieldRequest.messages[0].content,
      /company name[\s\S]*department[\s\S]*empty string/i
    );
    assert.match(
      criticalFieldRequest.messages[0].content,
      /same text in both department and position[\s\S]*수석연구원[\s\S]*position only/i
    );
    assert.match(
      criticalFieldRequest.messages[0].content,
      /"수석\/기업부설연구소"[\s\S]*position is "수석"[\s\S]*department is "기업부설연구소"/i
    );
    assert.match(
      criticalFieldRequest.messages[0].content,
      /W or W\.[\s\S]*globe icon[\s\S]*bare printed domain/i
    );
    assert.match(
      criticalFieldRequest.messages[0].content,
      /headquarters[\s\S]*branch[\s\S]*only the headquarters address/i
    );
    uploadedFilePath = path.join(projectRoot, result.file.path);
  } finally {
    app.kill("SIGTERM");
    await close(mockLmStudio);
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
  }
});

test("회사명이나 직책과 같은 부서명은 빈 값으로 정리한다", async () => {
  let uploadedFilePath = "";
  const mockLmStudio = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body);
      const isCriticalFieldCheck = request.response_format
        .json_schema.name === "critical_business_card_fields";
      const extracted = isCriticalFieldCheck
        ? {
          name: "야마나카",
          department: "수석연구원",
          position: "수석연구원",
          email: "yaam@ese-tech.com",
          address: "경기도 부천시 원미구 부천로198번길 18",
          website: "http://www.ese-tech.com"
        }
        : {
          is_business_card: true,
          name: "야마나카",
          company: "(주)에쎄테크놀로지",
          department: "(주)에쎄테크놀로지",
          position: "수석연구원",
          mobile: "010-5165-1271",
          phone: "032-623-0900",
          email: "yaam@ese-tech.com",
          address: "경기도 부천시 원미구 부천로198번길 18",
          website: "http://www.ese-tech.com"
        };

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify(extracted)
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
    assert.equal(result.extracted.company, "(주)에쎄테크놀로지");
    assert.equal(result.extracted.department, "");
    assert.equal(result.extracted.position, "수석연구원");
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

function createCardAddBrowser(
  fetchImplementation,
  { mobile = true, imageDimensions = null } = {}
) {
  const elements = new Map();
  const handlers = new Map();
  const alerts = [];
  const canvasState = {
    width: 0,
    height: 0,
    rotations: [],
    imageBitmapOptions: []
  };

  function element(selector) {
    if (!elements.has(selector)) {
      const classNames = new Set();
      elements.set(selector, {
        value: "",
        textContent: "",
        innerHTML: "",
        disabled: false,
        hidden: selector === ".uploadSourceSheet",
        clickCount: 0,
        click() {
          this.clickCount += 1;
        },
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
    document: {
      querySelector: element,
      createElement(tagName) {
        assert.equal(tagName, "canvas");

        return {
          get width() {
            return canvasState.width;
          },
          set width(value) {
            canvasState.width = value;
          },
          get height() {
            return canvasState.height;
          },
          set height(value) {
            canvasState.height = value;
          },
          getContext: () => ({
            translate() {},
            rotate(radians) { canvasState.rotations.push(radians); },
            drawImage() {}
          }),
          toBlob: (callback) => {
            callback(new Blob([Buffer.alloc(500 * 1024)], {
              type: "image/jpeg"
            }));
          }
        };
      }
    },
    fetch: fetchImplementation,
    matchMedia: () => ({ matches: mobile }),
    createImageBitmap: imageDimensions
      ? async (file, options) => {
        canvasState.imageBitmapOptions.push(options);
        return {
          ...imageDimensions,
          close() {}
        };
      }
      : undefined
  };

  const source = fs.readFileSync(path.join(projectRoot, "public/js/cardAdd.js"), "utf8");
  vm.runInNewContext(source, context);

  return {
    alerts,
    canvasState,
    element,
    handler(selector, event) {
      return handlers.get(`${selector}:${event}`);
    }
  };
}

test("고해상도 휴대폰 사진은 긴 변 1600px로 줄여 분석 요청한다", async () => {
  let uploadedImage;
  const browser = createCardAddBrowser(async (url, options) => {
    assert.equal(url, "/api/cards/extract");
    uploadedImage = options.body.get("image");

    return {
      ok: true,
      json: async () => ({
        file: { path: "/uploads/mobile-card.jpg" },
        extracted: {
          name: "홍길동",
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
  }, {
    imageDimensions: { width: 4032, height: 3024 }
  });
  const largeImage = new Blob([Buffer.alloc(3 * 1024 * 1024)], {
    type: "image/jpeg"
  });
  Object.defineProperty(largeImage, "name", { value: "mobile-card.jpg" });

  await browser.handler("#cardGalleryInput", "change")({
    target: {
      files: [largeImage],
      value: "selected"
    }
  });

  assert.equal(browser.canvasState.width, 1600);
  assert.equal(browser.canvasState.height, 1200);
  assert.deepEqual(browser.canvasState.rotations, []);
  assert.equal(uploadedImage.size, 500 * 1024);
  assert.equal(uploadedImage.type, "image/jpeg");
});

test("세로 방향으로 저장된 명함 사진은 가로로 회전해 분석 요청한다", async () => {
  let uploadedImage;
  const browser = createCardAddBrowser(async (url, options) => {
    assert.equal(url, "/api/cards/extract");
    uploadedImage = options.body.get("image");

    return {
      ok: true,
      json: async () => ({
        file: { path: "/uploads/rotated-card.jpg" },
        extracted: {
          name: "김학연",
          company: "대한전선 주식회사",
          department: "생산기술공정팀",
          position: "대리",
          mobile: "010-5029-9628",
          phone: "041-360-9653",
          email: "hykim@taihan.com",
          address: "31791, 충청남도 당진시 고대면 대호만로 870 당진케이블공장",
          website: ""
        }
      })
    };
  }, {
    imageDimensions: { width: 900, height: 1200 }
  });
  const portraitImage = namedImage("portrait-card.jpg");

  await browser.handler("#cardGalleryInput", "change")({
    target: {
      files: [portraitImage],
      value: "selected"
    }
  });

  assert.equal(browser.canvasState.width, 1200);
  assert.equal(browser.canvasState.height, 900);
  assert.deepEqual(browser.canvasState.rotations, [-Math.PI / 2]);
  assert.equal(uploadedImage.type, "image/jpeg");
});

test("휴대폰 카메라 촬영 사진은 EXIF 방향을 유지해 분석 요청한다", async () => {
  let uploadedImage;
  const browser = createCardAddBrowser(async (url, options) => {
    assert.equal(url, "/api/cards/extract");
    uploadedImage = options.body.get("image");

    return {
      ok: true,
      json: async () => ({
        file: { path: "/uploads/camera-card.jpg" },
        extracted: {
          name: "권준",
          company: "thebn Co.,Ltd.",
          department: "",
          position: "Editorial Director",
          mobile: "010-4264-7376",
          phone: "070-5031-5329",
          email: "editor@boannews.com",
          address: "서울특별시 마포구",
          website: "https://www.boannews.com"
        }
      })
    };
  }, {
    imageDimensions: { width: 900, height: 1200 }
  });
  const cameraImage = namedImage("camera-card.jpg");

  await browser.handler("#cardCameraInput", "change")({
    target: {
      files: [cameraImage],
      value: "selected"
    }
  });

  assert.deepEqual(browser.canvasState.rotations, []);
  assert.equal(
    browser.canvasState.imageBitmapOptions[0].imageOrientation,
    "from-image"
  );
  assert.equal(uploadedImage.type, "image/png");
});

test("모바일 업로드 선택창에 촬영용과 여러 장 선택용 입력을 분리한다", () => {
  const html = fs.readFileSync(
    path.join(projectRoot, "public/cardAdd.html"),
    "utf8"
  );

  assert.match(html, /class="uploadTrigger"/);
  assert.match(
    html,
    /id="cardCameraInput"[^>]*accept="image\/\*"[^>]*capture="environment"/
  );
  assert.match(
    html,
    /id="cardGalleryInput"[^>]*accept="image\/\*"[^>]*multiple/
  );
  assert.match(html, /class="uploadSourceSheet"[^>]*hidden/);
  assert.match(html, /class="uploadSourceCamera"[^>]*>[\s\S]*사진 촬영/);
  assert.match(html, /class="uploadSourceGallery"[^>]*>[\s\S]*사진 선택/);
  assert.match(html, /class="uploadSourceCancel"[^>]*>[\s\S]*취소/);
});

test("모바일 업로드 버튼에서 촬영 또는 사진 선택을 고를 수 있다", () => {
  const browser = createCardAddBrowser(async () => {
    throw new Error("파일을 고르기 전에는 요청하지 않아야 합니다.");
  });
  const sheet = browser.element(".uploadSourceSheet");

  browser.handler(".uploadTrigger", "click")();
  assert.equal(sheet.hidden, false);

  browser.handler(".uploadSourceCamera", "click")();
  assert.equal(sheet.hidden, true);
  assert.equal(browser.element("#cardCameraInput").clickCount, 1);

  browser.handler(".uploadTrigger", "click")();
  browser.handler(".uploadSourceGallery", "click")();
  assert.equal(sheet.hidden, true);
  assert.equal(browser.element("#cardGalleryInput").clickCount, 1);
});

test("데스크톱 업로드 버튼은 여러 장 파일 선택창을 바로 연다", () => {
  const browser = createCardAddBrowser(async () => {}, { mobile: false });

  browser.handler(".uploadTrigger", "click")();

  assert.equal(browser.element(".uploadSourceSheet").hidden, true);
  assert.equal(browser.element("#cardGalleryInput").clickCount, 1);
});

test("모바일 업로드 선택창은 취소와 배경 터치로 닫힌다", () => {
  const browser = createCardAddBrowser(async () => {});
  const sheet = browser.element(".uploadSourceSheet");

  browser.handler(".uploadTrigger", "click")();
  browser.handler(".uploadSourceCancel", "click")();
  assert.equal(sheet.hidden, true);

  browser.handler(".uploadTrigger", "click")();
  browser.handler(".uploadSourceBackdrop", "click")();
  assert.equal(sheet.hidden, true);
});

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

  const changeHandler = browser.handler("#cardGalleryInput", "change");
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
  assert.match(browser.element(".runningBadge").textContent, /^분석 완료 · \d+\.\d초$/);
});

test("다음 명함 버튼은 한 장만 업로드하면 비활성화되고 여러 장이면 활성화된다", async () => {
  const browser = createCardAddBrowser(async () => ({
    ok: true,
    json: async () => ({
      file: { path: "/uploads/card.png" },
      extracted: {
        name: "테스트 명함",
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
  }));

  await browser.handler("#cardGalleryInput", "change")({
    target: {
      files: [namedImage("only.png")],
      value: "selected"
    }
  });

  assert.equal(browser.element(".subAction").disabled, true);

  await browser.handler("#cardGalleryInput", "change")({
    target: {
      files: [namedImage("second.png")],
      value: "selected"
    }
  });

  assert.equal(browser.element(".subAction").disabled, false);
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

  await browser.handler("#cardGalleryInput", "change")({
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

  await browser.handler("#cardGalleryInput", "change")({
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

test("건너뛴 명함을 누르면 해당 이미지를 다시 분석한다", async () => {
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

  await browser.handler("#cardGalleryInput", "change")({
    target: {
      files: [namedImage("first.png"), namedImage("second.png")],
      value: "selected"
    }
  });
  await browser.handler(".subAction", "click")();
  await browser.handler(".queueBox", "click")({
    target: {
      closest: () => ({ dataset: { queueIndex: "0" } })
    }
  });

  assert.equal(extractRequests, 3);
  assert.equal(browser.element("#name").value, "명함 3");
  assert.doesNotMatch(browser.element(".queueBox").innerHTML, /queueItem-skipped current/);
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

  await browser.handler("#cardGalleryInput", "change")({
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

test("명함 목록, CSV, vCard, 단건 조회 API 경로를 유지한다", async () => {
  const probeServer = http.createServer();
  const appPort = await listen(probeServer);
  await close(probeServer);

  const app = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(appPort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(app);

    const listResponse = await fetch(`http://127.0.0.1:${appPort}/api/cards`);
    const listResult = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listResult.success, true);
    assert.equal(Array.isArray(listResult.cards), true);

    const csvResponse = await fetch(`http://127.0.0.1:${appPort}/api/cards/export/csv`);
    assert.equal(csvResponse.status, 200);
    assert.match(csvResponse.headers.get("content-type"), /^text\/csv/);

    const vcardResponse = await fetch(
      `http://127.0.0.1:${appPort}/api/cards/export/vcard`
    );
    const vcard = await vcardResponse.text();
    assert.equal(vcardResponse.status, 200);
    assert.match(vcardResponse.headers.get("content-type"), /^text\/vcard/);
    assert.match(
      vcardResponse.headers.get("content-disposition"),
      /filename=business_cards\.vcf/
    );
    if (vcard) {
      assert.match(vcard, /BEGIN:VCARD\r?\nVERSION:3\.0/);
    }

    const missingResponse = await fetch(
      `http://127.0.0.1:${appPort}/api/cards/not-a-number`
    );
    assert.equal(missingResponse.status, 404);
  } finally {
    app.kill("SIGTERM");
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

  assert.match(css, /\.queueList\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(210px,\s*1fr\)\);[^}]*max-height:\s*240px;[^}]*overflow-y:\s*auto;/);
  assert.match(css, /\.queueItem\.current\s*\{[^}]*background:/);
  assert.match(css, /\.queueItem-error\s+b\s*\{[^}]*color:/);
});

test("명함 미리보기는 이미지 방향을 추가로 회전하지 않는다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public/css/cardAdd.css"), "utf8");

  assert.match(
    css,
    /\.previewFrame img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*contain;/
  );
  assert.doesNotMatch(css, /\.previewFrame img\s*\{[^}]*transform:\s*rotate/);
});
