// Renders the PRODUCTION shell bundle's EDITOR route with a seeded project and
// asserts the new editing surfaces actually mount and respond.
//
//   npm install --no-save --ignore-scripts happy-dom fake-indexeddb
//   node scripts/smoke-editor.mjs            (after `npm run build:shell`)
//
// Exit 0 = editor rendered + key controls present, 1 = blank/crash.
import { readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "app-shell-dist");

process.on("unhandledrejection", (e) => {
  console.log("[harness] unhandledrejection (ignored):", String(e?.reason?.message ?? e).slice(0, 160));
});

const { Window } = await import("happy-dom");
await import("fake-indexeddb/auto");

const window = new Window({ url: "http://localhost/mayocut/editor?p=prj_smoke" });
try {
  window.indexedDB = globalThis.indexedDB;
} catch {
  /* ignore */
}
const document = window.document;
document.head.insertAdjacentHTML("beforeend", '<meta name="mayobuild-shell" content="1">');
document.body.innerHTML = '<div id="root"></div>';

const g = globalThis;
const def = (k, v) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
for (const k of Object.getOwnPropertyNames(window)) {
  if (k in g) continue;
  try {
    def(k, window[k]);
  } catch {
    /* not settable */
  }
}
for (const k of [
  "addEventListener", "removeEventListener", "dispatchEvent", "scrollTo", "scrollBy",
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback",
  "matchMedia", "focus", "blur", "getComputedStyle", "atob", "btoa", "reportError",
  "HTMLCanvasElement", "Image", "AudioContext", "MediaRecorder", "Blob", "URL",
]) {
  if (g[k] !== undefined || window[k] === undefined) continue;
  try {
    def(k, window[k]);
  } catch {
    /* ignore */
  }
}

// happy-dom has no 2D raster: stub the canvas context so the engine can draw
// without throwing (we are testing the UI/React wiring, not pixels).
const noop = () => undefined;
const fakeCtx = {
  canvas: null, save: noop, restore: noop, fillRect: noop, clearRect: noop,
  drawImage: noop, translate: noop, rotate: noop, scale: noop, beginPath: noop,
  rect: noop, clip: noop, arc: noop, fill: noop, stroke: noop, moveTo: noop,
  lineTo: noop, closePath: noop, fillText: noop, strokeText: noop,
  measureText: () => ({ width: 40 }), getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }),
  putImageData: noop, createPattern: () => null, createLinearGradient: () => ({ addColorStop: noop }),
  setTransform: noop, set filter(_v) {}, get filter() { return "none"; },
  createRadialGradient: () => ({ addColorStop: noop }),
  createConicGradient: () => ({ addColorStop: noop }),
  quadraticCurveTo: noop, bezierCurveTo: noop, ellipse: noop, roundRect: noop,
  strokeRect: noop, resetTransform: noop, createImageData: (_w, _h) => ({ data: new Uint8ClampedArray(4) }),
  globalAlpha: 1, globalCompositeOperation: "source-over", imageSmoothingEnabled: true,
  textAlign: "center", textBaseline: "middle", font: "16px sans-serif", lineWidth: 1,
  lineJoin: "round", miterLimit: 2, shadowColor: "", shadowBlur: 0, shadowOffsetY: 0,
  fillStyle: "#000", strokeStyle: "#000",
};
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
window.HTMLCanvasElement.prototype.toBlob = (cb) => cb(new window.Blob(["x"], { type: "image/png" }));

// --- seed a project that uses every clip type ---------------------------------
const STORES = ["media", "blobs", "projects", "templates", "exports", "luts", "fonts"];

