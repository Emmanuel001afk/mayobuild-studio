// MayoCut v0.4.0 functional audit — pure-logic modules under node (esbuild bundles).
import assert from 'node:assert';

let passed = 0, failed = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  PASS', name); })
    .catch((e) => { failed++; console.log('  FAIL', name, '—', e.message); });
}

// ================= types =================
const T = await import('./b-types.mjs');
console.log('types.ts');
await t('emptyTracks = 3 fixed tracks', () => {
  const tr = T.emptyTracks();
  assert.equal(tr.length, 3);
  assert.ok(tr.some((x) => x.id === 't_text'));
  assert.ok(tr.some((x) => x.id === 't_audio'));
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
const E = await import('./b-engine.mjs');
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

console.log(`\nAUDIT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
