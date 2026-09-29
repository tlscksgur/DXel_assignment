const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const vm = require("node:vm");
const { test } = require("node:test");
const { upload, UPLOAD_DIR } = require("../upload");

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64"
);

async function uploadImage(filename, type, bytes) {
  const boundary = "test-upload-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const req = Readable.from([body]);
  req.headers = { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body.length) };
  req.method = "POST";
  const error = await new Promise((resolve) => upload.single("image")(req, {}, resolve));
  return { status: error ? 400 : 200, error: error?.message || "", filename: req.file?.filename || "" };
}

test("rejects HTML and SVG uploads even when their MIME claims image", async () => {
  const before = new Set(fs.readdirSync(UPLOAD_DIR));
  const html = await uploadImage("attack.html", "image/png", "<script>alert(1)</script>");
  const svg = await uploadImage("attack.svg", "image/svg+xml", "<svg onload='alert(1)'></svg>");
  assert.equal(html.status, 400);
  assert.equal(svg.status, 400);
  assert.deepEqual(new Set(fs.readdirSync(UPLOAD_DIR)), before);
});

test("rejects image/polyglot payloads and mismatched MIME", async () => {
  const before = new Set(fs.readdirSync(UPLOAD_DIR));
  const polyglot = await uploadImage("attack.png", "image/png", Buffer.concat([validPng, Buffer.from("<script>alert(1)</script>")]));
  const mismatch = await uploadImage("attack.jpg", "image/jpeg", validPng);
  assert.equal(polyglot.status, 400);
  assert.equal(mismatch.status, 400);
  assert.deepEqual(new Set(fs.readdirSync(UPLOAD_DIR)), before);
});

test("rejects an unexpected MIME value without crashing upload middleware", async () => {
  const result = await uploadImage("card.png", "constructor", validPng);
  assert.equal(result.status, 400);
});

test("accepts a raster image under its verified extension", async () => {
  const result = await uploadImage("card.png", "image/png", validPng);
  try {
    assert.equal(result.status, 200);
    assert.match(result.filename, /\.png$/);
    assert.equal(fs.existsSync(path.join(UPLOAD_DIR, result.filename)), true);
  } finally {
    if (result.filename) fs.rmSync(path.join(UPLOAD_DIR, result.filename), { force: true });
  }
});

test("homepage escapes every stored contact field before HTML insertion", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/js/slide.js"), "utf8");
  const context = {
    document: { querySelector: () => ({ classList: { remove() {}, add() {} }, innerHTML: "" }) },
    window: { addEventListener() {} },
    fetch: () => new Promise(() => {}),
    requestAnimationFrame() {},
    console
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const card = context.createCard({
    name: "<img src=x onerror=alert(1)>",
    company: "<b>company</b>",
    position: "<svg/onload=alert(1)>",
    mobile: "<script>evil()</script>",
    email: "a@b.test&<p>",
    date: "<iframe>"
  });
  assert.doesNotMatch(card, /<img|<svg|<script|<iframe|<b>company/i);
  assert.match(card, /&lt;img/);
  assert.match(card, /a@b\.test&amp;&lt;p&gt;/);
});