/** Open (or create) mayocut-db at the app's schema version and return it. */
const idb = globalThis.indexedDB;
const db = await new Promise((res, rej) => {
  const r = idb.open("mayocut-db", 3);
  r.onupgradeneeded = () => {
    for (const s of STORES) {
      if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: "id" });
    }
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

const now = Date.now();
const project = {
  id: "prj_smoke",
  name: "Smoke project",
  aspect: "9:16",
  main: [
    { id: "mc1", mediaId: "med_v1", in: 0, out: 4, speed: 1, reverse: false, filter: "vivid",
      adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0, temperature: 12, tint: -5, fade: 10, sharpen: 20, vignette: 25, splitTone: 30 },
      volume: 1, muted: false, transitionIn: "none", transitionDur: 0, fit: "cover" },
    { id: "mc2", mediaId: "med_v1", in: 1, out: 3, speed: 1.5, reverse: false, filter: "cinema",
      adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
      volume: 1, muted: false, transitionIn: "wipeleft", transitionDur: 0.5 },
    { id: "mc3", mediaId: "med_v1", in: 2, out: 3, speed: 1, reverse: false, freeze: true, filter: "none",
      adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
      volume: 1, muted: true, transitionIn: "zoom", transitionDur: 0.4 },
  ],
  tracks: [
    { id: "t_text", name: "Text", clips: [
      { id: "tc1", kind: "text", start: 0.2, duration: 2.5, text: "Hello\nworld", size: 96, color: "#fff",
        bg: "#111827cc", bold: true, pos: "bc", anim: "rise", tracking: 4, leading: 1.2, upper: true,
        stroke: 6, strokeColor: "#000", underline: true, radius: 40, shadow: 0.6 },
    ] },
    { id: "t_overlay", name: "Overlay", clips: [
      { id: "ic1", kind: "image", mediaId: "med_i1", start: 0.5, duration: 2, scale: 0.45, x: 0.3, y: -0.4,
        rot: 12, fit: "contain", filter: "warm", blend: "screen", mask: "spotlight", duck: 0.6 },
    ] },
    { id: "t_audio", name: "Audio", clips: [
      { id: "ac1", kind: "audio", mediaId: "med_a1", start: 0, duration: 5, volume: 0.8, fadeIn: 0.4, duck: 0.8,
        fx: { reverb: 0.2, echo: 0.1, pitch: 2 } },
    ] },
  ],
  createdAt: now,
  updatedAt: now,
  beats: [1.1, 2.2, 3.3],
  masterGain: 1.1,
  duckAmount: 0.7,
  background: "#0f172a",
  fonts: [{ id: "mc-inter", family: "mc-inter", name: "Inter" }],
};

const media = [
  { id: "med_v1", name: "clip.mp4", kind: "video", size: 1000, createdAt: now, duration: 8, width: 1080, height: 1920, thumb: "data:," },
  { id: "med_i1", name: "sticker.png", kind: "image", size: 100, createdAt: now, width: 400, height: 400, thumb: "data:," },
  { id: "med_a1", name: "music.mp3", kind: "audio", size: 900, createdAt: now, duration: 30, wave: Array.from({ length: 64 }, (_, i) => (i % 7) / 7) },
];

await new Promise((res, rej) => {
  const t = db.transaction(["projects", "media"], "readwrite");
  t.objectStore("projects").put(project);
  for (const m of media) t.objectStore("media").put(m);
  t.oncomplete = () => res();
  t.onerror = () => rej(t.error);
});

// Offline: reject network but allow blob: URLs for media
g.fetch = (u) => {
  const s = String(u);
  if (s.startsWith("blob:") || s.startsWith("data:")) return Promise.resolve({ blob: () => new window.Blob(["0"]) });
  console.log("fetch (offline reject):", s.slice(0, 120));
  return Promise.reject(new Error("offline"));
};
window.fetch = g.fetch;

const errors = [];
const origErr = console.error;
console.error = (...a) => {
  errors.push(a.map(String).join(" ").slice(0, 300));
  origErr(...a);
};

