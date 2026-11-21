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
