import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { Engine } from "../src/mayocut/engine";
import { db } from "../src/mayocut/idb";
import {
  sampleTimeline,
  makeRenderPlan,
  findSharedSourceConflicts,
  timeForFrame,
} from "../src/mayocut/timeline";
import { encodeWavChannels } from "../src/mayocut/denoise";
import { mainClipGain, mainSpans, newProject, type MediaItem } from "../src/mayocut/types";

const video: MediaItem = {
  id: "v",
  name: "video.mp4",
  kind: "video",
  size: 12,
  createdAt: 1,
  duration: 10,
};

test("new clips are hard cuts and do not fade original sound", () => {
  const engine = new Engine(newProject("test", "16:9"));
  const clip = engine.addMainClip(video);
  engine.addMainClip(video);
  const spans = mainSpans(engine.project);
  assert.equal(clip.transitionIn, "none");
  assert.equal(spans[1].clip.transitionIn, "none");
  assert.equal(mainClipGain(clip, spans[0], spans[1], 9.9), 1);
  clip.muted = true;
  assert.equal(mainClipGain(clip, spans[0], spans[1], 2), 0);
});

test("splitting keeps the incoming transition on the first half and makes a clean cut", () => {
  const engine = new Engine(newProject("test", "16:9"));
  engine.addMainClip(video);
  const clip = engine.addMainClip(video);
  clip.transitionIn = "crossfade";
  clip.transitionDur = 0.5;
  assert.equal(engine.splitAt(15), true);
  const [, left, right] = engine.project.main;
  assert.deepEqual([left.in, left.out, left.transitionIn], [0, 5, "crossfade"]);
  assert.deepEqual([right.in, right.out, right.transitionIn], [5, 10, "none"]);
  assert.equal(engine.duration(), 20);
});

test("reverse split preserves source order; variable speed refuses unsafe split", () => {
  const engine = new Engine(newProject("test", "16:9"));
  const clip = engine.addMainClip(video);
  clip.reverse = true;
  assert.equal(engine.splitAt(3), true);
  assert.deepEqual(
    engine.project.main.map((c) => [c.in, c.out]),
    [
      [7, 10],
      [0, 7],
    ],
  );
  const other = new Engine(newProject("test", "16:9"));
  other.addMainClip(video).rampTo = 2;
  assert.equal(other.splitAt(4), false);
  assert.equal(other.project.main.length, 1);
});

test("direct changes notify autosave listeners", () => {
  const engine = new Engine(newProject("test", "16:9"));
  const clip = engine.addMainClip(video);
  let calls = 0;
  engine.onVersion = () => calls++;
  clip.filter = "bw";
  clip.muted = true;
  engine.commitChange();
  assert.equal(calls, 1);
  assert.equal(engine.project.main[0].filter, "bw");
});

test("extracted WAV keeps stereo channels and sample order", async () => {
  const wav = encodeWavChannels([Float32Array.of(1, 0), Float32Array.of(-1, 0.5)], 48000);
  const data = new DataView(await wav.arrayBuffer());
  assert.equal(data.getUint16(22, true), 2);
  assert.equal(data.getUint32(24, true), 48000);
  assert.equal(data.getInt16(44, true), 32767);
  assert.equal(data.getInt16(46, true), -32768);
  assert.equal(data.getInt16(48, true), 0);
  assert.equal(data.getInt16(50, true), 16383);
});

test("local media and project changes survive reload from IndexedDB", async () => {
  const media = { ...video, id: "persisted-video" };
  const blob = new Blob(["original bytes"], { type: "video/mp4" });
  const project = newProject("saved edit", "16:9");
  const engine = new Engine(project);
  const clip = engine.addMainClip(media);
  clip.filter = "bw";
  clip.muted = true;
  await db.putMedia(media, blob);
  await db.saveProject(engine.project);
  const restored = await db.getProject(project.id);
  assert.equal(restored?.main[0].filter, "bw");
  assert.equal(restored?.main[0].muted, true);
  assert.equal(await (await db.getBlob(media.id))?.text(), "original bytes");
});

