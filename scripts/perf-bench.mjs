#!/usr/bin/env node
// Interaction-latency probe.
//
// "It feels slow" is not a bug report you can fix. This turns it into numbers by
// timing the exact work that happens between a user moving a control and the
// canvas showing the result:
//
//   pushUndo()      -> JSON.stringify(project)  (a full deep copy, per event)
//   mutation        -> Object.assign onto the clip
//   commitChange()  -> bus bump + React setState(project copy) + draw()
//
// It runs against a project shaped like the ones people actually edit — several
// main clips with keyframes and curves, text overlays with per-word timing,
// audio with effects, a grade — because per-event cost grows with project size
// and a three-clip toy project hides exactly the problem being measured.
//
//   node scripts/perf-bench.mjs          # measure
//   node scripts/perf-bench.mjs --json   # machine-readable
//
// No browser and no canvas: this measures the BOOKKEEPING around a change, which
// is what a drag pays for. Frame rasterisation is measured separately by the
// smoke tests.
import { performance } from "node:perf_hooks";

const T = await import("../.diag/b-types.mjs");

const asJson = process.argv.includes("--json");

/** A project with the shape and size of a real wedding/YouTube edit. */
function realisticProject({ mainClips = 12, textClips = 6, audioClips = 3, keyframes = 6 } = {}) {
  const p = T.newProject("Perf project", "16:9");
  p.main = [];
  for (let i = 0; i < mainClips; i++) {
    p.main.push({
      id: `mc_${i}`,
      mediaId: `med_${i}`,
      start: i * 4,
      duration: 4,
      speed: 1,
      transition: { kind: "fade", duration: 0.4 },
      adjust: { brightness: 5, contrast: 10, saturation: -3, temp: 200, tint: 0, fade: 2 },
      curves: {
        rgb: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.55 },
          { x: 1, y: 1 },
        ],
      },
      hsl: { red: { h: 4, s: 12, l: 0 } },
      keyframes: Array.from({ length: keyframes }, (_, k) => ({
        t: k * 0.5,
        values: { scale: 1 + k * 0.02, x: 0, y: 0, rot: 0, opacity: 1 },
      })),
      words: [],
    });
  }
  const text = p.tracks.find((t) => t.id === "t_text");
  text.clips = Array.from({ length: textClips }, (_, i) => ({
    id: `tx_${i}`,
    kind: "text",
    start: i * 2,
    duration: 2,
    text: `Caption line ${i} with a few words`,
    size: 90,
    anim: "pop",
    pos: "mb",
    font: "system",
    words: "one two three four five six"
      .split(" ")
      .map((w, k) => ({ text: w, start: k * 0.2, end: k * 0.2 + 0.18 })),
  }));
  const audio = p.tracks.find((t) => t.id === "t_audio");
  audio.clips = Array.from({ length: audioClips }, (_, i) => ({
    id: `au_${i}`,
    kind: "audio",
    mediaId: `med_a${i}`,
    start: i * 10,
    duration: 10,
    volume: 0.8,
    fx: { kind: "reverb", mix: 0.3 },
    audioFx: "telephone",
  }));
  return p;
}

/** What pushUndo() costs: one deep copy of the whole project. */
function timeUndoSnapshot(project, n = 200) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) JSON.stringify(project);
  return (performance.now() - t0) / n;
}

/** What a slider event costs today: snapshot + stringify + shallow copy + version. */
function timeEditEvent(project, n = 200) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const snap = JSON.stringify(project); // pushUndo()
    const clip = project.tracks[0].clips[0];
    clip.size = 90 + (i % 10); // the actual edit
    JSON.stringify(project); // commitChange() -> autosave later re-serialises
    void snap;
  }
  return (performance.now() - t0) / n;
}

/** The parse side: undo restore, template load, autosave reload. */
function timeRestore(snap, n = 100) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) JSON.parse(snap);
  return (performance.now() - t0) / n;
}

const sizes = [
  { label: "small (3 clips)", opts: { mainClips: 3, textClips: 2, audioClips: 1, keyframes: 2 } },
  { label: "typical (12 clips)", opts: {} },
  {
    label: "large (40 clips)",
    opts: { mainClips: 40, textClips: 20, audioClips: 6, keyframes: 12 },
  },
];

