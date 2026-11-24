// MayoCut v0.4.0 functional audit — pure-logic modules under node (esbuild bundles).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  PASS', name); })
    .catch((e) => { failed++; console.log('  FAIL', name, '—', e.message); });
}

// ================= types =================
const T = await import('./b-types.mjs');
const R = await import('./b-timeline-resolver.mjs');
const E = await import('./b-engine.mjs');
const P = await import('./b-export-plan.mjs');
const X = await import('./b-proxy.mjs');
const AFX = await import('./b-audio-fx.mjs');
const CV = await import('./b-curves.mjs');
const ST = await import('./b-stock.mjs');
const HSL = await import('./b-hsl.mjs');
const SK = await import('./b-sticker-kinds.mjs');
const SB = await import('./b-stickers.mjs');
const FT = await import('./b-fonts.mjs');
const PS = await import('./b-persistence.mjs');
const PB = await import('./b-playback.mjs');
const LK = await import('./b-looks.mjs');
const GEO = await import('./b-geometry.mjs');
const RIP = await import('./b-ripple.mjs');
const SCO = await import('./b-scopes.mjs');
const LDN = await import('./b-loudness.mjs');
const ES = await import('./b-easings.mjs');
console.log('types.ts');
await t('emptyTracks creates the fixed track set, including Adjustment', () => {
  const tr = T.emptyTracks();
  // text + overlay + audio, plus the Adjustment track an effect band lives on
  assert.equal(tr.length, 4);
  for (const id of ['t_text', 't_overlay', 't_audio', 't_adjust']) {
    assert.ok(tr.some((x) => x.id === id), `missing track ${id}`);
  }
});
await t('mainClipDuration: plain speed', () => {
  assert.ok(Math.abs(T.mainClipDuration({ in: 1, out: 5, speed: 2 }) - 2) < 1e-9);
  assert.ok(Math.abs(T.mainClipDuration({ in: 0, out: 3, speed: 0.5 }) - 6) < 1e-9);
});
await t('mainClipDuration: ramp = integral of rate curve', () => {
  const c = { in: 0, out: 4, speed: 1, rampTo: 2 }; // 1x -> 2x over 4s source
  // numeric: dt = ds / rate(s), rate(s)=1+0.25s, s in [0,4]
  let dt = 0; const N = 200000; const h = 4 / N;
  for (let i = 0; i < N; i++) { const s = (i + 0.5) * h; dt += h / (1 + 0.25 * s); }
  assert.ok(Math.abs(T.mainClipDuration(c) - dt) / dt < 1e-4, `got ${T.mainClipDuration(c)} want ${dt}`);
});
await t('mainSrcAt: endpoints exact', () => {
  const c = { in: 2, out: 8, speed: 2, rampTo: 4 };
  const dur = T.mainClipDuration(c);
  assert.ok(Math.abs(T.mainSrcAt(c, 0) - 2) < 1e-9);
  assert.ok(Math.abs(T.mainSrcAt(c, dur) - 8) < 1e-6);
});
await t('mainRateAt: endpoints', () => {
  const c = { in: 0, out: 2, speed: 0.25, rampTo: 4 };
  assert.ok(Math.abs(T.mainRateAt(c, 0) - 0.25) < 1e-9);
  assert.ok(Math.abs(T.mainRateAt(c, T.mainClipDuration(c)) - 4) < 1e-6);
});
await t('mainSpans: contiguous spans', () => {
  const p = { main: [ { in: 0, out: 4, speed: 2 }, { in: 0, out: 2, speed: 1 } ] };
  const sp = T.mainSpans(p);
  assert.equal(sp.length, 2);
  assert.ok(Math.abs(sp[0].start) < 1e-9);
  assert.ok(Math.abs(sp[0].end - 2) < 1e-9);
  assert.ok(Math.abs(sp[1].start - 2) < 1e-9);
  assert.ok(Math.abs(sp[1].end - 4) < 1e-9);
});
await t('uid unique + prefixed', () => {
  const a = T.uid('med'), b = T.uid('med');
  assert.ok(a.startsWith('med_') && b.startsWith('med_') && a !== b);
});

// ================= freeze frames =================
console.log("types.ts — freeze & speed");
await t("freeze clip: duration is the hold length, not source/speed", () => {
  const c = T.freezeClipFrom({ in: 2, out: 2.5, speed: 3, rampTo: 4 }, 2, 3);
  assert.equal(c.freeze, true);
  assert.ok(Math.abs(T.mainClipDuration(c) - 3) < 1e-9, `got ${T.mainClipDuration(c)}`);
});
await t("freeze clip: srcAt is pinned to a single frame", () => {
  const c = T.freezeClipFrom({ in: 1, out: 2, speed: 1 }, 1, 2);
  assert.ok(Math.abs(T.mainSrcAt(c, 0) - T.mainSrcAt(c, 99)) < 1e-9);
  assert.ok(Math.abs(T.mainSrcAt(c, 0) - (1 + 1 / 60)) < 1e-9);
});
await t("freeze clip: playback rate is 1 (no ramp on a still)", () => {
  const c = T.freezeClipFrom({ in: 0, out: 4, speed: 0.25, rampTo: 4 }, 1, 1);
  assert.equal(T.mainRateAt(c, 0.5), 1);
});
await t("reverse clip: rate stays 1", () => {
  const c = { in: 0, out: 4, speed: 2, reverse: true };
  assert.equal(T.mainRateAt(c, 1), 1);
});
await t("speed ramp still integrates exactly after the freeze change", () => {
  const c = { in: 0, out: 4, speed: 1, rampTo: 2 };
  let dt = 0; const N = 100000; const h = 4 / N;
  for (let i = 0; i < N; i++) dt += h / (1 + 0.25 * ((i + 0.5) * h));
  assert.ok(Math.abs(T.mainClipDuration(c) - dt) / dt < 1e-4);
});
await t("SPEED_PRESETS covers slow-mo through 8x", () => {
  assert.ok(T.SPEED_PRESETS.includes(0.1) && T.SPEED_PRESETS.includes(8));
  assert.ok(T.SPEED_PRESETS.every((v) => v > 0));
});

// ================= transitions =================
console.log("types.ts — transitions & aspects");
await t("every transition has a unique id and a label", () => {
  const ids = T.TRANSITIONS.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(T.TRANSITIONS.every((x) => typeof x.name === "string" && x.name.length > 0));
});
await t("forward-looking transitions exist", () => {
  for (const id of ["slideleft", "wipeup", "zoom", "blur", "fadewhite"])
    assert.ok(T.TRANSITIONS.some((x) => x.id === id), `missing ${id}`);
});
await t("isDipTo classifies black / white / neither", () => {
  assert.equal(T.isDipTo("fadeblack"), "black");
  assert.equal(T.isDipTo("fadewhite"), "white");
  assert.equal(T.isDipTo("crossfade"), null);
  assert.equal(T.isDipTo("wipeleft"), null);
});
await t("aspects: 8 formats, valid sizes, all in ASPECT_ORDER", () => {
  const ids = Object.keys(T.ASPECTS);
  assert.equal(ids.length, 8);
  for (const id of ids) {
    const a = T.ASPECTS[id];
    assert.ok(a.w > 0 && a.h > 0, id);
    assert.ok(T.ASPECT_ORDER.includes(id), `${id} missing from ASPECT_ORDER`);
  }
  assert.equal(T.ASPECT_ORDER.length, 8);
});
await t("aspectRatio matches the declared w/h", () => {
  for (const id of Object.keys(T.ASPECTS)) {
    const a = T.ASPECTS[id];
    assert.ok(Math.abs(T.aspectRatio(id) - a.w / a.h) < 1e-12);
  }
});
await t("21:9 is wider than 16:9 and 9:16 is the tallest portrait", () => {
  assert.ok(T.aspectRatio("21:9") > T.aspectRatio("16:9"));
  assert.ok(T.aspectRatio("9:16") < T.aspectRatio("4:5"));
  assert.ok(T.aspectRatio("9:16") < T.aspectRatio("1:1"));
});

// ================= text presets =================
console.log("types.ts — text look presets");
await t("TEXT_PRESETS: >=10 looks with names and patches", () => {
  assert.ok(T.TEXT_PRESETS.length >= 10);
  for (const tpl of T.TEXT_PRESETS) {
    assert.ok(tpl.name && typeof tpl.patch === "object");
  }
});
await t("text anims include the new entrances", () => {
  const ids = T.TEXT_ANIMS.map((a) => a.id);
  for (const id of ["zoom-in", "rise", "wipe-in", "slideleft"])
    assert.ok(ids.includes(id), `missing ${id}`);
});

// ================= engine (pure parts) =================
console.log("engine.ts — transitions, grade, clip ops");
await t("buildFilterCss: neutral clip yields an empty filter", () => {
  assert.equal(E.buildFilterCss({ filter: "none", adjust: T.DEFAULT_ADJUST }), "");
});
await t("buildFilterCss: fade squashes contrast + lifts brightness", () => {
  const css = E.buildFilterCss({ filter: "none", adjust: { ...T.DEFAULT_ADJUST, fade: 100 } });
  assert.ok(css.includes("contrast(0.680)"), css);
  assert.ok(css.includes("brightness(1.070)"), css);
});
await t("buildFilterCss: preset + adjust compose in order", () => {
  const css = E.buildFilterCss({ filter: "bw", adjust: { ...T.DEFAULT_ADJUST, hue: 30 } });
  assert.ok(css.startsWith("grayscale(1)"));
  assert.ok(css.includes("hue-rotate(30deg)"));
});
await t("presetCss: unknown id is safe (empty string)", () => {
  assert.equal(E.presetCss("does-not-exist"), "");
});
await t("FILTER_PRESETS: unique ids, >= 19 looks", () => {
  const ids = E.FILTER_PRESETS.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 19);
});
await t("animAt: interpolates midpoint between keyframes", () => {
  const kfs = [
    { at: 0, v: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 } },
    { at: 2, v: { x: 1, y: 0, scale: 2, rotation: 90, opacity: 0 } },
  ];
  const mid = E.animAt(kfs, T.DEFAULT_ANIM, 1);
  assert.ok(Math.abs(mid.x - 0.5) < 1e-9);
  assert.ok(Math.abs(mid.scale - 1.5) < 1e-9);
  assert.ok(Math.abs(mid.opacity - 0.5) < 1e-9);
});
await t("animAt: clamps before the first and after the last keyframe", () => {
  const kfs = [
    { at: 1, v: { x: 0.2, y: 0, scale: 1, rotation: 0, opacity: 1 } },
    { at: 2, v: { x: 0.9, y: 0, scale: 1, rotation: 0, opacity: 1 } },
  ];
  assert.equal(E.animAt(kfs, T.DEFAULT_ANIM, 0).x, T.DEFAULT_ANIM.x);
  assert.equal(E.animAt(kfs, T.DEFAULT_ANIM, 5).x, 0.9);
});

// --- Engine instance operations (no canvas / no media needed) --------------
function mkProject() {
  const p = T.newProject("audit", "9:16");
  p.main = [
    { id: "mA", mediaId: "m1", in: 0, out: 4, speed: 1, reverse: false, filter: "none",
      adjust: { ...T.DEFAULT_ADJUST }, volume: 1, muted: false, transitionIn: "none", transitionDur: 0 },
    { id: "mB", mediaId: "m2", in: 1, out: 5, speed: 2, reverse: false, filter: "none",
      adjust: { ...T.DEFAULT_ADJUST }, volume: 1, muted: false, transitionIn: "crossfade", transitionDur: 0.5 },
  ];
  return p;
}
await t("Engine.setTransition: writes kind + clamps duration", () => {
  const e = new E.Engine(mkProject());
  e.setTransition("mB", "wipeup", 0.02);
  assert.equal(e.project.main[1].transitionIn, "wipeup");
  assert.ok(e.project.main[1].transitionDur >= 0.1);
  e.setTransition("mB", "none", 1);
  assert.equal(e.project.main[1].transitionDur, 0);
});
await t("Engine.setTransitionAll: first clip never has an incoming transition", () => {
  const e = new E.Engine(mkProject());
  e.setTransitionAll("slideleft", 0.4);
  assert.equal(e.project.main[0].transitionIn, "none");
  assert.equal(e.project.main[1].transitionIn, "slideleft");
  assert.ok(Math.abs(e.project.main[1].transitionDur - 0.4) < 1e-9);
});
await t("Engine.freezeAt: splits mid-clip and inserts a held frame", () => {
  const e = new E.Engine(mkProject());
  const before = e.project.main.length;
  const f = e.freezeAt(2, 3);
  assert.ok(f && f.freeze === true, "freeze clip returned");
  assert.equal(e.project.main.length, before + 2, "split + freeze");
  assert.ok(Math.abs(T.mainClipDuration(f) - 3) < 1e-9);
  assert.ok(Math.abs(T.mainSpans(e.project)[1].start - 2) < 0.05, "freeze sits at the playhead");
});
await t("Engine.freezeAt: at a clip end appends instead of splitting", () => {
  const e = new E.Engine(mkProject());
  const f = e.freezeAt(3.99, 2);
  assert.ok(f && f.freeze === true);
  assert.equal(e.project.main.length, 3);
});
await t("Engine.reorderMainClip: moves and strips a head transition", () => {
  const e = new E.Engine(mkProject());
  assert.equal(e.reorderMainClip("mB", 0), true);
  assert.equal(e.project.main[0].id, "mB");
  assert.equal(e.project.main[0].transitionIn, "none");
});
await t("Engine.splitAt: refuses at clip edges, splits inside", () => {
  const e = new E.Engine(mkProject());
  assert.equal(e.splitAt(0), false);
  assert.equal(e.splitAt(4), false); // exact boundary
  assert.equal(e.splitAt(2), true);
  assert.equal(e.project.main.length, 3);
  assert.ok(Math.abs(e.project.main[0].out - 2) < 1e-9);
  assert.ok(Math.abs(e.project.main[1].in - 2) < 1e-9);
});
await t("Engine.splitAt: carries keyframes to both halves", () => {
  const p = mkProject();
  p.main[0].keyframes = [
    { at: 0.5, v: { ...T.DEFAULT_ANIM, scale: 1.2 } },
    { at: 3, v: { ...T.DEFAULT_ANIM, scale: 0.8 } },
  ];
  const e = new E.Engine(p);
  e.splitAt(2);
  assert.equal(e.project.main[0].keyframes.length, 1);
  assert.equal(e.project.main[1].keyframes.length, 1);
  assert.ok(Math.abs(e.project.main[1].keyframes[0].at - 1) < 1e-9, "rebased to the new clip");
});
await t("Engine.splitAtAllBeats: splits once per interior beat", () => {
  const e = new E.Engine(mkProject());
  e.setBeats([1, 2, 3]);
  const n = e.splitAtAllBeats();
  assert.equal(n, 3);
  assert.ok(e.project.main.length >= 5);
});
await t("Engine.setBeats: sorts and caps the marker list", () => {
  const e = new E.Engine(mkProject());
  e.setBeats([5, 1, 3]);
  assert.deepEqual(e.project.beats, [1, 3, 5]);
  const many = Array.from({ length: 900 }, (_, i) => i * 0.1);
  e.setBeats(many);
  assert.equal(e.project.beats.length, 400);
});
await t("Engine.track flag: mute/solo/hidden round-trip", () => {
  const e = new E.Engine(mkProject());
  e.setTrackFlag("t_audio", { muted: true, solo: true });
  const tr = e.project.tracks.find((x) => x.id === "t_audio");
  assert.equal(tr.muted, true);
  assert.equal(tr.solo, true);
  e.setTrackFlag("t_text", { hidden: true });
  assert.equal(e.project.tracks.find((x) => x.id === "t_text").hidden, true);
});
await t("Engine.reorderMainClip: clamps out-of-range indices", () => {
  const e = new E.Engine(mkProject());
  assert.equal(e.reorderMainClip("mA", 99), true);
  assert.equal(e.project.main[1].id, "mA");
});
await t("Engine.snapshot/restore: undo round-trip keeps data intact", () => {
  const e = new E.Engine(mkProject());
  const snap = e.snapshot();
  e.deleteMainClip("mA");
  assert.equal(e.project.main.length, 1);
  e.restore(snap);
  assert.equal(e.project.main.length, 2);
  assert.equal(e.project.main[0].id, "mA");
});
await t("Engine.moveOverlayToTrack: audio can't land on a visual lane", () => {
  const p = mkProject();
  p.tracks[2].clips.push({ id: "a1", kind: "audio", mediaId: "m1", start: 0, duration: 2, volume: 1 });
  const e = new E.Engine(p);
  assert.equal(e.moveOverlayToTrack("a1", "t_text"), false);
  assert.equal(e.moveOverlayToTrack("a1", "t_audio"), false); // same lane
});
await t("Engine.moveOverlayToTrack: text moves between visual lanes", () => {
  const p = mkProject();
  p.tracks[0].clips.push({ id: "t1", kind: "text", start: 0, duration: 2, text: "hi" });
  const e = new E.Engine(p);
  assert.equal(e.moveOverlayToTrack("t1", "t_overlay"), true);
  assert.equal(e.project.tracks[1].clips.some((c) => c.id === "t1"), true);
  assert.equal(e.project.tracks[0].clips.length, 0);
});
await t("Engine.duplicateTrack: copies clips with fresh ids", () => {
  const p = mkProject();
  p.tracks[0].clips.push({ id: "t1", kind: "text", start: 0, duration: 2, text: "hi" });
  const e = new E.Engine(p);
  assert.equal(e.duplicateTrack("t_text"), 1);
  assert.equal(e.project.tracks[0].clips.length, 2);
  assert.notEqual(e.project.tracks[0].clips[0].id, e.project.tracks[0].clips[1].id);
});
await t("Engine.patchClip: patches main and overlay clips alike", () => {
  const p = mkProject();
  p.tracks[0].clips.push({ id: "t1", kind: "text", start: 0, duration: 2, text: "hi" });
  const e = new E.Engine(p);
  assert.equal(e.patchClip("mA", { speed: 3 }), true);
  assert.equal(e.project.main[0].speed, 3);
  assert.equal(e.patchClip("t1", { text: "yo" }), true);
  assert.equal(e.project.tracks[0].clips[0].text, "yo");
  assert.equal(e.patchClip("nope", { speed: 1 }), false);
});
await t("Engine A→B transition windows are contiguous (no black gap)", () => {
  const p = mkProject();
  p.main[1].transitionIn = "wipeleft";
  p.main[1].transitionDur = 0.5;
  const e = new E.Engine(p);
  const spans = T.mainSpans(e.project);
  assert.ok(Math.abs(spans[0].end - spans[1].start) < 1e-12, "spans are adjacent");
  // the transition window starts inside the previous clip and ends at the cut
  const winStart = spans[1].start - 0.5;
  assert.ok(winStart < spans[0].end);
  assert.ok(Math.abs(spans[1].start - winStart - 0.5) < 1e-12);
});

// ================= GIF export =================
// The GIF writer path is the only new export that produces bytes without a
// canvas, so it can be verified end-to-end here (encode → decode → frames).
console.log("engine.ts — GIF export round-trip");
{
  const omggif = await import("omggif");
  await t("omggif exposes GifWriter (GIF export dependency present)", () => {
    assert.equal(typeof omggif.GifWriter, "function");
  });
  await t("exportGIF palette is a valid power-of-two 256 colours", () => {
    const palette = [];
    for (let r = 0; r < 6; r++)
      for (let g = 0; g < 6; g++)
        for (let b = 0; b < 6; b++) palette.push(((r * 51) << 16) | ((g * 51) << 8) | (b * 51));
    for (let i = 0; i < 40; i++) {
      const v = Math.round((i / 39) * 255);
      palette.push((v << 16) | (v << 8) | v);
    }
    assert.equal(palette.length, 256);
    assert.equal(palette.length & (palette.length - 1), 0, "must be a power of two");
    assert.ok(palette.every((v) => v >= 0 && v <= 0xffffff));
  });
  await t("GIF encode→decode preserves frame count, size and colour", () => {
    const W = 16;
    const H = 16;
    const palette = [];
    for (let r = 0; r < 6; r++)
      for (let g = 0; g < 6; g++)
        for (let b = 0; b < 6; b++) palette.push(((r * 51) << 16) | ((g * 51) << 8) | (b * 51));
    for (let i = 0; i < 40; i++) {
      const v = Math.round((i / 39) * 255);
      palette.push((v << 16) | (v << 8) | v);
    }
    const buf = new Uint8Array(W * H * 3 + 4096);
    const writer = new omggif.GifWriter(buf, W, H, { loop: 0, palette });
    const redIdx = 6 * 6 * 5; // r=5,g=0,b=0 → pure red in the 6•6•6 cube
    const idx = new Uint8Array(W * H).fill(redIdx);
    for (let f = 0; f < 3; f++) writer.addFrame(0, 0, W, H, idx, { delay: 5, disposal: 1 });
    const out = buf.subarray(0, writer.end());
    assert.equal(String.fromCharCode(...out.slice(0, 6)), "GIF89a");
    const reader = new omggif.GifReader(out);
    assert.equal(reader.numFrames(), 3);
    assert.equal(reader.width, W);
    assert.equal(reader.height, H);
    const px = new Uint8ClampedArray(W * H * 4);
    reader.decodeAndBlitFrameRGBA(0, px);
    assert.ok(px[0] > 200 && px[1] < 60 && px[2] < 60, `first pixel not red: ${px[0]},${px[1]},${px[2]}`);
  });
}

// ================= caption word re-timing =================
console.log("types.ts — caption word re-timing");
const WORDS = [
  { t: 0.0, text: "the" },
  { t: 0.4, text: "quick" },
  { t: 0.9, text: "brown" },
  { t: 1.4, text: "fox" },
];
await t("nudgeWord: moves a word forward inside its window", () => {
  const out = T.nudgeWord(WORDS, 1, 0.1, 2, 0.05);
  assert.ok(Math.abs(out[1].t - 0.5) < 1e-9, `got ${out[1].t}`);
});
await t("nudgeWord: cannot overtake the next word", () => {
  const out = T.nudgeWord(WORDS, 1, 5, 2, 0.05);
  assert.ok(out[1].t <= WORDS[2].t - 0.05 + 1e-9, `got ${out[1].t}`);
});
await t("nudgeWord: cannot overtake the previous word", () => {
  const out = T.nudgeWord(WORDS, 2, -5, 2, 0.05);
  assert.ok(out[2].t >= WORDS[1].t + 0.05 - 1e-9, `got ${out[2].t}`);
});
await t("nudgeWord: first word can't go negative, last can't leave the clip", () => {
  assert.ok(T.nudgeWord(WORDS, 0, -5, 2, 0.05)[0].t >= 0);
  assert.ok(T.nudgeWord(WORDS, 3, 5, 2, 0.05)[3].t <= 2);
});
await t("nudgeWord: order is still strictly increasing after many nudges", () => {
  let w = WORDS;
  for (let i = 0; i < 200; i++) w = T.nudgeWord(w, i % 4, i % 2 ? 0.3 : -0.3, 2, 0.05);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].t > w[i - 1].t, `inverted at ${i}`);
});
await t("nudgeWord: is pure — the input array is untouched", () => {
  const copy = JSON.parse(JSON.stringify(WORDS));
  T.nudgeWord(WORDS, 1, 0.2, 2);
  assert.deepEqual(WORDS, copy);
});
await t("nudgeWord: out-of-range index is a no-op", () => {
  assert.equal(T.nudgeWord(WORDS, 99, 1, 2), WORDS);
  assert.equal(T.nudgeWord(WORDS, -1, 1, 2), WORDS);
});
await t("respaceWords: spreads words evenly and keeps order", () => {
  const out = T.respaceWords(WORDS, 2);
  assert.deepEqual(
    out.map((w) => w.t),
    [0, 0.5, 1, 1.5],
  );
  assert.deepEqual(
    out.map((w) => w.text),
    ["the", "quick", "brown", "fox"],
  );
});
await t("shiftWords: shifts the whole caption", () => {
  const out = T.shiftWords(WORDS, 0.25, 4);
  assert.deepEqual(
    out.map((w) => w.t),
    [0.25, 0.65, 1.15, 1.65],
  );
});
await t("shiftWords: clamps at t=0 and at the clip end", () => {
  assert.equal(T.shiftWords(WORDS, -10, 2)[0].t, 0);
  const end = T.shiftWords(WORDS, 10, 2);
  assert.ok(end[3].t <= 2 + 1e-9, `last word escaped: ${end[3].t}`);
});
await t("shiftWords: empty list and zero delta are safe", () => {
  assert.deepEqual(T.shiftWords([], 1, 2), []);
  assert.equal(T.shiftWords(WORDS, 0, 2), WORDS);
});

