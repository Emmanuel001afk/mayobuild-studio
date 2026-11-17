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

console.log(`\nAUDIT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
