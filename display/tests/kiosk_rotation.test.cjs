const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const kiosk = fs.readFileSync(
  path.join(__dirname, "..", "src", "common_room_display", "static", "index.html"),
  "utf8"
);
const script = [...kiosk.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

function createElement() {
  return {
    children: [],
    textContent: "",
    classList: { add() {}, remove() {}, toggle() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
  };
}

function textContent(element) {
  return element.textContent + element.children.map(textContent).join("");
}

async function createKiosk(announcements = []) {
  const timers = new Map();
  let timerId = 0;
  const element = { classList: { add() {}, remove() {}, toggle() {} } };
  const playlist = {
    photos: [],
    statistics: { available: true, stale: false },
    announcements,
  };
  const context = vm.createContext({
    document: {
      getElementById: () => element,
      createElement,
      createTextNode: text => ({ textContent: text, children: [] }),
    },
    fetch: async () => ({ ok: true, json: async () => playlist }),
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    setInterval() {},
  });
  vm.runInContext(script, context);
  vm.runInContext(
    "renderComposite = () => {}; renderAnnouncement = () => {};",
    context
  );
  await new Promise(resolve => setImmediate(resolve));
  return {
    playlist,
    context,
    nextDelay() {
      assert.equal(timers.size, 1);
      return [...timers.values()][0].delay;
    },
    advance() {
      assert.equal(timers.size, 1);
      const [id, timer] = [...timers.entries()][0];
      timers.delete(id);
      timer.callback();
    },
    showingAnnouncement: () => vm.runInContext("showingAnnouncement", context),
  };
}

test("overview lasts 60 seconds at startup and between announcements", async () => {
  const display = await createKiosk([
    { id: "normal", priority: "normal", displayDurationSeconds: 18 },
    { id: "important", priority: "important", displayDurationSeconds: 30 },
  ]);
  assert.equal(display.nextDelay(), 60000);
  for (const duration of [18000, 30000, 30000, 18000]) {
    display.advance();
    assert.equal(display.showingAnnouncement(), true);
    assert.equal(display.nextDelay(), duration);
    display.advance();
    assert.equal(display.showingAnnouncement(), false);
    assert.equal(display.nextDelay(), 60000);
  }
});

test("overview stays visible when there are no announcements", async () => {
  const display = await createKiosk();
  display.advance();
  assert.equal(display.showingAnnouncement(), false);
  assert.equal(display.nextDelay(), 60000);
  display.playlist.announcements.push({
    id: "new", priority: "normal", displayDurationSeconds: 8,
  });
  await vm.runInContext("refresh()", display.context);
  assert.equal(display.nextDelay(), 60000);
  display.advance();
  assert.equal(display.showingAnnouncement(), true);
  assert.equal(display.nextDelay(), 8000);
});

test("removing announcements gives the overview a full 60 seconds", async () => {
  const display = await createKiosk([
    { id: "ending", priority: "normal", displayDurationSeconds: 20 },
  ]);
  display.advance();
  display.playlist.announcements.length = 0;
  await vm.runInContext("refresh()", display.context);
  assert.equal(display.showingAnnouncement(), false);
  assert.equal(display.nextDelay(), 60000);
});

test("playlist refresh does not shorten the overview interval", async () => {
  const display = await createKiosk([
    { id: "active", priority: "normal", displayDurationSeconds: 15 },
  ]);
  await vm.runInContext("refresh()", display.context);
  assert.equal(display.nextDelay(), 60000);
});

test("rifle leaderboards render points/krydser including zero", async () => {
  const display = await createKiosk();
  for (const discipline of ["Riffel", "LuftRiffel"]) {
    display.context.group = {
      discipline,
      entries: [
        { displayName: "Anna N.", discipline, points: 198, krydser: 7 },
        { displayName: "Bo H.", discipline, points: 190, krydser: 0 },
      ],
    };
    const rendered = textContent(vm.runInContext("leaderboard(group)", display.context));
    assert.ok(rendered.includes("198/7"));
    assert.ok(rendered.includes("190/0"));
  }
});

test("daily score pages preserve krydser and support older feeds", async () => {
  const display = await createKiosk();
  display.context.scores = [
    { displayName: "Anna N.", discipline: "Riffel", points: 198, krydser: 7 },
    { displayName: "Bo H.", discipline: "LuftRiffel", points: 190, krydser: 0 },
    { displayName: "Carl H.", discipline: "Pistol", points: 180, krydser: null },
    { displayName: "Dina K.", discipline: "Riffel", points: 175 },
  ];
  vm.runInContext("allScores = scores", display.context);
  const rendered = textContent(vm.runInContext("allScoresSection()", display.context));
  assert.ok(rendered.includes("198/7"));
  assert.ok(rendered.includes("190/0"));
  assert.ok(rendered.includes("180"));
  assert.ok(rendered.includes("175"));
  assert.ok(!rendered.includes("180/"));
  assert.ok(!rendered.includes("175/"));
  assert.ok(!rendered.includes("undefined"));
  assert.ok(!rendered.includes("null"));
});

test("personal best highlights include recorded krydser", async () => {
  const display = await createKiosk();
  display.context.snapshot = {
    available: true,
    feed: {
      activity: { title: "Klubskydning" },
      stats: { participantCount: 1, sessionCount: 1, totalPoints: 198 },
      topScoresByDiscipline: [],
      recentScores: [],
      birthdays: [],
      personalBests: [
        { displayName: "Anna N.", discipline: "Riffel", points: 198, krydser: 7 },
        { displayName: "Bo H.", discipline: "LuftRiffel", points: 190, krydser: 0 },
        { displayName: "Carl H.", discipline: "Pistol", points: 180 },
      ],
    },
  };
  const rendered = textContent(vm.runInContext("statisticsPanel(snapshot)", display.context));
  assert.ok(rendered.includes("Anna N.: 198/7 point"));
  assert.ok(rendered.includes("Bo H.: 190/0 point"));
  assert.ok(rendered.includes("Carl H.: 180 point"));
});