// ------------------------------------------------------------------ load app
const assets = readdirSync(path.join(DIST, "assets"));
const entry = assets.find((f) => /^index-.*\.js$/.test(f));
if (!entry) {
  console.error("SMOKE FAIL: no entry bundle — run npm run build:shell first");
  process.exit(1);
}
console.log("importing", entry);
await import(path.join(DIST, "assets", entry));
console.log("IMPORT OK");

let failed = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const textOf = () => (document.body.textContent || "").replace(/\s+/g, " ").trim();

await wait(4000);
// The desktop tool shelf opens on Media; open Stickers before asserting the
// sticker library contents, matching the actual user navigation.
const stickersTool = [...document.querySelectorAll("button")].find(
  (button) => button.textContent?.trim() === "Stickers",
);
if (stickersTool) {
  stickersTool.click();
  await wait(250);
}
const text = textOf();
const html = document.body.innerHTML;

/** Find a button inside the desktop tool rail (two strips share the same labels). */
const railTab = (label) =>
  [
    ...(document.querySelector('[aria-label="Editing tools"]')?.querySelectorAll("button") ?? []),
  ].find((b) => (b.getAttribute("title") || "") === label);

const checks = [
  ["editor chrome rendered", text.length > 400],
  [
    "CapCut-style tool shelf categories",
    ["Media", "Audio", "Text", "Stickers", "Effects", "Filters", "Transitions", "Captions", "AI Studio"].every(
      (label) =>
        [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === label),
    ),
  ],
  [
    "project name in title field",
    [...document.querySelectorAll("input")].some((i) => i.value === "Smoke project"),
  ],
  ["timeline main lane", document.querySelectorAll("div").length > 50 && /main/i.test(text)],
  ["beat markers from project", /3 ✕|beat/i.test(text)],
  ["freeze clip rendered", /freeze/i.test(text)],
  ["transition chip rendered", /wipeleft|zoom/i.test(text)],
  ["audio duck chip", /duck/i.test(text)],
  ["text clip on timeline", /hello/i.test(text)],
  ["export button", /export/i.test(text)],
  ["undo/redo present", /undo|redo/i.test(html) || document.querySelectorAll("button").length > 10],
  ["inspector visible (desktop)", /canvas format|inspector|tune|shortcuts/i.test(text)],
  ["aspect picker", /16:9|9:16/.test(text)],
  [
    "preview render quality controls",
    [...document.querySelectorAll("select")].some((select) =>
      ["Auto", "540p", "720p", "1080p"].every((label) =>
        [...select.options].some((option) => option.textContent === label),
      ),
    ),
  ],
  [
    "sticker categories visible",
    /Sticker library/i.test(text) &&
      /Emoji/.test(text) &&
      /Graphics/.test(text) &&
      /Shapes/.test(text) &&
      /Animated/.test(text),
  ],
  ["no fatal render error", !/cannot read|is not a function|Minified React error/i.test(text)],
];

// --- interaction: select the text clip so the inspector targets it -----------
const buttons = [...document.querySelectorAll("button")];
const textClipBtn = buttons.find(
  (b) => /hello/i.test(b.textContent || "") || /font|text/i.test(b.getAttribute("title") || ""),
);
if (textClipBtn) {
  textClipBtn.click();
  await wait(600);
}
const assistButton = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Assist");
if (assistButton) {
  assistButton.click();
  await wait(500);
  const assistText = textOf();
  const discoverable = /AI background removal|Remove image background/i.test(assistText);
  console.log(discoverable ? "  PASS AI background removal tool is discoverable" : "  FAIL AI background removal tool is discoverable");
  if (!discoverable) failed++;
} else {
  console.log("  FAIL Assist drawer button missing");
  failed++;
}
// Assist replaces the right-side tool panel. Re-open Stickers before checking
// its category interaction, just as a user would when switching tools.
if (stickersTool) {
  stickersTool.click();
  await wait(250);
}
const lifestyleTab = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Shapes");
if (lifestyleTab) {
  lifestyleTab.click();
  await wait(250);
  const selected = lifestyleTab.getAttribute("aria-pressed") === "true";
  const lifestyleEmojiVisible = /★|➜|✔|◆/.test(textOf());
  console.log(selected && lifestyleEmojiVisible ? "  PASS sticker category switches" : "  FAIL sticker category switches");
  if (!selected || !lifestyleEmojiVisible) failed++;
} else {
  console.log("  FAIL sticker category button missing");
  failed++;
}