test("preview clock and audio wait for a loading video frame", () => {
  const engine = new Engine(newProject("buffering", "16:9"));
  engine.addMainClip(video);
  const g = globalThis as unknown as Record<string, unknown>;
  const oldVideo = g.HTMLVideoElement;
  const oldRaf = g.requestAnimationFrame;
  const oldCancel = g.cancelAnimationFrame;
  class FakeVideo {
    readyState = 1;
    seeking = false;
    paused = false;
    pause() {
      this.paused = true;
    }
  }
  let frame: FrameRequestCallback = () => {};
  g.HTMLVideoElement = FakeVideo;
  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    frame = cb;
    return 1;
  };
  g.cancelAnimationFrame = () => {};
  try {
    const e = engine as any;
    const el = new FakeVideo();
    e.els.set(video.id, { el, url: "blob:source" });
    e.requestVideoLoad = () => {};
    e.syncElements = () => {};
    e.draw = () => {};
    let buffering = false;
    engine.onBufferingChange = (value) => {
      buffering = value;
    };
    engine.playing = true;
    e.lastNow = 1000;
    e.loopRaf();
    frame(1100);
    assert.equal(engine.t, 0);
    assert.equal(el.paused, true);
    assert.equal(buffering, true);
    el.readyState = 2;
    frame(1200);
    assert.equal(buffering, false);
    assert.equal(engine.t, 0);
    frame(1300);
    assert.ok(Math.abs(engine.t - 0.1) < 1e-8);
  } finally {
    g.HTMLVideoElement = oldVideo;
    g.requestAnimationFrame = oldRaf;
    g.cancelAnimationFrame = oldCancel;
  }
});

test("timeline uses precise half-open cuts for playback and rendering", () => {
  const e = new Engine(newProject("cuts", "16:9"));
  const a = e.addMainClip(video);
  const b = e.addMainClip({ ...video, id: "b" });
  a.out = 2;
  b.in = 3;
  b.out = 7;
  assert.deepEqual(
    sampleTimeline(e.project, 1.999).main.map((s) => s.clip.id),
    [a.id],
  );
  const atCut = sampleTimeline(e.project, 2).main;
  assert.deepEqual(
    atCut.map((s) => s.clip.id),
    [b.id],
  );
  assert.equal(atCut[0].sourceTime, 3);
  assert.equal(sampleTimeline(e.project, 6).main.length, 0);
});

test("transition sampling includes both sources and consistent gains", () => {
  const e = new Engine(newProject("transition", "16:9"));
  const a = e.addMainClip(video);
  const b = e.addMainClip({ ...video, id: "b" });
  b.transitionIn = "crossfade";
  b.transitionDur = 2;
  const s = sampleTimeline(e.project, 9);
  assert.deepEqual(
    s.main.map((m) => m.clip.id),
    [a.id, b.id],
  );
  assert.equal(s.main[1].transition?.progress, 0.5);
  assert.equal(s.main[0].gain, 0.5);
  assert.equal(s.main[1].gain, 0.5);
});

test("overlay source offsets and rational frame times are stable", () => {
  const project = newProject("overlay", "16:9");
  project.tracks[2].clips.push({
    id: "a",
    kind: "audio",
    mediaId: "v",
    start: 4,
    duration: 3,
    sourceOffset: 5,
  });
  assert.equal(sampleTimeline(project, 5).overlays[0].sourceTime, 6);
  assert.equal(sampleTimeline(project, 7).overlays.length, 0);
  assert.equal(timeForFrame(30000, 30000, 1001), 1001);
  assert.throws(() => timeForFrame(1, 0), RangeError);
});

test("render plan is a detached versioned snapshot", () => {
  const e = new Engine(newProject("snapshot", "16:9"));
  e.addMainClip(video);
  const plan = makeRenderPlan(e.project);
  e.project.main[0].muted = true;
  assert.equal(plan.version, 1);
  assert.equal(plan.duration, 10);
  assert.equal(plan.project.main[0].muted, false);
});

test("overlapping instances of the same source are flagged but hard cuts are not", () => {
  const e = new Engine(newProject("conflicts", "16:9"));
  e.addMainClip(video);
  const b = e.addMainClip(video);
  const kinds = new Map([[video.id, video.kind]]);
  assert.equal(findSharedSourceConflicts(e.project, kinds).length, 0);
  b.transitionIn = "crossfade";
  b.transitionDur = 0.5;
  assert.deepEqual(
    findSharedSourceConflicts(e.project, kinds).map((c) => [c.start, c.end]),
    [[9.5, 10]],
  );
});

