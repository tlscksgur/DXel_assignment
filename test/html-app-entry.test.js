const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Express serves the original HTML pages without a SPA redirect or build fallback", () => {
  const server = read("server.js");
  const packageJson = JSON.parse(read("package.json"));

  assert.match(server, /app\.use\(express\.static\("public"\)\)/);
  assert.match(server, /LOGIN_REQUIRED_PAGES/);
  assert.doesNotMatch(server, /legacyPageRoutes|spaBuildDir|spaRoutes/);
  assert.equal(packageJson.scripts.start, "node server.js");
  assert.equal(packageJson.scripts.build, undefined);
  assert.equal(packageJson.dependencies?.vue, undefined);
  assert.equal(packageJson.dependencies?.["vue-router"], undefined);
  assert.equal(packageJson.devDependencies?.vite, undefined);
});

test("The documented app entry points use the legacy HTML pages", () => {
  const readme = read("README.md");

  assert.match(readme, /http:\/\/localhost:3000\/cardAdd\.html/);
  assert.match(readme, /http:\/\/localhost:3000\/BCM\.html/);
  assert.doesNotMatch(readme, /localhost:3000\/cards(?:\/|`|\))/);
});