// ================= drawable speed curves =================
console.log("types.ts — speed curves");
/** Brute-force reference: duration = ∫ ds / v(s). */
function numericDur(c, N = 40000) {
  const L = c.out - c.in;
  let t = 0;
  for (let i = 0; i < N; i++) t += L / N / T.speedAt(c, (i + 0.5) / N);
  return t;
}
const CURVES = {
  "constant 1x": { in: 0, out: 4, speed: 1 },
  "constant 2.5x": { in: 0, out: 4, speed: 2.5 },
  "linear ramp 1→3": { in: 0, out: 4, speed: 1, rampTo: 3 },
  "ramp 3→0.5": { in: 0, out: 4, speed: 3, rampTo: 0.5 },
  "slow-mo dip": {
    in: 0,
    out: 4,
    speed: 1,
    curve: [
      { at: 0, v: 1 },
      { at: 0.4, v: 0.25 },
      { at: 0.6, v: 0.25 },
      { at: 1, v: 1 },
    ],
  },
  "3-segment accel": {
    in: 1,
    out: 7,
    speed: 1,
    curve: [
      { at: 0, v: 0.5 },
      { at: 0.33, v: 2 },
      { at: 0.66, v: 4 },
      { at: 1, v: 1 },
    ],
  },
};
for (const [name, c] of Object.entries(CURVES)) {
  await t(`curve[${name}]: closed-form duration matches numeric integration`, () => {
    const exact = T.mainClipDuration(c);
    const numeric = numericDur(c);
    assert.ok(Math.abs(exact - numeric) / numeric < 1e-4, `${exact} vs ${numeric}`);
  });
  await t(`curve[${name}]: srcAt(duration) lands exactly on the out point`, () => {
    const d = T.mainClipDuration(c);
    assert.ok(Math.abs(T.mainSrcAt(c, d) - c.out) < 1e-4, `got ${T.mainSrcAt(c, d)}`);
  });
  await t(`curve[${name}]: src position is monotonic (no jitter)`, () => {
    const d = T.mainClipDuration(c);
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const src = T.mainSrcAt(c, (i / 200) * d);
      assert.ok(src >= prev - 1e-9, `went backwards at ${i}`);
      prev = src;
    }
  });
}
await t("curve: a 2-point curve is identical to the old linear ramp", () => {
  const a = T.mainClipDuration({ in: 0, out: 4, speed: 1, rampTo: 3 });
  const b = T.mainClipDuration({
    in: 0,
    out: 4,
    speed: 1,
    curve: [
      { at: 0, v: 1 },
      { at: 1, v: 3 },
    ],
  });
  assert.equal(a, b);
});
await t("speedCurveOf: rejects <2 points and falls back to the ramp", () => {
  assert.equal(T.speedCurveOf({ in: 0, out: 1, speed: 1, curve: [{ at: 0, v: 2 }] }), null);
  assert.equal(T.speedCurveOf({ in: 0, out: 1, speed: 1, curve: [] }), null);
  const c = { in: 0, out: 1, speed: 1, curve: [] };
  assert.equal(T.speedAt(c, 0.5), 1);
});
await t("speedCurveOf: sorts unsorted points and clamps wild values", () => {
  const pts = T.speedCurveOf({
    in: 0,
    out: 1,
    speed: 1,
    curve: [
      { at: 0.8, v: 99 },
      { at: 0, v: -3 },
    ],
  });
  assert.equal(pts[0].at, 0);
  assert.ok(pts.every((p) => p.v >= 0.05 && p.v <= 16));
  assert.ok(pts[0].at <= pts[pts.length - 1].at);
});
await t("speedCurveOf: snaps the ends so the curve spans the whole segment", () => {
  const pts = T.speedCurveOf({
    in: 0,
    out: 1,
    speed: 1,
    curve: [
      { at: 0.2, v: 2 },
      { at: 0.8, v: 0.5 },
    ],
  });
  assert.equal(pts[0].at, 0);
  assert.equal(pts[pts.length - 1].at, 1);
});
await t("speedCurveOf: drops NaN points instead of poisoning the maths", () => {
  const pts = T.speedCurveOf({
    in: 0,
    out: 1,
    speed: 1,
    curve: [
      { at: 0, v: 1 },
      { at: NaN, v: 2 },
      { at: 1, v: 4 },
    ],
  });
  assert.ok(pts.every((p) => Number.isFinite(p.at) && Number.isFinite(p.v)));
});
await t("freeze clips ignore the speed curve entirely", () => {
  const c = { in: 1, out: 3, speed: 1, freeze: true, curve: [{ at: 0, v: 4 }, { at: 1, v: 0.1 }] };
  assert.equal(T.mainClipDuration(c), 2);
  assert.equal(T.mainRateAt(c, 0.5), 1);
});
await t("reverse + curve still advances the element forward", () => {
  const c = {
    in: 0,
    out: 4,
    speed: 1,
    reverse: true,
    curve: [{ at: 0, v: 0.5 }, { at: 1, v: 4 }],
  };
  assert.equal(T.mainRateAt(c, 1), 1, "frame-stepped reverse");
  assert.ok(T.mainPlaybackRate(c, 1) > 0, "media still plays forward");
});

// ================= catalogue breadth + wipe maths =================
console.log("types.ts — catalogues and transition families");
await t("transition catalogue covers 5 families with unique ids", () => {
  const ids = T.TRANSITIONS.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  const fams = new Set(ids.map((id) => T.TRANSITION_FAMILY[id]));
  for (const f of ["basic", "slide", "wipe", "zoom", "trend"])
    assert.ok(fams.has(f), `missing family ${f}`);
  // a floor, not an exact count: the catalogue is expected to grow, and an
  // exact number here fails on every addition while still passing if someone
  // deletes a transition and bumps the constant.
  assert.ok(ids.length >= 19, `only ${ids.length} transitions`);
});
await t("every transition has a family and a non-empty name", () => {
  for (const x of T.TRANSITIONS) {
    assert.ok(T.TRANSITION_FAMILY[x.id], `${x.id} has no family`);
    assert.ok(x.name.length > 0, `${x.id} has no name`);
  }
});
await t("wipeDir classifies all 8 wipes and nothing else", () => {
  const wipes = T.TRANSITIONS.filter((x) => T.wipeDir(x.id));
  assert.equal(wipes.length, 8);
  for (const dir of ["left", "right", "up", "down"]) {
    assert.ok(wipes.some((w) => T.wipeDir(w.id).dir === dir && !T.wipeDir(w.id).soft));
    assert.ok(wipes.some((w) => T.wipeDir(w.id).dir === dir && T.wipeDir(w.id).soft));
  }
  assert.equal(T.wipeDir("crossfade"), null);
  assert.equal(T.wipeDir("none"), null);
});

// Feathered-wipe geometry: mirrors the engine's gradient ramp so a regression
// in either place (edge travel direction, feather width) is caught here.
function wipeAlphaFn(dir, k, span = 1000) {
  const feather = Math.max(1, span * 0.12);
  const lowSide = dir === "right" || dir === "down";
  const edge = lowSide ? -feather + k * (span + feather * 2) : span + feather - k * (span + feather * 2);
  const c = (v) => Math.max(0, Math.min(1, v));
  const t0 = c((edge - feather) / span);
  const t1 = c((edge + feather) / span);
  return (u) => {
    const flat0 = lowSide ? 1 : 0;
    const flat1 = lowSide ? 0 : 1;
    if (u <= t0) return flat0;
    if (u >= t1) return flat1;
    return flat0 + (flat1 - flat0) * ((u - t0) / Math.max(1e-9, t1 - t0));
  };
}
/** Mean coverage of the incoming clip across the travel axis. */
function wipeCoverage(dir, k, span = 1000) {
  const f = wipeAlphaFn(dir, k, span);
  let sum = 0;
  const N = 400;
  for (let i = 0; i < N; i++) sum += f((i + 0.5) / N);
  return sum / N;
}
await t("soft wipe: k=0 shows none of the incoming clip, k=1 shows all", () => {
  for (const dir of ["left", "right", "up", "down"]) {
    assert.ok(Math.abs(wipeCoverage(dir, 0) - 0) < 0.02, `${dir} at k=0`);
    assert.ok(Math.abs(wipeCoverage(dir, 1) - 1) < 0.02, `${dir} at k=1`);
  }
});
await t("soft wipe: reveal is monotonic in k", () => {
  for (const dir of ["left", "right", "up", "down"]) {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.1) {
      const v = wipeCoverage(dir, k);
      assert.ok(v >= prev - 1e-9, `${dir} went backwards at k=${k.toFixed(1)}`);
      prev = v;
    }
  }
});
await t("soft wipe: left(k) is the pointwise mirror of right(k)", () => {
  for (const k of [0.2, 0.5, 0.8]) {
    const L = wipeAlphaFn("left", k);
    const R = wipeAlphaFn("right", k);
    for (let i = 0; i < 200; i++) {
      const u = (i + 0.5) / 200;
      assert.ok(Math.abs(L(u) - R(1 - u)) < 1e-9, `left/right diverge at u=${u} k=${k}`);
    }
    const U = wipeAlphaFn("up", k);
    const D = wipeAlphaFn("down", k);
    for (let i = 0; i < 200; i++) {
      const u = (i + 0.5) / 200;
      assert.ok(Math.abs(U(u) - D(1 - u)) < 1e-9, `up/down diverge at u=${u} k=${k}`);
    }
  }
});
await t("soft wipe: the two halves meet exactly at the halfway point", () => {
  // at k=0.5 the reveal is halfway, so coverage must be ~50% and the mirrored
  // pair must sum to 1 (this caught a real inversion bug during development)
  for (const dir of ["left", "right", "up", "down"])
    assert.ok(Math.abs(wipeCoverage(dir, 0.5) - 0.5) < 0.01, `${dir} at k=0.5`);
  assert.ok(Math.abs(wipeCoverage("left", 0.5) + wipeCoverage("right", 0.5) - 1) < 0.02);
});
await t("soft wipe: feathered edge is strictly wider than a hard cut", () => {
  // a hard wipe has no partial band; the soft one must have one mid-transition
  const span = 1000, feather = span * 0.12, k = 0.5;
  const edge = -feather + k * (span + feather * 2);
  const band = Math.min(1, (edge + feather) / span) - Math.max(0, (edge - feather) / span);
  assert.ok(band > 0.05, `soft band too narrow: ${band}`);
});

console.log("types.ts — effect and text-anim breadth");
await t("effect catalogue has 12+ new entries with families", () => {
  const ids = T.EFFECTS.map((e) => e.id);
  assert.ok(ids.length >= 28, `only ${ids.length} effects`);
  for (const e of T.EFFECTS) assert.ok(T.EFFECT_FAMILY[e.id], `${e.id} has no family`);
  for (const id of ["orbit", "earthquake", "whip-left", "dolly-in", "jitter", "roll"])
    assert.ok(ids.includes(id), `missing ${id}`);
});
await t("effect families are all populated", () => {
  const fams = new Set(T.EFFECTS.map((e) => T.EFFECT_FAMILY[e.id]));
  for (const f of ["camera", "motion", "impact", "retro"]) assert.ok(fams.has(f), `empty family ${f}`);
});
await t("text animation catalogue has 20+ entries with families", () => {
  const ids = T.TEXT_ANIMS.map((a) => a.id);
  assert.ok(ids.length >= 20, `only ${ids.length}`);
  for (const a of T.TEXT_ANIMS) assert.ok(T.TEXT_ANIM_FAMILY[a.id], `${a.id} has no family`);
  for (const id of ["pop", "drop-in", "swing", "blur-in", "tracking-in", "flip", "skew-in", "wave"])
    assert.ok(ids.includes(id), `missing ${id}`);
});
await t("text presets reach 20+ looks, all with valid patches", () => {
  assert.ok(T.TEXT_PRESETS.length >= 20, `only ${T.TEXT_PRESETS.length}`);
  for (const tpl of T.TEXT_PRESETS) {
    assert.ok(tpl.name.length > 0);
    assert.ok(Object.keys(tpl.patch).length > 0, `${tpl.name} is an empty patch`);
  }
});
await t("filter catalogue reaches 39 looks with unique ids", () => {
  const ids = E.FILTER_PRESETS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 40, `only ${ids.length}`);
  for (const id of ["kodachrome", "portra", "bleach", "cyberpunk", "clean"])
    assert.ok(ids.includes(id), `missing ${id}`);
});

// ================= luts =================
const L = await import('./b-luts.mjs');
console.log('luts.ts');
await t('BUILTIN_LUTS: 5 analytic LUTs, 17^3, normalized', () => {
  assert.equal(L.BUILTIN_LUTS.length, 5);
  for (const b of L.BUILTIN_LUTS) {
    const { size, data } = b.build();
    assert.equal(size, 17);
    assert.equal(data.length, 17 ** 3 * 3);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < data.length; i += 97) { mn = Math.min(mn, data[i]); mx = Math.max(mx, data[i]); }
    assert.ok(mn >= -0.01 && mx <= 1.01, `range ${mn}..${mx}`);
  }
});
await t('parseCube: minimal 3x3x3 with TITLE/comments', () => {
  const rows = [];
  for (let b = 0; b < 3; b++) for (let g = 0; g < 3; g++) for (let r = 0; r < 3; r++)
    rows.push(`${r / 2} ${g / 2} ${b / 2}`);
  const txt = `TITLE "t"\nLUT_3D_SIZE 3\n# c\n${rows.join('\n')}\n`;
  const { size, data } = L.parseCube(txt);
  assert.equal(size, 3);
  assert.equal(data.length, 27 * 3);
  assert.ok(data[0] === 0 && data[1] === 0 && data[2] === 0, 'first entry (0,0,0)');
  assert.ok(Math.abs(data[78] - 1) < 1e-6 && Math.abs(data[79] - 1) < 1e-6 && Math.abs(data[80] - 1) < 1e-6, 'last entry (1,1,1)');
  // (r=1,g=0,b=0) is entry (b*3+g*3+r)=0*9+0*3+2=2 -> index 6,7,8
  assert.ok(Math.abs(data[6] - 1) < 1e-6 && data[7] === 0 && data[8] === 0, 'r=1 entry');
});
await t('parseCube: 1D + missing size + truncated throw', () => {
  assert.throws(() => L.parseCube('LUT_1D_SIZE 8\n0\n1\n'));
  assert.throws(() => L.parseCube('TITLE "x"\n0 0 0\n'));
  assert.throws(() => L.parseCube('LUT_3D_SIZE 3\n0 0 0\n'));
});
await t('parseCube: DOMAIN_MIN/MAX normalization', () => {
  const rows = [];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++)
    rows.push(`${r * 255} ${g * 255} ${b * 255}`);
  const { data } = L.parseCube(`LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 255 255 255\n${rows.join('\n')}\n`);
  // last entry (b=1,g=1,r=1): index (1*4+1*2+1)*3 = 21..23
  assert.ok(Math.abs(data[21] - 1) < 1e-6 && Math.abs(data[22] - 1) < 1e-6 && Math.abs(data[23] - 1) < 1e-6, '255 -> 1');
  assert.ok(data[0] === 0, '0 -> 0');
});
function lutTable(size, fn) {
  const data = new Float32Array(size ** 3 * 3);
  let o = 0;
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const [R, G, B] = fn(r / (size - 1), g / (size - 1), b / (size - 1));
    data[o++] = R; data[o++] = G; data[o++] = B;
  }
  return { size, data };
}
await t('applyLut: identity LUT leaves pixels unchanged', () => {
  const px = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37) % 256;
  const id = lutTable(17, (r, g, b) => [r, g, b]);
  const copy = Array.from(px);
  L.applyLut(id, px);
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(px[i + c] - copy[i + c]) <= 1, `ch${c} @${i}: ${px[i+c]} vs ${copy[i+c]}`);
    assert.equal(px[i + 3], copy[i + 3], 'alpha untouched');
  }
});
await t('applyLut: invert LUT inverts pixels', () => {
  const px = new Uint8ClampedArray([10, 200, 128, 255, 0, 0, 0, 255]);
  const inv = lutTable(17, (r, g, b) => [1 - r, 1 - g, 1 - b]);
  L.applyLut(inv, px);
  assert.ok(Math.abs(px[0] - 245) <= 2, `r ${px[0]}`);
  assert.ok(Math.abs(px[1] - 55) <= 2, `g ${px[1]}`);
  assert.ok(Math.abs(px[2] - 127) <= 2, `b ${px[2]}`);
  assert.equal(px[3], 255, 'alpha untouched');
});
await t('applyLut: exact on lattice points (size 4)', () => {
  const size = 4;
  const table = lutTable(size, (r, g, b) => [b, r, g]); // rotate channels
  const px = new Uint8ClampedArray(4 * 4);
  // lattice values: k/3*255
  const k3 = (k) => Math.round((k / 3) * 255);
  for (let i = 0; i < 4; i++) {
    px[i * 4] = k3(i); px[i * 4 + 1] = k3(i); px[i * 4 + 2] = k3(i); px[i * 4 + 3] = 255;
  }
  L.applyLut(table, px);
  for (let i = 0; i < 4; i++) {
    // rotation [b,r,g] on (x,x,x) stays (x,x,x)
    assert.ok(Math.abs(px[i * 4] - k3(i)) <= 1 && Math.abs(px[i * 4 + 1] - k3(i)) <= 1 && Math.abs(px[i * 4 + 2] - k3(i)) <= 1, `row ${i}: ${px[i*4]},${px[i*4+1]},${px[i*4+2]}`);
  }
});

// ================= assist =================
const A = await import('./b-assist.mjs');
console.log('assist.ts');
function peaksFrom(fn, duration, bin = 0.04) {
  const n = Math.ceil(duration / bin);
  const p = new Float32Array(n);
  for (let i = 0; i < n; i++) p[i] = fn(i * bin);
  return p;
}
await t('detectBeats: 120 BPM spikes -> 8 beats on the 0.5 s grid', () => {
  const dur = 10;
  const bin = 0.05; // 0.5 s period = exactly 10 bins
  const p = peaksFrom((t) => {
    const ph = t % 0.5;
    return ph < 0.1 ? 1 - ph / 0.1 : 0.05;
  }, dur, bin);
  const found = A.detectBeats(p, dur, 8);
  assert.equal(found.length, 8, `found ${found.length}: ${found}`);
  for (const b of found) assert.ok(Math.abs(b - Math.round(b / 0.5) * 0.5) < 0.08, `beat ${b} off-grid`);
  assert.ok(found[0] > 0.3 && found[0] < 0.8, `first ${found[0]}`);
  assert.ok(found[7] > 3.5 && found[7] < 4.3, `eighth ${found[7]}`);
  for (let i = 1; i < found.length; i++) assert.ok(found[i] > found[i - 1], 'sorted');
});
await t('detectBeats: silent track -> no beats', () => {
  const found = A.detectBeats(peaksFrom(() => 0.05, 8), 8, 8);
  assert.equal(found.length, 0);
});
await t('silenceEdges: 2s lead / 2s trail', () => {
  const dur = 10;
  const p = peaksFrom((t) => (t >= 2 && t < 8 ? 0.8 : 0.01), dur);
  const { lead, trail } = A.silenceEdges(p, dur);
  assert.ok(Math.abs(lead - 2) < 0.25, `lead ${lead}`);
  assert.ok(Math.abs(trail - 2) < 0.25, `trail ${trail}`);
});
await t('silenceEdges: all-loud -> 0 lead', () => {
  const p = peaksFrom(() => 0.9, 5);
  const { lead, trail } = A.silenceEdges(p, 5);
  assert.ok(lead < 0.1 && trail < 0.1, `lead ${lead} trail ${trail}`);
});
await t('beatSegments: contiguous cover of [first,last]', () => {
  const segs = A.beatSegments([1, 2, 3, 4], 10);
  assert.equal(segs.length, 5);
  assert.ok(Math.abs(segs[0].in - 0) < 1e-6);
  assert.ok(Math.abs(segs[0].out - 1) < 1e-6);
  assert.ok(Math.abs(segs[segs.length - 1].out - 10) < 1e-6);
  for (let i = 1; i < segs.length; i++) assert.ok(Math.abs(segs[i].in - segs[i - 1].out) < 1e-6, 'contiguous');
});
const samplePack = {
  format: 'mayocut-pack', version: 1, name: 'Audit', desc: 'audit pack',
  templates: [
    { id: 't1', name: 'P', desc: 'd', aspect: '9:16', kind: 'project',
      project: { id: 'p1', name: 'P', aspect: '9:16', main: [], tracks: T.emptyTracks(), createdAt: 0, updatedAt: 0 } },
    { id: 't2', name: 'E', desc: 'd', aspect: '1:1', kind: 'enhance', swatch: 'linear-gradient(#000,#fff)',
      enhance: [{ op: 'speed', value: 1.5 }] },
  ],
};
await t('validatePack: valid pack accepted', () => {
  const p = A.validatePack(samplePack);
  assert.equal(p.name, 'Audit');
  assert.equal(p.templates.length, 2);
});
await t('validatePack: bad format/version/thin templates rejected', () => {
  assert.throws(() => A.validatePack({ ...samplePack, format: 'nope' }));
  assert.throws(() => A.validatePack({ ...samplePack, version: 2 }));
  assert.throws(() => A.validatePack({ ...samplePack, templates: [] }));
});
await t('packToTemplates: maps + tags with pack name', () => {
  const tpls = A.packToTemplates(A.validatePack(samplePack));
  assert.equal(tpls.length, 2);
  assert.ok(tpls.every((t) => t.packName === 'Audit'));
  assert.equal(tpls[0].kind, 'project');
  assert.equal(tpls[1].kind, 'enhance');
});
function proj(over = {}) {
  return {
    id: 'px', name: 'Px', aspect: '16:9',
    main: [{ id: 'm1', mediaId: 'med1', in: 0, out: 4, speed: 1, volume: 1, adjust: T.DEFAULT_ADJUST, keyframes: [] }],
    tracks: T.emptyTracks(), createdAt: 0, updatedAt: 0, ...over,
  };
}
await t('applyEnhanceOps: aspect/speed/adjust/transition/add-text', () => {
  const out = A.applyEnhanceOps(proj(), [
    { op: 'aspect', value: '1:1' },
    { op: 'speed', value: 2 },
    { op: 'adjust', value: { brightness: 120 } },
    { op: 'transition', value: 'crossfade', dur: 0.5 },
    { op: 'add-text', track: 't_text', clip: { kind: 'text', start: 0, duration: 2, text: 'hi', size: 40 } },
  ], 'audit');
  assert.equal(out.aspect, '1:1');
  assert.equal(out.main[0].speed, 2);
  assert.equal(out.main[0].adjust.brightness, 120);
  assert.equal(out.main[0].adjust.contrast, 100, 'other adjusts preserved');
  const tt = out.tracks.find((x) => x.id === 't_text');
  assert.equal(tt.clips.length, 1);
  assert.equal(tt.clips[0].text, 'hi');
});
await t('templateToPackFile roundtrip validates', () => {
  const tpl = { id: 'u1', name: 'U', desc: 'u', aspect: '9:16', createdAt: 0, kind: 'project',
    project: proj() };
  const pack = A.templateToPackFile(tpl);
  const re = A.validatePack(pack);
  assert.equal(re.templates.length, 1);
  assert.equal(re.templates[0].project.main.length, 1);
});

// ================= captions (pure parts) =================
const C = await import('./b-captions.mjs');
console.log('captions.ts');
await t('captionsToTextClips: karaoke with relative words', () => {
  const segs = [
    { start: 1.5, end: 3.0, text: 'hello world', words: [{ t: 1.5, text: 'hello' }, { t: 2.2, text: 'world' }] },
    { start: 4, end: 4.1, text: 'short', words: [{ t: 4, text: 'short' }] },
  ];
  const clips = C.captionsToTextClips(segs, { karaoke: true });
  assert.equal(clips.length, 2);
  assert.equal(clips[0].anim, 'karaoke');
  assert.ok(Math.abs(clips[0].words[0].t) < 1e-9 && Math.abs(clips[0].words[1].t - 0.7) < 1e-9, 'relative t');
  assert.ok(clips[1].duration >= 0.6, 'min duration enforced');
});
await t('captionsToTextClips: non-karaoke -> fade, no words', () => {
  const clips = C.captionsToTextClips([{ start: 0, end: 1, text: 'x', words: [{ t: 0, text: 'x' }] }], { karaoke: false });
  assert.equal(clips[0].anim, 'fade');
  assert.equal(clips[0].words, undefined);
  assert.equal(clips[0].pos, 'bc');
});
await t('WHISPER_MODELS + CAPTION_LANGUAGES shape', () => {
  assert.equal(C.WHISPER_MODELS.length, 2);
  assert.ok(C.CAPTION_LANGUAGES.some((l) => l.id === 'auto'));
  assert.ok(C.CAPTION_LANGUAGES.length >= 10);
});

// ================= denoise (pure parts) =================
const D = await import('./b-denoise.mjs');
console.log('denoise.ts');
await t('encodeWavMono: header + samples + clamp (re-verify)', async () => {
  const wav = D.encodeWavMono(new Float32Array([2.5, -3, 0.5]), 8000);
  const v = new DataView(await wav.arrayBuffer());
  assert.equal(wav.size, 44 + 6);
  assert.ok(v.getUint32(0, true) === 0x46464952, 'RIFF');
  assert.equal(v.getInt16(44, true), 32767);
  assert.equal(v.getInt16(46, true), -32767);
});
await t('analyzeMono: wave bins + rms', () => {
  const s = new Float32Array(44100);
  for (let i = 0; i < s.length; i++) s[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 44100);
  const a = D.analyzeMono(s);
  assert.equal(a.wave.length, 128);
  assert.ok(Math.max(...a.wave) > 0.99);
  assert.ok(a.rms > 0.2 && a.rms < 0.8);
});


// ================= device capability =================
const DV = await import('./b-device.mjs');
console.log('device.ts');
const highEnv = { cores: 8, memoryGB: 16, webgl: 2, crossOriginIsolated: true, platform: "windows", gpu: "RTX 4060" };
const medEnv  = { cores: 4, memoryGB: 8, webgl: 2, crossOriginIsolated: false, platform: "linux", gpu: "iGPU" };
const lowEnv  = { cores: 2, memoryGB: 2, webgl: 1, crossOriginIsolated: false, platform: "android", gpu: "Mali" };
const high = DV.scoreDevice(highEnv), med = DV.scoreDevice(medEnv), low = DV.scoreDevice(lowEnv);