test("WebM export releases owned canvas tracks and restores state when playback fails", async () => {
  const previousRecorder = globalThis.MediaRecorder;
  const previousStream = globalThis.MediaStream;
  let canvasStopped = 0;
  let audioStopped = 0;
  let recorderStopped = 0;
  class Recorder {
    static isTypeSupported() { return true; }
    state = "inactive";
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; recorderStopped++; }
  }
  try {
    (globalThis as any).MediaRecorder = Recorder;
    (globalThis as any).MediaStream = class { constructor(_tracks: unknown[]) {} };
    const engine = new Engine(newProject("export", "16:9"));
    engine.addMainClip(video);
    const e = engine as any;
    e.canvas = { captureStream: () => ({
      getVideoTracks: () => [{ stop: () => canvasStopped++ }],
      getTracks: () => [{ stop: () => canvasStopped++ }],
    }) };
    e.audioCtx = {};
    e.exportDest = { stream: { getAudioTracks: () => [{ stop: () => audioStopped++ }] } };
    e.ensureAudio = async () => {};
    e.prepareExportFrame = async () => {};
    e.seek = () => {};
    e.pause = () => { e.playing = false; };
    e.play = async () => { e.playing = true; throw new Error("play rejected"); };
    await assert.rejects(engine.exportMedia({ fps: 30, videoBitsPerSecond: 1000000, audioBitsPerSecond: 128000, scale: 0.5 }, () => {}), /play rejected/);
    assert.equal(canvasStopped, 1);
    assert.equal(audioStopped, 0);
    assert.equal(recorderStopped, 1);
    assert.equal(e.playing, false);
    assert.equal(e.exporting, false);
    assert.equal(e.loop, true);
  } finally {
    (globalThis as any).MediaRecorder = previousRecorder;
    (globalThis as any).MediaStream = previousStream;
  }
});

test("MP4 export closes a partially configured encoder and restores state", async () => {
  const previousWindow = (globalThis as any).window;
  let closed = 0;
  class Encoder {
    static async isConfigSupported() { return { supported: true }; }
    state = "unconfigured";
    configure() { throw new Error("configuration failed"); }
    close() { this.state = "closed"; closed++; }
  }
  try {
    (globalThis as any).window = { VideoEncoder: Encoder, AudioEncoder: Encoder, VideoFrame: class {} };
    const engine = new Engine(newProject("export", "16:9"));
    const e = engine as any;
    e.canvas = {};
    e.audioCtx = { sampleRate: 48000 };
    e.exportDest = {};
    e.ensureAudio = async () => {};
    e.prepareExportFrame = async () => {};
    e.seek = () => {};
    e.pause = () => { e.playing = false; };
    await assert.rejects(engine.exportMP4({ fps: 30, videoBitsPerSecond: 1000000, audioBitsPerSecond: 128000, scale: 0.5 }, () => {}), /configuration failed/);
    assert.equal(closed, 1);
    assert.equal(e.exporting, false);
    assert.equal(e.loop, true);
  } finally {
    (globalThis as any).window = previousWindow;
  }
});

test("unsafe stored proxies cannot replace the original for playback or export", async () => {
  const { sourceFor } = await import("../src/mayocut/proxy");
  assert.equal(sourceFor("preview", "original", "legacy-proxy"), "original");
  assert.equal(sourceFor("export", "original", "legacy-proxy"), "original");
});

test("deleting a stored proxy preserves the original, and deleting media removes both", async () => {
  const item = { ...video, id: "proxy-delete-test" };
  const original = new Blob(["original"]);
  const proxy = new Blob(["proxy"]);
  await db.putMedia(item, original);
  await db.putProxy(item.id, proxy);
  await db.deleteProxy(item.id);
  assert.equal(await (await db.getBlob(item.id))?.text(), "original");
  assert.equal(await db.getProxy(item.id), undefined);
  await db.putProxy(item.id, proxy);
  await db.deleteMedia(item.id);
  assert.equal(await db.getBlob(item.id), undefined);
  assert.equal(await db.getProxy(item.id), undefined);
});

