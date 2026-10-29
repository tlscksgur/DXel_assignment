const fs = require("node:fs");
const path = require("node:path");

const version = process.argv[2];
if (!["1", "2"].includes(version)) {
  console.error("사용법: node scripts/set-footer-garden.js 1 또는 2");
  process.exit(1);
}
const root = path.join(__dirname, "..");
const versionDir = path.join(root, "design-variants/footer-garden", version);
const indexPath = path.join(root, "public/index.html");
const source = fs.readFileSync(indexPath, "utf8");
const fragment = fs.readFileSync(path.join(versionDir, "garden.html"), "utf8");
const css = fs.readFileSync(path.join(versionDir, "homeGarden.css"));
const start = source.indexOf('      <div class="footerGarden');
const end = source.indexOf('      <div class="footerLeft">', start);
if (start < 0 || end < start) throw new Error("홈의 정원 영역을 찾을 수 없습니다. 파일은 변경하지 않았습니다.");
fs.writeFileSync(indexPath, source.slice(0, start) + fragment + source.slice(end));
fs.writeFileSync(path.join(root, "public/css/homeGarden.css"), css);
console.log(`홈 푸터 정원을 ${version}번으로 적용했습니다. 새로고침하세요.`);
