const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const pages = [
  {
    name: "local",
    html: fs.readFileSync(path.join(__dirname, "..", "src", "common_room_display", "static", "upload.html"), "utf8"),
    endpoint: "/api/uploads",
  },
  {
    name: "relay",
    html: fs.readFileSync(path.join(__dirname, "..", "..", "api", "handlers", "display_relay.php"), "utf8")
      .match(/<!doctype html>[\s\S]*?<\/html>/)[0],
    endpoint: "./photos",
  },
];

function createPage(page, options = {}) {
  const elements = new Map();
  const requests = [];
  const revoked = [];
  const timers = new Map();
  const images = [];
  const readers = [];
  let sequence = 0;
  let replacedUrl;
  function element(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      const node = {
        files: [], hidden: true, disabled: id === "submit",
        naturalWidth: 1920, naturalHeight: 1080, textContent: "",
        addEventListener: (name, callback) => handlers.set(name, callback),
        dispatch: (name) => handlers.get(name)?.({ preventDefault() {} }),
        click() { this.clicked = true; },
        focus() { this.focused = true; },
        setAttribute(name, value) { this[name] = value; },
        removeAttribute(name) { delete this[name]; },
      };
      let value = "";
      Object.defineProperty(node, "value", {
        get: () => value,
        set(next) { value = next; if (!next) node.files = []; },
      });
      elements.set(id, node);
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element },
    location: { hash: options.hash ?? `#${"a".repeat(64)}`, pathname: "/api/v1/display-relay/upload" },
    history: { replaceState: (_state, _title, url) => { replacedUrl = url; } },
    URL: {
      createObjectURL: () => `blob:${++sequence}`,
      revokeObjectURL: url => revoked.push(url),
    },
    Image: class {
      constructor() { images.push(this); }
    },
    FileReader: class {
      constructor() { readers.push(this); }
      readAsDataURL(file) { this.file = file; }
    },
    AbortController, TypeError,
    setTimeout(callback, delay) { timers.set(++sequence, { callback, delay }); return sequence; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, request) => {
      requests.push({ url, ...request });
      return options.fetch ? options.fetch(url, request) : { ok: true, json: async () => ({ id: "photo" }) };
    },
  });
  const script = [...page.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script, context);
  return {
    element, requests, revoked, timers, images, readers,
    replacedUrl: () => replacedUrl,
    choose(file = { name: "klub.jpg", type: "image/jpeg", size: 1024 }, source = "photo", decode = true) {
      element(source).files = file ? [file] : [];
      if (file) element(source).value = file.name;
      element(source).dispatch("change");
      if (decode && images.at(-1)?.src) this.decode();
      return file;
    },
    decode(image = images.at(-1)) {
      image.naturalWidth = element("preview").naturalWidth;
      image.naturalHeight = element("preview").naturalHeight;
      image.onload();
    },
    failDecode: (image = images.at(-1)) => image.onerror(),
    readDataUrl(reader = readers.at(-1)) {
      reader.result = "data:image/jpeg;base64,fixture";
      reader.onload();
    },
    send: () => element("upload-form").dispatch("submit"),
  };
}