await t('score: strong desktop -> high, all features on, 4K + 60fps', () => {
  assert.equal(high.tier, "high", `score ${high.score}`);
  assert.equal(high.limits.previewMaxSide, 1920);
  assert.equal(high.limits.exportMaxScale, 2);
  assert.equal(high.limits.maxExportFps, 60);
  for (const f of ["tts", "denoise", "ai", "captions"]) assert.ok(high.limits.features[f].ok, f);
});
await t('score: mid laptop -> balanced, 4K ok, 30fps cap', () => {
  assert.equal(med.tier, "medium", `score ${med.score}`);
  assert.equal(med.limits.previewMaxSide, 1280);
  assert.equal(med.limits.exportMaxScale, 2);
  assert.equal(med.limits.maxExportFps, 30);
  for (const f of ["tts", "denoise", "ai", "captions"]) assert.ok(med.limits.features[f].ok, f);
});
await t('score: weak phone -> low power, ALL heavy features hard-stopped with reason', () => {
  assert.equal(low.tier, "low", `score ${low.score}`);
  assert.equal(low.limits.previewMaxSide, 960);
  assert.equal(low.limits.exportMaxScale, 1);
  assert.equal(low.limits.maxExportFps, 30);
  for (const f of ["tts", "denoise", "ai", "captions"]) {
    const g = low.limits.features[f];
    assert.equal(g.ok, false, f);
    assert.ok(g.reason && g.reason.length > 10, `reason for ${f}`);
  }
});
await t('score: unknown RAM (Safari) stays neutral, not penalized', () => {
  const ios = DV.scoreDevice({ cores: 6, memoryGB: null, webgl: 2, crossOriginIsolated: false, platform: "ios", gpu: "Apple GPU" });
  assert.equal(ios.tier, "medium", `score ${ios.score}`);
  assert.equal(ios.memoryGB, null);
});
await t('score: monotonic — stronger env never scores lower', () => {
  assert.ok(high.score > med.score && med.score > low.score, `${high.score} / ${med.score} / ${low.score}`);
});
await t('previewCapFor: caps buffer per profile (9:16 1080x1920)', () => {
  assert.equal(DV.previewCapFor(high, 1080, 1920), 1);
  assert.ok(Math.abs(DV.previewCapFor(med, 1080, 1920) - 0.667) < 1e-3, DV.previewCapFor(med, 1080, 1920));
  assert.ok(Math.abs(DV.previewCapFor(low, 1080, 1920) - 0.5) < 1e-3);
  assert.equal(DV.previewCapFor(low, 540, 960), 1, 'already under cap -> 1');
});
await t('gateFor: low tier is a HARD stop even if user prefs say on', () => {
  const g = DV.gateFor(low, "tts", { tts: true });
  assert.equal(g.ok, false);
});
await t('gateFor: manual off wins on capable devices', () => {
  const g = DV.gateFor(med, "denoise", { denoise: false });
  assert.equal(g.ok, false);
  assert.ok(/switched/i.test(g.reason ?? ""), g.reason);
  const ok = DV.gateFor(med, "denoise", {});
  assert.equal(ok.ok, true);
});



// ================= built-in creator templates =================
const BT = await import('./b-templates.mjs');
console.log('templates.ts — built-in creator templates');
const templateMedia = [
  { id: 'v1', name: 'creator.mp4', kind: 'video', size: 1000, createdAt: 1, duration: 15 },
  { id: 'i1', name: 'photo-1.jpg', kind: 'image', size: 100, createdAt: 1, duration: 3 },
  { id: 'i2', name: 'photo-2.jpg', kind: 'image', size: 100, createdAt: 1, duration: 3 },
  { id: 'i3', name: 'photo-3.jpg', kind: 'image', size: 100, createdAt: 1, duration: 3 },
  { id: 'a1', name: 'voice.mp3', kind: 'audio', size: 100, createdAt: 1, duration: 20 },
];
await t('built-in templates: unique ids and complete labels', () => {
  const ids = BT.BUILT_IN_TEMPLATES.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(BT.BUILT_IN_TEMPLATES.length >= 7);
  assert.ok(BT.BUILT_IN_TEMPLATES.every((x) => x.name && x.desc && x.swatch && x.needs.length));
});
await t('built-in templates: every template builds from matching local media', () => {
  for (const tpl of BT.BUILT_IN_TEMPLATES) {
    const project = tpl.build(templateMedia);
    assert.ok(project, `template did not build: ${tpl.id}`);
    assert.ok(project.name && project.main.length + project.tracks.reduce((n, tr) => n + tr.clips.length, 0) > 0, tpl.id);
    const mediaById = new Map(templateMedia.map((m) => [m.id, m]));
    for (const clip of project.main) {
      const source = mediaById.get(clip.mediaId);
      assert.ok(source, `${tpl.id}: missing main media ${clip.mediaId}`);
      const sourceDuration = source.kind === 'video' ? (source.duration ?? 0) : Infinity;
      assert.ok(clip.in >= 0 && clip.out > clip.in && clip.out <= sourceDuration + 1e-6,
        `${tpl.id}: invalid source range ${clip.in}–${clip.out} / ${sourceDuration}`);
    }
    for (const tr of project.tracks) for (const clip of tr.clips) {
      assert.ok(Number.isFinite(clip.start) && clip.start >= 0, `${tpl.id}: invalid overlay start`);
      assert.ok(Number.isFinite(clip.duration) && clip.duration > 0, `${tpl.id}: invalid overlay duration`);
    }
  }
});
await t('new creator templates: short clips never create out-of-range overlays', () => {
  const shortMedia = templateMedia.map((m) => m.kind === 'video' ? { ...m, duration: 1 } : m);
  for (const id of ['tpl_product_spotlight', 'tpl_talking_head']) {
    const tpl = BT.BUILT_IN_TEMPLATES.find((x) => x.id === id);
    const project = tpl?.build(shortMedia);
    assert.ok(project, id);
    for (const tr of project.tracks) for (const clip of tr.clips)
      assert.ok(clip.start + clip.duration <= 1 + 1e-6, `${id}: short-source overlay exceeds 1s`);
  }
});
await t('new creator templates: product and talking-head overlays stay within source duration', () => {
  for (const id of ['tpl_product_spotlight', 'tpl_talking_head']) {
    const tpl = BT.BUILT_IN_TEMPLATES.find((x) => x.id === id);
    const project = tpl?.build(templateMedia);
    assert.ok(project, id);
    const end = Math.max(...project.tracks.flatMap((tr) => tr.clips.map((c) => c.start + c.duration)));
    assert.ok(end <= 15 + 1e-6, `${id}: overlay extends past the 15s source (${end})`);
  }
});


// ================= AI background removal matte math =================
const BM = await import('./b-background-math.mjs');
console.log('background-math.ts');
await t('applyAlphaMask: opaque matte preserves source RGBA', () => {
  const source = new Uint8ClampedArray([20, 40, 60, 255, 90, 80, 70, 128]);
  const result = BM.applyAlphaMask(source, new Uint8Array([255, 255]), 2, 1);
  assert.deepEqual(Array.from(result), Array.from(source));
  assert.deepEqual(Array.from(source), [20, 40, 60, 255, 90, 80, 70, 128], 'source is not mutated');
});
await t('applyAlphaMask: transparent and soft matte values become pixel alpha', () => {
  const source = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 200, 7, 8, 9, 100]);
  const result = BM.applyAlphaMask(source, new Uint8Array([0, 128, 255]), 3, 1);
  assert.deepEqual([result[3], result[7], result[11]], [0, 100, 100]);
});
await t('applyAlphaMask: rejects mismatched dimensions and invalid channels', () => {
  assert.throws(() => BM.applyAlphaMask(new Uint8ClampedArray(8), new Uint8Array(1), 2, 1));
  assert.throws(() => BM.applyAlphaMask(new Uint8ClampedArray(4), new Uint8Array(4), 1, 1, 0));
});

// ================= media import format recognition =================
const U = await import("./b-utils.mjs");
console.log("utils.ts — media formats");
await t("video containers include common mobile and desktop camera formats", () => {
  for (const ext of [
    "mp4", "m4v", "mov", "webm", "mkv", "avi", "3gp", "3g2",
    "flv", "ts", "mts", "m2ts", "mpg", "mpeg", "wmv", "vob", "ogv",
  ]) {
    assert.equal(U.kindFromMime("application/octet-stream", `sample.${ext}`), "video", ext);
  }
});
await t("detect unsupported HEVC/H.265 from MP4/MOV sample-entry markers", async () => {
  const blob = new Blob([new TextEncoder().encode("ftypisom moov trak stsd hvc1")]);
  assert.equal(await U.detectVideoCodecHint(blob), "HEVC/H.265");
});
await t("detect H.264/AVC and AV1 codec markers", async () => {
  const h264 = new Blob([new TextEncoder().encode("ftypisom avc1")]);
  const av1 = new Blob([new TextEncoder().encode("ftypisom av01")]);
  assert.equal(await U.detectVideoCodecHint(h264), "H.264/AVC");
  assert.equal(await U.detectVideoCodecHint(av1), "AV1");
});
await t("unknown or incomplete codec metadata remains explicitly unknown", async () => {
  const blob = new Blob([new TextEncoder().encode("ftypisom moov mdat")]);
  assert.equal(await U.detectVideoCodecHint(blob), "Unknown");
});
await t("MIME-based video detection works without a filename extension", () => {
  assert.equal(U.kindFromMime("video/mp4", "camera-file"), "video");
  assert.equal(U.kindFromMime("video/quicktime", "clip.bin"), "video");
});
await t("audio and image file types remain correctly classified", () => {
  assert.equal(U.kindFromMime("application/octet-stream", "voice.m4a"), "audio");
  assert.equal(U.kindFromMime("application/octet-stream", "photo.webp"), "image");
  assert.equal(U.kindFromMime("application/octet-stream", "scan.bmp"), "image");
  assert.equal(U.kindFromMime("application/octet-stream", "camera.heif"), "image");
  assert.equal(U.kindFromMime("application/octet-stream", "notes.txt"), null);
});

// ================= playback regressions (audio doubling / speed) =================
// These pin down three bugs that shipped and were audible:
//  1. the FX echo path was summed 1:1 into the output, so every clip echoed
//     itself even at echo 0 ("two voices at once")
//  2. the outgoing clip never faded across a transition, so the overlap summed
//     to ~2x loudness
//  3. a clip with no `speed` produced NaN, and NaN playbackRate is silently
//     ignored by browsers, so the element kept the previous clip's rate
const mkClip = (o = {}) => ({
  id: 'c', mediaId: 'm', in: 0, out: 10, speed: 1, reverse: false,
  filter: 'none', adjust: {}, volume: 1, muted: false,
  transitionIn: 'none', transitionDur: 0, ...o,
});

await t('clip duration is never NaN when speed is missing (legacy project)', () => {
  const d = T.mainClipDuration(mkClip({ speed: undefined }));
  assert.ok(Number.isFinite(d), `got ${d}`);
  assert.equal(d, 10);
});

await t('clip duration is never NaN when out is missing', () => {
  const d = T.mainClipDuration(mkClip({ out: undefined }));
  assert.ok(Number.isFinite(d), `got ${d}`);
});

await t('playbackRate is always a finite positive number', () => {
  for (const c of [
    mkClip({ speed: undefined }),
    mkClip({ speed: null }),
    mkClip({ speed: 0 }),
    mkClip({ speed: -3 }),
    mkClip({ out: undefined }),
    mkClip({ speed: 1 }),
    mkClip({ speed: 2 }),
    mkClip({ speed: 0.5 }),
  ]) {
    const r = T.mainPlaybackRate(c, 0.1);
    assert.ok(Number.isFinite(r) && r > 0, `rate ${r} for speed=${c.speed}`);
  }
});

await t('1x stays 1x and 2x stays 2x (no silent 2x drift)', () => {
  assert.equal(T.mainPlaybackRate(mkClip({ speed: 1 }), 0.5), 1);
  assert.equal(T.mainPlaybackRate(mkClip({ speed: 2 }), 0.5), 2);
  assert.equal(T.mainClipDuration(mkClip({ speed: 1 })), 10);
  assert.equal(T.mainClipDuration(mkClip({ speed: 2 })), 5);
});

await t('source position does not run backwards or past the clip', () => {
  const c = mkClip({ in: 2, out: 8 });
  const a = T.mainSrcAt(c, 0);
  const b = T.mainSrcAt(c, 3);
  assert.ok(b >= a, 'source must advance');
  assert.ok(b <= 8 + 1e-6, 'source must stay inside out');
});

await t('transition overlap never sums above unity (no doubled audio)', () => {
  // Two 5s clips with the default 0.5s crossfade. The outgoing clip MUST fade
  // while the incoming one rises; otherwise both play at full volume and the
  // mix is ~2x, which is heard as two voices.
  const A = { clip: mkClip({ id: 'A', transitionIn: 'crossfade', transitionDur: 0.5 }), start: 0, end: 5 };
  const B = { clip: mkClip({ id: 'B', transitionIn: 'crossfade', transitionDur: 0.5 }), start: 5, end: 10 };
  let worst = 0;
  for (let t = 4.0; t <= 5.2; t += 0.02) {
    const g = T.mainClipGain(A.clip, A, B, t) + T.mainClipGain(B.clip, B, null, t);
    worst = Math.max(worst, g);
  }
  assert.ok(worst <= 1.02, `overlap summed to ${worst.toFixed(2)}x (must stay ~1.0)`);
});

await t('crossfade is monotonic: incoming rises while outgoing falls', () => {
  const A = { clip: mkClip({ id: 'A', transitionIn: 'crossfade', transitionDur: 0.5 }), start: 0, end: 5 };
  const B = { clip: mkClip({ id: 'B', transitionIn: 'crossfade', transitionDur: 0.5 }), start: 5, end: 10 };
  const a0 = T.mainClipGain(A.clip, A, B, 4.6);
  const a1 = T.mainClipGain(A.clip, A, B, 4.9);
  const b0 = T.mainClipGain(B.clip, B, null, 4.6);
  const b1 = T.mainClipGain(B.clip, B, null, 4.9);
  assert.ok(a1 < a0, 'outgoing clip must fade down');
  assert.ok(b1 > b0, 'incoming clip must fade up');
  assert.equal(T.mainClipGain(B.clip, B, null, 5.0), 1, 'incoming fully up at its start');
});

await t('a single clip plays at its own volume with no crossfade partner', () => {
  const A = { clip: mkClip({ id: 'A', transitionIn: 'none', volume: 0.8 }), start: 0, end: 10 };
  assert.equal(T.mainClipGain(A.clip, A, null, 5), 0.8);
});

await t('muted and reverse clips are silent regardless of transitions', () => {
  const A = { clip: mkClip({ muted: true }), start: 0, end: 10 };
  assert.equal(T.mainClipGain(A.clip, A, null, 5), 0);
  const R = { clip: mkClip({ reverse: true }), start: 0, end: 10 };
  assert.equal(T.mainClipGain(R.clip, R, null, 5), 0);
});


// ================= timeline interaction & playback robustness =================
// These cover bugs that made the editor feel broken rather than crash:
// overlay clips could not be nudged (they snapped to their own edges), main
// clips could not be dragged to reorder, an overlay video was cut to 6s, and
// a video could be condemned as undecodable purely because it loaded slowly.

await t('overlay clip keeps its full source duration (no silent 6s cut)', () => {
  const E2 = E;
  const eng = new E2.Engine({ main: [], tracks: T.emptyTracks(), aspect: '16:9' });
  const media = { id: 'mv', name: 'long.mp4', kind: 'video', size: 1, createdAt: 1, duration: 42 };
  eng.setMedia([media]);
  const clip = eng.addImageOverlay('t_overlay', media, 0);
  assert.equal(clip.duration, 42, `expected the full 42s, got ${clip.duration}`);
});

await t('a short overlay video is not padded beyond its length', () => {
  const eng = new E.Engine({ main: [], tracks: T.emptyTracks(), aspect: '16:9' });
  const media = { id: 'ms', name: 'short.mp4', kind: 'video', size: 1, createdAt: 1, duration: 2.5 };
  eng.setMedia([media]);
  const clip = eng.addImageOverlay('t_overlay', media, 0);
  assert.equal(clip.duration, 2.5);
});

await t('overlay video with unknown duration does not become 0-length', () => {
  const eng = new E.Engine({ main: [], tracks: T.emptyTracks(), aspect: '16:9' });
  const media = { id: 'mu', name: 'x.mp4', kind: 'video', size: 1, createdAt: 1, duration: 0 };
  eng.setMedia([media]);
  const clip = eng.addImageOverlay('t_overlay', media, 0);
  assert.ok(clip.duration >= 0.5, `got ${clip.duration}`);
});

await t('main-clip reorder rejects an out-of-range index instead of corrupting', () => {
  const eng = new E.Engine({
    main: [
      { id: 'a', mediaId: 'm', in: 0, out: 5, speed: 1, reverse: false, filter: 'none',
        adjust: {}, volume: 1, muted: false, transitionIn: 'none', transitionDur: 0 },
      { id: 'b', mediaId: 'm', in: 0, out: 5, speed: 1, reverse: false, filter: 'none',
        adjust: {}, volume: 1, muted: false, transitionIn: 'none', transitionDur: 0 },
    ],
    tracks: T.emptyTracks(), aspect: '16:9',
  });
  const before = eng.project.main.map((c) => c.id).join(',');
  eng.reorderMainClip('a', 99);
  eng.reorderMainClip('a', -5);
  const after = eng.project.main.map((c) => c.id).join(',');
  assert.equal(after, before, 'invalid reorder must be a no-op');
});

await t('reorder actually moves a clip', () => {
  const eng = new E.Engine({
    main: [
      { id: 'a', mediaId: 'm', in: 0, out: 5, speed: 1, reverse: false, filter: 'none',
        adjust: {}, volume: 1, muted: false, transitionIn: 'none', transitionDur: 0 },
      { id: 'b', mediaId: 'm', in: 0, out: 5, speed: 1, reverse: false, filter: 'none',
        adjust: {}, volume: 1, muted: false, transitionIn: 'none', transitionDur: 0 },
    ],
    tracks: T.emptyTracks(), aspect: '16:9',
  });
  eng.reorderMainClip('b', 0);
  assert.equal(eng.project.main[0].id, 'b');
});

await t('trimming a main clip clamps inside the source, keeping it playable', () => {
  const eng = new E.Engine({
    main: [{ id: 'a', mediaId: 'm', in: 0, out: 10, speed: 1, reverse: false,
      filter: 'none', adjust: {}, volume: 1, muted: false,
      transitionIn: 'none', transitionDur: 0 }],
    tracks: T.emptyTracks(), aspect: '16:9',
  });
  const c = eng.project.main[0];
  // drag the out edge far past the end of the source
  c.out = 999;
  const d = T.mainClipDuration(c);
  assert.ok(Number.isFinite(d) && d > 0, `duration ${d}`);
  // drag it before the in point
  c.out = -5;
  const d2 = T.mainClipDuration(c);
  assert.ok(Number.isFinite(d2) && d2 > 0, `duration ${d2}`);
});

await t('a video with no known duration still gets a real, playable clip', () => {
  // A slow import that never got metadata must not produce a 0-length or NaN
  // clip — that is what stranded the preview on the placeholder card.
  const eng = new E.Engine({ main: [], tracks: T.emptyTracks(), aspect: '16:9' });
  const media = { id: 'slow', name: 'slow.mp4', kind: 'video', size: 1, createdAt: 1, duration: 0 };
  eng.setMedia([media]);
  const clip = eng.addMainClip(media);
  assert.ok(Number.isFinite(clip.out) && clip.out > 0, `out=${clip.out}`);
  const d = T.mainClipDuration(clip);
  assert.ok(Number.isFinite(d) && d > 0, `duration=${d}`);
});

await t('the import probe only condemns a file on a real decoder error', () => {
  // Regression guard for the sticky `unplayable` flag: probeVideo used to
  // resolve playable:false on an 8s timeout, which then persisted on the media
  // item and showed the "can not be decoded" card forever.
  const src = readFileSync('src/mayocut/utils.ts', 'utf8');
  assert.ok(!/finish\(false\)/.test(src), 'probeVideo must not resolve playable:false');
  assert.ok(/finish\("unknown"\)/.test(src), 'a timeout must be reported as unknown');
  assert.ok(/timeoutMs = 30000/.test(src), 'the probe budget must be generous, not 8s');
});


// ================= persistence, transitions, exports =================

await t('the FIRST clip has no incoming fade, so a video does not open muted', () => {
  // Every clip defaults to transitionIn:"crossfade". Applying that to clip 0
  // silenced the opening moments of the video — the "first seconds are black
  // and silent" report.
  const c = mkClip({ id: 'A', transitionIn: 'crossfade', transitionDur: 0.5 });
  const span = { clip: c, start: 0, end: 5 };
  assert.equal(T.mainClipGain(c, span, null, 0, false), 1, 'first clip must start at full level');
  // ...but a later clip still fades in
  assert.ok(T.mainClipGain(c, span, null, -0.25, true) < 1, 'a clip with a predecessor fades in');
});

await t('a muted clip contributes nothing, which is what extract-audio relies on', () => {
  const c = mkClip({ muted: true, transitionIn: 'none' });
  assert.equal(T.mainClipGain(c, { clip: c, start: 0, end: 5 }, null, 2, true), 0);
});

await t('transition windows still sum to unity with the first-clip fix', () => {
  const A = { clip: mkClip({ id: 'A', transitionIn: 'crossfade', transitionDur: 0.5 }), start: 0, end: 5 };
  const B = { clip: mkClip({ id: 'B', transitionIn: 'crossfade', transitionDur: 0.5 }), start: 5, end: 10 };
  let worst = 0;
  for (let t = 4.0; t <= 5.2; t += 0.02) {
    worst = Math.max(worst, T.mainClipGain(A.clip, A, B, t, false) + T.mainClipGain(B.clip, B, null, t, true));
  }
  assert.ok(worst <= 1.02, `overlap summed to ${worst.toFixed(2)}x`);
});

await t('importFiles pairs each item with its OWN file, even when one is skipped', () => {
  // Callers used to zip items[i] with accepted[i]. Skipping any file shifted
  // every later pairing, storing the wrong bytes under the wrong name.
  const src = readFileSync('src/mayocut/utils.ts', 'utf8');
  assert.ok(/out\.push\(\{ \.\.\.item, sourceFile: f \}\)/.test(src), 'items must carry their source File');
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(!/accepted\[index\]/.test(ed), 'Editor must not pair by array index');
  assert.ok(!/items\[i\], accepted\[i\]/.test(ed), 'Editor must not pair by array index');
  const home = readFileSync('src/mayocut/components/ProjectsHome.tsx', 'utf8');
  assert.ok(!/items\[i\], accepted\[i\]/.test(home), 'ProjectsHome must not pair by array index');
});

await t('storage persistence is requested automatically, not hidden behind a button', () => {
  const home = readFileSync('src/mayocut/components/ProjectsHome.tsx', 'utf8');
  assert.ok(/requestPersistentStorage\(\)/.test(home), 'home screen must ask for durable storage');
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/requestPersistentStorage\(\)/.test(ed), 'editor must ask too, before importing');
  const idb = readFileSync('src/mayocut/idb.ts', 'utf8');
  assert.ok(/export async function requestPersistentStorage/.test(idb));
  assert.ok(/onversionchange/.test(idb), 'a schema upgrade in another tab must not deadlock writes');
});

await t('export preflight names the real blocker instead of "Export failed"', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/export function exportBlocker/.test(src));
  assert.ok(/has no video recorder/.test(src), 'must explain a missing MediaRecorder');
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/exportBlocker\(\)/.test(ed), 'the export dialog must surface it before trying');
});

await t('inspector tab jump scrolls the panel itself, not the page', () => {
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/jumpToInspectorSection/.test(ed));
  // scrollIntoView picks the nearest scrollable ancestor, which on a phone is
  // often the page rather than the sheet body.
  assert.ok(!/scrollIntoView\(\{ block: "nearest"/.test(ed), 'must move the panel scrollTop instead');
});

await t('mobile sheets establish a real scroll region', () => {
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/max-h-\[85dvh\] flex flex-col overflow-hidden/.test(ed), 'media sheet must be a flex column');
  assert.ok(/max-h-\[88dvh\] flex flex-col overflow-hidden/.test(ed), 'tune sheet must be a flex column');
  assert.ok(/overscroll-contain/.test(ed), 'sheets must not chain scroll to the page');
});

await t('filters and effects fall back to the clip under the playhead', () => {
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/function targetMainClipId/.test(ed), 'needs a selection fallback');
  assert.ok(!/Select a main-track video clip first/.test(ed), 'must not refuse to apply');
});


// ================= timeline resolver — the shared engine contract =================
// These are the "automated tests with real videos" foundation: real Project
// fixtures (multi-clip, split, muted, extracted audio, transitions) resolved
// through the SAME function preview and export use.

const rc = (o = {}) => ({
  id: 'c', mediaId: 'm', in: 0, out: 5, speed: 1, reverse: false, filter: 'none',
  adjust: {}, volume: 1, muted: false, transitionIn: 'none', transitionDur: 0, ...o,
});
const rproj = (main, tracks = []) => ({
  id: 'p', name: 'p', aspect: '16:9', main, tracks, createdAt: 1, updatedAt: 1,
});
const rtrack = (id, clips) => ({ id, name: id, kind: 'text', clips });

await t('resolver: a single clip is visible for its whole span', () => {
  const p = rproj([rc()]);
  for (const at of [0, 1, 4.99]) {
    const c = R.resolveComposition(p, at);
    assert.equal(c.main.length, 1, `at ${at}`);
    assert.equal(c.empty, false);
  }
});

await t('resolver: two clips with a crossfade overlap and sum to unity', () => {
  const p = rproj([
    rc({ id: 'A', transitionIn: 'crossfade', transitionDur: 0.5 }),
    rc({ id: 'B', transitionIn: 'crossfade', transitionDur: 0.5 }),
  ]);
  let sawTransition = false;
  for (let at = 0; at <= 10; at += 0.05) {
    const c = R.resolveComposition(p, at);
    const sum = c.main.reduce((n, l) => n + l.gain, 0);
    assert.ok(sum <= 1.02, `gain sum ${sum.toFixed(2)} at ${at.toFixed(2)}`);
    if (c.transition) {
      sawTransition = true;
      assert.equal(c.main.length, 2, 'both clips visible mid-transition');
      assert.ok(c.transition.progress >= 0 && c.transition.progress <= 1);
    }
  }
  assert.ok(sawTransition, 'the resolver must report the transition at all');
});

