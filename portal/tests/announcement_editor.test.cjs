const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const script = fs.readFileSync(path.join(__dirname, "..", "assets", "portal.js"), "utf8");

function createEditor() {
  const elements = {};
  for (const id of [
    "form", "title", "body", "priority", "image-mode", "duration", "image",
    "preview", "preview-image", "preview-title", "preview-body", "preview-kicker",
  ]) {
    const classes = new Set();
    elements[`announcement-${id}`] = {
      value: "",
      files: [],
      listeners: {},
      animations: [],
      getAnimations() { return this.animations; },
      style: { properties: {}, setProperty(name, value) { this.properties[name] = value; } },
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
      addEventListener(name, callback) { this.listeners[name] = callback; },
    };
  }
  const events = {};
  vm.runInNewContext(script, {
    document: {
      getElementById: id => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: (name, callback) => { events[name] = callback; },
    },
    URL: { createObjectURL: () => "blob:fixture", revokeObjectURL() {} },
  });
  events.DOMContentLoaded();
  return elements;
}

test("announcement editor starts without password-reset forms and updates panning preview", () => {
  const elements = createEditor();
  const mode = elements["announcement-image-mode"];
  const duration = elements["announcement-duration"];
  const preview = elements["announcement-preview"];
  mode.value = "pan";
  duration.value = "30";
  mode.listeners.change();
  assert.equal(preview.classList.contains("pan-image"), true);
  assert.equal(preview.style.properties["--announcement-duration"], "30s");
  duration.value = "60";
  const animation = { currentTime: 25000 };
  elements["announcement-preview-image"].animations = [animation];
  duration.listeners.change();
  assert.equal(preview.style.properties["--announcement-duration"], "60s");
  assert.equal(animation.currentTime, 0);
  animation.currentTime = 10000;
  elements["announcement-preview-image"].listeners.load();
  assert.equal(animation.currentTime, 0);
  mode.value = "fit";
  mode.listeners.change();
  assert.equal(preview.classList.contains("pan-image"), false);
});

test("announcement editor retains title, priority and selected-image previews", () => {
  const elements = createEditor();
  elements["announcement-title"].value = "Klubbesked";
  elements["announcement-body"].value = "Information";
  elements["announcement-priority"].value = "important";
  elements["announcement-image-mode"].value = "fit";
  elements["announcement-duration"].value = "15";
  elements["announcement-title"].listeners.input();
  assert.equal(elements["announcement-preview-title"].textContent, "Klubbesked");
  assert.equal(elements["announcement-preview-body"].textContent, "Information");
  assert.equal(elements["announcement-preview-kicker"].textContent, "Vigtig besked fra ISS");
  elements["announcement-image"].files = [{}];
  elements["announcement-image"].listeners.change();
  assert.equal(elements["announcement-preview-image"].src, "blob:fixture");
});