for (const page of pages) {
  test(`${page.name}: gallery never forces capture; camera requests rear camera`, () => {
    assert.match(page.html, /<input id="photo"[^>]*accept="image\/\*"[^>]*>/);
    assert.doesNotMatch(page.html.match(/<input id="photo"[^>]*>/)[0], /capture/);
    assert.match(page.html, /<input id="camera"[^>]*capture="environment"/);
    const ui = createPage(page);
    ui.element("gallery").dispatch("click");
    assert.equal(ui.element("photo").clicked, true);
    ui.element("take-photo").dispatch("click");
    assert.equal(ui.element("camera").clicked, true);
  });

  test(`${page.name}: preview must decode before send; cancellation preserves selection`, () => {
    const ui = createPage(page);
    assert.equal(ui.element("submit").disabled, true);
    ui.choose(undefined, "photo", false);
    assert.equal(ui.element("submit").disabled, true);
    ui.decode();
    assert.equal(ui.element("submit").disabled, false);
    const url = ui.element("preview").src;
    ui.choose(null, "camera");
    assert.equal(ui.element("preview").src, url);
    assert.equal(ui.element("submit").disabled, false);
  });

  test(`${page.name}: camera and gallery share upload flow and release preview after success`, async () => {
    for (const source of ["photo", "camera"]) {
      const ui = createPage(page);
      const file = ui.choose(undefined, source);
      await ui.send();
      assert.equal(ui.requests.length, 1);
      assert.equal(ui.requests[0].url, page.endpoint);
      assert.equal(ui.requests[0].body, file);
      assert.equal(ui.requests[0].headers["Content-Type"], "image/jpeg");
      if (page.name === "relay") assert.equal(ui.requests[0].headers["X-Display-Upload-Token"], "a".repeat(64));
      assert.equal(ui.element("preview").hidden, true);
      assert.equal(ui.element("submit").disabled, true);
      assert.equal(ui.element("message").className, "success");
      assert.equal(ui.revoked.length, 1);
      assert.equal(ui.timers.size, 0);
    }
  });

  test(`${page.name}: replacement and removal release object URLs; filenames stay text`, () => {
    const ui = createPage(page);
    ui.choose({ name: "<img onerror=alert(1)>.png", type: "image/png", size: 2048 });
    assert.match(ui.element("details").textContent, /<img onerror=/);
    ui.choose();
    assert.equal(ui.revoked.length, 1);
    ui.element("remove").dispatch("click");
    assert.equal(ui.revoked.length, 2);
    assert.equal(ui.element("preview").hidden, true);
    assert.equal(ui.element("submit").disabled, true);
    assert.equal(ui.element("gallery").focused, true);
  });

  test(`${page.name}: unsupported, empty and over-20MP images are rejected`, async () => {
    for (const type of ["image/heic", "image/svg+xml", "image/gif", ""]) {
      const ui = createPage(page);
      ui.choose({ name: "bad", type, size: 1024 });
      await ui.send();
      assert.equal(ui.requests.length, 0);
      assert.equal(ui.element("message").className, "error");
    }
    const empty = createPage(page);
    empty.choose({ name: "empty.jpg", type: "image/jpeg", size: 0 });
    assert.equal(empty.element("submit").disabled, true);
    const huge = createPage(page);
    huge.element("preview").naturalWidth = 5001;
    huge.element("preview").naturalHeight = 4000;
    huge.choose();
    assert.equal(huge.element("submit").disabled, true);
    assert.match(huge.element("message").textContent, /20 megapixel/);
    huge.element("preview").naturalWidth = 5000;
    huge.choose();
    assert.equal(huge.element("submit").disabled, false);
  });

  test(`${page.name}: HTTP errors, including HTML 413, preserve photo for retry`, async () => {
    for (const status of [400, 413, 429, 500, 507]) {
      const ui = createPage(page, { fetch: async () => ({
        ok: false, status, json: async () => { throw new Error("HTML must not be parsed as JSON"); },
      }) });
      ui.choose();
      await ui.send();
      assert.equal(ui.element("message").className, "error");
      assert.doesNotMatch(ui.element("message").textContent, /HTML/);
      assert.equal(ui.element("submit").disabled, false);
      assert.equal(ui.element("preview").hidden, false);
      assert.equal(ui.timers.size, 0);
    }
  });

  test(`${page.name}: slow requests lock all controls and prevent duplicate uploads`, async () => {
    let resolve;
    const ui = createPage(page, { fetch: () => new Promise(done => { resolve = done; }) });
    const file = ui.choose();
    const sending = ui.send();
    for (const id of ["gallery", "take-photo", "remove", "submit"]) assert.equal(ui.element(id).disabled, true);
    assert.equal(ui.element("upload-form")["aria-busy"], "true");
    await ui.send();
    assert.equal(ui.requests.length, 1);
    ui.choose({ name: "other.jpg", type: "image/jpeg", size: 12 });
    assert.equal(ui.requests[0].body, file);
    resolve({ ok: true, json: async () => ({ id: "photo" }) });
    await sending;
    assert.equal(ui.element("upload-form")["aria-busy"], "false");
  });

  test(`${page.name}: network failures and timeouts preserve retry and clear timer`, async () => {
    const offline = createPage(page, { fetch: async () => { throw new TypeError("Failed to fetch"); } });
    offline.choose();
    await offline.send();
    assert.match(offline.element("message").textContent, /forbindelse/);
    assert.equal(offline.element("submit").disabled, false);
    const timed = createPage(page, { fetch: (_url, request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(request.signal.reason));
    }) });
    timed.choose();
    const sending = timed.send();
    const timer = [...timed.timers.values()][0];
    assert.equal(timer.delay, 60000);
    timer.callback();
    await sending;
    assert.match(timed.element("message").textContent, /lang tid/);
    assert.equal(timed.element("submit").disabled, false);
    assert.equal(timed.timers.size, 0);
  });
}

test("relay: missing/malformed capability disables selection and removes fragment", async () => {
  for (const hash of ["", "#bad", `#${"A".repeat(64)}`]) {
    const ui = createPage(pages[1], { hash });
    assert.equal(ui.replacedUrl(), "/api/v1/display-relay/upload");
    assert.equal(ui.element("gallery").disabled, true);
    ui.choose();
    await ui.send();
    assert.equal(ui.requests.length, 0);
    assert.equal(ui.element("submit").disabled, true);
    assert.match(ui.element("message").textContent, /QR-koden/);
  }
});

test("relay: expired invitation disables all subsequent uploads", async () => {
  const ui = createPage(pages[1], { fetch: async () => ({ ok: false, status: 404 }) });
  ui.choose();
  await ui.send();
  assert.match(ui.element("message").textContent, /udløbet/);
  for (const id of ["gallery", "take-photo", "remove", "submit"]) assert.equal(ui.element(id).disabled, true);
  await ui.send();
  assert.equal(ui.requests.length, 1);
});