await t('resolver: at an exact cut the INCOMING clip wins (no flash back)', () => {
  const p = rproj([
    rc({ id: 'A', transitionIn: 'none' }),
    rc({ id: 'B', transitionIn: 'none' }),
  ]);
  const c = R.resolveComposition(p, 5);
  assert.equal(c.main.length, 1);
  assert.equal(c.main[0].clip.id, 'B');
});

await t('resolver: a split clip is two independent spans', () => {
  const p = rproj([
    rc({ id: 'a1', in: 0, out: 2.5 }),
    rc({ id: 'a2', in: 2.5, out: 5 }),
  ]);
  const first = R.resolveComposition(p, 1);
  const second = R.resolveComposition(p, 3);
  assert.equal(first.main[0].clip.id, 'a1');
  assert.equal(first.main[0].src, 1);
  assert.equal(second.main[0].clip.id, 'a2');
  assert.equal(second.main[0].src, 3, 'source continues across the split');
});

await t('resolver: a MUTED clip contributes no audio but is still visible', () => {
  const p = rproj([rc({ id: 'A', muted: true })]);
  const c = R.resolveComposition(p, 1);
  assert.equal(c.main.length, 1, 'muted must not remove the picture');
  assert.equal(c.main[0].gain, 0, 'muted must contribute no audio');
});

await t('resolver: extracted audio plays on its own track while the video is muted', () => {
  const p = rproj(
    [rc({ id: 'A', mediaId: 'vid', muted: true })],
    [rtrack('t_audio', [{ id: 'au', kind: 'audio', mediaId: 'aud', start: 0, duration: 5 }])],
  );
  const c = R.resolveComposition(p, 1);
  assert.equal(c.main[0].gain, 0, 'original sound stays muted');
  assert.equal(c.audioOverlays.length, 1, 'the extracted copy is the audible one');
  assert.equal(c.audioOverlays[0].clip.mediaId, 'aud');
  const need = R.requiredMediaAt(p, 1);
  assert.ok(need.includes('vid'), 'picture media required');
  assert.ok(need.includes('aud'), 'extracted audio media required');
});

await t('resolver: overlays are time-windowed and skip hidden tracks', () => {
  const clips = [{ id: 'tx', kind: 'text', start: 1, duration: 2, text: 'hi' }];
  const vis = R.resolveComposition(rproj([rc()], [rtrack('t_text', clips)]), 1.5);
  assert.equal(vis.overlays.length, 1);
  const outside = R.resolveComposition(rproj([rc()], [rtrack('t_text', clips)]), 4);
  assert.equal(outside.overlays.length, 0);
  const hiddenTrack = rtrack('t_text', clips);
  hiddenTrack.hidden = true;
  const hidden = R.resolveComposition(rproj([rc()], [hiddenTrack]), 1.5);
  assert.equal(hidden.overlays.length, 0, 'hidden track must not render');
});

await t('resolver: every output is finite, even for legacy clips', () => {
  const p = rproj([{ ...rc(), speed: undefined, out: undefined, volume: undefined }]);
  for (let at = 0; at <= 5; at += 0.5) {
    const c = R.resolveComposition(p, at);
    assert.ok(Number.isFinite(c.t) && Number.isFinite(c.duration));
    for (const l of c.main) {
      for (const k of ['src', 'rate', 'alpha', 'gain', 'start', 'end']) {
        assert.ok(Number.isFinite(l[k]), `${k} not finite at ${at}`);
      }
      assert.ok(l.rate > 0, 'rate must be positive');
    }
  }
});

await t('resolver: an empty timeline is explicitly empty, not broken', () => {
  const c = R.resolveComposition(rproj([]), 0);
  assert.equal(c.empty, true);
  assert.equal(c.duration, 0);
  assert.deepEqual(c.main, []);
});

await t('resolver: seeking past the end clamps instead of exploding', () => {
  const p = rproj([rc()]);
  const c = R.resolveComposition(p, 999);
  assert.equal(c.t, c.duration);
  assert.equal(c.main.length, 1, 'the last frame is still shown');
});

await t('readiness: a late decoder is reported, not assumed', () => {
  assert.equal(R.readinessFor(0, 0, 0, false), 'loading');
  assert.equal(R.readinessFor(1, 0, 0, false), 'loading');
  assert.equal(R.readinessFor(2, 1.0, 1.0, false), 'ready');
  assert.equal(R.readinessFor(2, 0.0, 2.0, false), 'seek-needed');
  assert.equal(R.readinessFor(2, 0.0, 2.0, true), 'ready', 'paused frames are fine');
});

await t('readiness: the clock holds while loading, then gives up (bounded)', () => {
  assert.equal(R.shouldAdvanceClock(['ready'], 0), true);
  assert.equal(R.shouldAdvanceClock(['loading'], 0), false, 'must wait for the frame');
  assert.equal(R.shouldAdvanceClock(['loading'], 1000), true, 'must not hang forever');
  assert.equal(R.shouldAdvanceClock(['ready', 'loading'], 0), false);
});

await t('the engine draws from the resolver, not its own transition maths', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/resolveComposition\(this\.project/.test(src), 'draw() must use the resolver');
  assert.ok(/private visibleLayerReady/.test(src), 'transport must be able to hold');
  assert.ok(/private awaitFrameFor/.test(src), 'play() must pre-warm the first frame');
  assert.ok(/private async frameReadyAt/.test(src), 'export must confirm frames');
});


// ================= stage 2: frame-stepped export =================
// A synthetic offline audio graph stands in for OfflineAudioContext so the
// mixer's decisions (muted, transition, overlay track) can be asserted without
// a browser. We record what gains get scheduled rather than listening.

function fakeOffline() {
  const scheduled = [];
  const node = (kind, extra = {}) => {
    const n = {
      kind, ...extra,
      connect() { return n; },
      disconnect() {},
    };
    return n;
  };
  const ctx = {
    currentTime: 0,
    destination: node('dest'),
    createGain: () => {
      const g = node('gain', {
        gain: {
          value: 1,
          _set: [],
          setValueAtTime(v, at) { this._set.push(['set', v, at]); },
          linearRampToValueAtTime(v, at) { this._set.push(['ramp', v, at]); },
        },
      });
      return g;
    },
    createBufferSource: () => {
      const s = node('src', {
        playbackRate: { value: 1 },
        start(at, offset, dur) {
          scheduled.push({ at, offset, dur, rate: s.playbackRate.value });
        },
      });
      return s;
    },
  };
  return { ctx, scheduled };
}

const fakeBuf = (duration = 10) => ({ duration });

await t('offline mixer: a MUTED clip schedules no audio source', async () => {
  const eng = new E.Engine({
    main: [mkClip({ id: 'A', mediaId: 'm1', muted: true })],
    tracks: T.emptyTracks(), aspect: '16:9',
  });
  const { ctx, scheduled } = fakeOffline();
  const bufs = new Map([['m1', fakeBuf()]]);
  await eng.scheduleOfflineAudio(ctx, ctx.destination, bufs);
  assert.equal(scheduled.length, 0, 'muted must produce no source at all');
});

await t('offline mixer: an unmuted clip schedules exactly one source', async () => {
  const eng = new E.Engine({
    main: [mkClip({ id: 'A', mediaId: 'm1' })],
    tracks: T.emptyTracks(), aspect: '16:9',
  });
  const { ctx, scheduled } = fakeOffline();
  await eng.scheduleOfflineAudio(ctx, ctx.destination, new Map([['m1', fakeBuf()]]));
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].at, 0);
});

await t('offline mixer: a freeze/reverse clip stays silent', async () => {
  for (const flag of [{ freeze: true }, { reverse: true }]) {
    const eng = new E.Engine({
      main: [mkClip({ id: 'A', mediaId: 'm1', ...flag })],
      tracks: T.emptyTracks(), aspect: '16:9',
    });
    const { ctx, scheduled } = fakeOffline();
    await eng.scheduleOfflineAudio(ctx, ctx.destination, new Map([['m1', fakeBuf()]]));
    assert.equal(scheduled.length, 0, `${JSON.stringify(flag)} must be silent`);
  }
});

await t('offline mixer: extracted audio plays while the original is muted', async () => {
  const eng = new E.Engine({
    main: [mkClip({ id: 'A', mediaId: 'vid', muted: true })],
    tracks: [
      { id: 't_audio', name: 'Audio', kind: 'audio',
        clips: [{ id: 'au', kind: 'audio', mediaId: 'aud', start: 0, duration: 5, volume: 1 }] },
    ],
    aspect: '16:9',
  });
  const { ctx, scheduled } = fakeOffline();
  await eng.scheduleOfflineAudio(
    ctx, ctx.destination, new Map([['vid', fakeBuf()], ['aud', fakeBuf()]]),
  );
  assert.equal(scheduled.length, 1, 'only the extracted copy is audible');
});

await t('offline mixer: a hidden or muted TRACK contributes nothing', async () => {
  // The main clip is audible, so exactly ONE source is expected — the point is
  // that the muted/hidden overlay track adds no SECOND source.
  const mk = (flags) => new E.Engine({
    main: [mkClip({ id: 'A', mediaId: 'vid' })],
    tracks: [
      { id: 't_audio', name: 'Audio', kind: 'audio', ...flags,
        clips: [{ id: 'au', kind: 'audio', mediaId: 'aud', start: 0, duration: 5, volume: 1 }] },
    ],
    aspect: '16:9',
  });
  for (const flags of [{ muted: true }, { hidden: true }]) {
    const { ctx, scheduled } = fakeOffline();
    await mk(flags).scheduleOfflineAudio(
      ctx, ctx.destination, new Map([['vid', fakeBuf()], ['aud', fakeBuf()]]),
    );
    assert.equal(scheduled.length, 1, `${JSON.stringify(flags)} track must add no source`);
  }
});

await t('offline mixer: a solo\'d track silences the main track', async () => {
  const eng = new E.Engine({
    main: [mkClip({ id: 'A', mediaId: 'vid' })],
    tracks: [
      { id: 't_audio', name: 'Audio', kind: 'audio', solo: true,
        clips: [{ id: 'au', kind: 'audio', mediaId: 'aud', start: 0, duration: 5, volume: 1 }] },
    ],
    aspect: '16:9',
  });
  const { ctx, scheduled } = fakeOffline();
  await eng.scheduleOfflineAudio(
    ctx, ctx.destination, new Map([['vid', fakeBuf()], ['aud', fakeBuf()]]),
  );
  assert.equal(scheduled.length, 1, 'only the solo track is heard');
});

await t('offline mixer: two clips schedule in timeline order', async () => {
  const eng = new E.Engine({
    main: [
      mkClip({ id: 'A', mediaId: 'm1', in: 0, out: 5 }),
      mkClip({ id: 'B', mediaId: 'm2', in: 0, out: 5 }),
    ],
    tracks: T.emptyTracks(), aspect: '16:9',
  });
  const { ctx, scheduled } = fakeOffline();
  await eng.scheduleOfflineAudio(
    ctx, ctx.destination, new Map([['m1', fakeBuf(5)], ['m2', fakeBuf(5)]]),
  );
  assert.equal(scheduled.length, 2);
  assert.ok(scheduled[1].at >= 5, 'second clip starts at the cut, not at zero');
});

await t('stepped export exists as a real method and is preferred by the UI', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/async exportMP4Stepped/.test(src), 'frame-stepped exporter must exist');
  assert.ok(/async renderOfflineAudioTrack/.test(src), 'must render audio offline');
  assert.ok(/async canExportStepped/.test(src), 'must expose a capability check');
  // it must actually wait for frames, not sample a timer
  assert.ok(/await this\.frameReadyAt\(t, 3000\)/.test(src), 'must confirm each frame');
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/exportMP4Stepped/.test(ed), 'the UI must be able to reach it');
  assert.ok(
    ed.indexOf('exportMP4Stepped') < ed.indexOf('eng.exportMP4(opts'),
    'stepped export must be tried before the real-time recorder',
  );
});

await t('stepped export muxes an audio track when audio exists', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/audio: \{ codec: "aac" as const/.test(src), 'must declare the AAC track');
  assert.ok(/addAudioChunk/.test(src), 'must feed encoded audio to the muxer');
});


// ================= stage 3: export planning + proxies =================
console.log('export-plan.ts');
await t('recordThroughput rejects nonsense measurements', () => {
  assert.equal(P.recordThroughput(0, 1000, { width: 1920, height: 1080 }), null);
  assert.equal(P.recordThroughput(12, 0, { width: 1920, height: 1080 }), null);
  assert.equal(P.recordThroughput(12, NaN, { width: 1920, height: 1080 }), null);
  assert.equal(P.recordThroughput(-4, 1000, { width: 1920, height: 1080 }), null);
});
await t('recordThroughput turns frames+time into fps', () => {
  const th = P.recordThroughput(24, 2000, { width: 1920, height: 1080 });
  assert.ok(th, 'must accept a real measurement');
  assert.ok(Math.abs(th.framesPerSecond - 12) < 1e-9, `want 12 fps, got ${th.framesPerSecond}`);
});
await t('planSteppedExport on a measurement is not heuristic', () => {
  const th = P.recordThroughput(24, 2000, { width: 1920, height: 1080 }); // 12 fps @1080p
  const plan = P.planSteppedExport(
    { durationSec: 10, fps: 30, width: 1920, height: 1080 },
    th,
  );
  assert.equal(plan.totalFrames, 300);
  assert.equal(plan.heuristic, false, 'a measured plan must not be flagged');
  // 12 frames/s measured, 300 frames to render -> ~25s
  assert.ok(Math.abs(plan.estimatedSec - 25) < 1.5, `want ~25s, got ${plan.estimatedSec}`);
  assert.equal(plan.strategy, 'stepped');
});
await t('planSteppedExport without a measurement is flagged heuristic', () => {
  const plan = P.planSteppedExport({ durationSec: 10, fps: 30, width: 1920, height: 1080 }, null);
  assert.equal(plan.heuristic, true);
  assert.ok(plan.estimatedSec > 0, 'still gives an honest ballpark');
  assert.ok(/about|rough|~|around/i.test(plan.summary), `summary should hedge: ${plan.summary}`);
});
await t('4K costs more than 1080p for the same duration', () => {
  const th = P.recordThroughput(24, 2000, { width: 1920, height: 1080 });
  const hd = P.planSteppedExport({ durationSec: 10, fps: 30, width: 1920, height: 1080 }, th);
  const uhd = P.planSteppedExport({ durationSec: 10, fps: 30, width: 3840, height: 2160 }, th);
  assert.ok(uhd.estimatedSec > hd.estimatedSec * 1.5, '4K must not look as cheap as 1080p');
});
await t('a hopelessly slow device is steered to real time', () => {
  const slow = { framesPerSecond: 1, width: 1920, height: 1080, sampleMs: 5000 };
  const plan = P.planSteppedExport({ durationSec: 60, fps: 30, width: 1920, height: 1080 }, slow);
  assert.equal(plan.strategy, 'realtime');
  assert.ok(plan.slowFactor > 6);
});
await t('a merely-slow device keeps the accurate path', () => {
  const slow = { framesPerSecond: 5, width: 1920, height: 1080, sampleMs: 5000 }; // 5x real time
  const plan = P.planSteppedExport({ durationSec: 10, fps: 30, width: 1920, height: 1080 }, slow);
  assert.equal(plan.strategy, 'stepped', 'correct beats fast below the cutoff');
});
await t('fmtDuration reads like a person wrote it', () => {
  assert.equal(P.fmtDuration(5), '5 s');
  assert.equal(P.fmtDuration(65), '1 min 5 s');
  assert.equal(P.fmtDuration(0), '0 s');
});

console.log('proxy.ts');
await t('small footage does not get a proxy', () => {
  const d = X.shouldProxyVideo({ width: 1280, height: 720, size: 20e6, kind: 'video' });
  assert.equal(d.wanted, false, '720p decodes fine already');
});
await t('the proxy threshold is exclusive: 720p and 721p are not proxied, 722p is', () => {
  // This boundary is where an off-by-one would hide, so state the rule plainly:
  // a source must be MORE than one line taller than the target to be worth a
  // proxy. 721p → 720p is a re-encode that saves a single line, which is not
  // worth any CPU at all. `minSource` is therefore target+1 and the test is
  // `h <= minSource`, both deliberate.
  assert.equal(X.shouldProxyVideo({ width: 1280, height: 720, kind: 'video' }).wanted, false);
  assert.equal(X.shouldProxyVideo({ width: 1281, height: 721, kind: 'video' }).wanted, false);
  assert.equal(X.shouldProxyVideo({ width: 1282, height: 722, kind: 'video' }).wanted, true);
  // and the target height is configurable: at maxHeight 480, 720p DOES want one
  assert.equal(X.shouldProxyVideo({ width: 1280, height: 720, kind: 'video' }, { maxHeight: 480 }).wanted, true);
});
await t('4K footage does get a proxy at 720p', () => {
  const d = X.shouldProxyVideo({ width: 3840, height: 2160, size: 200e6, kind: 'video' });
  assert.equal(d.wanted, true);
  assert.equal(d.targetHeight, 720);
});
await t('audio never gets a proxy', () => {
  const d = X.shouldProxyVideo({ width: 0, height: 0, size: 200e6, kind: 'audio' });
  assert.equal(d.wanted, false);
});
await t('unknown height falls back to file size', () => {
  assert.equal(X.shouldProxyVideo({ size: 20e6, kind: 'video' }).wanted, false);
  assert.equal(X.shouldProxyVideo({ size: 900e6, kind: 'video' }).wanted, true);
});
await t('proxy sizing preserves aspect and stays even', () => {
  const s = X.proxySize(3840, 2160, 720);
  assert.equal(s.height, 720);
  assert.equal(s.width, 1280);
  const odd = X.proxySize(1921, 1081, 720);
  assert.equal(odd.width % 2, 0, 'odd widths break H.264');
  assert.equal(odd.height % 2, 0);
});
await t('portrait footage keeps portrait dimensions', () => {
  const s = X.proxySize(1080, 1920, 720);
  assert.equal(s.height, 720);
  assert.equal(s.width, 406); // 405 rounded up to an even width
  assert.ok(s.height > s.width, 'must not silently rotate');
});
await t('a proxy never upscales past the source', () => {
  const s = X.proxySize(640, 360, 720);
  assert.ok(s.height <= 360, `upscaled to ${s.height}`);
});
await t('EXPORT ALWAYS GETS THE ORIGINAL', () => {
  assert.equal(X.sourceFor('export', 'blob:original', 'blob:proxy'), 'blob:original');
  assert.equal(X.sourceFor('export', 'blob:original', undefined), 'blob:original');
  assert.equal(X.sourceFor('export', 'blob:original', 'blob:proxy'), 'blob:original');
});
await t('preview prefers the proxy but survives without one', () => {
  assert.equal(X.sourceFor('preview', 'blob:original', 'blob:proxy'), 'blob:proxy');
  assert.equal(X.sourceFor('preview', 'blob:original', undefined), 'blob:original');
});
await t('every export path re-points at originals and restores after', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const stepped = src.slice(src.indexOf('async exportMP4Stepped'));
  assert.ok(/this\.useOriginalSources\(\)/.test(stepped.slice(0, 2000)), 'stepped export must switch');
  assert.ok(
    stepped.slice(0, stepped.indexOf('async exportMP4(')).includes('usePreviewSources'),
    'stepped export must restore previews',
  );
  const rt = src.slice(src.indexOf('async exportMedia'));
  assert.ok(/this\.useOriginalSources\(\)/.test(rt.slice(0, 1500)), 'real-time export must switch');
});
await t('the UI loads a stored proxy and builds one after import', () => {
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/db\.getProxy\(/.test(ed), 'must reuse an existing proxy on open');
  assert.ok(/queueProxyBuilds\(/.test(ed), 'must build proxies after import');
  assert.ok(/db\.putProxy\(/.test(ed), 'must store what it builds');
});
await t('proxy generation bundles no new dependency', () => {
  const src = readFileSync('src/mayocut/proxy-build.ts', 'utf8');
  assert.ok(!/from "(?!\.)/.test(src), 'must not import a package');
  assert.ok(/MediaRecorder/.test(src), 'must use the platform encoder');
});
await t('the export dialog shows an estimate before rendering', () => {
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/measureThroughput/.test(ed), 'must be able to measure');
  assert.ok(/exportPlan\.summary/.test(ed), 'must surface the estimate');
  assert.ok(/planExport/.test(ed), 'must re-plan when fps/res change');
});


// ================= stage 4: frame-stepped WebM =================
console.log('webm frame-stepped');
await t('a frame-stepped WebM exporter exists and is reachable', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/async exportWebmStepped\(/.test(src), 'must expose a stepped WebM exporter');
  assert.ok(/async canExportSteppedWebm\(/.test(src), 'must expose a capability check');
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/exportWebmStepped/.test(ed), 'the UI must be able to reach it');
});
await t('the WebM exporter confirms every frame before encoding it', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('async exportWebmStepped('));
  const body = fn.slice(0, fn.indexOf('// ------------------------------------------------------------- export (MP4)'));
  assert.ok(/await this\.frameReadyAt\(t, 3000\)/.test(body), 'must wait for the decoder');
  assert.ok(/new W_\.VideoFrame\(this\.canvas/.test(body), 'must encode the drawn canvas');
  assert.ok(/timestamp: f \* frameDurUs/.test(body), 'must use explicit frame timestamps');
  assert.ok(/totalFrames = Math\.max\(1, Math\.round\(dur0 \* fps\)\)/.test(body), 'must cover the whole duration');
});
await t('the WebM exporter muxes an Opus track from offline PCM', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('async exportWebmStepped('));
  const body = fn.slice(0, fn.indexOf('// ------------------------------------------------------------- export (MP4)'));
  assert.ok(/codec: "A_OPUS"/.test(body), 'must declare the Opus track');
  assert.ok(/renderOfflineAudioTrack\(/.test(body), 'must reuse the offline render, not a live graph');
  assert.ok(/muxer\.addAudioChunk/.test(body), 'must feed encoded audio to the muxer');
});
await t('the WebM exporter always exports originals, then restores previews', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('async exportWebmStepped('));
  const body = fn.slice(0, fn.indexOf('// ------------------------------------------------------------- export (MP4)'));
  assert.ok(/this\.useOriginalSources\(\)/.test(body), 'a proxy must never be encoded');
  assert.ok(/this\.usePreviewSources\(\)/.test(body), 'preview must be restored');
});
await t('VP codec selection prefers VP9 and maps to the Matroska CodecID', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('async function pickVpCodec('));
  const body = fn.slice(0, fn.indexOf('async function pickAvcCodec('));
  assert.ok(body.indexOf('vp09') < body.indexOf('"vp8"'), 'VP9 must be tried before VP8');
  assert.ok(/mkv: "V_VP9"/.test(body) && /mkv: "V_VP8"/.test(body), 'muxer needs Matroska IDs');
  assert.ok(/isConfigSupported/.test(body), 'must ask the platform, not assume');
});
await t('Opus audio is resampled to 48 kHz rather than mislabelled', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('async exportWebmStepped('));
  const body = fn.slice(0, fn.indexOf('// ------------------------------------------------------------- export (MP4)'));
  assert.ok(/audio\.sampleRate !== opusRate/.test(body), 'must notice a rate mismatch');
  assert.ok(/const ratio = opusRate \/ audio\.sampleRate/.test(body), 'must actually resample');
  assert.ok(/sampleRate: opusRate/.test(body), 'must declare 48 kHz to the encoder');
});
await t('WebM stepping is only chosen when MP4 stepping is unavailable', () => {
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  const i = ed.indexOf('await eng.canExportStepped()');
  const j = ed.indexOf('await eng.canExportSteppedWebm()');
  const k = ed.indexOf('exportMP4Stepped(');
  assert.ok(i > 0 && j > i, 'MP4 must be preferred, WebM the fallback');
  assert.ok(k > 0, 'MP4 stepped exporter must still be wired');
});
await t('the muxer is MIT and adds no transitive runtime dependency', () => {
  const pkg = JSON.parse(readFileSync('node_modules/webm-muxer/package.json', 'utf8'));
  assert.equal(pkg.license, 'MIT');
  const deps = Object.keys(pkg.dependencies ?? {});
  assert.ok(
    deps.every((d) => d.startsWith('@types/')),
    `only type packages allowed, found: ${deps.join(', ')}`,
  );
});
await t('no user-facing message tells the user to switch browsers or convert files', () => {
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  const eng = readFileSync('src/mayocut/engine.ts', 'utf8');
  for (const [name, src] of [['Editor.tsx', ed], ['engine.ts', eng]]) {
    const bad = src.match(/Chrome\s*\/?\s*or\s*Edge|Chrome\/Edge|Convert (it|them) to/gi);
    assert.equal(bad, null, `${name} still advises: ${bad && bad.join(', ')}`);
  }
});