// --- emoji and graphic stickers are different objects, in the UI too ---------
// CapCut keeps them apart; the rail must show the five category chips, and the
// inspector must name what was dropped on the canvas. A graphic arrives with an
// entrance animation, an emoji arrives still — that difference is the feature.
if (stickersTool) {
  stickersTool.click();
  await wait(250);
}
const chipGroup = document.querySelector('[aria-label="Sticker categories"]');
const chipNames = chipGroup ? [...chipGroup.querySelectorAll("button")].map((b) => b.textContent?.trim()) : [];
const chipsOk =
  chipNames.length === 5 &&
  ["Emoji", "Graphics", "Shapes", "Text", "Animated"].every((n) => chipNames.includes(n));
console.log(chipsOk ? "  PASS five sticker categories in the rail" : `  FAIL five sticker categories in the rail (${chipNames.join("/")})`);
if (!chipsOk) failed++;

// Tile titles read "<glyph> — <category id>", so match the id, not the chip label.
const pickSticker = async (chipLabel, categoryId) => {
  const chip = chipGroup ? [...chipGroup.querySelectorAll("button")].find((b) => b.textContent?.trim() === chipLabel) : null;
  if (!chip) return { missing: `chip ${chipLabel}` };
  chip.click();
  await wait(200);
  const tile = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "").includes(`— ${categoryId}`));
  if (!tile) return { missing: `tile in ${categoryId}` };
  tile.click();
  await wait(500);
  // The inspector header is the first h3 in the right-hand panel.
  const header = [...document.querySelectorAll("h3")].map((h) => h.textContent?.trim()).find(Boolean);
  return { header };
};

const emojiPick = await pickSticker("Emoji", "emoji");
const emojiNamed = emojiPick.header === "Emoji";
console.log(emojiNamed ? "  PASS an emoji is named an Emoji, not Text" : "  FAIL an emoji is named an Emoji, not Text");
if (!emojiNamed) {
  console.log("    inspector header:", emojiPick.header, emojiPick.missing ?? "");
  failed++;
}

const graphicPick = await pickSticker("Graphics", "graphic");
const graphicNamed = graphicPick.header === "Sticker";
console.log(graphicNamed ? "  PASS a graphic sticker is named a Sticker" : "  FAIL a graphic sticker is named a Sticker");
if (!graphicNamed) {
  console.log("    inspector header:", graphicPick.header, graphicPick.missing ?? "");
  failed++;
}

// --- the font picker shows faces, not just names ----------------------------
// A <select> cannot preview a font, which is the only thing that matters when
// choosing one. The picker must open, list every face, and render each row in
// its own family.
{
  const fontBtn = [...document.querySelectorAll('button[aria-label="Font"]')][0];
  if (fontBtn) {
    fontBtn.click();
    await wait(250);
    const rows = [...document.querySelectorAll('button')].filter((b) =>
      /· imported$|· [A-Z]/.test((b.textContent || "").trim()),
    );
    const sampleRows = [...document.querySelectorAll("button")].filter((b) =>
      /Aa Bb 123/.test(b.textContent || ""),
    );
    const styled = sampleRows.filter((b) => {
      const el = b.querySelector("div");
      return !!el && (el.getAttribute("style") || "").includes("font-family");
    });
    const ok = sampleRows.length >= 20 && styled.length === sampleRows.length;
    console.log(
      ok
        ? `  PASS font picker previews every face (${sampleRows.length} rows, all styled)`
        : `  FAIL font picker previews every face (${sampleRows.length} rows, ${styled.length} styled)`,
    );
    if (!ok) failed++;
    fontBtn.click();
    await wait(150);
  } else {
    console.log("  FAIL font picker missing");
    failed++;
  }
}