const rows = [];
for (const { label, opts } of sizes) {
  const project = realisticProject(opts);
  const bytes = JSON.stringify(project).length;
  const snapMs = timeUndoSnapshot(project);
  const editMs = timeEditEvent(project);
  const restoreMs = timeRestore(JSON.stringify(project));
  rows.push({
    project: label,
    kb: Math.round(bytes / 1024),
    undoCopyMs: +snapMs.toFixed(3),
    editEventMs: +editMs.toFixed(3),
    restoreMs: +restoreMs.toFixed(3),
    // A slider drag fires ~16 events in the time it takes you to sweep it, and
    // the edit path runs synchronously inside the event handler.
    drag100Ms: Math.round(editMs * 100),
  });
}

if (false) {
} else {
  console.log("INTERACTION LATENCY — cost of one edit event, before rasterising\n");
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    pad("project", 20) +
      pad("size", 8) +
      pad("undo copy", 12) +
      pad("edit event", 12) +
      pad("restore", 10) +
      "100-event drag",
  );
  for (const r of rows) {
    console.log(
      pad(r.project, 20) +
        pad(`${r.kb} KB`, 8) +
        pad(`${r.undoCopyMs} ms`, 12) +
        pad(`${r.editEventMs} ms`, 12) +
        pad(`${r.restoreMs} ms`, 10) +
        `${r.drag100Ms} ms`,
    );
  }
  console.log(
    "\nAn 'edit event' is: stringify the whole project (undo), apply the patch," +
      "\nstringify again (autosave). Every slider tick and colour chip pays this" +
      "\ninside the event handler, before React even renders.",
  );
}

// ---------------------------------------------------------------------------
// The per-frame grade: what every preview frame and every exported frame pays.
// This is the number that decides whether the editor plays at all on a phone.
// ---------------------------------------------------------------------------
const E = await import("../.diag/b-engine.mjs");
const HSLm = await import("../.diag/b-hsl.mjs");

function gradeFrame() {
  const W = 1280;
  const H = 720;
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (i >> 2) % 256;
    d[i + 1] = ((i >> 4) * 3) % 256;
    d[i + 2] = ((i >> 6) * 7) % 256;
    d[i + 3] = 255;
  }
  const grade = E.Engine.prototype.gradePixels;
  const base = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    temperature: 0,
    tint: 0,
    splitTone: 0,
    sharpen: 0,
    vignette: 0,
  };
  const cases = {
    "colour adjust only": { ...base, brightness: 108, contrast: 105 },
    "temperature + tint": { ...base, temperature: 8, tint: -4 },
    vignette: { ...base, vignette: 20 },
    sharpen: { ...base, sharpen: 20 },
    "everything at once": {
      brightness: 108,
      contrast: 105,
      saturation: 102,
      hue: 0,
      temperature: 8,
      tint: -4,
      splitTone: 12,
      sharpen: 15,
      vignette: 12,
    },
  };
  const out = [];
  for (const [name, adj] of Object.entries(cases)) {
    grade.call({}, d, W, H, adj); // warm up
    const t0 = performance.now();
    for (let k = 0; k < 3; k++) grade.call({}, d, W, H, adj);
    out.push({ name, ms: +((performance.now() - t0) / 3).toFixed(1) });
  }
  // HSL is a separate pass on top of the grade.
  const hslSet = { red: { h: 4, s: 10, l: 0 }, blue: { h: 2, s: 8, l: 0 } };
  HSLm.applyHsl(d, hslSet);
  const t1 = performance.now();
  for (let k = 0; k < 3; k++) HSLm.applyHsl(d, hslSet);
  out.push({ name: "HSL (2 bands)", ms: +((performance.now() - t1) / 3).toFixed(1) });
  return out;
}

const frameRows = gradeFrame();
if (asJson) {
  console.log(JSON.stringify({ interaction: rows, grade: frameRows }, null, 2));
} else {
  console.log(
    "\nPER-FRAME GRADE COST — 1280×720 buffer, the pass every frame pays\n" +
      "Synthetic buffer spanning the whole hue circle: this is the WORST case for\n" +
      "HSL, not a typical frame. Real footage clusters in hue and is faster.\n",
  );
  for (const r of frameRows) {
    // 33 ms is a 30 fps budget; anything near it leaves nothing for drawing.
    const verdict =
      r.ms < 8 ? "cheap" : r.ms < 20 ? "ok" : r.ms < 33 ? "tight" : "TOO SLOW for 30 fps";
    console.log("  " + r.name.padEnd(22) + String(r.ms).padStart(6) + " ms   " + verdict);
  }
}