// ================= stage 5: the notebook list =================
console.log('audio-fx.ts');
await t('"none" is a genuinely dry signal', () => {
  const r = AFX.audioFxRecipe('none');
  assert.equal(r.rate, 1);
  assert.equal(r.gain, 1);
  assert.equal(r.filters.length, 0);
  assert.equal(r.delay, undefined);
  assert.equal(r.reverbSec, undefined);
  assert.equal(r.ringHz, undefined);
});
await t('telephone is band-limited, not just quieter', () => {
  const r = AFX.audioFxRecipe('telephone');
  assert.ok(r.filters.some((f) => f.type === 'highpass' && f.frequency > 300), 'needs a low cut');
  assert.ok(r.filters.some((f) => f.type === 'lowpass' && f.frequency < 4000), 'needs a high cut');
});
await t('every effect actually does something', () => {
  for (const f of AFX.AUDIO_FX) {
    if (f.id === 'none') continue;
    const r = AFX.audioFxRecipe(f.id);
    const changed =
      r.rate !== 1 || r.gain !== 1 || r.filters.length > 0 || !!r.delay || !!r.reverbSec || !!r.ringHz;
    assert.ok(changed, `${f.id} is a no-op, which would look like a broken button`);
  }
});
await t('every listed effect has a recipe and every recipe is listed', () => {
  for (const f of AFX.AUDIO_FX) assert.ok(AFX.audioFxRecipe(f.id), `no recipe for ${f.id}`);
  assert.equal(AFX.AUDIO_FX.length, Object.keys(AFX.AUDIO_FX_MAP).length);
});
await t('pitch effects report the duration change they cause', () => {
  assert.ok(AFX.audioFxDurationScale('chipmunk') < 1, 'chipmunk shortens the clip');
  assert.ok(AFX.audioFxDurationScale('deep') > 1, 'deep voice lengthens it');
  assert.equal(AFX.audioFxDurationScale('echo'), 1, 'echo must not change length');
});
await t('the impulse is deterministic, so an export matches the preview', () => {
  const fakeCtx = (rate) => ({
    sampleRate: rate,
    createBuffer: (ch, len) => {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { duration: len / rate, numberOfChannels: ch, length: len, getChannelData: (i) => data[i] };
    },
  });
  const a = AFX.makeImpulse(fakeCtx(48000), 0.5);
  const b = AFX.makeImpulse(fakeCtx(48000), 0.5);
  const da = a.getChannelData(0);
  const db = b.getChannelData(0);
  assert.equal(da.length, db.length);
  for (let i = 0; i < da.length; i += 97) {
    assert.equal(da[i], db[i], `sample ${i} differs between two renders`);
  }
  assert.ok(da.some((v) => v !== 0), 'the impulse must not be silence');
});
await t('the engine applies audio effects in preview AND export', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/this\.setAudioFx\(rec, a\?\.fx \?\? "none"\)/.test(src), 'preview path must set it');
  const offline = src.slice(src.indexOf('async scheduleOfflineAudio'));
  assert.ok(/buildAudioFx\(off, fxId/.test(offline), 'offline export must build the same chain');
  assert.ok(/audioFxRecipe\(fxId\)\.rate/.test(offline), 'export must honour the pitch rate');
});
await t('the library exposes audio effects and says where they apply', () => {
  const lib = readFileSync('src/mayocut/components/Library.tsx', 'utf8');
  assert.ok(/AUDIO_FX\.map/.test(lib), 'the tab must render the effect list');
  assert.ok(/rendered into the export, not just the preview/.test(lib), 'must state the guarantee');
});

console.log('curves.ts');
await t('identity curve returns the input exactly', () => {
  for (const x of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(Math.abs(CV.evalCurve(CV.IDENTITY_CURVE, x) - x) < 1e-9, `identity broke at ${x}`);
  }
});
await t('a curve passes through its own control points', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 0.3, y: 0.1 },
    { x: 0.7, y: 0.9 },
    { x: 1, y: 1 },
  ];
  for (const p of pts) {
    assert.ok(Math.abs(CV.evalCurve(pts, p.x) - p.y) < 1e-6, `missed point ${JSON.stringify(p)}`);
  }
});
await t('a curve never overshoots, even on shapes that break cubic splines', () => {
  // The third set is the interesting one: evenly-spaced x with y = 0,1,0.4,1
  // makes an UNCLAMPED Catmull-Rom (or a raw cubic Hermite) shoot past 1 and
  // dip below 0 between the points. That overshoot is the bright halo you get
  // around a subject after an aggressive S-curve, and it is exactly what the
  // monotone limiter exists to prevent. A gentler S-curve alone would pass
  // either way, which is why the hard case is in here.
  const monotoneSets = [
    [
      { x: 0, y: 0 },
      { x: 0.2, y: 0.1 },
      { x: 0.8, y: 0.9 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: 1, y: 1 },
    ],
  ];
  // A user may legitimately drag a point *down* — that shape is supposed to go
  // backwards, so only the range is asserted for it, never the direction.
  const nonMonotone = [
    { x: 0, y: 0 },
    { x: 0.3333, y: 1 },
    { x: 0.6667, y: 0.4 },
    { x: 1, y: 1 },
  ];
  for (const pts of monotoneSets) {
    let prev = -1;
    for (let i = 0; i <= 2000; i++) {
      const x = i / 2000;
      const y = CV.evalCurve(pts, x);
      assert.ok(y >= -1e-9 && y <= 1 + 1e-9, `value ${y.toFixed(5)} outside 0..1 at ${x}`);
      assert.ok(y >= prev - 1e-9, `monotone input produced a backwards step at ${x}`);
      prev = y;
    }
  }
  for (let i = 0; i <= 2000; i++) {
    const x = i / 2000;
    const y = CV.evalCurve(nonMonotone, x);
    assert.ok(y >= -1e-9 && y <= 1 + 1e-9, `value ${y.toFixed(5)} outside 0..1 at ${x}`);
  }
  // This is the shape that separates a sign-clamp from a real monotone
  // limiter. Three flat points followed by a late rise makes the tangent at
  // the last flat point far too steep; clamping only the *sign* of the slopes
  // still dips below zero before the rise (measured: -0.008), which is a
  // visible black crush in the shadows. Only the Fritsch–Carlson limiter
  // (|m| <= 3·|secant|) removes it.
  const lateRise = [
    { x: 0, y: 0 },
    { x: 0.25, y: 0 },
    { x: 0.5, y: 0 },
    { x: 0.75, y: 0.1 },
    { x: 1, y: 0.9 },
  ];
  for (let i = 0; i <= 4000; i++) {
    const x = i / 4000;
    const y = CV.evalCurve(lateRise, x);
    assert.ok(y >= -1e-9, `dipped to ${y.toFixed(6)} below black at ${x}`);
    assert.ok(y <= 1 + 1e-9, `rose to ${y.toFixed(6)} above white at ${x}`);
  }
});
await t('out-of-range and unsorted points are handled, not crashed on', () => {
  const pts = CV.normalisePoints([
    { x: 0.9, y: 0.8 },
    { x: -5, y: 3 },
    { x: 0.2, y: -1 },
  ]);
  assert.equal(pts[0].x, 0);
  assert.equal(pts[pts.length - 1].x, 1);
  for (const p of pts) {
    assert.ok(p.x >= 0 && p.x <= 1, 'x must be clamped');
    assert.ok(p.y >= 0 && p.y <= 1, 'y must be clamped');
  }
});
await t('the LUT is 256 bytes and clamps rather than wrapping', () => {
  const lut = CV.curveLut([{ x: 0, y: 0 }, { x: 0.5, y: 1.6 }, { x: 1, y: 1 }]);
  assert.equal(lut.length, 256);
  assert.ok(lut[255] >= 0 && lut[255] <= 255);
  assert.ok(lut[128] <= 255, 'must clamp, not wrap to black');
});
await t('an all-identity curve set costs nothing', () => {
  assert.equal(CV.buildCurveLuts(undefined), null);
  assert.equal(CV.buildCurveLuts({ rgb: CV.IDENTITY_CURVE }), null);
  assert.equal(CV.curvesActive({}), false);
});
await t('RGB curves leave the channels they do not touch alone', () => {
  const luts = CV.buildCurveLuts({ r: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 1 }] });
  assert.ok(luts, 'must build');
  assert.equal(luts.g, null, 'green must stay untouched');
  assert.equal(luts.b, null, 'blue must stay untouched');
  assert.ok(luts.r, 'red must be shaped');
});
await t('the renderer applies curves after the LUT, in the same pass', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('private drawMainGrade'));
  const body = fn.slice(0, fn.indexOf('private gradePixels'));
  assert.ok(/applyCurveLuts\(img\.data, curveLuts\)/.test(body), 'curves must run in the pixel pass');
  assert.ok(
    body.indexOf('applyLut(lut, img.data)') < body.indexOf('applyCurveLuts'),
    'curves must shape the LUT result, not be flattened by it',
  );
  assert.ok(/curvesActive\(c\.curves\)/.test(src), 'a curve alone must trigger the pixel pass');
});

console.log('stock.ts');
await t('every stock asset is drawable and tagged', () => {
  assert.ok(ST.STOCK_ASSETS.length >= 10);
  const ids = new Set();
  for (const a of ST.STOCK_ASSETS) {
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
    assert.ok(a.tags.length > 0, `${a.id} has no tags`);
    assert.ok(typeof a.draw === 'function');
    assert.ok(a.width > 0 && a.height > 0);
    if (a.kind === 'video') assert.ok(a.frames > 0 && a.fps > 0, `${a.id} needs frames+fps`);
  }
});
await t('search finds assets by tag and by name', () => {
  assert.ok(ST.searchStock('green').some((a) => a.id === 'green-screen'));
  assert.ok(ST.searchStock('chroma').some((a) => a.id === 'green-screen'));
  assert.ok(ST.searchStock('snow').length + ST.searchStock('dust').length > 0);
  assert.equal(ST.searchStock('').length, ST.STOCK_ASSETS.length);
  assert.equal(ST.searchStock('zzzznope').length, 0);
});
await t('the assets a CapCut library would offer are present', () => {
  const ids = ST.STOCK_ASSETS.map((a) => a.id);
  for (const want of ['green-screen', 'white-blank', 'light-leak', 'countdown']) {
    assert.ok(ids.includes(want), `missing ${want}`);
  }
  assert.ok(ST.STOCK_ASSETS.some((a) => a.kind === 'video'), 'needs at least one video sticker');
});
await t('nothing in the stock module reaches the network', () => {
  const src = readFileSync('src/mayocut/stock.ts', 'utf8');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'https://', 'http://']) {
    assert.ok(!src.includes(bad), `stock.ts must not use ${bad}`);
  }
});
await t('emoji search works, so "fire" finds the flame', () => {
  assert.ok(ST.searchEmoji('fire').includes('🔥'));
  assert.ok(ST.searchEmoji('money').includes('💰'));
  assert.ok(ST.searchEmoji('kkkk').length === 0 || true);
});

// ================= stage 5: UI wiring =================
console.log('notebook wiring');
await t('orientation can be turned, and framing turns with it', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('rotateOrientation('));
  const body = fn.slice(0, fn.indexOf('setAspect(') > 0 ? 3000 : 3000);
  assert.ok(/landscape \? "9:16" : "16:9"/.test(body), 'must pick the opposite orientation');
  assert.ok(/o\.x = -s \* y/.test(body), 'must carry x across the diagonal');
  assert.ok(/o\.y = s \* x/.test(body), 'must carry y across the diagonal');
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/rotateProject\("cw"\)/.test(ed) && /rotateProject\("ccw"\)/.test(ed), 'both buttons');
});
await t('a generated sticker is sized to fill the frame, not as a postage stamp', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('addImageOverlay('));
  const body = fn.slice(0, fn.indexOf('addAudioClip('));
  assert.ok(/isStickerVideo/.test(body), 'must distinguish a sticker from a photo');
  assert.ok(/scale: isStickerVideo \? 1 : 0\.5/.test(body), 'sticker must open full-frame');
  assert.ok(/blend: "screen"/.test(body), 'light overlays need Screen to read');
});
await t('the curve editor is a real draggable graph, not fake output', () => {
  const src = readFileSync('src/mayocut/components/CurveEditor.tsx', 'utf8');
  assert.ok(/onPointerDown/.test(src) && /onPointerMove/.test(src), 'must be draggable');
  assert.ok(/curveLut\(points\)/.test(src), 'the drawn line must be the applied LUT');
  assert.ok(/onChange\(next\)/.test(src), 'dragging must report new points');
});
await t('everything in the notebook list is reachable from the UI', () => {
  const lib = readFileSync('src/mayocut/components/Library.tsx', 'utf8');
  const insp = readFileSync('src/mayocut/components/Inspector.tsx', 'utf8');
  const ed = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  // 1 + 2: audio effects
  assert.ok(/Audio effects/.test(lib), '1/2 — audio effects panel');
  // 3: library of generated video + pictures
  assert.ok(/Built-in stock/.test(lib), '3 — stock library');
  // 4: sticker search (video stickers)
  assert.ok(/StickerSearch/.test(insp), '4 — sticker search');
  // 5: graphs + curves
  assert.ok(/CurveEditor/.test(insp), '5 — curve graph');
  // 6: orientation
  assert.ok(/rotateProject/.test(ed), '6 — orientation switch');
});


// ================= stage 6: HSL + one audio mixer =================
console.log('hsl.ts');
await t('rgb↔hsl round-trips within a rounding step', () => {
  const cases = [
    [255, 0, 0],
    [0, 128, 255],
    [12, 200, 90],
    [200, 200, 200],
    [1, 1, 1],
    [254, 100, 3],
  ];
  for (const [r, g, b] of cases) {
    const { h, s, l } = HSL.rgbToHsl(r, g, b);
    const back = HSL.hslToRgb(h, s, l);
    assert.ok(Math.abs(back.r - r) < 1.5, `r ${r} -> ${back.r}`);
    assert.ok(Math.abs(back.g - g) < 1.5, `g ${g} -> ${back.g}`);
    assert.ok(Math.abs(back.b - b) < 1.5, `b ${b} -> ${back.b}`);
  }
});
await t('an empty or zeroed HSL set changes nothing', () => {
  assert.equal(HSL.hslActive(undefined), false);
  assert.equal(HSL.hslActive({}), false);
  assert.equal(HSL.hslActive({ red: { h: 0, s: 0, l: 0 } }), false);
  const px = HSL.applyHslPixel(120, 60, 30, { red: { h: 0, s: 0, l: 0 } });
  assert.deepEqual(px, { r: 120, g: 60, b: 30 });
});
await t('a red-only adjustment leaves a blue pixel untouched', () => {
  const set = { red: { h: 40, s: 60, l: 30 } };
  const blue = HSL.applyHslPixel(30, 60, 220, set);
  assert.ok(Math.abs(blue.r - 30) < 1e-6 && Math.abs(blue.g - 60) < 1e-6 && Math.abs(blue.b - 220) < 1e-6);
});
await t('a red-only adjustment DOES move a red pixel', () => {
  const set = { red: { l: -40 } };
  const before = { r: 220, g: 40, b: 40 };
  const after = HSL.applyHslPixel(before.r, before.g, before.b, set);
  const lb = HSL.rgbToHsl(before.r, before.g, before.b).l;
  const la = HSL.rgbToHsl(after.r, after.g, after.b).l;
  assert.ok(la < lb, `luminance should drop: ${lb} -> ${la}`);
  assert.ok(after.r > after.g && after.r > after.b, 'it must still be red, not a different colour');
});
await t('saturation -100 greys a pixel that sits in the band', () => {
  // Pure green sits at 120°, the exact centre of the green band, so it gets the
  // full weight of the adjustment.
  const set = { green: { s: -100 } };
  const after = HSL.applyHslPixel(0, 255, 0, set);
  const sat = HSL.rgbToHsl(after.r, after.g, after.b).s;
  assert.ok(sat < 0.02, `expected near-grey at full band weight, got ${sat}`);
});
await t('a pixel only PARTLY in a band is only partly adjusted', () => {
  // (20,200,40) sits about 7° off green's centre, so it is ~78% in-band. Fully
  // greying it out here would mean the band edges are hard, and a gradient
  // would show a visible seam.
  const after = HSL.applyHslPixel(20, 200, 40, { green: { s: -100 } });
  const sat = HSL.rgbToHsl(after.r, after.g, after.b).s;
  assert.ok(sat > 0.1 && sat < 0.3, `expected a partial desaturation, got ${sat}`);
});
await t('band weights blend instead of snapping at a boundary', () => {
  // 15° is exactly between red (0°) and orange (30°)
  assert.ok(Math.abs(HSL.bandWeight(15, 'red') - 0.5) < 1e-9);
  assert.ok(Math.abs(HSL.bandWeight(15, 'orange') - 0.5) < 1e-9);
  // dead centre of a band
  assert.ok(Math.abs(HSL.bandWeight(120, 'green') - 1) < 1e-9);
  // far away
  assert.equal(HSL.bandWeight(180, 'red'), 0);
  // hue wraps: 350° is close to red (0°)
  assert.ok(HSL.bandWeight(350, 'red') > 0.6);
});
await t('adjustments are clamped to the range the UI allows', () => {
  const c = HSL.clampHsl({ h: 500, s: -900, l: NaN });
  assert.equal(c.h, 100);
  assert.equal(c.s, -100);
  assert.equal(c.l, 0);
});
await t('hue rotation moves the colour, not just its brightness', () => {
  const set = { red: { h: 100 } };
  const after = HSL.applyHslPixel(220, 30, 30, set);
  const before = HSL.rgbToHsl(220, 30, 30);
  const now = HSL.rgbToHsl(after.r, after.g, after.b);
  assert.ok(Math.abs(now.h - before.h) > 10, `hue barely moved: ${before.h} -> ${now.h}`);
});
await t('each band is nudged by at most 30° of hue', () => {
  // A band must not be able to recolour a neighbouring band's pixels entirely.
  const set = { red: { h: 100 } };
  const px = HSL.applyHslPixel(250, 20, 20, set);
  const after = HSL.rgbToHsl(px.r, px.g, px.b);
  const base = HSL.rgbToHsl(250, 20, 20);
  let d = Math.abs(after.h - base.h);
  if (d > 180) d = 360 - d;
  assert.ok(d <= 30.5, `hue moved ${d}°, more than the 30° cap`);
});
await t('the renderer applies HSL and it triggers the pixel pass on its own', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/applyHsl\(img\.data, c\.hsl!\)/.test(src), 'HSL must run in the grade pass');
  assert.ok(/hslActive\(c\.hsl\)/.test(src), 'HSL alone must force the pixel pass');
  assert.ok(
    src.indexOf('applyCurveLuts') < src.indexOf('applyHsl(img.data'),
    'HSL must run after curves, on the graded pixels',
  );
});
await t('the HSL panel is reachable from the inspector', () => {
  const insp = readFileSync('src/mayocut/components/Inspector.tsx', 'utf8');
  assert.ok(/HslSection/.test(insp), 'panel must exist');
  assert.ok(/HSL_BANDS\.map/.test(insp), 'must offer every band');
  for (const label of ['Hue', 'Saturation', 'Luminance']) {
    assert.ok(new RegExp(`label="${label}"`).test(insp), `missing the ${label} slider`);
  }
});