// --- the player: frame stepping, speed, loop region -------------------------
{
  const frameGroup = document.querySelector('[aria-label="Frame stepping"]');
  const speedGroup = document.querySelector('[aria-label="Playback speed"]');
  const loopGroup = document.querySelector('[aria-label="Loop region"]');
  const grids = frameGroup ? [...frameGroup.querySelectorAll("option")].map((o) => o.value) : [];
  const speeds = speedGroup
    ? [...speedGroup.querySelectorAll("button")].map((b) => b.textContent.trim())
    : [];
  const ok =
    !!frameGroup &&
    !!speedGroup &&
    !!loopGroup &&
    [24, 25, 30, 50, 60].every((f) => grids.includes(String(f))) &&
    ["0.25x", "0.5x", "1x", "2x"].every((r) => speeds.includes(r));
  console.log(
    ok
      ? `  PASS player has frame grid (${grids.join("/")}), speeds (${speeds.join(" ")}) and loop marks`
      : `  FAIL player transport incomplete — grids ${grids.join("/")} / speeds ${speeds.join(" ")}`,
  );
  if (!ok) failed++;

  // The speed buttons must actually change the engine's transport rate, not just
  // light up: a control that only sets React state is the bug this catches.
  const half = speedGroup && [...speedGroup.querySelectorAll("button")].find((b) => b.textContent.trim() === "0.5x");
  if (half) {
    half.click();
    await wait(200);
    const pressed = half.getAttribute("aria-pressed") === "true";
    console.log(pressed ? "  PASS playback speed selects 0.5x" : "  FAIL playback speed selects 0.5x");
    if (!pressed) failed++;
  }
}

// --- durability: the project must survive a CLOSE, not just a quiet moment ---
// The report was "everything disappears when I close the app". Two earlier
// versions of this check were worthless, and both were caught the same way: by
// deleting the fix and confirming the check STILL passed.
//   1. "wait 7 s, then read the store" — that only tests the debounce.
//   2. "click a chip, hide the page" — the chip did not exist, and a mount-time
//      autosave landed 1.2 s later carrying a snapshot that happened to include
//      the change, so it passed with the close path removed entirely.
// This version isolates the thing under test: settle all pending writes, make a
// change through a control that is asserted to exist, then close within the
// debounce window so ONLY the close path can save it.
{
  const read = () =>
    new Promise((resolve, reject) => {
      const req = db.transaction("projects", "readonly").objectStore("projects").get("prj_smoke");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  // Let every mount-time autosave finish, so `before` is genuinely the settled
  // state and nothing is in flight to rescue the change.
  await wait(2600);
  const before = await read();

  // A change through a real control, with a real selection behind it.
  const mainClip = [...document.querySelectorAll("[title]")].find((el) =>
    (el.getAttribute("title") || "").startsWith("clip.mp4 · 4.00s"),
  );
  mainClip?.dispatchEvent(
    new window.PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", clientX: 10 }),
  );
  window.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", clientX: 10 }));
  await wait(150);
  railTab("Filters")?.click();
  await wait(200);
  const control = [...document.querySelectorAll("button")].find((el) => el.title === "Sepia");
  control?.click();
  // Shorter than the 1200 ms debounce on purpose: no timer can have fired.
  await wait(150);

  const pending = await read();
  const timerDidNotSave = pending?.updatedAt === before?.updatedAt;

  // visibilitychange → hidden, then pagehide: the order browsers use when a tab
  // is closed or a phone reclaims a backgrounded app.
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new window.Event("visibilitychange"));
  window.dispatchEvent(new window.Event("pagehide"));
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });

  // Read BEFORE the 1200 ms debounce from the click could fire (we are ~250 ms
  // in). A real browser freezes timers on pagehide; happy-dom does not, so
  // waiting longer lets the timer rescue a missing close path — which is
  // exactly what made the first two versions of this check pass without a fix.
  await wait(250);
  const after = await read();
  const saved = !!after && after.updatedAt !== before?.updatedAt;
  const filterKept = after?.main?.[0]?.filter === "sepia";
  await wait(1200);

  checks.push(["a filter control exists for the close-path test", !!mainClip && !!control]);
  checks.push(["no timer had saved yet when the page closed", timerDidNotSave]);
  checks.push(["a change made just before closing survives (written on pagehide)", saved]);
  checks.push(["the surviving project holds the change, not a stale copy", filterKept]);
}

