#!/usr/bin/env node
// Editor interaction timings, measured in happy-dom against the real bundle.
//
// Same bootstrapping as smoke-editor.mjs (production bundle, seeded project,
// stubbed canvas), but the point here is not "does it render" — it is "how long
// does one interaction take". Each case dispatches a real DOM event and waits
// for React to flush, so the number includes render + commit + effect work.
//
//   npm install --no-save --ignore-scripts happy-dom fake-indexeddb
//   npm run build:shell && node scripts/perf-editor.mjs
//
// Caveat that must not be papered over: happy-dom is not a browser. Absolute
// milliseconds here are lower than a real device and there is no rasterisation.
// The numbers are useful for FINDING a hot path and for proving a change moves
// the number in the right direction — not for claiming a frame budget.
import { readdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "app-shell-dist");

process.on("unhandledrejection", () => {});

const { Window } = await import("happy-dom");
await import("fake-indexeddb/auto");

const window = new Window({ url: "http://localhost/mayocut/editor?p=prj_perf" });
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
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "scrollTo",
  "scrollBy",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "matchMedia",
  "focus",
  "blur",
  "getComputedStyle",
  "atob",
  "btoa",
  "reportError",
  "HTMLCanvasElement",
  "Image",
  "AudioContext",
  "MediaRecorder",
  "Blob",
  "URL",
]) {
  if (g[k] !== undefined || window[k] === undefined) continue;
  try {
    def(k, window[k]);
  } catch {
    /* ignore */
  }
}

const noop = () => undefined;
const fakeCtx = {
  canvas: null,
  save: noop,
  restore: noop,
  fillRect: noop,
  clearRect: noop,
  drawImage: noop,
  translate: noop,
  rotate: noop,
  scale: noop,
  beginPath: noop,
  rect: noop,
  clip: noop,
  arc: noop,
  fill: noop,
  stroke: noop,
  moveTo: noop,
  lineTo: noop,
  closePath: noop,
  fillText: noop,
  strokeText: noop,
  measureText: () => ({ width: 40 }),
  getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }),
  putImageData: noop,
  createPattern: () => null,
  createLinearGradient: () => ({ addColorStop: noop }),
  setTransform: noop,
  set filter(_v) {},
  get filter() {
    return "none";
  },
  createRadialGradient: () => ({ addColorStop: noop }),
  createConicGradient: () => ({ addColorStop: noop }),
  quadraticCurveTo: noop,
  bezierCurveTo: noop,
  ellipse: noop,
  roundRect: noop,
  arcTo: noop,
  strokeRect: noop,
  resetTransform: noop,
  createImageData: (_w, _h) => ({ data: new Uint8ClampedArray(4) }),
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  imageSmoothingEnabled: true,
  textAlign: "center",
  textBaseline: "middle",
  font: "16px sans-serif",
  lineWidth: 1,
  lineJoin: "round",
  miterLimit: 2,
  shadowColor: "",
  shadowBlur: 0,
  shadowOffsetY: 0,
  fillStyle: "#000",
  strokeStyle: "#000",
};
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
window.HTMLCanvasElement.prototype.toBlob = (cb) =>
  cb(new window.Blob(["x"], { type: "image/png" }));