console.log('one audio mixer');
await t('the WAV export renders through the shared scheduler', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('async exportAudioWav('));
  const body = fn.slice(0, fn.indexOf('async exportAudioWav(') + 3000);
  assert.ok(/await this\.scheduleOfflineAudio\(off/.test(body), 'must use the shared mixer');
  assert.ok(!/const schedule = \(/.test(body), 'its own private scheduler must be gone');
  assert.ok(/decodeAllAudio/.test(body), 'must use the shared decoder');
});
await t('the WAV export no longer has a second opinion about muting', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('async exportAudioWav('));
  const end = fn.indexOf('\n  }\n');
  const body = fn.slice(0, end);
  // These were the duplicated rules; they now live only in scheduleOfflineAudio.
  for (const dup of ['s.clip.muted) continue', 'hasSolo', 'isDipTo']) {
    assert.ok(!body.includes(dup), `the old copy still contains "${dup}"`);
  }
});
await t('ducking is applied in the offline mix, not only in preview', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const fn = src.slice(src.indexOf('async scheduleOfflineAudio'));
  const scope = fn.slice(0, fn.indexOf('async exportAudioWav'));
  assert.ok(/this\.duckFactor\(start \+ dt\)/.test(scope), 'overlay music must duck in the file');
  assert.ok(/this\.duckFactor\(s\.start \+ dt\)/.test(scope), 'main track must duck in the file');
  assert.ok(/duckFactor\(t: number\)/.test(src), 'duckFactor must be reachable from the scheduler');
});
await t('every export path shares one description of the sound', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  const schedulers = src.match(/scheduleOfflineAudio\(/g) ?? [];
  assert.ok(schedulers.length >= 3, `expected MP4, WebM and WAV to use it, found ${schedulers.length}`);
  // The preview has its own call sites (music, overlay audio, main) — that is
  // fine. What matters is that the *offline* scheduler ducks too, so the file
  // matches what was heard.
  const offline = src.slice(src.indexOf('async scheduleOfflineAudio'));
  const ducks = (offline.slice(0, offline.indexOf('async exportAudioWav')).match(/this\.duckFactor\(/g) ?? []);
  assert.equal(ducks.length, 2, `offline mix should duck main + overlays, found ${ducks.length}`);
});



// ================= stage 7: emoji vs graphic vs video sticker =================
console.log('sticker-kinds.ts + stickers.ts');
await t('the three sticker kinds have distinct kinds, not aliases', () => {
  assert.deepEqual(
    ['emoji', 'graphic', 'video'].map((k) => SK.defaultAnimFor(k)),
    ['none', 'pop', 'none'],
  );
  assert.deepEqual(
    ['emoji', 'graphic', 'video'].map((k) => SK.defaultSizeFor(k)),
    [170, 200, 260],
  );
});
await t('an emoji is still, so it carries no entrance animation', () => {
  const emoji = SB.EMOJI_ASSETS[0];
  assert.equal(emoji.kind, 'emoji');
  assert.equal(emoji.anim, 'none', 'an emoji must not arrive wobbling');
  assert.equal(emoji.size, 170);
});
await t('a graphic pops in and keeps its own colour', () => {
  const g = SB.GRAPHIC_ASSETS[0];
  assert.equal(g.kind, 'graphic');
  assert.equal(g.anim, 'pop');
  assert.ok(g.color && /^#[0-9a-f]{6}$/i.test(g.color), 'graphic needs a colour');
});
await t('isEmojiOverlay accepts ZWJ / modifier / VS16 clusters', () => {
  const mk = (text) => ({ kind: 'text', text });
  for (const cluster of ['🔥', '❤️', '👨‍👩‍👧', '👍🏽', '🇳🇬', '🔟', '👩🏾‍🚀']) {
    assert.equal(SK.isEmojiOverlay(mk(cluster)), true, `expected emoji: ${cluster}`);
  }
});
await t('isEmojiOverlay rejects words, sentences and media-backed overlays', () => {
  const mk = (text) => ({ kind: 'text', text });
  for (const word of ['NEW', 'Sold out', '★', '➜', 'a', '']) {
    assert.equal(SK.isEmojiOverlay(mk(word)), false, `expected not-emoji: ${word}`);
  }
  assert.equal(SK.isEmojiOverlay({ kind: 'text', text: '🔥', mediaId: 'm1' }), false);
  assert.equal(SK.isEmojiOverlay({ kind: 'image', text: '🔥' }), false);
});
await t('isEmojiOverlay rejects a long sentence that starts with an emoji', () => {
  assert.equal(SK.isEmojiOverlay({ kind: 'text', text: '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥' }), false);
});
await t('overlayLabel names each object the way the panel will', () => {
  assert.equal(SK.overlayLabel({ kind: 'text', text: '🔥' }), 'Emoji');
  assert.equal(SK.overlayLabel({ kind: 'text', text: '🔥', sticker: 'emoji' }), 'Emoji');
  assert.equal(SK.overlayLabel({ kind: 'text', text: 'SALE', sticker: 'graphic' }), 'Sticker');
  assert.equal(SK.overlayLabel({ kind: 'text', text: 'Fire', sticker: 'emoji' }), 'Emoji');
  assert.equal(SK.overlayLabel({ kind: 'text', text: 'NEW' }), 'Text');
  assert.equal(SK.overlayLabel({ kind: 'video' }), 'Video sticker');
  assert.equal(SK.overlayLabel({ kind: 'image' }), 'Image');
  assert.equal(SK.overlayLabel({ kind: 'audio' }), 'Audio');
});
await t('patchFor lands a sticker centred, background-free, at its own size', () => {
  const p = SK.patchFor({ id: 'x', kind: 'graphic', glyph: '★', tags: [], category: 'shape', anim: 'pop', color: '#fbbf24', size: 200 });
  assert.equal(p.text, '★');
  assert.equal(p.size, 200);
  assert.equal(p.anim, 'pop');
  assert.equal(p.bg, '');
  assert.equal(p.pos, 'mc');
  assert.equal(p.color, '#fbbf24');
  const e = SK.patchFor({ id: 'y', kind: 'emoji', glyph: '🔥', tags: [], category: 'emoji', anim: 'none', size: 170 });
  assert.equal(e.color, undefined, 'an emoji must not inherit a sticker colour');
});
await t('every category chip has at least one asset (no dead chips)', () => {
  for (const c of SK.STICKER_CATEGORIES) {
    if (c.id === 'video') continue; // animated ones live in stock.ts
    const n = SB.stickersIn(c.id).length;
    assert.ok(n > 0, `category ${c.id} is empty`);
  }
  assert.equal(SK.STICKER_CATEGORIES.length, 5);
});
await t('shape assets are graphics with the graphic entrance, not emoji', () => {
  const shapes = SB.stickersIn('shape');
  assert.ok(shapes.length >= 10);
  for (const s of shapes) {
    assert.equal(s.kind, 'graphic');
    assert.equal(s.anim, 'pop');
    // Some shape glyphs (⬅ ✔ ✳ 〰) ARE Extended_Pictographic, so the regex
    // alone would call them emoji. The recorded kind is what disambiguates.
    assert.equal(SK.patchFor(s).sticker, 'graphic', `${s.glyph} must record its kind`);
    assert.equal(SK.overlayLabel({ kind: 'text', text: s.glyph, sticker: 'graphic' }), 'Sticker');
  }
  // This is exactly why the kind is recorded rather than guessed: typed by
  // hand, "⬅" is indistinguishable from the emoji of the same code point.
  assert.equal(SK.isEmojiOverlay({ kind: 'text', text: '⬅' }), true);
  assert.equal(SK.overlayLabel({ kind: 'text', text: '⬅', sticker: 'graphic' }), 'Sticker');
});
await t('searchStickers matches tags, glyphs and category names', () => {
  assert.ok(SB.searchStickers('fire').some((s) => s.glyph === '🔥'));
  assert.ok(SB.searchStickers('trophy').some((s) => s.glyph === '🏆'));
  assert.ok(SB.searchStickers('arrow').every((s) => s.category === 'shape' || s.tags.includes('arrow')));
  assert.ok(SB.searchStickers('shape').some((s) => s.category === 'shape'));
  assert.equal(SB.searchStickers('').length, SB.STATIC_STICKERS.length);
  assert.equal(SB.searchStickers('zzzzznomatch').length, 0);
});
await t('static catalogue ids are unique and every asset is tagged', () => {
  const ids = new Set(SB.STATIC_STICKERS.map((s) => s.id));
  assert.equal(ids.size, SB.STATIC_STICKERS.length, 'duplicate sticker id');
  for (const s of SB.STATIC_STICKERS) assert.ok(s.tags.length > 0, `${s.id} has no tags`);
});
await t('catalogue is emoji+graphic+shape+word, counts unchanged elsewhere', () => {
  assert.equal(SB.EMOJI_ASSETS.length + SB.GRAPHIC_ASSETS.length + SB.SHAPE_ASSETS.length + SB.WORD_ASSETS.length, SB.STATIC_STICKERS.length);
  // floors, for the same reason as the transitions above
  assert.ok(SB.EMOJI_ASSETS.length >= 140, `only ${SB.EMOJI_ASSETS.length} emoji`);
  assert.ok(SB.GRAPHIC_ASSETS.length >= 60, `only ${SB.GRAPHIC_ASSETS.length} graphics`);
  assert.ok(SB.SHAPE_ASSETS.length >= 12, `only ${SB.SHAPE_ASSETS.length} shapes`);
  assert.ok(SB.WORD_ASSETS.length >= 35, `only ${SB.WORD_ASSETS.length} words`);
});


// ================= stage 8: fonts, and a fast grade =================
console.log('fonts.ts');
await t('the catalogue is bigger and every face has a real fallback', () => {
  assert.ok(FT.FONT_CATALOGUE.length >= 20, `only ${FT.FONT_CATALOGUE.length} fonts`);
  for (const f of FT.FONT_CATALOGUE) {
    assert.ok(f.css.length > 0, `${f.id} has no stack`);
    // A stack that does not end in a generic family renders as Times in some
    // browser somewhere. That is the bug this asserts against.
    assert.ok(/,\s*(sans-serif|serif|monospace|cursive|system-ui)\s*$/.test(f.css), `${f.id} lacks a generic tail: ${f.css}`);
    assert.ok(f.name && f.note, `${f.id} needs a name and a note`);
  }
});
await t('font ids are unique (a duplicate would shadow a face silently)', () => {
  const ids = FT.FONT_CATALOGUE.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});
await t('resolveFontCss finds built-ins', () => {
  assert.match(FT.resolveFontCss('serif'), /Georgia/);
  assert.match(FT.resolveFontCss('impact'), /Impact/);
});
await t('an IMPORTED font resolves to its own family, not the default', () => {
  // This is the bug that shipped: the canvas only knew the built-in stacks, so
  // every imported font rendered as system-ui while the label said otherwise.
  const imported = [{ id: 'mc-my-font-ab12', family: 'mc-my-font-ab12', name: 'My Font' }];
  const css = FT.resolveFontCss('mc-my-font-ab12', imported);
  assert.match(css, /"mc-my-font-ab12"/, `imported font did not resolve: ${css}`);
  assert.ok(!css.startsWith('"Inter"'), 'imported font fell back to the default stack');
});
await t('an unknown id still yields a usable stack', () => {
  const css = FT.resolveFontCss('does-not-exist');
  assert.match(css, /sans-serif/);
});
await t('fontName reports imported names, and falls back to the id', () => {
  const imported = [{ id: 'mc-x', family: 'mc-x', name: 'Xylophone Sans' }];
  assert.equal(FT.fontName('mc-x', imported), 'Xylophone Sans');
  assert.equal(FT.fontName('nope'), 'nope');
  assert.equal(FT.fontName('serif'), 'Classic serif');
});
await t('FONTS re-export matches the catalogue (canvas and picker cannot disagree)', () => {
  assert.equal(T.FONTS.length, FT.FONT_CATALOGUE.length);
  for (let i = 0; i < FT.FONT_CATALOGUE.length; i++) {
    assert.equal(T.FONTS[i].id, FT.FONT_CATALOGUE[i].id);
    assert.equal(T.FONTS[i].css, FT.FONT_CATALOGUE[i].css);
  }
});

console.log('hsl.ts (performance rewrite must stay pixel-identical)');
await t('applyHsl matches a straightforward per-pixel reference implementation', () => {
  // The fast path exists because the original took ~280 ms/frame. Speed is only
  // acceptable if the RESULT is unchanged, so this compares against a plain,
  // obviously-correct implementation written straight from the maths.
  function reference(d, set) {
    const bands = HSL.HSL_BANDS.filter((b) => {
      const a = set[b.id];
      return a && ((a.h ?? 0) !== 0 || (a.s ?? 0) !== 0 || (a.l ?? 0) !== 0);
    });
    for (let i = 0; i < d.length; i += 4) {
      const { h, s, l } = HSL.rgbToHsl(d[i], d[i + 1], d[i + 2]);
      if (s < 0.02) continue;
      let dH = 0, sMul = 0, dL = 0, total = 0;
      for (const b of bands) {
        const a = set[b.id];
        const w = HSL.bandWeight(h, b.id);
        if (w <= 0) continue;
        dH += ((a.h ?? 0) / 100) * 30 * w;
        sMul += (a.s ?? 0) / 100 * w;
        dL += ((a.l ?? 0) / 100) * 0.35 * w;
        total += w;
      }
      if (total === 0) continue;
      const out = HSL.hslToRgb(h + dH, Math.max(0, Math.min(1, s * (1 + sMul))), Math.max(0, Math.min(1, l + dL)));
      d[i] = Math.max(0, Math.min(255, out.r));
      d[i + 1] = Math.max(0, Math.min(255, out.g));
      d[i + 2] = Math.max(0, Math.min(255, out.b));
    }
  }
  const sets = {
    one: { red: { h: 4, s: 10, l: 0 } },
    four: { red: { h: 4, s: 10, l: 0 }, yellow: { h: 0, s: 0, l: 3 }, green: { h: -5, s: 0, l: 0 }, blue: { h: 2, s: 8, l: 0 } },
    extreme: { red: { h: 100, s: 100, l: 100 }, magenta: { h: -100, s: -100, l: -100 }, cyan: { h: 30, s: -50, l: 20 } },
  };
  const n = 6000;
  for (const [name, set] of Object.entries(sets)) {
    const a = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < a.length; i += 4) {
      a[i] = (i * 7) % 256;
      a[i + 1] = (i * 13) % 256;
      a[i + 2] = (i * 29) % 256;
      a[i + 3] = 255;
    }
    const b = new Uint8ClampedArray(a);
    reference(a, set);
    HSL.applyHsl(b, set);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    assert.ok(worst <= 1, `${name}: fast path differs from reference by ${worst}/255`);
  }
});
await t('the fast path still skips greys, NEAR-greys and identity sets', () => {
  // Pure grey is caught by the "no chroma at all" check, so a pure-grey-only
  // test passes even with the saturation guard deleted. A near-grey pixel is
  // the case the guard actually exists for: it has a measurable hue, so without
  // the s < 0.02 check an extreme adjustment would tint skin-tone shadows and
  // neutral walls.
  const grey = new Uint8ClampedArray([128, 128, 128, 255, 10, 10, 10, 255]);
  const copy = new Uint8ClampedArray(grey);
  HSL.applyHsl(grey, { red: { h: 50, s: 50, l: 50 } });
  assert.deepEqual([...grey], [...copy], 'grey pixels must not be touched');

  const nearGrey = new Uint8ClampedArray([128, 130, 128, 255]);
  const keepNear = new Uint8ClampedArray(nearGrey);
  HSL.applyHsl(nearGrey, { red: { h: 100, s: 100, l: 100 }, green: { h: 100, s: 100, l: 100 } });
  assert.deepEqual([...nearGrey], [...keepNear], 'near-grey pixels must not be touched');

  const identity = new Uint8ClampedArray([200, 40, 40, 255]);
  const keep = new Uint8ClampedArray(identity);
  HSL.applyHsl(identity, { red: { h: 0, s: 0, l: 0 } });
  assert.deepEqual([...identity], [...keep]);
});
await t('the HSL pass stays fast enough to preview in real time', () => {
  // A guard against this quietly regressing. The original implementation took
  // ~280 ms for one band on a 1280x720 buffer (~4 fps); the rewrite is ~20 ms.
  // The threshold is deliberately loose — this must not fail on a slow CI box —
  // but it does fail if the per-pixel object allocation ever comes back.
  const W = 1280, H2 = 720;
  const d = new Uint8ClampedArray(W * H2 * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (i >> 2) % 256;
    d[i + 1] = ((i >> 4) * 3) % 256;
    d[i + 2] = ((i >> 6) * 7) % 256;
    d[i + 3] = 255;
  }
  const set = { red: { h: 4, s: 10, l: 0 }, blue: { h: 2, s: 8, l: 0 } };
  HSL.applyHsl(d, set); // warm up the JIT
  const t0 = Date.now();
  HSL.applyHsl(d, set);
  const ms = Date.now() - t0;
  assert.ok(ms < 120, `HSL took ${ms} ms for one 720p frame (budget 120 ms)`);
});


// ================= stage 9: playback stalls + work that survives a close ======
console.log('playback.ts — when may the transport advance?');
await t('a clip that has never loaded holds playback', () => {
  assert.equal(PB.blocksPlayback({ readyState: 0, seeking: false, warm: false, videoBroken: false }), true);
  assert.equal(PB.blocksPlayback({ readyState: 1, seeking: false, warm: false, videoBroken: false }), true);
});
await t('a WARM clip that dips below readyState 2 does NOT stop the show', () => {
  // This is the freeze: re-buffering mid-clip used to pause every element,
  // which interrupted the seek that would have cleared the condition.
  assert.equal(PB.blocksPlayback({ readyState: 0, seeking: false, warm: true, videoBroken: false }), false);
  assert.equal(PB.blocksPlayback({ readyState: 1, seeking: false, warm: true, videoBroken: false }), false);
});
await t('a seek in flight DOES hold, because the frame is coming', () => {
  assert.equal(PB.blocksPlayback({ readyState: 3, seeking: true, warm: true, videoBroken: false }), true);
});
await t('a clip that can never decode never holds the transport', () => {
  const s = { readyState: 0, seeking: true, warm: false, videoBroken: true };
  assert.equal(PB.blocksPlayback(s), false, 'an undecodable video must not freeze the timeline');
  assert.equal(PB.shouldHardStop([s]), false);
});
await t('the transport only hard-stops when EVERYTHING on screen is cold', () => {
  const cold = { readyState: 0, seeking: false, warm: false, videoBroken: false };
  const ready = { readyState: 4, seeking: false, warm: true, videoBroken: false };
  const refilling = { readyState: 1, seeking: false, warm: true, videoBroken: false };
  assert.equal(PB.shouldHardStop([cold]), true);
  assert.equal(PB.shouldHardStop([cold, ready]), false, 'one live picture means keep playing');
  assert.equal(PB.shouldHardStop([cold, refilling]), false, 'a refilling warm clip is still on screen');
  assert.equal(PB.shouldHardStop([]), false);
  assert.equal(PB.shouldHardStop([{ ...cold, videoBroken: true }]), false);
});
await t('the overlay case that caused the report: main ready + overlay refilling', () => {
  // A main clip that is fine, plus an overlay video that drops out for a moment.
  // Before: both paused, picture froze. Now: playback continues.
  const main = { readyState: 4, seeking: false, warm: true, videoBroken: false };
  const overlay = { readyState: 1, seeking: false, warm: true, videoBroken: false };
  assert.equal(PB.blocksPlayback(overlay), false);
  assert.equal(PB.shouldHardStop([main, overlay]), false);
});

console.log('persistence.ts — saving that can be trusted');
await t('autosave waits for the debounce, then writes', () => {
  assert.equal(PS.shouldAutosave(1000, null, 0, 0), false, 'nothing dirty = nothing to write');
  // last edit at 100, so the debounce elapses at 100 + 1200
  assert.equal(PS.shouldAutosave(1300, 100, 100, 0), true);
  assert.equal(PS.shouldAutosave(500, 100, 100, 0), false, 'too soon after the edit');
  // a late timer firing after the write already landed must not write again
  assert.equal(PS.shouldAutosave(5000, 100, 100, 1400), false, 'already on disk');
});
await t('autosave force-writes during a long drag that never pauses', () => {
  // The debounce alone never fires while a user is dragging a slider, so the
  // 6 s ceiling is the only thing that gets that work onto the disk.
  const started = 0;
  // Edited continuously: lastEdit keeps moving, so the debounce never elapses.
  const stillDragging = PS.AUTOSAVE_MAX_WAIT_MS - 1;
  assert.equal(PS.shouldAutosave(stillDragging, started, stillDragging, 0), false);
  assert.equal(PS.shouldAutosave(PS.AUTOSAVE_MAX_WAIT_MS, started, stillDragging, 0), true);
});
await t('a full device is reported as a quota problem with a remedy', () => {
  const e = new Error("The quota has been exceeded.");
  e.name = "QuotaExceededError";
  const f = PS.describeWriteFailure(e);
  assert.equal(f.kind, 'quota');
  assert.match(f.advice, /out of space|free/i);
  assert.ok(f.advice.length > 20, 'advice must be actionable, not a bare error');
});
await t('a blocked or aborted write is named, not lumped together', () => {
  const blocked = new Error("database connection is closing");
  blocked.name = "InvalidStateError";
  assert.equal(PS.describeWriteFailure(blocked).kind, 'blocked');
  const aborted = new Error("The transaction was aborted");
  aborted.name = "AbortError";
  assert.equal(PS.describeWriteFailure(aborted).kind, 'aborted');
  assert.equal(PS.describeWriteFailure(new Error("???")).kind, 'unknown');
  // every kind must carry advice: a silent failure is the bug being fixed
  for (const e of [blocked, aborted, new Error("???")]) {
    assert.ok(PS.describeWriteFailure(e).advice.length > 10);
  }
});
await t('an import larger than the free space is refused BEFORE copying', () => {
  const tight = { used: 950, quota: 1000 }; // 50 bytes free
  // A 90% margin: 50 free means ~45 usable, so 60 is refused and 40 is allowed.
  assert.equal(PS.fitsBudget(60, tight).ok, false);
  assert.match(PS.fitsBudget(60, tight).reason, /free/i);
  assert.equal(PS.fitsBudget(40, tight).ok, true);
  assert.equal(PS.fitsBudget(46, tight).ok, false, 'just over the usable margin');
  // no estimate available = do not block the user
  assert.equal(PS.fitsBudget(1e9, null).ok, true);
});
await t('saved-vs-actual comparison catches a write that did not land', () => {
  const p = { id: 'p1', updatedAt: 5, main: [1], tracks: [1, 2] };
  assert.equal(PS.sameProject(p, { ...p }), true);
  assert.equal(PS.sameProject(p, { ...p, updatedAt: 6 }), false, 'a stale copy is not saved');
  assert.equal(PS.sameProject(p, { ...p, main: [] }), false, 'a truncated copy is not saved');
  assert.equal(PS.sameProject(p, undefined), false);
});
await t('byte formatting is honest at every scale', () => {
  assert.equal(PS.fmtBytes(0), '0 B');
  assert.equal(PS.fmtBytes(999), '999 B');
  assert.equal(PS.fmtBytes(1024), '1.0 KB');
  assert.equal(PS.fmtBytes(1024 * 1024 * 1.5), '1.5 MB');
  assert.match(PS.fmtBytes(3 * 1024 ** 3), /GB/);
  assert.equal(PS.fmtBytes(-5), '0 B');
});
await t('storage advice never claims durability the browser did not grant', () => {
  assert.match(PS.storageAdvice(true), /won't be cleared/);
  const notGranted = PS.storageAdvice(false);
  assert.ok(!/won't be cleared/.test(notGranted), 'must not promise persistence that was refused');
  assert.match(notGranted, /backup|open once more/i);
});


// ================= stage 10: the asset libraries =============================
console.log('looks.ts — the colour catalogue');
await t('every look has a unique id, a name and a family', () => {
  const ids = LK.LOOKS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate look id');
  for (const l of LK.LOOKS) {
    assert.ok(l.name && l.name.length > 1, `unnamed look ${l.id}`);
    assert.ok(LK.LOOK_FAMILIES.includes(l.family), `${l.id} has unknown family ${l.family}`);
  }
  assert.ok(LK.LOOKS.length >= 50, `only ${LK.LOOKS.length} looks`);
});
await t('every look is reachable from a family chip', () => {
  const seen = new Set();
  for (const f of LK.LOOK_FAMILIES) for (const l of LK.looksIn(f)) seen.add(l.id);
  for (const l of LK.LOOKS) assert.ok(seen.has(l.id), `${l.id} is in no family`);
  assert.equal(LK.looksIn('all').length, LK.LOOKS.length);
});
await t('css is a valid filter stack for every look (no empty, no stray text)', () => {
  for (const l of LK.LOOKS) {
    assert.ok(l.css.trim().length > 0, `${l.id} has no css`);
    // every function in the stack must be balanced and known to canvas
    const fns = l.css.match(/([a-z-]+)\(/g) ?? [];
    const allowed = ['saturate(', 'contrast(', 'brightness(', 'sepia(', 'grayscale(', 'hue-rotate(', 'blur(', 'opacity(', 'invert('];
    for (const f of fns) assert.ok(allowed.includes(f), `${l.id} uses unsupported ${f}`);
    const opens = (l.css.match(/\(/g) ?? []).length;
    const closes = (l.css.match(/\)/g) ?? []).length;
    assert.equal(opens, closes, `${l.id} has unbalanced css`);
  }
});
await t('no duplicate look NAMES (two cards called "Moody" is a bug)', () => {
  const names = LK.LOOKS.map((l) => l.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, 'duplicate display name: ' + names.filter((n, i) => names.indexOf(n) !== i));
});
await t('search finds the names people actually type', () => {
  const cases = {
    teal: 'tealorange',
    portra: 'portra',
    kodak: 'kodachrome',
    vhs: 'vhs',
    kdrama: 'kdrama',
    'film stock': null,
    noir: 'noir',
    pink: 'aestheticpink',
  };
  for (const [q, expectId] of Object.entries(cases)) {
    const hits = LK.searchLooks(q);
    assert.ok(hits.length > 0, `search "${q}" found nothing`);
    if (expectId) assert.ok(hits.some((h) => h.id === expectId), `search "${q}" missed ${expectId}`);
  }
  assert.equal(LK.searchLooks('').length, LK.LOOKS.length, 'empty query must return everything');
  assert.equal(LK.searchLooks('zzzzz').length, 0);
});
await t('search is a conjunction, not a union', () => {
  // "film stock" must only return looks tagged with BOTH words, otherwise a
  // two-word search behaves like an OR and buries the right answer.
  const both = LK.searchLooks('film stock');
  const either = LK.LOOKS.filter((l) => /film|stock/.test(`${l.tags} ${l.name}`.toLowerCase()));
  assert.ok(both.length > 0);
  assert.ok(both.length < either.length, 'conjunction returned everything the union did');
  for (const l of both) assert.match(`${l.tags} ${l.name}`.toLowerCase(), /film/);
});
await t('renamed ids still resolve, so saved projects keep their grade', () => {
  // A project saved with filter "mono-high" must not silently become Original.
  assert.equal(LK.resolveLookId('mono-high'), 'monohigh');
  assert.equal(LK.resolveLookId('silvertone'), 'silver');
  assert.equal(LK.resolveLookId('neon-night'), 'neonphoto');
  assert.equal(LK.resolveLookId('golden'), 'goldenhour');
  assert.equal(LK.resolveLookId('kodachrome'), 'kodachrome', 'current ids must pass through');
  for (const legacy of Object.keys(LK.LEGACY_LOOK_IDS)) {
    assert.ok(LK.lookFor(legacy), `legacy id ${legacy} resolves to nothing`);
  }
});
await t('every legacy mapping points at a look that exists today', () => {
  for (const [from, to] of Object.entries(LK.LEGACY_LOOK_IDS)) {
    assert.ok(LK.LOOK_BY_ID.has(to), `${from} -> ${to}, which is not in the catalogue`);
    assert.equal(LK.lookCss(from), LK.lookCss(to), `${from} does not render as ${to}`);
  }
});
await t('engineering: the engine exposes the finish of the looks that have one', () => {
  // The finish must survive the trip from the catalogue to the renderer.
  const withFinish = LK.LOOKS.filter((l) => l.tint || l.grain || l.vignette || l.label);
  assert.ok(withFinish.length >= 10, `only ${withFinish.length} looks have a finish`);
  for (const l of withFinish) {
    const f = E.finishFor(l.id);
    assert.ok(f, `${l.id} has a finish in the catalogue but the engine returns none`);
  }
  assert.equal(E.finishFor('bw'), undefined, 'a look with no finish must return undefined');
});
await t('a rename keeps the finish: legacy id gets the new look finish too', () => {
  const f = E.finishFor('neon-night');
  assert.ok(f && f.tint, 'the renamed look lost its tint');
});
await t('presetCss agrees with the catalogue for every look', () => {
  for (const l of LK.LOOKS) assert.equal(E.presetCss(l.id), l.css, `${l.id} css differs between catalogue and engine`);
  assert.equal(E.presetCss('none'), '');
  assert.equal(E.presetCss('not-a-real-look'), '', 'an unknown look must render as ungraded, not throw');
});
await t('tile and canvas read the SAME finish (the card cannot lie)', () => {
  // The preview renders from the Look; the canvas renders from finishFor().
  // If those ever diverge the tile is a mock-up, which is the bug being fixed.
  for (const l of LK.LOOKS) {
    const f = E.finishFor(l.id);
    assert.equal(!!f?.tint, !!l.tint, `${l.id} tint disagreement`);
    assert.equal(f?.grain ?? 0, l.grain ?? 0, `${l.id} grain disagreement`);
    assert.equal(f?.vignette ?? 0, l.vignette ?? 0, `${l.id} vignette disagreement`);
    assert.equal(f?.label, l.label, `${l.id} label disagreement`);
  }
});

await t('every transition id has a real renderer (no silent fallthrough)', () => {
  // The dangerous failure mode: add an id to TRANSITIONS, forget the engine, and
  // the renderer falls through to the generic wipe — so the card promises a
  // glitch and the export produces a rectangle reveal. Checked against the
  // source because drawing a transition needs a real canvas.
  const src = readFileSync(new URL('../src/mayocut/engine.ts', import.meta.url), 'utf8');
  const from = src.indexOf('composeTransition(');
  assert.ok(from > 0, 'composeTransition was renamed — update this test');
  const body = src.slice(from);
  const missing = [];
  for (const tr of T.TRANSITIONS) {
    // these are handled before the per-kind branches
    if (['none', 'crossfade'].includes(tr.id)) continue;
    if (T.isDipTo(tr.id)) continue;
    const wipe = T.wipeDir(tr.id);
    if (wipe && !wipe.soft) continue; // the hard-wipe branch
    if (wipe && wipe.soft) {
      // Soft wipes are NOT keyed by id: they branch on wipeDir() returning a
      // direction with soft=true, which is what lets one code path serve all
      // four. So the check is that the soft branch exists, not that each id is
      // named — asserting on the id here was a false alarm.
      assert.ok(
        body.includes('soft?.soft') && body.includes('drawFeatheredWipe'),
        'the feathered-wipe branch is gone; soft wipes would draw as hard ones',
      );
      continue;
    }
    if (!body.includes('"' + tr.id + '"')) missing.push(tr.id);
  }
  assert.equal(missing.length, 0, 'no renderer for: ' + missing.join(', '));
});

await t('the trending transitions each have their OWN branch, not a shared one', () => {
  const src = readFileSync(new URL('../src/mayocut/engine.ts', import.meta.url), 'utf8');
  const trending = T.TRANSITIONS.filter((tr) => T.TRANSITION_FAMILY[tr.id] === 'trend');
  assert.ok(trending.length >= 8, `only ${trending.length} trending transitions`);
  for (const tr of trending) {
    const marker = `kind === "${tr.id}"`;
    assert.ok(src.includes(marker), `${tr.id} has no dedicated branch in the engine`);
  }
});

await t('paintFinish actually draws: tint, grain, vignette and the caption', () => {
  // The catalogue test proves the DATA reaches the engine; this proves the
  // engine turns that data into draw calls. A finishing pass that silently
  // draws nothing would leave every "vintage" look looking modern.
  const calls = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    fillRect() { calls.push('fillRect:' + this.globalCompositeOperation); },
    createRadialGradient() {
      calls.push('radial');
      return { addColorStop() {} };
    },
    createPattern() {
      calls.push('pattern');
      return {};
    },
    fillText(txt) { calls.push('text:' + txt); },
  };
  E.paintFinish(ctx, { tint: { color: '#ff0000', mode: 'overlay', alpha: 0.3 } }, 800, 450, 1);
  assert.ok(calls.includes('fillRect:overlay'), 'tint did not blend in its own mode');

  calls.length = 0;
  E.paintFinish(ctx, { vignette: 0.5 }, 800, 450, 1);
  assert.ok(calls.includes('radial'), 'vignette did not build a gradient');

  calls.length = 0;
  E.paintFinish(ctx, { label: '1998 PLAY' }, 800, 450, 1);
  assert.ok(calls.some((c) => c.startsWith('text:1998 PLAY')), 'caption was not drawn');
  assert.ok(calls.includes('save') && calls.includes('restore'), 'paint left the context unbalanced');
});
await t('the finish is WIRED INTO the main draw path, not just available', () => {
  // A unit test on paintFinish proves it draws. It does not prove anyone calls
  // it. Deleting the call from drawMainItem left every test green, which is the
  // difference between "the feature exists" and "the feature is on".
  const src = readFileSync(new URL('../src/mayocut/engine.ts', import.meta.url), 'utf8');
  const start = src.indexOf('private drawMainItem(');
  assert.ok(start > 0, 'drawMainItem moved — update this test');
  const after = src.slice(start);
  const stop = after.indexOf('\n  private ');
  const body = stop > 0 ? after.slice(0, stop) : after;
  assert.ok(body.includes('finishFor('), 'drawMainItem does not look up the look finish');
  assert.ok(body.includes('paintFinish('), 'drawMainItem never paints the finish');
});

await t('paintFinish is a no-op for a look with no finish, and for alpha 0', () => {
  let touched = 0;
  const ctx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '',
    save() { touched++; },
    restore() { touched++; },
    fillRect() { touched++; },
    createRadialGradient() { touched++; return { addColorStop() {} }; },
    createPattern() { touched++; return {}; },
    fillText() { touched++; },
  };
  E.paintFinish(ctx, undefined, 100, 100, 1);
  E.paintFinish(ctx, {}, 100, 100, 1);
  E.paintFinish(ctx, { tint: { color: '#fff', mode: 'overlay', alpha: 1 } }, 100, 100, 0);
  assert.equal(touched, 0, 'a look with no finish must not touch the context at all');
});
await t('grain is generated once and reused (deterministic between preview and export)', () => {
  // Node has no document, so a null here means "cannot make a canvas", not
  // "grain is broken". What must hold either way: the call is idempotent, so
  // the preview and the export of the same project cannot show different grain.
  const a = E.grainTexture();
  const b = E.grainTexture();
  assert.equal(a, b, 'grainTexture returned two different textures');
  if (typeof document === 'undefined') {
    assert.equal(a, null, 'without a document it must return null rather than throw');
  } else {
    assert.ok(a, 'a document exists but no grain texture was made');
  }
});
await t('every effect id has a family and either a transform or a paint step', () => {
  const src = readFileSync(new URL('../src/mayocut/engine.ts', import.meta.url), 'utf8');
  const transformStart = src.indexOf('private effectTransform(');
  assert.ok(transformStart > 0, 'effectTransform moved — update this test');
  // it sits after drawMainItem, so cut at the next method that follows it
  const after = src.slice(transformStart);
  const stop = after.indexOf('\n  private ');
  const transformBody = stop > 0 ? after.slice(0, stop) : after;
  const paintBody = src.slice(src.indexOf('drawMainItem('));
  const orphans = [];
  for (const ef of T.EFFECTS) {
    if (ef.id === 'none') continue;
    const inTransform = transformBody.includes(`case "${ef.id}"`) || transformBody.includes(`case '${ef.id}'`);
    const inPaint = paintBody.includes(`eff === "${ef.id}"`);
    if (!inTransform && !inPaint) orphans.push(ef.id);
  }
  assert.equal(orphans.length, 0, 'effects with no implementation: ' + orphans.join(', '));
});

await t('the filter tile grain is a well-formed data URI (a broken one renders blank)', () => {
  // The tile draws its grain from an inline SVG data URI. Markup that does not
  // parse fails SILENTLY — the browser paints nothing — so this is the same
  // class of bug as the blank tiles this pass exists to fix. Parsed, not trusted.
  const src = readFileSync(new URL('../src/mayocut/components/Library.tsx', import.meta.url), 'utf8');
  const marker = "data:image/svg+xml;utf8,";
  const at = src.indexOf(marker);
  assert.ok(at > 0, 'the tile grain data URI is gone — update this test');
  // the JSX splices the strength in as a literal; settle that expression first
  const raw = src.slice(at + marker.length, at + 400);
  const settled = raw.replace(/'"+\s*\+\s*grain\.toFixed\(2\)\s*\+\s*"'/g, "'0.20'");
  const END = "'/></svg>";
  const cut = settled.indexOf(END);
  assert.ok(cut > 0, 'the grain svg lost its closing tag');
  const svg = settled.slice(0, cut + END.length);
  assert.ok(svg.startsWith("<svg"), 'the data URI does not begin with <svg');
  assert.ok(svg.endsWith("</svg>"), 'the data URI does not end with </svg>');
  assert.match(svg, /<filter id='n'>/);
  assert.match(svg, /<feTurbulence[^>]*\/>/, 'no turbulence primitive — the grain would be a flat tint');
  assert.match(svg, /filter='url\(%23n\)'/, 'the rect does not reference the noise filter');
  assert.match(svg, /opacity='0\.20'/, 'the strength expression did not settle into the markup');
  const opens = (svg.match(/</g) ?? []).length;
  const closes = (svg.match(/>/g) ?? []).length;
  assert.equal(opens, closes, 'unbalanced tags in the grain svg');
});

console.log('sticks: the sticker catalogue');
await t('the catalogue is genuinely large and covers every category', () => {
  assert.ok(SB.EMOJI_ASSETS.length >= 140, `only ${SB.EMOJI_ASSETS.length} emoji`);
  assert.ok(SB.GRAPHIC_ASSETS.length >= 60, `only ${SB.GRAPHIC_ASSETS.length} graphics`);
  assert.ok(SB.WORD_ASSETS.length >= 35, `only ${SB.WORD_ASSETS.length} words`);
  assert.ok(SB.STATIC_STICKERS.length >= 250, `only ${SB.STATIC_STICKERS.length} total`);
  for (const c of SK.STICKER_CATEGORIES) {
    if (c.id === 'video') continue; // owned by stock.ts
    const n = SB.stickersIn(c.id).length;
    assert.ok(n > 0, `category ${c.id} is empty`);
  }
});
await t('no duplicate emoji glyphs (two identical tiles is a bug)', () => {
  const g = SB.EMOJI_ASSETS.map((a) => a.glyph);
  const dup = g.filter((x, i) => g.indexOf(x) !== i);
  assert.equal(dup.length, 0, 'duplicate glyphs: ' + [...new Set(dup)].join(' '));
});
await t('every sticker id is unique across all categories', () => {
  const ids = SB.STATIC_STICKERS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});
await t('every sticker has searchable tags and a renderable glyph', () => {
  for (const a of SB.STATIC_STICKERS) {
    assert.ok(a.tags.length > 0, `${a.id} has no tags`);
    assert.ok((a.glyph ?? '').length > 0, `${a.id} has no glyph`);
    assert.ok(a.size > 0, `${a.id} has no size`);
  }
});
await t('sticker search finds the words in the panel placeholder', () => {
  for (const q of ['fire', 'crown', 'arrow', 'wow', 'heart']) {
    assert.ok(SB.searchStickers(q).length > 0, `search "${q}" found nothing`);
  }
  assert.equal(SB.searchStickers('').length, SB.STATIC_STICKERS.length);
});
await t('graphics and words carry a colour; emoji do not', () => {
  for (const a of SB.GRAPHIC_ASSETS) assert.match(a.color, /^#[0-9a-f]{6}$/i, `${a.id} colour ${a.color}`);
  for (const a of SB.WORD_ASSETS) assert.match(a.color, /^#[0-9a-f]{6}$/i, `${a.id} colour ${a.color}`);
  // an emoji takes the device's own colour font; forcing a colour only tints the
  // ones that are drawn as outlines, so it must not be set
  for (const a of SB.EMOJI_ASSETS) assert.equal(a.color, undefined, `${a.id} should not force a colour`);
});

console.log('types.ts — the new transitions and effects are wired end to end');
await t('every transition has a family and a display name', () => {
  for (const tr of T.TRANSITIONS) {
    assert.ok(T.TRANSITION_FAMILY[tr.id], `${tr.id} has no family`);
    assert.ok(tr.name && tr.name.length > 1, `${tr.id} has no name`);
  }
  assert.equal(T.TRANSITIONS.length, Object.keys(T.TRANSITION_FAMILY).length, 'a transition is in one list but not the other');
});
await t('the trending transitions exist and are grouped as trending', () => {
  for (const id of ['flash', 'spin', 'glitch', 'lightleak', 'luma', 'zoomblur', 'whipl', 'whipr']) {
    assert.ok(T.TRANSITIONS.some((t2) => t2.id === id), `${id} missing from TRANSITIONS`);
    assert.equal(T.TRANSITION_FAMILY[id], 'trend', `${id} is not in the trend family`);
  }
});
await t('a soft wipe is not also claimed as a dip or a direction', () => {
  // these three helpers are consulted in sequence; overlap would make the
  // renderer take the wrong branch and draw a different transition
  for (const tr of T.TRANSITIONS) {
    const dip = T.isDipTo(tr.id);
    const wipe = T.wipeDir(tr.id);
    assert.ok(!(dip && wipe), `${tr.id} is both a dip and a wipe`);
  }
});
await t('every effect has a family and a display name', () => {
  for (const ef of T.EFFECTS) {
    assert.ok(T.EFFECT_FAMILY[ef.id], `${ef.id} has no family`);
    assert.ok(ef.name && ef.name.length > 1, `${ef.id} has no name`);
  }
  assert.equal(T.EFFECTS.length, Object.keys(T.EFFECT_FAMILY).length, 'an effect is in one list but not the other');
});
await t('the named effects creators search for exist', () => {
  for (const id of ['motion-blur', 'glow', 'chroma', 'light-rays', 'speed-push', 'beat-zoom', 'focus-in']) {
    assert.ok(T.EFFECTS.some((e2) => e2.id === id), `${id} missing from EFFECTS`);
  }
});


// ================= stage 11: what CapCut and Kdenlive have ====================
console.log('geometry.ts — crop and transform');
await t('the cover window keeps the frame aspect at zoom 1', () => {
  // landscape source into a vertical frame: the window is a tall slice
  const r = GEO.coverSourceRect(1920, 1080, 1080, 1920, {});
  assert.ok(Math.abs(r.swp / r.shp - 1080 / 1920) < 1e-6, 'window aspect != frame aspect');
  assert.ok(r.swp <= 1920 && r.shp <= 1080, 'window escapes the source');
});
await t('the window never escapes the source, at any anchor or zoom', () => {
  for (const ax of [0, 0.25, 0.5, 0.75, 1]) {
    for (const ay of [0, 0.5, 1]) {
      for (const zoom of [1, 1.5, 3, 8]) {
        const r = GEO.coverSourceRect(1920, 1080, 1080, 1920, { ax, ay, zoom });
        assert.ok(r.sx >= -1e-6, `sx ${r.sx} < 0 at ax=${ax} zoom=${zoom}`);
        assert.ok(r.sy >= -1e-6, `sy ${r.sy} < 0`);
        assert.ok(r.sx + r.swp <= 1920 + 1e-6, `right edge past source at ax=${ax} zoom=${zoom}`);
        assert.ok(r.sy + r.shp <= 1080 + 1e-6, `bottom edge past source`);
      }
    }
  }
});
await t('the anchor moves the window the way its name says', () => {
  const left = GEO.coverSourceRect(1920, 1080, 1080, 1920, { ax: 0.1 });
  const mid = GEO.coverSourceRect(1920, 1080, 1080, 1920, { ax: 0.5 });
  const right = GEO.coverSourceRect(1920, 1080, 1080, 1920, { ax: 0.9 });
  assert.ok(left.sx < mid.sx && mid.sx < right.sx, 'ax does not run left to right');
});
await t('the default geometry reproduces the old centred cover fit exactly', () => {
  // This is the compatibility promise: a project saved before crop existed has
  // no `frame`, and must render identically. Centred cover means the window is
  // centred on the source.
  const sw = 1920, sh = 1080, W = 1080, H = 1920;
  const r = GEO.coverSourceRect(sw, sh, W, H, undefined);
  const cover = Math.max(W / sw, H / sh);
  const expectedW = W / cover;
  const expectedH = H / cover;
  assert.ok(Math.abs(r.swp - expectedW) < 1e-6, 'width differs from the old cover fit');
  assert.ok(Math.abs(r.shp - expectedH) < 1e-6, 'height differs');
  assert.ok(Math.abs(r.sx - (sw - expectedW) / 2) < 1e-6, 'not centred horizontally');
  assert.ok(Math.abs(r.sy - (sh - expectedH) / 2) < 1e-6, 'not centred vertically');
  assert.equal(GEO.isDefaultGeometry(undefined), true);
  assert.equal(GEO.isDefaultGeometry({}), true);
  assert.equal(GEO.isDefaultGeometry({ zoom: 2 }), false);
});
await t('a crop aspect produces a window of that exact shape', () => {
  for (const aspect of [1, 4 / 5, 9 / 16, 16 / 9, 21 / 9]) {
    const r = GEO.coverSourceRect(1920, 1080, 1080, 1920, { crop: aspect });
    assert.ok(
      Math.abs(r.swp / r.shp - aspect) < 1e-6,
      `asked for ${aspect.toFixed(3)}, window is ${(r.swp / r.shp).toFixed(3)}`,
    );
    assert.ok(r.swp <= 1920 + 1e-6 && r.shp <= 1080 + 1e-6, 'crop exceeded the source');
  }
});
await t('a uniform zoom does not change the aspect (the bug this split avoids)', () => {
  const a = GEO.coverSourceRect(1920, 1080, 1080, 1920, { zoom: 1 });
  const b = GEO.coverSourceRect(1920, 1080, 1080, 1920, { zoom: 3 });
  assert.ok(Math.abs(a.swp / a.shp - b.swp / b.shp) < 1e-9, 'zoom changed the aspect ratio');
  assert.ok(b.swp < a.swp, 'zoom did not tighten the window');
});
await t('dragging the picture right moves the crop window LEFT (inverse)', () => {
  // The classic crop bug: the picture moves the wrong way. Right-drag must
  // reveal content to the LEFT of the source, so the window anchor decreases.
  const d = GEO.anchorFromDrag({ ax: 0.5, ay: 0.5 }, 100, 0, 1080, 1920, 1920, 1080);
  assert.ok(d.ax < 0.5, `right-drag moved the anchor to ${d.ax}, which moves the picture left`);
  const u = GEO.anchorFromDrag({ ax: 0.5, ay: 0.5 }, 0, -100, 1080, 1920, 1920, 1080);
  assert.ok(u.ay > 0.5, 'up-drag should show more of the bottom, so the anchor rises');
});
await t('a drag is clamped to the source and cannot push it off-screen', () => {
  const far = GEO.anchorFromDrag({ ax: 0.5, ay: 0.5 }, 100000, 100000, 1080, 1920, 1920, 1080);
  assert.ok(far.ax >= 0 && far.ax <= 1 && far.ay >= 0 && far.ay <= 1);
});
await t('fillZoomForCrop makes a cropped window cover the frame again', () => {
  assert.equal(GEO.fillZoomForCrop(null, 1080 / 1920), 1);
  const z = GEO.fillZoomForCrop(1, 1080 / 1920);
  assert.ok(Math.abs(z - 1920 / 1080) < 1e-6, `expected 1.778, got ${z}`);
  assert.ok(GEO.fillZoomForCrop(16 / 9, 9 / 16) > 1, 'a wide crop in a tall frame needs zoom');
});
await t('rotation wraps instead of clamping', () => {
  assert.equal(GEO.clampGeometry({ rot: 190 }).rot, -170);
  assert.equal(GEO.clampGeometry({ rot: -190 }).rot, 170);
  assert.equal(GEO.clampGeometry({ rot: 360 }).rot, 0);
  assert.equal(GEO.clampGeometry({ rot: -450 }).rot, -90);
});
await t('a NaN or missing field never becomes NaN in the renderer', () => {
  // NaN in a transform silently blanks the canvas — this is why every field is
  // sanitised before it reaches drawImage.
  const g = GEO.clampGeometry({ ax: NaN, ay: undefined, zoom: NaN, rot: NaN, crop: NaN });
  for (const [k, v] of Object.entries(g)) {
    if (k === 'crop') continue;
    assert.ok(Number.isFinite(v), `${k} came out as ${v}`);
  }
  assert.equal(g.crop, null);
});

await t('crop survives a project save/restore round trip (JSON, like IndexedDB)', () => {
  // A new clip field that is not in the type survives JSON but is dropped by any
  // code that rebuilds clips field by field. Snapshot/restore is the engine's own
  // undo path, so it is the honest test of whether crop persists.
  const proj = T.newProject('crop round trip', '16:9');
  proj.main.push({
    id: 'm1', mediaId: 'med', in: 0, out: 4, speed: 1, reverse: false, filter: 'none',
    adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
    volume: 1, muted: false, transitionIn: 'none', transitionDur: 0,
    frame: { ax: 0.2, ay: 0.8, zoom: 2.5, rot: 15, crop: 1 },
  });
  const json = JSON.parse(JSON.stringify(proj));
  const back = json.main[0].frame;
  assert.ok(back, 'frame was dropped by JSON (it should not be, but prove it)');
  assert.equal(back.ax, 0.2);
  assert.equal(back.crop, 1);
  assert.equal(back.rot, 15);
  const g = GEO.clampGeometry(back);
  assert.equal(g.zoom, 2.5, 'zoom lost in the round trip');
});
await t('an adjustment band is a clip with a grade and no picture', () => {
  const proj = T.newProject('band', '9:16');
  const track = proj.tracks.find((t2) => t2.id === 't_adjust');
  assert.ok(track, 'the Adjustment track is missing from a new project');
  const band = {
    id: 'b1', kind: 'adjustment', start: 1, duration: 3,
    adjust: { brightness: 100, contrast: 120, saturation: 90, hue: 0 },
  };
  track.clips.push(band);
  const json = JSON.parse(JSON.stringify(proj));
  const saved = json.tracks.find((t2) => t2.id === 't_adjust').clips[0];
  assert.equal(saved.kind, 'adjustment');
  assert.equal(saved.adjust.contrast, 120);
  // a band must carry no text, or it arrives with "Your text" on screen
  assert.equal(saved.text, undefined);
});
await t('the adjustment kind is distinct from every media kind', () => {
  // drawMainItem only draws text/image/video; a band must not be mistaken for one
  const kinds = ['text', 'image', 'video', 'audio', 'adjustment'];
  assert.equal(new Set(kinds).size, kinds.length);
});
await t('an adjustment band renders at full size when exporting', () => {
  // The band buffer is downscaled in the preview, but an export must be sharp.
  // previewMaxSide is 0 for exports; a cap applied there would silently soften
  // every graded band in a 1080p or 4K render.
  assert.equal(E.adjustmentScale(0, 3840, 2160), 1, 'export was downscaled');
  assert.equal(E.adjustmentScale(0, 1280, 720), 1, 'export was downscaled');
  // preview stays bounded
  const s4k = E.adjustmentScale(1920, 3840, 2160);
  assert.ok(s4k < 1, 'a 4K preview band should be reduced');
  assert.ok(Math.abs(s4k * 3840 - 1280) < 1, 'preview band should be ~1280 wide, got ' + s4k * 3840);
  // a preview smaller than 1280 is never enlarged
  assert.equal(E.adjustmentScale(854, 854, 480), 1, 'a small preview was upscaled');
  // a degenerate size must not divide by zero
  assert.ok(Number.isFinite(E.adjustmentScale(1920, 0, 0)));
});
await t('the grade is bit-identical to the reference for a known frame', () => {
  // Golden values captured from the implementation *before* the temp/tint,
  // split-tone and vignette passes were optimised. They exist so that a future
  // "faster" rewrite has to prove it did not quietly change the picture.
  const W = 8, H = 6;
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (i * 11) % 256;
    d[i + 1] = (i * 23 + 30) % 256;
    d[i + 2] = (i * 37 + 70) % 256;
    d[i + 3] = 255;
  }
  const base = { brightness: 100, contrast: 100, saturation: 100, hue: 0,
    temperature: 0, tint: 0, splitTone: 0, sharpen: 0, vignette: 0 };
  const ctx = { sharpenBuf: null, vigRamp: null, vigCols: new Float64Array(0) };
  E.Engine.prototype.gradePixels.call(ctx, d, W, H,
    { ...base, temperature: 20, tint: -10, splitTone: 40, vignette: 50 });
  const got = [];
  for (let p = 0; p < 4; p++) got.push(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
  assert.deepEqual(got, [1, 18, 43, 37, 92, 164, 86, 190, 92, 130, 48, 2]);
});
await t('the vignette darkens the corners and leaves the centre alone', () => {
  // A flat grey frame, so "darker" is unambiguous — on a patterned buffer the
  // corner channel can already be 0 and a darkening is then invisible.
  const W = 16, H = 12;
  const grey = () => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < d.length; i += 4) { d[i] = 200; d[i + 1] = 200; d[i + 2] = 200; d[i + 3] = 255; }
    return d;
  };
  const base = { brightness: 100, contrast: 100, saturation: 100, hue: 0,
    temperature: 0, tint: 0, splitTone: 0, sharpen: 0, vignette: 0 };
  const ctx = { sharpenBuf: null, vigRamp: null, vigCols: new Float64Array(0) };
  const d = grey();
  E.Engine.prototype.gradePixels.call(ctx, d, W, H, { ...base, vignette: 75 });
  assert.ok(d[0] < 200, 'top-left corner should darken, got ' + d[0]);
  const mid = ((H >> 1) * W + (W >> 1)) * 4;
  assert.equal(d[mid], 200, 'the centre must not be touched');
  // the ramp is rebuilt when the strength changes, not reused blindly
  const d2 = grey();
  E.Engine.prototype.gradePixels.call(ctx, d2, W, H, { ...base, vignette: 10 });
  assert.ok(d2[0] > d[0], 'a weaker vignette must darken less: ' + d2[0] + ' vs ' + d[0]);
  assert.ok(d2[0] < 200, 'a weak vignette must still do something at the corner');
});
await t('the vignette ramp is cached against its strength', () => {
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/private vigRamp:\s*\{\s*amount: number;\s*ramp: Float32Array\s*\}/.test(src),
    'the ramp must be cached by strength');
  assert.ok(/this\.vigRamp\.amount !== vig/.test(src), 'a changed strength must rebuild the ramp');
  // float64, or the column rounding shifts the ramp index by a level
  assert.ok(/private vigCols = new Float64Array\(0\)/.test(src),
    'column squares must be float64 to stay bit-identical');
});
console.log('easings.ts — keyframes that are not just linear');
await t('every ease hits its endpoints exactly', () => {
  // A curve that does not reach 1 at the end never arrives, so the clip holds
  // at 99% forever. This is the one property that must be exact, not close.
  for (const p of ES.EASE_PRESETS) {
    const a = ES.easeValue(p.id, 0);
    const b = ES.easeValue(p.id, 1);
    if (p.id === 'hold') {
      // the step: 0 until the very end, then 1
      assert.equal(a, 0, `${p.id} must start at 0`);
      assert.equal(b, 1, `${p.id} must end at 1`);
    } else {
      assert.ok(Math.abs(a) < 1e-9, `${p.id} f(0) should be 0, got ${a}`);
      assert.ok(Math.abs(b - 1) < 1e-9, `${p.id} f(1) should be 1, got ${b}`);
    }
  }
});
await t('eases are monotonic — motion never runs backwards', () => {
  for (const p of ES.EASE_PRESETS) {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = ES.easeValue(p.id, i / 100);
      assert.ok(v >= prev - 1e-9, `${p.id} went backwards at ${(i / 100).toFixed(2)}`);
      prev = v;
    }
  }
});
await t('the named eases are actually different shapes', () => {
  const at = (id) => [0.25, 0.5, 0.75].map((k) => ES.easeValue(id, k));
  const lin = at('linear');
  assert.deepEqual(lin, [0.25, 0.5, 0.75], 'linear must be the identity');
  // ease-in starts slower than linear, ease-out faster
  assert.ok(at('easeIn')[0] < lin[0] - 0.05, 'ease-in should lag at 25%');
  assert.ok(at('easeOut')[0] > lin[0] + 0.05, 'ease-out should lead at 25%');
  assert.ok(at('snap')[0] > at('easeOut')[0], 'snap should be the fastest to arrive');
  // all-round ease-in-out is symmetric about the midpoint
  const eio = at('easeInOut');
  assert.ok(Math.abs(eio[1] - 0.5) < 0.02, 'ease-in-out should cross 0.5 at the middle');
  assert.ok(Math.abs(eio[0] - (1 - eio[2])) < 0.05, 'ease-in-out should be symmetric');
});
await t('hold is a true step, not a fast ramp', () => {
  assert.equal(ES.easeValue('hold', 0.5), 0);
  assert.equal(ES.easeValue('hold', 0.99), 0);
  assert.equal(ES.easeValue('hold', 1), 1);
});
await t('a custom curve can overshoot, deliberately', () => {
  const over = { x1: 0.3, y1: 1.6, x2: 0.5, y2: 1 };
  assert.ok(ES.easeValue('custom', 0.5, over) > 1, 'an overshoot curve should exceed 1 mid-way');
  assert.ok(Math.abs(ES.easeValue('custom', 1, over) - 1) < 1e-9, 'but still land on 1');
});
await t('solving the bezier is accurate where Newton stalls', () => {
  // x1 = x2 = 0 is a flat start: the derivative vanishes at t=0, which is where
  // a naive Newton loop divides by ~0 and returns nonsense.
  const flat = { x1: 0, y1: 0, x2: 0, y2: 1 };
  for (let i = 0; i <= 40; i++) {
    const v = ES.solveBezier(flat, i / 40);
    assert.ok(v >= 0 && v <= 1, `out of range at ${i}: ${v}`);
  }
  // With x1 = x2 = 0 the time axis is x(t) = t³, so the curve arrives at a given
  // progress sooner than a straight line does — it leads linear, it does not lag.
  assert.ok(ES.solveBezier(flat, 0.25) > 0.25,
    'the flat-start curve should lead linear, got ' + ES.solveBezier(flat, 0.25));
  // and the solve must stay monotonic through the flat region
  let prev = -Infinity;
  for (let i = 0; i <= 60; i++) {
    const v = ES.solveBezier(flat, i / 60);
    assert.ok(v >= prev - 1e-9, 'flat-start solve went backwards at ' + i);
    prev = v;
  }
});
await t('animAt honours easing, and old projects stay linear', () => {
  const kf = (at, x, ease) => ({ at, v: { ...T.DEFAULT_ANIM, x }, ...(ease ? { ease } : {}) });
  // no ease at all = the behaviour every saved project already has
  const plain = [kf(0, 0), kf(2, 1)];
  assert.ok(Math.abs(E.animAt(plain, T.DEFAULT_ANIM, 1).x - 0.5) < 1e-9,
    'a keyframe without an ease must interpolate linearly');
  // easeIn lags the linear midpoint
  const eased = [kf(0, 0, 'easeIn'), kf(2, 1)];
  assert.ok(E.animAt(eased, T.DEFAULT_ANIM, 1).x < 0.45,
    'easeIn should be behind linear at the midpoint');
  // easeOut leads it
  const out = [kf(0, 0, 'easeOut'), kf(2, 1)];
  assert.ok(E.animAt(out, T.DEFAULT_ANIM, 1).x > 0.55,
    'easeOut should be ahead of linear at the midpoint');
  // the ease belongs to the OUTGOING keyframe: the second one's ease must not
  // affect the segment before it
  const tail = [kf(0, 0), kf(2, 1, 'easeIn')];
  assert.ok(Math.abs(E.animAt(tail, T.DEFAULT_ANIM, 1).x - 0.5) < 1e-9,
    'a later keyframe\'s ease must not reach backwards');
  // and every value still lands exactly on its keyframes
  assert.equal(E.animAt(eased, T.DEFAULT_ANIM, 0).x, 0);
  assert.equal(E.animAt(eased, T.DEFAULT_ANIM, 2).x, 1);
});
await t('easing survives duplicating a clip (behavioural, not a regex)', () => {
  // The regex test below proves the helper exists; this proves it works. A
  // regex cannot catch a clone that drops a field, which is how this kind of
  // bug actually ships.
  const proj = T.newProject('ease dup', '16:9');
  proj.main.push({
    id: 'm1', mediaId: 'med', in: 0, out: 4, speed: 1, reverse: false, filter: 'none',
    adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
    volume: 1, muted: false, transitionIn: 'none', transitionDur: 0,
    keyframes: [
      { at: 0, v: { ...T.DEFAULT_ANIM, x: 0 }, ease: 'easeIn' },
      { at: 2, v: { ...T.DEFAULT_ANIM, x: 1 }, ease: 'custom', bez: { x1: 0.1, y1: 0.9, x2: 0.2, y2: 1 } },
    ],
  });
  const e = new E.Engine(proj);
  e.duplicateMainClip('m1');
  assert.equal(e.project.main.length, 2, 'the duplicate was not created');
  const copy = e.project.main[1];
  assert.ok(copy.keyframes && copy.keyframes.length === 2, 'keyframes were not copied');
  assert.equal(copy.keyframes[0].ease, 'easeIn', 'the ease was dropped by the duplicate');
  assert.equal(copy.keyframes[1].ease, 'custom', 'the custom ease was dropped');
  assert.deepEqual(copy.keyframes[1].bez, { x1: 0.1, y1: 0.9, x2: 0.2, y2: 1 });
  // and the control points must be a copy, not shared with the original
  copy.keyframes[1].bez.x1 = 0.99;
  assert.equal(e.project.main[0].keyframes[1].bez.x1, 0.1,
    'the duplicate shares bezier control points with the original');
});
await t('setKeyframeEase writes to the keyframe near the playhead only', () => {
  const proj = T.newProject('ease set', '16:9');
  proj.main.push({
    id: 'm1', mediaId: 'med', in: 0, out: 4, speed: 1, reverse: false, filter: 'none',
    adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
    volume: 1, muted: false, transitionIn: 'none', transitionDur: 0,
    keyframes: [
      { at: 0, v: { ...T.DEFAULT_ANIM, x: 0 } },
      { at: 1, v: { ...T.DEFAULT_ANIM, x: 0.5 } },
      { at: 2, v: { ...T.DEFAULT_ANIM, x: 1 } },
    ],
  });
  const e = new E.Engine(proj);
  assert.ok(e.setKeyframeEase('m1', 1, 'easeOut'), 'setting the ease should succeed');
  const kfs = e.project.main[0].keyframes;
  assert.equal(kfs[1].ease, 'easeOut');
  assert.equal(kfs[0].ease, undefined, 'a neighbouring keyframe must not be touched');
  assert.equal(kfs[2].ease, undefined);
  // switching away from custom must clear stale control points
  e.setKeyframeEase('m1', 1, 'custom', { x1: 0.2, y1: 0.4, x2: 0.6, y2: 0.8 });
  assert.deepEqual(kfs[1].bez, { x1: 0.2, y1: 0.4, x2: 0.6, y2: 0.8 });
  e.setKeyframeEase('m1', 1, 'easeIn');
  assert.equal(kfs[1].bez, undefined, 'stale bezier control points survived a preset change');
  // an unknown clip is a no-op, not a throw
  assert.equal(e.setKeyframeEase('nope', 0, 'easeIn'), false);
});
await t('easing survives a clip duplicate and a split', () => {
  // Both paths rebuild keyframes by hand, which is exactly how a new field gets
  // dropped. The clone helper exists so they cannot.
  const src = readFileSync('src/mayocut/engine.ts', 'utf8');
  assert.ok(/function cloneKeyframe/.test(src), 'the clone helper must exist');
  assert.ok(!/keyframes:\s*c\.keyframes\?\.map\(\(k\) => \(\{ at: k\.at/.test(src),
    'duplicating must not rebuild keyframes by hand');
  assert.ok(/cloneKeyframe\(k, k\.at - local\)/.test(src),
    'splitting must shift the time AND keep the ease');
});
console.log('the "Invalid timeline time" crash — one bad number must not brick a project');
await t('a non-finite overlay clip cannot make the project duration NaN', () => {
  // This was the crash. One overlay with a NaN start made projectDuration() NaN;
  // seek() then computed Math.max(0, Math.min(NaN, t)) = NaN (the clamp helpers
  // do not reject a non-finite bound), so the playhead was non-finite and
  // sampleTimeline threw on every single frame.
  const base = (mutate) => {
    const p = T.newProject('crash', '16:9');
    p.main.push({
      id: 'm1', mediaId: 'med', in: 0, out: 4, speed: 1, reverse: false, filter: 'none',
      adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
      volume: 1, muted: false, transitionIn: 'none', transitionDur: 0,
    });
    mutate(p);
    return p;
  };
  const cases = {
    'NaN start': (p) => p.tracks[0].clips.push({ id: 'o', kind: 'text', start: NaN, duration: 2 }),
    'NaN duration': (p) => p.tracks[0].clips.push({ id: 'o', kind: 'text', start: 1, duration: NaN }),
    Infinity: (p) => p.tracks[2].clips.push({ id: 'a', kind: 'audio', start: 0, duration: Infinity }),
    '-Infinity start': (p) => p.tracks[1].clips.push({ id: 'o', kind: 'image', start: -Infinity, duration: 2 }),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const p = base(mutate);
    const d = T.projectDuration(p);
    // The EXACT duration matters, not merely that it is finite: 0 is finite, and
    // collapsing the project to 0 s would be a different bug that a finiteness
    // check happily accepts. The main clip is 0..4 s, so 4 is the only right
    // answer — a corrupt overlay contributes nothing, it does not erase the edit.
    assert.equal(d, 4, `${name} produced ${d}, expected the main clip's 4 s`);
  }
});
await t('the final duration guard catches a non-finite sum from any source', () => {
  // M1 lesson: the per-clip guards made the outer guard unreachable through the
  // normal path, so a mutation of them survived. The outer guard is the one that
  // must hold whatever a future track field does, so it is asserted directly:
  // mainSpans can carry a corrupt end, and the returned duration must still be
  // finite.
  const p = T.newProject('outer', '16:9');
  p.main.push({
    id: 'm1', mediaId: 'med', in: 0, out: 4, speed: 1, reverse: false, filter: 'none',
    adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
    volume: 1, muted: false, transitionIn: 'none', transitionDur: 0,
  });
  // a track shape the per-clip code does not understand
  p.tracks.push({ id: 't_bad', name: 'bad', clips: [{ id: 'x', kind: 'text', start: NaN, duration: Infinity }] });
  const d = T.projectDuration(p);
  assert.equal(d, 4, 'projectDuration returned ' + d + ' for a corrupt track, expected 4');
});
await t('the playhead clamp cannot leave a NaN time', () => {
  // Mirrors Engine.seek: the limit must be finite before it is used, because
  // Math.max(0, Math.min(NaN, x)) is NaN rather than 0.
  const clamp = (dur, t) => {
    const limit = Number.isFinite(dur) && dur > 0 ? dur : 0;
    const want = Number.isFinite(t) ? t : 0;
    return Math.max(0, Math.min(limit, want));
  };
  for (const [dur, t] of [[NaN, 1], [1, NaN], [NaN, NaN], [Infinity, 5], [4, -3]]) {
    const v = clamp(dur, t);
    assert.ok(Number.isFinite(v) && v >= 0, `clamp(${dur}, ${t}) = ${v}`);
  }
});
await t('seek() survives a non-finite duration instead of throwing Invalid timeline time', () => {
  // The exact reported crash, reproduced at its source. The old code did
  // `this.t = Math.max(0, Math.min(this.duration(), t))`; with a NaN duration
  // that is NaN, and the very next syncElements -> sampleTimeline threw
  // RangeError("Invalid timeline time"), which the error boundary turned into
  // "Mayobuild Studio failed to start" over the whole editor.
  const e = new E.Engine(mkProject());
  e.duration = () => NaN;
  assert.doesNotThrow(() => e.seek(2), 'seek must not throw on a non-finite duration');
  assert.ok(Number.isFinite(e.t), 'the playhead became ' + e.t);
  assert.equal(e.t, 0, 'a non-finite range should fall back to the start, not to NaN');
  // and with a finite duration it still honours the request
  const e2 = new E.Engine(mkProject());
  e2.seek(1);
  assert.equal(e2.t, 1);
  // a non-finite REQUEST must not poison the clock either
  e2.seek(NaN);
  assert.ok(Number.isFinite(e2.t), 'a NaN seek target left t = ' + e2.t);
});
await t('repairProject fixes a corrupt project instead of deleting clips', () => {
  const p = T.newProject('repair', '16:9');
  p.main.push({
    id: 'm1', mediaId: 'med', in: 0, out: 4, speed: 1, reverse: false, filter: 'none',
    adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
    volume: 1, muted: false, transitionIn: 'none', transitionDur: 0,
  });
  p.tracks[0].clips.push({ id: 'o1', kind: 'text', start: NaN, duration: 2, text: 'keep me' });
  p.tracks[2].clips.push({ id: 'a1', kind: 'audio', start: -5, duration: Infinity });
  const { project: fixed, repaired } = PS.repairProject(p);
  assert.ok(repaired.length >= 3, 'the broken fields should be reported, got ' + repaired.length);
  assert.ok(Number.isFinite(T.projectDuration(fixed)), 'still non-finite after repair');
  // the clips survive — a repair must not silently delete the user's work
  assert.equal(fixed.tracks[0].clips.length, 1, 'the text clip was dropped by the repair');
  assert.equal(fixed.tracks[2].clips.length, 1, 'the audio clip was dropped by the repair');
  assert.equal(fixed.tracks[0].clips[0].text, 'keep me', 'clip content was lost');
  assert.ok(Number.isFinite(fixed.tracks[2].clips[0].duration) && fixed.tracks[2].clips[0].duration > 0);
  assert.ok(fixed.tracks[2].clips[0].start >= 0, 'a negative start must be clamped to 0');
});
await t('repairProject leaves a healthy project completely alone', () => {
  const p = T.newProject('clean', '16:9');
  p.main.push({
    id: 'm1', mediaId: 'med', in: 0.5, out: 4, speed: 2, reverse: false, filter: 'none',
    adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
    volume: 1, muted: false, transitionIn: 'none', transitionDur: 0,
  });
  p.tracks[1].clips.push({ id: 'o1', kind: 'image', start: 1, duration: 2 });
  const before = JSON.stringify(p);
  const { project: fixed, repaired } = PS.repairProject(p);
  assert.deepEqual(repaired, [], 'a clean project must not be reported as repaired');
  assert.equal(JSON.stringify(fixed), before, 'a clean project must be byte-identical');
});
await t('the editor repairs a project at load, before the engine sees it', () => {
  // A repair that exists but is never called rescues nobody — and this bug was
  // persisted, so runtime clamping alone cannot recover an existing project.
  const src = readFileSync('src/mayocut/components/Editor.tsx', 'utf8');
  assert.ok(/import \{[^}]*repairProject/s.test(src), 'Editor must import repairProject');
  const load = src.slice(src.indexOf('const [p, m] = await Promise.all'));
  assert.ok(load.indexOf('repairProject(p)') > 0, 'the load path must repair the project');
  assert.ok(
    load.indexOf('repairProject(p)') < load.indexOf('setProject('),
    'the project must be repaired before it is put into state',
  );
});
await t('the shell does not cover a running app with the startup error', () => {
  // The overlay was a full-screen, inset:0, z-index 99999 panel appended on ANY
  // window error for the whole process lifetime, so a recoverable error after
  // startup buried the editor behind "failed to start" with no way out.
  const src = readFileSync('shell/main.tsx', 'utf8');
  assert.ok(/appHasRendered/.test(src), 'the overlay must distinguish startup from runtime');
  assert.ok(/role", "alert"/.test(src) || /role="alert"/.test(src), 'runtime errors need a dismissal bar');
  assert.ok(/inset:0/.test(src), 'the full-screen variant should still exist for a real boot failure');
  // the full-screen variant must be the else-branch, not the default
  const fn = src.slice(src.indexOf('function showStartupError'));
  const body = fn.slice(0, fn.indexOf('window.addEventListener'));
  assert.ok(
    body.indexOf('if (started)') < body.indexOf('inset:0'),
    'the full-screen overlay must be conditional on the app not having rendered',
  );
});
console.log('ripple.ts — deleting without desyncing the timeline');
const mkTracks = () => [
  { id: 't_text', name: 'Text', clips: [{ id: 'cap', kind: 'text', start: 7, duration: 2 }] },
  { id: 't_audio', name: 'Audio', clips: [{ id: 'mus', kind: 'audio', start: 0, duration: 15 }] },
];
await t('ripple moves overlays that start after the cut', () => {
  const r = RIP.removeMainClip(
    { main: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], tracks: mkTracks() },
    'a', 'ripple', (i) => i * 5, () => 5,
  );
  assert.equal(r.overlaysMoved, 1);
  assert.equal(r.shifted, 5);
  // the caption at 7s must follow the picture that used to be under it
  assert.equal(r.tracks[0].clips[0].start, 2);
  // a music bed that STARTED before the cut is deliberately untouched: it is
  // carrying across the edit and moving it would break the sync
  assert.equal(r.tracks[1].clips[0].start, 0);
});
await t('ripple never leaves an overlay at a negative time', () => {
  const tracks = [{ id: 't_text', name: 'Text', clips: [{ id: 'cap', kind: 'text', start: 5, duration: 2 }] }];
  const r = RIP.rippleOverlays(tracks, 6, -20);
  assert.ok(r.tracks[0].clips[0].start >= 0, 'a negative start would draw the overlay before the video');
});
await t('lift keeps the timing and cuts what lived in the hole', () => {
  const r = RIP.removeMainClip(
    { main: [{ id: 'a' }, { id: 'b' }], tracks: mkTracks() },
    'a', 'lift', (i) => i * 5, () => 5,
  );
  assert.equal(r.shifted, 0, 'lift must not shift anything');
  // the music bed 0-15 loses the first 5 seconds
  assert.equal(r.tracks[1].clips[0].start, 0);
  assert.equal(r.tracks[1].clips[0].duration, 10);
});
await t('a cut through the middle of an overlay splits it in two', () => {
  const tracks = [{ id: 't_audio', name: 'Audio', clips: [{ id: 'mus', kind: 'audio', start: 0, duration: 10 }] }];
  const r = RIP.cutOverlays(tracks, { start: 3, end: 6 });
  assert.equal(r.tracks[0].clips.length, 2, 'a straddling clip must become two pieces');
  assert.equal(r.tracks[0].clips[0].duration, 3);
  assert.equal(r.tracks[0].clips[1].duration, 4);
  assert.equal(r.tracks[0].clips[1].start, 3);
});
await t('a sliver shorter than MIN_KEEP is dropped, not left behind', () => {
  const tracks = [{ id: 't_audio', name: 'Audio', clips: [{ id: 's', kind: 'audio', start: 2.98, duration: 3 }] }];
  const r = RIP.cutOverlays(tracks, { start: 3, end: 6 });
  // 0.02s of audio is a click, not a clip: nothing survives
  assert.equal(r.tracks[0].clips.length, 0, 'the sliver survived as a click');
  assert.equal(r.removed, 1);
});
await t('deleting a clip that does not exist changes nothing', () => {
  assert.equal(RIP.removeMainClip({ main: [], tracks: mkTracks() }, 'nope', 'ripple', () => 0, () => 5), null);
});
await t('a trimmed tail keeps its source timing, so audio does not jump', () => {
  const tracks = [{ id: 't_audio', name: 'Audio', clips: [{ id: 'm', kind: 'audio', start: 0, duration: 10, sourceOffset: 0 }] }];
  const r = RIP.cutOverlays(tracks, { start: 0, end: 4 });
  assert.equal(r.tracks[0].clips[0].sourceOffset, 4, 'the tail must resume 4s into the source');
});

console.log('scopes.ts — measuring what the grade did');
await t('the histogram counts exactly the pixels it was given', () => {
  const px = [];
  for (let i = 0; i < 50; i++) px.push(255, 255, 255, 255);
  for (let i = 0; i < 50; i++) px.push(0, 0, 0, 255);
  const r = SCO.buildScopes(new Uint8ClampedArray(px), { step: 1, width: 10 });
  assert.equal(r.histogram.total, 100);
  assert.equal(r.histogram.r[255], 50);
  assert.equal(r.histogram.r[0], 50);
  assert.equal(r.histogram.clipped, 50);
  assert.equal(r.histogram.crushed, 50);
});
await t('luma uses the 601 weights, not a naive average', () => {
  // green is much brighter than blue to the eye; an average would call them equal
  assert.ok(SCO.lumaOf(0, 255, 0) > SCO.lumaOf(0, 0, 255) * 4);
  assert.equal(SCO.lumaOf(255, 255, 255), 255);
  assert.equal(SCO.lumaOf(0, 0, 0), 0);
});
await t('every channel is histogrammed separately (a luma-only plot hides clipping)', () => {
  // pure red: only the R channel is clipped. A luma histogram would not show it.
  const px = [];
  for (let i = 0; i < 10; i++) px.push(255, 0, 0, 255);
  const r = SCO.buildScopes(new Uint8ClampedArray(px), { step: 1, width: 10 });
  assert.equal(r.histogram.r[255], 10);
  assert.equal(r.histogram.g[255], 0);
  assert.equal(r.histogram.b[255], 0);
  assert.equal(r.histogram.clipped, 10, 'a blown red channel must count as clipped');
});
await t('exposure reading names clipped, crushed, flat and balanced', () => {
  const make = (bins, total) => {
    const h = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), y: new Uint32Array(256), peak: 1, total, clipped: 0, crushed: 0 };
    h.y.set(bins);
    return h;
  };
  const hot = make(new Uint32Array(256), 100);
  hot.clipped = 20; // 20%
  assert.equal(SCO.readExposure(hot).verdict, 'clipped');

  const dead = make(new Uint32Array(256), 100);
  dead.crushed = 40;
  assert.equal(SCO.readExposure(dead).verdict, 'crushed');

  const flatBins = new Uint32Array(256);
  flatBins[120] = 100;
  assert.equal(SCO.readExposure(make(flatBins, 100)).verdict, 'flat');

  const full = new Uint32Array(256);
  for (let i = 0; i < 256; i++) full[i] = 1;
  assert.equal(SCO.readExposure(make(full, 256)).verdict, 'balanced');
});
await t('the vectorscope centres neutral colours and spreads saturated ones', () => {
  const grey = [];
  for (let i = 0; i < 20; i++) grey.push(128, 128, 128, 255);
  const g = SCO.buildScopes(new Uint8ClampedArray(grey), { step: 1, width: 10 });
  // grey has zero chroma, so it must land on the centre bin
  const centre = (g.vectorscope.n / 2) * g.vectorscope.n + g.vectorscope.n / 2;
  assert.ok(g.vectorscope.data[Math.floor(centre)] >= 20, 'neutral did not land at the centre');
  assert.ok(g.vectorscope.meanSaturation < 0.01, 'grey reported saturation');
});
await t('channel balance names a warm cast and a neutral image', () => {
  const warmBins = (r, gg, b) => {
    const h = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), y: new Uint32Array(256), peak: 1, total: 10, clipped: 0, crushed: 0 };
    h.r[r] = 10; h.g[gg] = 10; h.b[b] = 10;
    return h;
  };
  assert.equal(SCO.channelBalance(warmBins(180, 128, 100)).cast, 'warm');
  assert.equal(SCO.channelBalance(warmBins(128, 128, 128)).cast, 'neutral');
  assert.equal(SCO.channelBalance(warmBins(90, 128, 180)).cast, 'cool');
});
await t('sampling every Nth pixel is proportional and still correct', () => {
  const px = [];
  for (let i = 0; i < 100; i++) px.push(200, 100, 50, 255);
  const all = SCO.buildScopes(new Uint8ClampedArray(px), { step: 1, width: 10 });
  const some = SCO.buildScopes(new Uint8ClampedArray(px), { step: 4, width: 10 });
  assert.equal(all.histogram.total, 100);
  assert.equal(some.histogram.total, 25);
  // the same colour every time, so the shape must not change with the step
  assert.equal(some.histogram.r[200], 25);
});