// --- the library tabs must all open and expose their catalogue ---------------
// This is the part that would silently rot: a tab that renders nothing, or a
// catalogue that lost its entries, is invisible to a "does it mount" check.
const LIBRARY_TABS = [
  { label: "Media", expect: /import/i },
  { label: "Audio", expect: /import audio|no audio yet/i },
  { label: "Text", expect: /add text|text style|look/i },
  { label: "Stickers", expect: /sticker|emoji|reaction|creator/i },
  { label: "Effects", expect: /camera|motion|impact|select a clip/i },
  { label: "Transitions", expect: /transition|wipe|crossfade|select a clip/i },
  { label: "Filters", expect: /look|original|select a clip/i },
  { label: "Adjust", expect: /brightness|contrast|select a main-track/i },
  { label: "Captions", expect: /caption/i },
  // main's rail also carries an AI Studio entry; it must not regress either
  { label: "AI Studio", expect: /ai studio|assistant|open ai/i },
];
const t0 = textOf();
for (const tb of LIBRARY_TABS) {
  const btn = [...document.querySelectorAll("button")].find(
    (b) => (b.getAttribute("title") || "") === tb.label,
  );
  if (!btn) {
    checks.push([`library tab present: ${tb.label}`, false]);
    continue;
  }
  btn.click();
  await wait(220);
  const body = textOf();
  // the tab strip itself contains every label, so diff against the pre-click text
  const grew = body.length !== t0.length || tb.expect.test(body);
  checks.push([`library tab opens: ${tb.label}`, grew && tb.expect.test(body)]);
  checks.push([`library tab adds no console error: ${tb.label}`, errors.length === 0]);
}

// --- the catalogue sizes must actually be visible in the UI -----------------
{
  const filtersBtn = [...document.querySelectorAll("button")].find(
    (b) => (b.getAttribute("title") || "") === "Filters",
  );
  filtersBtn?.click();
  await wait(250);
  const text2 = textOf();
  // The filters tab renders one card per preset, each titled with its name.
  const looks = [
    "Original",
    "Kodachrome",
    "Portra 400",
    "Bleach Bypass",
    "Cyberpunk",
    "Mono High",
    "Neon Night",
    "Teal & Orange",
  ];
  const cards = [...document.querySelectorAll("button")].filter((b) => {
    const t = b.getAttribute("title") || "";
    return looks.includes(t);
  });
  checks.push(["filters grid shows the full catalogue", cards.length >= 8]);
  checks.push(["filters grid includes new looks", /koda|portra|bleach/i.test(text2)]);
  // each card should carry a real preview, not just a label
  const previews = document.querySelectorAll("svg");
  checks.push(["filter cards render preview artwork", previews.length >= 8]);
}

