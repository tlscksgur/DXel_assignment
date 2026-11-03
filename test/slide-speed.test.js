const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function createHome({ areaWidth = 1200, cardWidth = 542 } = {}) {
  const classes = new Set();
  const styles = new Map();
  const events = new Map();
  const area = { offsetWidth: areaWidth };
  const track = {
    innerHTML: "",
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    style: { setProperty: (name, value) => styles.set(name, value) },
    get scrollWidth() {
      return [...this.innerHTML.matchAll(/class="contactCard"/g)].length * cardWidth;
    }
  };
  const context = vm.createContext({
    document: { querySelector: (selector) => selector === "#cardTrack" ? track : selector === ".cardArea" ? area : {} },
    window: { addEventListener: (name, callback) => events.set(name, callback) },
    fetch: () => new Promise(() => {}), requestAnimationFrame: (callback) => callback(), console
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js/slide.js"), "utf8"), context);
  return {
    track, classes, area,
    duration: () => parseFloat(styles.get("--card-flow-duration")),
    render(count) {
      context.contacts = Array.from({ length: count }, (_, id) => ({ name: `명함 ${id}` }));
      vm.runInContext("renderCards(contacts)", context);
    },
    resize(width) { area.offsetWidth = width; events.get("resize")(); }
  };
}

test("명함이 15·34·100·1000장이어도 이동 속도는 초당 150px로 제한된다", () => {
  const home = createHome();
  for (const count of [15, 34, 100, 1000]) {
    home.render(count);
    assert.equal(home.classes.has("slide"), true);
    assert.ok(Math.abs(home.track.scrollWidth / 2 / home.duration() - 150) < 0.001);
    assert.equal([...home.track.innerHTML.matchAll(/class="contactCard"/g)].length, count * 2);
  }
});

test("짧은 목록은 기존 45초보다 빨라지지 않고 화면에 들어오면 멈춘다", () => {
  const home = createHome({ areaWidth: 400, cardWidth: 380 });
  home.render(2);
  assert.equal(home.duration(), 45);
  home.resize(1000);
  assert.equal(home.classes.has("slide"), false);
  home.resize(400);
  assert.equal(home.classes.has("slide"), true);
  assert.equal(home.duration(), 45);
});

test("긴 목록 다음에 짧은 목록·빈 목록을 표시할 때 이전 재생 상태가 남지 않는다", () => {
  const home = createHome();
  home.render(100);
  const longDuration = home.duration();
  home.render(3);
  assert.ok(home.duration() < longDuration);
  assert.ok(home.track.scrollWidth / 2 / home.duration() <= 150);
  home.render(0);
  assert.equal(home.classes.has("slide"), false);
  assert.equal(home.classes.has("is-empty"), true);
});