test("built-in sound effects are deterministic, audible and bounded", async () => {
  const { SOUND_LIBRARY, synthesizeSound } = await import("../src/mayocut/sound-library");
  for (const sound of SOUND_LIBRARY) {
    const pcm = synthesizeSound(sound.id);
    assert.equal(pcm.length, Math.round(sound.duration * 44100));
    assert.deepEqual(pcm, synthesizeSound(sound.id));
    assert.ok(pcm[0] === 0);
    assert.ok(pcm[pcm.length - 1] === 0);
    assert.ok(pcm.some((sample) => Math.abs(sample) > 0.05));
    assert.ok(pcm.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1));
  }
});

test("a generated effect can persist with a timeline clip and reopen", async () => {
  const { synthesizeSound } = await import("../src/mayocut/sound-library");
  const { encodeWavMono } = await import("../src/mayocut/denoise");
  const samples = synthesizeSound("clock");
  const wav = encodeWavMono(samples, 44100);
  const item: MediaItem = { id: "builtin-clock-persistence-test", name: "Clock ticks.wav", kind: "audio", size: wav.size, createdAt: 1, duration: samples.length / 44100 };
  const engine = new Engine(newProject("sound persistence", "16:9"));
  const clip = engine.addAudioClip("t_audio", item, 1.25);
  clip.fadeIn = 0;
  clip.fadeOut = 0;
  await db.putMedia(item, wav);
  await db.saveProject(engine.project);
  const restored = await db.getProject(engine.project.id);
  const stored = await db.getBlob(item.id);
  assert.equal(await stored?.slice(0, 4).text(), "RIFF");
  const restoredClip = restored?.tracks.flatMap((track) => track.clips).find((c) => c.id === clip.id);
  assert.equal(restoredClip?.mediaId, item.id);
  assert.equal(restoredClip?.start, 1.25);
  assert.equal(restoredClip?.fadeIn, 0);
  await db.deleteMedia(item.id);
});

test("future proxy metadata validation rejects missing audio and timing drift", async () => {
  const { validateProxyMetadata } = await import("../src/mayocut/proxy-validation");
  const source = { duration: 3, streams: [
    { type: "video" as const, start: 0, duration: 3 },
    { type: "audio" as const, start: 0.02, duration: 2.98, channels: 2, sampleRate: 48000 },
  ] };
  assert.equal(validateProxyMetadata(source, source).ok, true);
  assert.equal(validateProxyMetadata(source, { ...source, streams: [source.streams[0]] }).ok, false);
  assert.equal(validateProxyMetadata(source, { ...source, duration: 2.7 }).ok, false);
  assert.equal(validateProxyMetadata(source, { ...source, streams: [source.streams[0], { ...source.streams[1], start: 0.4 }] }).ok, false);
  assert.equal(validateProxyMetadata(source, { ...source, streams: [source.streams[0], { ...source.streams[1], channels: 1 }] }).ok, false);
  assert.equal(validateProxyMetadata(source, { ...source, streams: [source.streams[0], { ...source.streams[1], duration: NaN }] }).ok, false);
});

test("offline background assets use the requested color and fail safely without a canvas", async () => {
  const { BACKGROUNDS, createBackground } = await import("../src/mayocut/visual-library");
  const previousDocument = (globalThis as any).document;
  const painted: string[] = [];
  try {
    (globalThis as any).document = {
      createElement: () => {
        const context = { fillStyle: "", fillRect: () => painted.push(context.fillStyle) };
        return {
          width: 0, height: 0, getContext: () => context,
          toBlob: (cb: (blob: Blob) => void) => cb(new Blob(["png"], { type: "image/png" })),
          toDataURL: () => "data:image/png;base64,cG5n",
        };
      },
    };
    for (const entry of BACKGROUNDS) {
      const result = await createBackground(entry.id);
      assert.equal(result.blob.type, "image/png");
      assert.equal(painted.at(-1), entry.color);
    }
    (globalThis as any).document = { createElement: () => ({ getContext: () => null }) };
    await assert.rejects(createBackground("white"), /unavailable/);
  } finally {
    (globalThis as any).document = previousDocument;
  }
});