// ---------------------------------------------------------------- seed project
const STORES = ["media", "blobs", "projects", "templates", "exports", "luts", "fonts"];
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
// A project with the weight of a real edit: many clips, keyframes, words, grade.
const mainClips = 14;
const project = {
  id: "prj_perf",
  name: "Perf project",
  aspect: "9:16",
  main: Array.from({ length: mainClips }, (_, i) => ({
    id: `mc${i}`,
    mediaId: "med_v1",
    in: 0,
    out: 3,
    speed: 1,
    reverse: false,
    filter: "vivid",
    adjust: {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      temperature: 8,
      tint: 0,
      fade: 4,
      sharpen: 10,
      vignette: 10,
      splitTone: 8,
    },
    curves: {
      rgb: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.55 },
        { x: 1, y: 1 },
      ],
    },
    hsl: { red: { h: 4, s: 10, l: 0 } },
    // Real keyframe shape: { at, v: AnimValues }. Seeding anything else makes the
    // engine throw mid-draw, which is what the first run of this harness did.
    keyframes: Array.from({ length: 6 }, (_, k) => ({
      at: k * 0.4,
      v: { x: 0, y: 0, scale: 1 + k * 0.01, rotation: 0, opacity: 1 },
    })),
    volume: 1,
    muted: false,
    transitionIn: i ? "fade" : "none",
    transitionDur: i ? 0.4 : 0,
    fit: "cover",
  })),
  tracks: [
    {
      id: "t_text",
      name: "Text",
      clips: Array.from({ length: 6 }, (_, i) => ({
        id: `tc${i}`,
        kind: "text",
        start: i * 1.5,
        duration: 1.4,
        text: `Line ${i}\nsecond row`,
        size: 96,
        color: "#fff",
        bg: "#111827cc",
        bold: true,
        pos: "bc",
        anim: "rise",
        tracking: 4,
        leading: 1.2,
        upper: true,
        stroke: 6,
        strokeColor: "#000",
        radius: 40,
        shadow: 0.6,
        words: "one two three four five six seven eight"
          .split(" ")
          .map((w, k) => ({ text: w, start: k * 0.15, end: k * 0.15 + 0.12 })),
      })),
    },
    {
      id: "t_overlay",
      name: "Overlay",
      clips: [
        {
          id: "ic1",
          kind: "image",
          mediaId: "med_i1",
          start: 0.5,
          duration: 2,
          scale: 0.45,
          x: 0.3,
          y: -0.4,
          rot: 12,
          fit: "contain",
          filter: "warm",
          blend: "screen",
          mask: "spotlight",
          duck: 0.6,
        },
        {
          id: "ic2",
          kind: "image",
          mediaId: "med_i1",
          start: 3,
          duration: 2,
          scale: 0.3,
          x: -0.2,
          y: 0.2,
        },
      ],
    },
    {
      id: "t_audio",
      name: "Audio",
      clips: [
        {
          id: "ac1",
          kind: "audio",
          mediaId: "med_a1",
          start: 0,
          duration: 12,
          volume: 0.8,
          fadeIn: 0.4,
          duck: 0.8,
          fx: { reverb: 0.2, echo: 0.1, pitch: 2 },
        },
      ],
    },
  ],
  createdAt: now,
  updatedAt: now,
  beats: [1.1, 2.2, 3.3],
  masterGain: 1.1,
  duckAmount: 0.7,
  background: "#0f172a",
  fonts: [],
};

const media = [
  {
    id: "med_v1",
    name: "clip.mp4",
    kind: "video",
    size: 1000,
    createdAt: now,
    duration: 8,
    width: 1080,
    height: 1920,
    thumb: "data:,",
  },
  {
    id: "med_i1",
    name: "sticker.png",
    kind: "image",
    size: 100,
    createdAt: now,
    width: 400,
    height: 400,
    thumb: "data:,",
  },
  {
    id: "med_a1",
    name: "music.mp3",
    kind: "audio",
    size: 900,
    createdAt: now,
    duration: 30,
    wave: Array.from({ length: 64 }, (_, i) => (i % 7) / 7),
  },
];

await new Promise((res, rej) => {
  const t = db.transaction(["projects", "media"], "readwrite");
  t.objectStore("projects").put(project);
  for (const m of media) t.objectStore("media").put(m);
  t.oncomplete = () => res();
  t.onerror = () => rej(t.error);
});

g.fetch = (u) => {
  const s = String(u);
  if (s.startsWith("blob:") || s.startsWith("data:"))
    return Promise.resolve({ blob: () => new window.Blob(["0"]) });
  return Promise.reject(new Error("offline"));
};
window.fetch = g.fetch;