test("relay: 10 MiB boundary is accepted; oversized files are rejected before decoding", () => {
  const ui = createPage(pages[1]);
  ui.choose({ name: "large.jpg", type: "image/jpeg", size: 10485760 });
  assert.equal(ui.element("submit").disabled, false);
  ui.choose({ name: "large.jpg", type: "image/jpeg", size: 10485761 });
  assert.equal(ui.element("submit").disabled, true);
  assert.match(ui.element("message").textContent, /10 MB/);
});

test("relay CSP permits blob previews and keeps capabilities private", () => {
  const php = fs.readFileSync(path.join(__dirname, "..", "..", "api", "handlers", "display_relay.php"), "utf8");
  assert.match(php, /img-src 'self' blob:/);
  assert.match(php, /connect-src 'self'/);
  assert.match(php, /Referrer-Policy: no-referrer/);
  assert.match(php, /Cache-Control: no-store/);
});

for (const page of pages) {
  test(`${page.name}: file details use KB for small photos and MB for large ones`, () => {
    const ui = createPage(page);
    ui.choose({ name: "small.jpg", type: "image/jpeg", size: 2048 });
    assert.equal(ui.element("details").textContent, "small.jpg · 2 KB");
    ui.choose({ name: "large.jpg", type: "image/jpeg", size: 2097152 });
    assert.equal(ui.element("details").textContent, "large.jpg · 2 MB");
  });

  test(`${page.name}: the selected gallery file remains attached until removal or success`, async () => {
    const ui = createPage(page);
    const file = ui.choose();
    assert.equal(ui.element("photo").files[0], file);
    assert.equal(ui.element("photo").value, file.name);
    await ui.send();
    assert.equal(ui.element("photo").files.length, 0);
  });

  test(`${page.name}: blob preview failure retries with a data URL`, () => {
    const ui = createPage(page);
    const file = ui.choose(undefined, "photo", false);
    ui.failDecode();
    assert.equal(ui.element("submit").disabled, true);
    assert.equal(ui.readers.length, 1);
    assert.equal(ui.readers[0].file, file);
    ui.readDataUrl();
    assert.match(ui.images[0].src, /^data:/);
    ui.decode();
    assert.equal(ui.element("submit").disabled, false);
    assert.equal(ui.element("preview").hidden, false);
    assert.match(ui.element("preview").src, /^data:/);
  });

  test(`${page.name}: old image and file-reader callbacks cannot reject a new selection`, () => {
    const ui = createPage(page);
    ui.choose(undefined, "photo", false);
    const oldImage = ui.images[0];
    ui.failDecode();
    const oldReader = ui.readers[0];
    ui.choose({ name: "new.jpg", type: "image/jpeg", size: 4096 });
    const newPreview = ui.element("preview").src;
    ui.failDecode(oldImage);
    ui.decode(oldImage);
    ui.readDataUrl(oldReader);
    oldReader.onerror();
    assert.equal(ui.element("preview").src, newPreview);
    assert.equal(ui.element("submit").disabled, false);
    assert.match(ui.element("details").textContent, /new.jpg/);
    assert.equal(ui.element("message").className, "");
  });

  test(`${page.name}: unreadable gallery files display an error and cannot be sent`, async () => {
    const ui = createPage(page);
    ui.choose(undefined, "photo", false);
    ui.failDecode();
    ui.readers[0].onerror();
    assert.equal(ui.element("message").className, "error");
    assert.match(ui.element("message").textContent, /læses fra galleriet/);
    await ui.send();
    assert.equal(ui.requests.length, 0);
  });

  test(`${page.name}: unsupported browser decoding offers explicit server-validated upload`, async () => {
    const ui = createPage(page, { fetch: async () => ({ ok: false, status: 400 }) });
    const file = ui.choose(undefined, "photo", false);
    ui.failDecode();
    ui.readDataUrl();
    ui.failDecode();
    assert.equal(ui.element("submit").disabled, false);
    assert.match(ui.element("submit").textContent, /uden forhåndsvisning/);
    assert.match(ui.element("message").textContent, /kontrollerer filen/);
    assert.equal(ui.element("preview").hidden, true);
    await ui.send();
    assert.equal(ui.requests[0].body, file);
    assert.equal(ui.element("message").className, "error");
    assert.equal(ui.element("photo").files[0], file);
  });

  test(`${page.name}: gallery files without MIME metadata use a supported filename extension`, async () => {
    for (const [name, type, expected] of [
      ["today.JPG", "", "image/jpeg"],
      ["today.jpeg", "image/jpg", "image/jpeg"],
      ["today.png", "application/octet-stream", "image/png"],
      ["today.webp", "", "image/webp"],
    ]) {
      const ui = createPage(page);
      const file = ui.choose({ name, type, size: 2048 });
      await ui.send();
      assert.equal(ui.requests.length, 1);
      assert.equal(ui.requests[0].headers["Content-Type"], expected);
      assert.equal(ui.requests[0].body, file);
    }
    for (const name of ["photo", "photo.heic", "photo.svg", "photo.gif", "photo.constructor"]) {
      const ui = createPage(page);
      ui.choose({ name, type: "", size: 2048 });
      assert.equal(ui.element("submit").disabled, true);
    }
  });
}