test("video time sticker resolves and renders project time consistently", async () => {
  const { stickerText, FEATURED_STICKERS } = await import("../src/mayocut/stickers");
  const project = newProject("stickers", "16:9");
  const engine = new Engine(project);
  const timer = FEATURED_STICKERS.find((sticker) => sticker.id === "timecode")!;
  const clip = engine.addTextClip("t_text", 59, { text: timer.label, ...timer.patch, bg: "" });
  assert.equal(stickerText(clip, 0), "00:59");
  assert.equal(stickerText(clip, 2), "01:01");
  assert.equal(stickerText(clip, 3542), "1:00:01");
  const drawn: string[] = [];
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    measureText(text: string) { return { width: text.length * 10 }; },
    fillText(text: string) { drawn.push(text); },
  };
  (engine as any).drawText(ctx, clip, 1920, 1080, 1, 2, 5, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
  assert.deepEqual(drawn, ["01:01"]);
  await db.saveProject(engine.project);
  const restored = await db.getProject(engine.project.id);
  assert.equal(restored?.tracks.flatMap((track) => track.clips).find((c) => c.id === clip.id)?.sticker, "timecode");
  assert.equal(FEATURED_STICKERS.find((sticker) => sticker.id === "cat")?.patch.anim, "wave");
});

test("HSL color ranges and master curve change pixels non-destructively", async () => {
  const { advancedGradeActive, applyAdvancedGrade } = await import("../src/mayocut/color-grade");
  const { DEFAULT_ADJUST } = await import("../src/mayocut/types");
  const pixels = new Uint8ClampedArray([255, 0, 0, 201, 0, 0, 255, 255, 128, 128, 128, 120]);
  const neutral = pixels.slice();
  applyAdvancedGrade(neutral, DEFAULT_ADJUST);
  assert.deepEqual(neutral, pixels);
  const adjust = { ...DEFAULT_ADJUST, hsl: { red: { hue: 100, saturation: 0, luminance: 0 } } };
  assert.equal(advancedGradeActive(adjust), true);
  applyAdvancedGrade(pixels, adjust);
  assert.ok(pixels[0] > 240 && pixels[1] > 240 && pixels[2] < 10, "red becomes yellow");
  assert.deepEqual(Array.from(pixels.slice(4, 8)), [0, 0, 255, 255], "blue is unchanged");
  assert.deepEqual(Array.from(pixels.slice(8, 12)), [128, 128, 128, 120], "neutral gray and alpha are unchanged");
  const mid = new Uint8ClampedArray([128, 128, 128, 60]);
  applyAdvancedGrade(mid, { ...DEFAULT_ADJUST, curveMid: 0.75 });
  assert.ok(mid[0] > 180 && mid[0] < 195);
  assert.equal(mid[3], 60);
  const channel = new Uint8ClampedArray([128, 128, 128, 77]);
  const channelGrade = { ...DEFAULT_ADJUST, curveChannels: { red: 0.75 } };
  assert.equal(advancedGradeActive(channelGrade), true);
  applyAdvancedGrade(channel, channelGrade);
  assert.ok(channel[0] > 180 && channel[0] < 195);
  assert.equal(channel[1], 128);
  assert.equal(channel[2], 128);
  assert.equal(channel[3], 77);
  const engine = new Engine(newProject("grade", "16:9"));
  engine.addMainClip(video).adjust = adjust;
  await db.saveProject(engine.project);
  assert.equal((await db.getProject(engine.project.id))?.main[0].adjust.hsl?.red?.hue, 100);
});

test("advanced grading reaches the browser compositor pixel pass", () => {
  const engine = new Engine(newProject("grade render", "16:9"));
  const clip = engine.addMainClip(video);
  clip.adjust = { ...clip.adjust, hsl: { red: { hue: 100, saturation: 0, luminance: 0 } } };
  const image = { data: new Uint8ClampedArray([255, 0, 0, 255]) };
  const offscreen = { filter: "", globalAlpha: 1, clearRect() {}, getImageData: () => image, putImageData() {} };
  const canvas = { width: 0, height: 0, getContext: () => offscreen };
  const previousDocument = (globalThis as any).document;
  try {
    (globalThis as any).document = { createElement: () => canvas };
    (engine as any).paintFit = () => {};
    assert.equal((engine as any).gradeActive(clip.adjust), true);
    (engine as any).drawMainGrade({ drawImage() {} }, {}, 4, 4, clip, null);
    assert.ok(image.data[0] > 240 && image.data[1] > 240 && image.data[2] < 10);
  } finally {
    (globalThis as any).document = previousDocument;
  }
});