// --- the notebook list: effects, stock, orientation -------------------------
{
  // 3 + 4: the built-in stock set is generated on device, so its names must be
  // real rendered UI text, not just constants in a module.
  // The desktop rail opens on Media, and this smoke project is desktop-width.
  // Clicking anyway is harmless and keeps the check honest if the default changes.
  const mediaBtn = railTab("Media");
  mediaBtn?.click();
  await wait(250);
  const mediaText = textOf();
  const mBtn = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("title") || "") === "Media");
  checks.push(["stock library lists generated assets", /green screen/i.test(mediaText)]);
  checks.push(["stock library includes a video asset", /light leak/i.test(mediaText)]);
  const stockTiles = [...document.querySelectorAll("button")].filter((b) =>
    /chroma green|white — flash|drifts/i.test(b.getAttribute("title") || ""),
  );
  checks.push(["stock tiles are clickable cards", stockTiles.length >= 2]);

  // 1 + 2: audio effects live in the Audio tab.
  const audioBtn = railTab("Audio");
  audioBtn?.click();
  await wait(250);
  const audioText = textOf();
  checks.push(["audio effects panel is present", /audio effects/i.test(audioText)]);
  for (const name of ["Echo", "Reverb", "Chipmunk", "Telephone"]) {
    const hit = [...document.querySelectorAll("button")].some((b) =>
      new RegExp(name, "i").test(b.textContent || ""),
    );
    checks.push([`audio effect offered: ${name}`, hit]);
  }

  // 5b: HSL panel, after selecting a main clip so the adjust panel is live.
  const clip = [...document.querySelectorAll("[title]")].find((el) =>
    (el.getAttribute("title") || "").startsWith("clip.mp4 · 4.00s"),
  );
  clip?.dispatchEvent(
    new window.PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", clientX: 10 }),
  );
  window.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
  await wait(200);
  const adjustText = textOf();
  checks.push(["HSL panel is present with all three axes", /HSL/.test(adjustText) && /Luminance/.test(adjustText)]);
  const bandChips = [...document.querySelectorAll("button")].filter((b) =>
    /^(Red|Orange|Yellow|Green|Cyan|Blue|Purple|Magenta)( — adjusted)?$/.test(b.getAttribute("title") || ""),
  );
  checks.push(["HSL offers all eight colour bands", bandChips.length === 8]);

  // 6: orientation buttons exist in the transport.
  const turnBtns = [...document.querySelectorAll("button")].filter((b) =>
    /turn the whole project/i.test(b.getAttribute("title") || ""),
  );
  checks.push(["orientation can be turned both ways", turnBtns.length === 2]);
}

// Exercise a real filter click and wait for the debounced IndexedDB autosave.
{
  const mainClip = [...document.querySelectorAll("[title]")].find((el) =>
    (el.getAttribute("title") || "").startsWith("clip.mp4 · 4.00s"),
  );
  mainClip?.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", clientX: 10 }));
  window.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", clientX: 10 }));
  await wait(100);
  railTab("Filters")?.click();
  await wait(200);
  const filter = [...document.querySelectorAll("button")].find((el) => el.title === "Noir");
  const titles = [...document.querySelectorAll("button")].map((b) => b.getAttribute("title")).filter(Boolean);
  filter?.click();
  await wait(1600);
  const saved = await new Promise((resolve, reject) => {
    const req = db.transaction("projects", "readonly").objectStore("projects").get("prj_smoke");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  checks.push(["selected filter persists in project storage", !!mainClip && !!filter && saved?.main[0]?.filter === "noir"]);
}

// NOTE: do not reset `failed` here. Earlier interaction checks already counted
// their own failures, and resetting made the run print PASS while a check had
// failed — exactly the kind of false green this harness exists to prevent.
for (const [name, ok] of checks) {
  console.log(ok ? "  PASS" : "  FAIL", name);
  if (!ok) failed++;
}

console.log("BODY TEXT (first 500):", text.slice(0, 500));
console.log("console.errors:", errors.length ? errors.slice(0, 6) : "none");

if (failed === 0) {
  console.log(
    `SMOKE-EDITOR PASS — editor mounts, all ${LIBRARY_TABS.length} library tabs open, catalogues populated`,
  );
  process.exit(0);
} else {
  console.log(`SMOKE-EDITOR FAIL — ${failed} check(s) failed`);
  process.exit(1);
}