// ------------------------------------------------------------------- load app
const assets = readdirSync(path.join(DIST, "assets"));
const entry = assets.find((f) => /^index-.*\.js$/.test(f));
if (!entry) {
  console.error("no bundle — run npm run build:shell first");
  process.exit(1);
}
const t0 = performance.now();
await import(path.join(DIST, "assets", entry));
const importMs = performance.now() - t0;

// Split "the bundle executed" from "React finished mounting a usable editor",
// because they are fixed by completely different changes.
let firstRoot = performance.now();
const started = performance.now();
while (performance.now() - started < 15000) {
  if (document.querySelector('[aria-label="Editing tools"]')) {
    firstRoot = performance.now();
    break;
  }
  await new Promise((r) => setTimeout(r, 25));
}
const mountMs = firstRoot - t0;
// give effects/IndexedDB a moment to settle before timing interactions
await new Promise((r) => setTimeout(r, 600));
console.log(`bundle import:  ${importMs.toFixed(0)} ms`);
console.log(`editor usable:  ${mountMs.toFixed(0)} ms (import + React mount + data load)\n`);

const flush = async (rounds = 2) => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
};

const buttons = () => [...document.querySelectorAll("button")];
const byText = (txt) => buttons().find((b) => (b.textContent || "").trim() === txt);

/** Time one interaction: dispatch, then wait for React to settle. */
async function time(name, fn, { rounds = 5 } = {}) {
  const times = [];
  for (let i = 0; i < rounds; i++) {
    await flush();
    const a = performance.now();
    await fn(i);
    await flush();
    times.push(performance.now() - a);
  }
  times.sort((x, y) => x - y);
  const median = times[Math.floor(times.length / 2)];
  const worst = times[times.length - 1];
  return { name, median, worst };
}

const results = [];
const record = (r) => {
  results.push(r);
  console.log(
    `  ${r.name.padEnd(38)} median ${r.median.toFixed(1)} ms   worst ${r.worst.toFixed(1)} ms`,
  );
};

// ------------------------------------------------- 1. select a clip and a slider
const textClip = buttons().find((b) => /Line 0|Hello/i.test(b.textContent || ""));
if (textClip) {
  textClip.click();
  await flush(3);
}

const sliders = () => [...document.querySelectorAll('input[type="range"]')];
console.log("interactions");
record(
  await time("tool tab switch (Stickers→Effects)", async () => {
    const before = document.querySelectorAll("*").length;
    const a = byText("Stickers");
    const b = byText("Effects");
    a?.click();
    await flush();
    b?.click();
    await flush();
    globalThis.__lastNodes = document.querySelectorAll("*").length - before;
  }),
);

record(
  await time("inspector slider drag (1 event)", async (i) => {
    const s = sliders()[0];
    if (!s) return;
    const min = Number(s.min || 0);
    const max = Number(s.max || 100);
    const v = min + ((max - min) * (20 + (i % 10) * 5)) / 100;
    s.value = String(v);
    s.dispatchEvent(new window.Event("input", { bubbles: true }));
    s.dispatchEvent(new window.Event("change", { bubbles: true }));
  }),
);

record(
  await time("colour chip apply", async () => {
    const chip = buttons().find(
      (b) =>
        /^#[0-9a-f]{6}$/i.test((b.getAttribute("title") || "").trim()) ||
        /white|black|red/i.test(b.getAttribute("title") || ""),
    );
    chip?.click();
  }),
);

record(
  await time("undo", async () => {
    const u = buttons().find((b) => /undo/i.test(b.getAttribute("title") || ""));
    u?.click();
  }),
);

console.log("");
console.log(
  `\nDOM: ${document.querySelectorAll("*").length} nodes in the editor` +
    (globalThis.__lastNodes !== undefined ? `, tab switch touched ${globalThis.__lastNodes}` : ""),
);
const biggest = [...results].sort((a, b) => b.median - a.median)[0];
console.log(`slowest interaction: ${biggest.name} at ${biggest.median.toFixed(1)} ms (happy-dom)`);
console.log("NOTE: happy-dom has no rasterisation and no real layout. Use these for");
console.log("relative comparisons and hot-path discovery, not as a device budget.");