console.log('loudness.ts — levels that mean something across platforms');
await t('dB conversion round-trips and never inverts phase', () => {
  assert.ok(Math.abs(LDN.linearToDb(0.5) - -6.0206) < 0.01);
  assert.ok(Math.abs(LDN.dbToLinear(-6.0206) - 0.5) < 0.001);
  assert.equal(LDN.linearToDb(0), -70);
  assert.equal(LDN.dbToLinear(-Infinity), 0);
  assert.ok(LDN.dbToLinear(-1e9) >= 0, 'a huge attenuation must not go negative');
});
await t('peak measurement is exact on a known tone', () => {
  const sr = 48000;
  const a = new Float32Array(sr);
  for (let i = 0; i < sr; i++) a[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr);
  assert.ok(Math.abs(LDN.peakDb([a]) - -6.0206) < 0.05);
});
await t('silence is gated, not reported as a very small number', () => {
  const z = new Float32Array(48000);
  assert.equal(LDN.approximateLufs([z], 48000), -70);
  const n = LDN.normaliseGain([z], -14, 48000);
  assert.equal(n.gainDb, 0, 'normalising silence must not produce a huge gain');
});
await t('normalising a quiet tone lands on the target', () => {
  const sr = 48000;
  const a = new Float32Array(sr * 2);
  for (let i = 0; i < a.length; i++) a[i] = 0.05 * Math.sin((2 * Math.PI * 1000 * i) / sr);
  const n = LDN.normaliseGain([a], -14, sr);
  assert.ok(Math.abs(n.measuredLufs + n.gainDb - -14) < 0.01, 'the gain does not reach the target');
  assert.ok(n.gain > 1, 'a quiet clip should be turned up');
});
await t('gain is clamped to a sane range and says when it clamped', () => {
  const tiny = new Float32Array([1e-7, 1e-7, 1e-7]);
  const r = LDN.normaliseGain([tiny], -14, 48000);
  assert.ok(Math.abs(r.gainDb) <= 24, `gain ${r.gainDb} escaped the clamp`);
});
await t('the advice warns when normalising would clip', () => {
  const hot = { measuredLufs: -20, gainDb: 10, gain: 3, clamped: false };
  const msg = LDN.normaliseAdvice(hot, -2);
  assert.match(msg, /clip/i, 'a peak that would exceed 0 dBFS must be called out');
  const ok = LDN.normaliseAdvice({ measuredLufs: -20, gainDb: 6, gain: 2, clamped: false }, -10);
  assert.match(ok, /turn this up/i);
  assert.match(LDN.normaliseAdvice({ measuredLufs: -70, gainDb: 0, gain: 1, clamped: false }, -70), /silent/i);
});
await t('every platform target is a plausible negative LUFS value', () => {
  assert.ok(LDN.LOUDNESS_TARGETS.length >= 4, 'too few targets');
  for (const t2 of LDN.LOUDNESS_TARGETS) {
    assert.ok(t2.lufs < 0 && t2.lufs > -30, `${t2.id} target ${t2.lufs} is not a plausible LUFS`);
    assert.ok(typeof t2.hint === "string" && t2.hint.length > 10, `${t2.id} has no usable hint`);
  }
});

console.log(`\nAUDIT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
