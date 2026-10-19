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
    document: { getElementById: () => element },
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
