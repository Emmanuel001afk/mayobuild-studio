// MayoCut engine — client-side playback, compositing and export.
// Runs entirely in the browser (also inside Electron / Capacitor).
// No server, no database: media lives in IndexedDB, export is canvas + WebAudio
// (WebM via MediaRecorder, MP4 via WebCodecs + mp4-muxer).

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import {
  ASPECTS,
  DEFAULT_ADJUST,
  DEFAULT_ANIM,
  fontCss,
  mainClipDuration,
  mainRateAt,
  mainSpans,
  mainSrcAt,
  projectDuration,
  uid,
  type AnimValues,
  type EffectId,
  type FilterAdjust,
  type Keyframe,
  type MainClip,
  type MediaItem,
  type MediaKind,
  type OverlayClip,
  type OverlayTrack,
  type Project,
  type TextPos,
} from "./types";
import { applyLut, type LutTable } from "./luts";
import { makeImpulse, probeGif } from "./utils";
import { GifReader } from "omggif";

/** Decode every frame of a GIF into canvases (capped; null if too big). */
function decodeGifFrames(blob: Blob): Promise<{ frames: CanvasImageSource[]; fps: number } | null> {
  return new Promise((resolve) => {
    if (blob.size > 8 * 1024 * 1024) return resolve(null);
    blob
      .arrayBuffer()
      .then((ab) => {
        const reader = new GifReader(new Uint8Array(ab));
        const count = Math.min(48, reader.numFrames());
        const info = reader.frameInfo(0);
        if (!info || count === 0) return resolve(null);
        if (info.width > 400 || info.height > 400) return resolve(null);
        const frames: CanvasImageSource[] = [];
        let ms = 0;
        for (let k = 0; k < count; k++) {
          const fi = reader.frameInfo(k);
          ms += fi?.delay ?? 0.1;
          const image = new ImageData(info.width, info.height);
          reader.decodeAndBlitFrameRGBA(k, image.data);
          const c = document.createElement("canvas");
          c.width = info.width;
          c.height = info.height;
          c.getContext("2d")?.putImageData(image, 0, 0);
          frames.push(c);
        }
        const fps = ms > 0 ? Math.min(60, Math.max(2, count / (ms / 1000))) : 12;
        resolve({ frames, fps });
      })
      .catch(() => resolve(null));
  });
}

// ---------------------------------------------------------------------------
// Filter presets (rendered via canvas ctx.filter)
// ---------------------------------------------------------------------------
export const FILTER_PRESETS: { id: string; name: string; css: string }[] = [
  { id: "none", name: "Original", css: "" },
  { id: "vivid", name: "Vivid", css: "saturate(1.4) contrast(1.1)" },
  { id: "warm", name: "Warm", css: "sepia(0.25) saturate(1.25) brightness(1.05)" },
  { id: "cool", name: "Cool", css: "hue-rotate(-8deg) saturate(1.15) brightness(1.02)" },
  { id: "bw", name: "B&W", css: "grayscale(1)" },
  { id: "noir", name: "Noir", css: "grayscale(1) contrast(1.35) brightness(0.95)" },
  { id: "vintage", name: "Vintage", css: "sepia(0.4) contrast(1.05) brightness(1.06) saturate(0.85)" },
  { id: "cinema", name: "Cinema", css: "contrast(1.18) saturate(1.12) brightness(0.97)" },
  { id: "soft", name: "Soft", css: "brightness(1.08) saturate(1.06) blur(0.4px)" },
  { id: "punch", name: "Punch", css: "contrast(1.28) saturate(1.45)" },
  { id: "tealorange", name: "Teal & Orange", css: "contrast(1.1) saturate(1.35) sepia(0.14) hue-rotate(-14deg)" },
  { id: "golden", name: "Golden Hour", css: "sepia(0.32) saturate(1.4) brightness(1.06) contrast(1.03)" },
  { id: "faded", name: "Faded", css: "contrast(0.9) brightness(1.07) saturate(0.72) sepia(0.16)" },
  { id: "dreamy", name: "Dreamy", css: "brightness(1.12) saturate(1.18) blur(0.6px)" },
  { id: "moody", name: "Moody", css: "contrast(1.26) brightness(0.88) saturate(0.82)" },
  { id: "pastel", name: "Pastel", css: "brightness(1.09) saturate(1.25) contrast(0.88) hue-rotate(6deg)" },
  { id: "dramatic", name: "Dramatic", css: "contrast(1.38) saturate(1.22) brightness(0.94)" },
  { id: "night", name: "Night", css: "hue-rotate(12deg) saturate(1.08) brightness(0.9) contrast(1.12)" },
  { id: "retro", name: "Retro Film", css: "sepia(0.45) contrast(1.1) saturate(1.25) brightness(1.02) hue-rotate(-6deg)" },
];

export function presetCss(id: string): string {
  return FILTER_PRESETS.find((p) => p.id === id)?.css ?? "";
}

export function buildFilterCss(clip: MainClip): string {
  const parts: string[] = [presetCss(clip.filter)];
  const a = clip.adjust;
  const parts2: string[] = [];
  if (a.brightness !== 100) parts2.push(`brightness(${(a.brightness / 100).toFixed(3)})`);
  if (a.contrast !== 100) parts2.push(`contrast(${(a.contrast / 100).toFixed(3)})`);
  if (a.saturation !== 100) parts2.push(`saturate(${(a.saturation / 100).toFixed(3)})`);
  if (a.hue !== 0) parts2.push(`hue-rotate(${a.hue}deg)`);
  return [...parts, ...parts2].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Keyframes — interpolation of animation values over clip-local time
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function srcW(src: CanvasImageSource): number {
  if (src instanceof HTMLVideoElement) return src.videoWidth;
  if (src instanceof HTMLImageElement) return src.naturalWidth;
  if (src instanceof HTMLCanvasElement) return src.width;
  if (src instanceof ImageBitmap) return src.width;
  return 0;
}
function srcH(src: CanvasImageSource): number {
  if (src instanceof HTMLVideoElement) return src.videoHeight;
  if (src instanceof HTMLImageElement) return src.naturalHeight;
  if (src instanceof HTMLCanvasElement) return src.height;
  if (src instanceof ImageBitmap) return src.height;
  return 0;
}
/** Small stable numeric seed from a string id (deterministic effects). */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 1000;
}

function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Interpolated animation values at clip-local time `t`.
 * Before the first keyframe the base value holds; between keyframes values
 * lerp; after the last keyframe the last value holds.
 */
export function animAt(kfs: Keyframe[] | undefined, base: AnimValues, t: number): AnimValues {
  if (!kfs || kfs.length === 0) return base;
  if (t < kfs[0].at) return base;
  const last = kfs[kfs.length - 1];
  if (t >= last.at) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.at && t < b.at) {
      const span = b.at - a.at;
      const k = span > 0.0001 ? clamp01((t - a.at) / span) : 1;
      return {
        x: lerp(a.v.x, b.v.x, k),
        y: lerp(a.v.y, b.v.y, k),
        scale: lerp(a.v.scale, b.v.scale, k),
        rotation: lerp(a.v.rotation, b.v.rotation, k),
        opacity: lerp(a.v.opacity, b.v.opacity, k),
      };
    }
  }
  return last.v;
}

// ---------------------------------------------------------------------------

type MediaEl = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
type AudioEl = HTMLVideoElement | HTMLAudioElement;

interface FxChain {
  in: GainNode; // dry input
  out: GainNode; // → master
  delay: DelayNode;
  feedback: GainNode;
  conv: ConvolverNode;
  convWet: GainNode;
}

interface ElRecord {
  el: MediaEl;
  url: string;
  sourceNode?: MediaElementAudioSourceNode;
  fx?: FxChain;
  gif?: { frames: CanvasImageSource[]; fps: number };
  audioBuffer?: AudioBuffer;
  bufSrc?: AudioBufferSourceNode;
  bufClip?: { clipId: string; start: number };
  bufStartWall?: number;
  /**
   * The video track can't be decoded on this device (codec, e.g. HEVC
   * camera clips). The <video> stays as a visual placeholder; a shadow
   * <audio> element (same object URL) carries the sound so preview,
   * volume/FX, captions and export-audio keep working.
   */
  videoBroken?: boolean;
  audioFallback?: HTMLAudioElement;
}

export interface ExportOptions {
  fps: number;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
  scale?: 1 | 2; // 2 = 4K render (canvas buffer doubled)
}

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

export function pickMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return { mime, ext: mime.includes("mp4") ? "mp4" : "webm" };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** MP4 path needs WebCodecs (Chrome, Edge, recent Samsung Internet). */
export function mp4Supported(): boolean {
  return (
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined" &&
    typeof (window as unknown as { AudioEncoder?: unknown }).AudioEncoder !== "undefined" &&
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame !== "undefined"
  );
}

const AVC_CANDIDATES = ["avc1.640028", "avc1.640021", "avc1.64001f", "avc1.42002a", "avc1.42001f"];

async function pickAvcCodec(width: number, height: number, fps: number, bitrate: number): Promise<string | null> {
  const Ctor = (window as unknown as { VideoEncoder?: { isConfigSupported: (c: object) => Promise<{ supported: boolean }> } }).VideoEncoder;
  if (!Ctor?.isConfigSupported) return null;
  for (const codec of AVC_CANDIDATES) {
    try {
      const r = await Ctor.isConfigSupported({ codec, width, height, framerate: fps, bitrate });
      if (r.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}

export class Engine {
  project: Project;
  media: Map<string, MediaItem> = new Map();
  els: Map<string, ElRecord> = new Map();
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;

  t = 0;
  playing = false;
  loop = true;
  private raf = 0;
  private lastNow = 0;

  private audioCtx: AudioContext | null = null;
  private master: GainNode | null = null;
  private exportDest: MediaStreamAudioDestinationNode | null = null;

  private chromaCache = new Map<string, HTMLCanvasElement>();
  private keyColorCache = new Map<string, [number, number, number]>();
  private lutCache = new Map<string, LutTable>();
  private lutOff: HTMLCanvasElement | null = null;
  private vhsPattern: HTMLCanvasElement | null = null;
  private impulse: AudioBuffer | null = null;

  /**
   * Hit rectangles of the overlays drawn in the last draw() — canvas-space
   * pixels, in draw order. Used by pickOverlayAt() so "drag the text on the
   * preview" hit-tests the exact pixels that were painted.
   */
  private overlayRects: { clipId: string; x: number; y: number; w: number; h: number }[] = [];

  /** 1 = canvas native, 2 = 4K (export only; draw() resizes the buffer). */
  exportScale = 1;

  /** True while an export is rendering — placeholders draw plain black
   *  (no "loading…" text baked into the exported video). */
  exporting = false;

  /**
   * Live-preview stabilization (from device.ts): longest canvas buffer side
   * allowed for the preview, in pixels. 0 = no cap (full quality). Export
   * always renders at full quality — the export paths temporarily clear this.
   */
  previewMaxSide = 0;

  setLuts(map: Map<string, LutTable>) {
    this.lutCache = map;
  }

  /** Decode a media blob to an AudioBuffer (cached) — used by pitch FX + captions. */
  async audioBuffer(mediaId: string): Promise<AudioBuffer | null> {
    const rec = this.els.get(mediaId);
    if (rec?.audioBuffer) return rec.audioBuffer;
    if (!rec?.url || !this.audioCtx) return null;
    try {
      const blob = await fetch(rec.url).then((r) => r.blob());
      const buf = await this.audioCtx.decodeAudioData(await blob.arrayBuffer());
      rec.audioBuffer = buf;
      return buf;
    } catch {
      return null;
    }
  }

  getMedia(mediaId: string): MediaItem | undefined {
    return this.media.get(mediaId);
  }

  /** Public span view (used by the captions module). */
  mainSpansPublic() {
    return mainSpans(this.project);
  }

  /** bump whenever the document mutates, so React can autosave/refresh */
  version = 0;
  onVersion: (() => void) | null = null;
  onTime: ((t: number) => void) | null = null;
  onPlayingChange: ((playing: boolean) => void) | null = null;

  constructor(project: Project) {
    this.project = project;
  }

  // ------------------------------------------------------------------ media

  setMedia(items: MediaItem[]) {
    this.media = new Map(items.map((m) => [m.id, m]));
  }

  private ensureEl(media: MediaItem): ElRecord {
    const rec = this.els.get(media.id);
    if (rec) return rec;
    let el: MediaEl;
    if (media.kind === "video") {
      el = document.createElement("video");
      const v = el as HTMLVideoElement;
      v.preload = "auto";
      v.playsInline = true;
    } else if (media.kind === "audio") {
      el = document.createElement("audio");
      (el as HTMLAudioElement).preload = "auto";
    } else {
      el = document.createElement("img");
    }
    // Object URLs are resolved from the IndexedDB blob by the host app and
    // handed over via attachUrl().
    const record: ElRecord = { el, url: "" };
    this.els.set(media.id, record);
    this.routeEl(record, media.id);
    return record;
  }

  attachUrl(mediaId: string, url: string) {
    const media = this.media.get(mediaId);
    if (!media) return;
    const rec = this.ensureEl(media);
    rec.url = url;
    this.chromaCache.forEach((c, k) => {
      // invalidate cached keyframes-of-keycolor when a media element changes
      void c;
      if (this.clipUsingMedia(k, mediaId)) {
        this.chromaCache.delete(k);
        this.keyColorCache.delete(k);
      }
    });
    if (rec.el instanceof HTMLImageElement) {
      rec.el.src = url;
    } else {
      (rec.el as HTMLVideoElement).src = url;
    }
    if (media.kind === "video") {
      const v = rec.el as HTMLVideoElement;
      v.addEventListener("loadedmetadata", () => {
        if (media.duration == null) {
          media.duration = isFinite(v.duration) ? v.duration : 0;
          this.bump();
        }
      });
      // Decode failure (e.g. HEVC on a WebView without HEVC) can arrive as an
      // error event or as a silent stall — watch for both.
      v.addEventListener("error", () => this.markVideoBroken(media.id, "video error event"));
      const watchdog = window.setTimeout(() => {
        const r2 = this.els.get(media.id);
        if (!r2) return;
        if (!r2.videoBroken && (r2.el as HTMLVideoElement).readyState < 2) {
          this.markVideoBroken(media.id, "no decoded frame after 8 s (codec not supported on this device?)");
        }
      }, 8000);
      v.addEventListener("canplay", () => window.clearTimeout(watchdog), { once: true });
      v.addEventListener("error", () => window.clearTimeout(watchdog), { once: true });
    }
    if (media.isGif && !rec.gif) {
      // decode all frames once (capped size) so stickers animate on the canvas
      void fetch(url)
        .then((r) => r.blob())
        .then((blob) => decodeGifFrames(blob))
        .then((frames) => {
          const rec2 = this.els.get(mediaId);
          if (frames && rec2 && frames.frames.length > 0) {
            rec2.gif = frames;
            this.bump();
          }
        })
        .catch(() => undefined);
    }
  }

  /** A video track can't be decoded here: switch its sound to a shadow
   *  <audio> element so the editor stays fully usable (audio, captions,
   *  export audio) while the preview shows a clear placeholder. */
  private markVideoBroken(mediaId: string, why: string) {
    const rec = this.els.get(mediaId);
    if (!rec || rec.videoBroken) return;
    rec.videoBroken = true;
    console.warn(`[mayocut] video not playable on this device — ${why}: ${this.media.get(mediaId)?.name ?? mediaId}`);
    // The <video>'s own audio path must go quiet (it can't render anyway);
    // the shadow element takes over the WebAudio routing.
    if (rec.sourceNode) {
      try {
        rec.sourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
      rec.sourceNode = undefined;
    }
    const a = document.createElement("audio");
    a.preload = "auto";
    a.src = rec.url;
    rec.audioFallback = a;
    this.routeEl(rec, mediaId, a);
    this.bump();
    this.draw();
  }

  /** Is a video's track undecodable on this device (runtime-confirmed)? */
  isVideoBroken(mediaId: string): boolean {
    return this.els.get(mediaId)?.videoBroken ?? false;
  }

  private clipUsingMedia(clipId: string, mediaId: string): boolean {
    if (this.project.main.some((c) => c.id === clipId && c.mediaId === mediaId)) return true;
    for (const tr of this.project.tracks) if (tr.clips.some((c) => c.id === clipId && c.mediaId === mediaId)) return true;
    return false;
  }

  private audioEl(mediaId: string): AudioEl | undefined {
    const media = this.media.get(mediaId);
    if (!media || media.kind === "image") return undefined;
    const rec = this.ensureEl(media);
    if (rec.videoBroken && rec.audioFallback) return rec.audioFallback;
    return rec.el as AudioEl;
  }

  // ------------------------------------------------- audio FX (reverb/echo)
  // Every media element's source node flows through a per-media FX chain
  // (dry + delay/feedback echo + convolution reverb) before the master gain,
  // so effects apply to live preview *and* export alike.

  private ensureFx(mediaId: string): FxChain | null {
    const ctx = this.audioCtx;
    if (!ctx) return null;
    const rec = this.els.get(mediaId);
    if (rec?.fx) return rec.fx;
    const inNode = ctx.createGain();
    const out = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0;
    const conv = ctx.createConvolver();
    if (!this.impulse) this.impulse = makeImpulse(ctx);
    conv.buffer = this.impulse;
    const convWet = ctx.createGain();
    convWet.gain.value = 0;
    inNode.connect(out); // dry
    inNode.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(out);
    inNode.connect(conv);
    conv.connect(convWet);
    convWet.connect(out);
    out.connect(this.master!);
    const chain: FxChain = { in: inNode, out, delay, feedback, conv, convWet };
    if (rec) {
      if (rec.sourceNode) {
        try {
          rec.sourceNode.disconnect();
          rec.sourceNode.connect(inNode);
        } catch {
          /* node may be unconnected */
        }
      }
      rec.fx = chain;
    }
    return chain;
  }

  /**
   * Route a media element into the WebAudio FX chain exactly once.
   *
   * Every audible element MUST go through WebAudio: once routed, the
   * element's audio can never also leak out the native output (which is how
   * "double audio" / echo happens on Android Chromium when an element plays
   * both ways). Elements created BEFORE the AudioContext exists are
   * back-filled by the syncElements sweep — without that, clips added after
   * the first play would bypass volume/FX AND be silent in exports.
   */
  private routeEl(rec: ElRecord, mediaId: string, target?: AudioEl) {
    const ctx = this.audioCtx;
    const el = target ?? (rec.el as AudioEl);
    if (!ctx || el instanceof HTMLImageElement || rec.sourceNode) return;
    try {
      rec.sourceNode = ctx.createMediaElementSource(el);
      rec.sourceNode.connect(this.ensureFx(mediaId)!.in);
    } catch {
      /* element already routed elsewhere — ignore */
    }
  }

  /**
   * Decode a source segment [inS, outS) of a media's embedded audio to mono.
   * Powers "Extract audio" (CapCut-style detach). On-device limit: sources
   * up to ~15 min (decodeAudioData needs the whole file in memory).
   */
  async extractAudioWav(
    mediaId: string,
    inS: number,
    outS: number
  ): Promise<{ samples: Float32Array; sampleRate: number; duration: number } | null> {
    if (!this.audioBufferAllowed(mediaId)) return null;
    await this.ensureAudio();
    const buf = await this.audioBuffer(mediaId);
    if (!buf) return null;
    const sr = buf.sampleRate;
    const start = Math.max(0, Math.floor(inS * sr));
    const end = Math.min(buf.length, Math.ceil(outS * sr));
    if (end - start < sr * 0.15) return null;
    const n = end - start;
    const chs = buf.numberOfChannels;
    const out = new Float32Array(n);
    for (let c = 0; c < chs; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += d[start + i] / chs;
    }
    return { samples: out, sampleRate: sr, duration: n / sr };
  }

  /** On-device memory guard for full-file audio decode. */
  private audioBufferAllowed(mediaId: string): boolean {
    const m = this.media.get(mediaId);
    if (!m) return false;
    if (m.duration == null) return true; // unknown length — let decode decide
    return m.duration <= 15 * 60;
  }

  /** Apply the active clip's FX to its media chain (no-op when nothing is active). */
  private syncFx() {
    const t = this.t;
    const active = new Map<string, { reverb: number; echo: number }>();
    for (const tr of this.project.tracks)
      for (const c of tr.clips) {
        if (c.kind !== "audio" || !c.mediaId) continue;
        if (t >= c.start && t < c.start + c.duration) {
          active.set(c.mediaId, {
            reverb: clamp01(c.fx?.reverb ?? 0),
            echo: clamp01(c.fx?.echo ?? 0),
          });
        }
      }
    for (const [id, rec] of this.els) {
      if (!rec.el || rec.el instanceof HTMLImageElement) continue;
      const fx = this.ensureFx(id);
      if (!fx) continue;
      const a = active.get(id);
      const reverb = a?.reverb ?? 0;
      const echo = a?.echo ?? 0;
      fx.delay.delayTime.value = 0.22 + 0.18 * echo;
      fx.feedback.gain.value = echo > 0 ? 0.45 * echo : 0;
      fx.convWet.gain.value = reverb;
      // pull dry down slightly when wet is hot to avoid clipping
      fx.in.gain.value = 1 - 0.35 * Math.max(reverb, echo);
    }
  }

  /** Pitch-shifted playback of a short overlay audio clip via buffer source. */
  private async startBufferSource(c: OverlayClip, local: number) {
    if (!this.audioCtx) return;
    const mediaId = c.mediaId!;
    const rec = this.els.get(mediaId);
    if (!rec) return;
    if (
      rec.bufSrc &&
      rec.bufClip?.clipId === c.id &&
      Math.abs((rec.bufClip.start + (this.audioCtx.currentTime - (rec.bufStartWall ?? 0))) - local) < 0.4
    )
      return; // still the same clip, close enough — keep playing
    this.stopBufSource(mediaId);
    const buf = rec.audioBuffer ?? (await this.audioBuffer(mediaId));
    if (!buf || !rec.fx) return;
    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    src.detune.value = Math.max(-1200, Math.min(1200, (c.fx?.pitch ?? 0) * 100));
    src.connect(rec.fx.in);
    rec.bufSrc = src;
    rec.bufClip = { clipId: c.id, start: c.start };
    rec.bufStartWall = this.audioCtx.currentTime;
    try {
      src.start(0, Math.min(local, buf.duration));
    } catch {
      /* overlapping start — ignore */
    }
  }

  private stopBufSource(mediaId: string) {
    const rec = this.els.get(mediaId);
    if (rec?.bufSrc) {
      try {
        rec.bufSrc.onended = null;
        rec.bufSrc.stop();
      } catch {
        /* already stopped */
      }
      rec.bufSrc = undefined;
      rec.bufClip = undefined;
    }
  }

  // ------------------------------------------------------------- timebase

  duration(): number {
    return projectDuration(this.project);
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.duration(), t));
    this.syncElements(true);
    this.draw();
    this.onTime?.(this.t);
  }

  async play() {
    if (this.playing) return;
    if (this.duration() === 0) return;
    await this.ensureAudio();
    if (this.t >= this.duration() - 0.02) this.t = 0;
    this.playing = true;
    this.lastNow = performance.now();
    this.onPlayingChange?.(true);
    this.syncElements(true);
    const els = this.activeAudioEls();
    for (const e of els) if (!e.clipReverse) void e.el.play().catch(() => undefined);
    this.loopRaf();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const rec of this.els.values()) {
      const e = rec.el as Partial<AudioEl>;
      if (e && !e.paused) e.pause?.();
      if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
    }
    this.onPlayingChange?.(false);
    this.draw();
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  private loopRaf() {
    cancelAnimationFrame(this.raf);
    const step = (now: number) => {
      if (!this.playing) return;
      const dt = Math.min(0.25, (now - this.lastNow) / 1000);
      this.lastNow = now;
      this.t += dt;
      const dur = this.duration();
      if (this.t >= dur) {
        if (this.loop && dur > 0) {
          this.t = 0;
          this.syncElements(true);
        } else {
          this.t = dur;
          this.playing = false;
          for (const rec of this.els.values()) {
            const e = rec.el as Partial<AudioEl>;
            if (e && !e.paused) e.pause?.();
            if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
          }
          this.onPlayingChange?.(false);
          this.draw();
          this.onTime?.(this.t);
          return;
        }
      }
      this.syncElements(false);
      this.draw();
      this.onTime?.(this.t);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /**
   * Glue media elements to the timeline clock.
   * Reverse clips: the element is held paused and re-seeked to the mirrored
   * source position every frame (its audio is muted — see effectiveVolume).
   */
  private syncElements(hard: boolean) {
    // Back-fill WebAudio routing for any element created before the
    // AudioContext existed (see routeEl) — single-pass audio, always.
    if (this.audioCtx) {
      for (const [id, rec] of this.els) {
        if (rec.videoBroken && rec.audioFallback) this.routeEl(rec, id, rec.audioFallback);
        else this.routeEl(rec, id);
      }
    }
    const spans = mainSpans(this.project);
    const t = this.t;
    const activeIds = new Set<string>();
    for (const s of spans) {
      const winStart = s.clip.transitionIn !== "none" ? s.start - s.clip.transitionDur : s.start;
      const active = t >= winStart && t < s.end + 0.001;
      if (!active) continue;
      activeIds.add(s.clip.mediaId);
      const rec = this.els.get(s.clip.mediaId);
      const el = this.audioEl(s.clip.mediaId);
      if (!el) continue;
      if (el instanceof HTMLVideoElement || rec?.videoBroken) {
        const local = mainSrcAt(s.clip, t - s.start);
        if (Math.abs(el.currentTime - local) > (hard ? 0.08 : 0.2)) {
          try {
            el.currentTime = Math.max(0, local);
          } catch {
            /* not seekable yet */
          }
        }
        el.playbackRate = mainRateAt(s.clip, t - s.start);
        el.volume = this.effectiveVolume(s.clip, t, s);
        if (s.clip.reverse) {
          if (!el.paused) el.pause();
        } else if (this.playing && el.paused) {
          void el.play().catch(() => undefined);
        }
      } else if (!this.playing && !el.paused) {
        el.pause();
      }
    }
    // overlay audio clips
    for (const tr of this.project.tracks) {
      for (const c of tr.clips) {
        if (c.kind === "audio") {
          if (!c.mediaId) continue;
          if (t >= c.start && t < c.start + c.duration) {
            activeIds.add(c.mediaId);
            const el = this.audioEl(c.mediaId);
            if (!el) continue;
            const local = t - c.start;
            const pitch = c.fx?.pitch ?? 0;
            const media = this.media.get(c.mediaId);
            const md = media?.duration ?? 0;
            const canPitch =
              pitch !== 0 && this.playing && !!media && md > 0 && md <= 120 && !!this.audioCtx;
            if (canPitch) {
              // duration-preserving pitch via AudioBufferSourceNode.detune —
              // the element itself goes silent while this is running
              el.volume = 0;
              if (!el.paused) el.pause();
              void this.startBufferSource(c, local);
            } else {
              this.stopBufSource(c.mediaId);
              if (Math.abs(el.currentTime - local) > (hard ? 0.08 : 0.2)) {
                try {
                  el.currentTime = Math.max(0, local);
                } catch {
                  /* ignore */
                }
              }
              el.volume = this.overlayAudioVolume(c, t);
              if (this.playing && el.paused) void el.play().catch(() => undefined);
            }
          }
        } else if (c.kind === "video" && c.mediaId) {
          // picture sticker from a video: frame-synced, always silent
          if (t >= c.start && t < c.start + c.duration) {
            activeIds.add(c.mediaId);
            const el = this.audioEl(c.mediaId);
            if (el instanceof HTMLVideoElement) {
              const local = t - c.start;
              if (Math.abs(el.currentTime - local) > (hard ? 0.08 : 0.2)) {
                try {
                  el.currentTime = Math.max(0, local);
                } catch {
                  /* ignore */
                }
              }
              el.playbackRate = 1;
              el.volume = 0;
              if (this.playing && el.paused) void el.play().catch(() => undefined);
            }
          }
        }
      }
    }
    this.syncFx();
    // pause everything else
    for (const [id, rec] of this.els) {
      if (activeIds.has(id)) continue;
      const e = rec.el as Partial<AudioEl>;
      if (e && !e.paused) e.pause?.();
      if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
    }
  }

  private activeAudioEls(): { el: AudioEl; clipReverse: boolean }[] {
    const spans = mainSpans(this.project);
    const out: { el: AudioEl; clipReverse: boolean }[] = [];
    const t = this.t;
    for (const s of spans) {
      const winStart = s.clip.transitionIn !== "none" ? s.start - s.clip.transitionDur : s.start;
      if (t >= winStart && t < s.end) {
        const el = this.audioEl(s.clip.mediaId);
        if (el) out.push({ el, clipReverse: !!s.clip.reverse });
      }
    }
    for (const tr of this.project.tracks)
      for (const c of tr.clips)
        if (
          (c.kind === "audio" || c.kind === "video") &&
          c.mediaId &&
          t >= c.start &&
          t < c.start + c.duration
        ) {
          const el = this.audioEl(c.mediaId);
          if (el) out.push({ el, clipReverse: c.kind === "video" });
        }
    return out;
  }

  private effectiveVolume(clip: MainClip, t: number, s: { start: number; end: number }): number {
    if (clip.reverse) return 0; // reversed playback is silent (frame-stepped)
    let v = clip.muted ? 0 : clip.volume;
    if (clip.transitionIn !== "none" && t < s.start && clip.transitionDur > 0) {
      const k = (t - (s.start - clip.transitionDur)) / clip.transitionDur;
      v *= Math.max(0, Math.min(1, k));
    }
    if (s.end - t < 0.3 && clip.transitionIn === "none") v *= Math.max(0, Math.min(1, (s.end - t) / 0.3));
    return Math.max(0, Math.min(1, v));
  }

  private overlayAudioVolume(c: OverlayClip, t: number): number {
    const fadeIn = c.fadeIn ?? 0.15;
    const fadeOut = c.fadeOut ?? 0.15;
    const inT = t - c.start;
    const outT = c.start + c.duration - t;
    let v = c.volume ?? 1;
    if (fadeIn > 0) v *= clamp01(inT / fadeIn);
    if (fadeOut > 0) v *= clamp01(outT / fadeOut);
    return Math.max(0, Math.min(1, v));
  }

  // ------------------------------------------------------------- audio graph

  private async ensureAudio() {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") {
        try {
          await this.audioCtx.resume();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctor();
      this.master = this.audioCtx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.audioCtx.destination);
      this.exportDest = this.audioCtx.createMediaStreamDestination();
      this.master.connect(this.exportDest);
      for (const [id, rec] of this.els) {
        if (rec.el instanceof HTMLImageElement) continue;
        if (rec.sourceNode) continue;
        try {
          rec.sourceNode = this.audioCtx.createMediaElementSource(rec.el as AudioEl);
          rec.sourceNode.connect(this.ensureFx(id)!.in);
        } catch {
          /* element already routed elsewhere — ignore */
        }
      }
    } catch {
      this.audioCtx = null;
    }
  }

  // ------------------------------------------------------------- compositing

  bind(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const a = ASPECTS[this.project.aspect];
    canvas.width = a.w;
    canvas.height = a.h;
    this.ctx = canvas.getContext("2d");
    this.draw();
  }

  setAspect(aspect: Project["aspect"]) {
    this.project.aspect = aspect;
    this.bump();
    if (this.canvas) {
      const a = ASPECTS[aspect];
      this.canvas.width = a.w;
      this.canvas.height = a.h;
      this.draw();
    }
  }

  /** Base animation values for a clip (used when a param has no keyframes). */
  animBase(clip: MainClip | OverlayClip): AnimValues {
    if ("kind" in clip && (clip.kind === "image" || clip.kind === "video")) {
      return { x: clip.x ?? 0, y: clip.y ?? 0, scale: clip.scale ?? 0.5, rotation: clip.rot ?? 0, opacity: 1 };
    }
    if ("kind" in clip && clip.kind === "text") {
      // free positioning: base x/y (drag on the preview, or the sliders),
      // pos grid stays the anchor point they offset from
      return { x: clip.x ?? 0, y: clip.y ?? 0, scale: 1, rotation: 0, opacity: 1 };
    }
    return { ...DEFAULT_ANIM };
  }

  /** Which track holds a given overlay clip? */
  overlayTrackOf(clipId: string): string | null {
    for (const tr of this.project.tracks) {
      if (tr.clips.some((c) => c.id === clipId)) return tr.id;
    }
    return null;
  }

  /**
   * Free placement of a text/image/video overlay (canvas fractions of the
   * half-width/height from center, as painted). Clamped so nothing can be
   * dragged further than 50% of the canvas away from center.
   */
  setOverlayFreePos(clipId: string, x: number, y: number) {
    const tr = this.project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
    const c = tr?.clips.find((c) => c.id === clipId);
    if (!c || (c.kind !== "text" && c.kind !== "image" && c.kind !== "video")) return;
    const cl = (v: number) => Math.max(-1.5, Math.min(1.5, v));
    c.x = cl(x);
    c.y = cl(y);
    this.bump();
    this.draw();
  }

  /**
   * Hit-test the overlays painted in the last draw(). x/y are canvas-space
   * pixels (i.e. in [0, canvas.width] × [0, canvas.height]). Returns the
   * topmost clip id under the point, or null.
   */
  pickOverlayAt(x: number, y: number): string | null {
    for (let i = this.overlayRects.length - 1; i >= 0; i--) {
      const r = this.overlayRects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.clipId;
    }
    return null;
  }

  /** Remove every clip (main + all overlay tracks) that references a media id. */
  dropMediaRefs(mediaId: string): number {
    let n = 0;
    const before = this.project.main.length;
    this.project.main = this.project.main.filter((c) => c.mediaId !== mediaId);
    n += before - this.project.main.length;
    for (const tr of this.project.tracks) {
      const b = tr.clips.length;
      tr.clips = tr.clips.filter((c) => c.mediaId !== mediaId);
      n += b - tr.clips.length;
    }
    if (n) this.bump();
    return n;
  }

  /** Interpolated animation values at the playhead for a clip. */
  animAtPlayhead(clip: MainClip | OverlayClip, clipStart: number): AnimValues {
    const local = Math.max(0, Math.min(this.duration(), this.t) - clipStart);
    return animAt(clip.keyframes, this.animBase(clip), local);
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    const base = ASPECTS[this.project.aspect];
    // exportScale is the export multiplier (1 or 2). previewMaxSide caps the
    // LIVE preview buffer on weak devices (0 = no cap; cleared while exporting
    // so exports always render at full quality).
    const maxSide = Math.max(base.w, base.h);
    const cap = this.previewMaxSide > 0 ? Math.min(1, this.previewMaxSide / maxSide) : 1;
    const k = this.exportScale * cap;
    const W = Math.max(2, Math.round(base.w * k));
    const H = Math.max(2, Math.round(base.h * k));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const t = this.t;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // --- main track (with transitions) ---
    const spans = mainSpans(this.project);
    type DrawItem = { s: (typeof spans)[number]; alpha: number };
    const items: DrawItem[] = [];
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      const c = s.clip;
      const winStart = c.transitionIn !== "none" ? s.start - c.transitionDur : s.start;
      if (t < winStart || t >= s.end + 0.001) continue;
      if (c.transitionIn === "crossfade" && t < s.start && c.transitionDur > 0) {
        const k = clamp01((t - (s.start - c.transitionDur)) / c.transitionDur);
        if (i > 0) items.push({ s: spans[i - 1], alpha: 1 - k });
        items.push({ s, alpha: k });
      } else if (c.transitionIn === "fadeblack" && t < s.start && c.transitionDur > 0) {
        // true dip-to-black: previous clip fades to black in the first half,
        // the new one fades in from black in the second half
        const k = clamp01((t - (s.start - c.transitionDur)) / c.transitionDur);
        if (k < 0.5) {
          if (i > 0) items.push({ s: spans[i - 1], alpha: 1 - 2 * k });
        } else {
          items.push({ s, alpha: 2 * k - 1 });
        }
      } else {
        items.push({ s, alpha: 1 });
      }
    }
    for (const { s, alpha } of items) {
      this.drawMainItem(ctx, s, alpha, W, H, t);
    }

    // --- overlay tracks ---
    this.overlayRects.length = 0;
    for (const tr of this.project.tracks) {
      for (const c of tr.clips) {
        if (t < c.start || t >= c.start + c.duration) continue;
        const localT = t - c.start;
        const rampIn = Math.min(1, localT / 0.4);
        const rampOut = Math.min(1, (c.start + c.duration - t) / 0.3);
        const fadeAlpha = c.anim === "none" ? 1 : rampIn * rampOut;
        const anim = animAt(c.keyframes, this.animBase(c), localT);
        if (c.kind === "text")
          this.drawText(ctx, c, W, H, fadeAlpha * clamp01(anim.opacity), localT, c.duration, anim);
        if ((c.kind === "image" || c.kind === "video") && c.mediaId) {
          const rec = this.els.get(c.mediaId);
          if (!rec || !rec.url) continue;
          // GIF stickers: step through decoded frames at their native fps
          let src = rec.el as CanvasImageSource;
          if (rec.gif && rec.gif.frames.length > 0) {
            src = rec.gif.frames[Math.floor(localT * rec.gif.fps) % rec.gif.frames.length];
          }
          const sw = srcW(src);
          const sh = srcH(src);
          if (!sw || !sh) continue;
          const size = Math.max(1, anim.scale * W);
          const ar = sw / sh;
          const cx = W / 2 + anim.x * (W / 2);
          const cy = H / 2 + anim.y * (H / 2);
          this.overlayRects.push({
            clipId: c.id,
            x: cx - size / 2,
            y: cy - size / (2 * ar),
            w: size,
            h: size / ar,
          });
          const rot = (anim.rotation * Math.PI) / 180;
          const alpha = clamp01(fadeAlpha * anim.opacity);
          const blend: GlobalCompositeOperation | null =
            c.blend && c.blend !== "normal" ? (c.blend as GlobalCompositeOperation) : null;
          if (c.chroma && sw * sh > 4) {
            this.drawChroma(
              ctx,
              rec.el as HTMLVideoElement | HTMLImageElement,
              c,
              size,
              ar,
              alpha,
              cx,
              cy,
              rot,
              blend,
            );
          } else {
            ctx.save();
            ctx.globalAlpha = alpha;
            if (blend) ctx.globalCompositeOperation = blend;
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            if (c.mask && c.mask !== "none") this.applyMask(ctx, c.mask, size, ar);
            ctx.drawImage(src, -size / 2, -size / (2 * ar), size, size / ar);
            ctx.restore();
          }
        }
      }
    }

    ctx.restore();
  }

  // ------------------------------------------------------------ main render

  private drawMainItem(
    ctx: CanvasRenderingContext2D,
    s: { clip: MainClip; start: number; end: number },
    alpha: number,
    W: number,
    H: number,
    t: number,
  ) {
    const c = s.clip;
    const rec = this.els.get(c.mediaId);
    const localT = t - s.start;
    const anim = animAt(c.keyframes, DEFAULT_ANIM, localT);
    const a = clamp01(alpha * anim.opacity);
    if (!rec || !rec.url) {
      this.drawPlaceholder(ctx, W, H, c.mediaId, a);
      return;
    }
    const el = rec.el;
    if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) {
      const ready = el instanceof HTMLImageElement || (el.readyState >= 2 && el.videoWidth > 0);
      if (!ready) {
        this.drawPlaceholder(ctx, W, H, c.mediaId, a, rec.videoBroken);
        return;
      }
    } else {
      this.drawPlaceholder(ctx, W, H, c.mediaId, a, rec.videoBroken);
      return;
    }
    const eff: EffectId = c.effect ?? "none";
    const ef = this.effectTransform(c, localT, W, H, mainClipDuration(c));

    ctx.save();
    ctx.globalAlpha = a;
    let filterCss = buildFilterCss(c);
    if (eff === "blur-in") {
      const ramp = clamp01(localT / 0.45);
      const px = Math.round((1 - ramp) * H * 0.018 * 10) / 10;
      if (px > 0.05) filterCss = (filterCss + ` blur(${px}px)`).trim();
    }
    ctx.filter = filterCss;
    if (anim.x !== 0 || anim.y !== 0 || anim.scale !== 1 || anim.rotation !== 0) {
      ctx.translate(W / 2 + anim.x * (W / 2), H / 2 + anim.y * (H / 2));
      ctx.rotate((anim.rotation * Math.PI) / 180);
      ctx.scale(anim.scale, anim.scale);
      ctx.translate(-W / 2, -H / 2);
    }
    if (ef.scale !== 1 || ef.rot !== 0 || ef.tx !== 0 || ef.ty !== 0) {
      ctx.translate(W / 2 + ef.tx, H / 2 + ef.ty);
      ctx.rotate(ef.rot);
      ctx.scale(ef.scale, ef.scale);
      ctx.translate(-W / 2, -H / 2);
    }

    const lut = c.lut ? this.lutCache.get(c.lut) : null;
    const glitching = eff === "glitch" && this.glitchWindow(localT);
    if (lut) {
      this.drawMainLut(ctx, el, W, H, lut);
    } else if (glitching || eff === "vhs") {
      this.drawMainSliced(ctx, el, W, H, glitching, localT);
    } else {
      this.drawImageCover(ctx, el, W, H);
    }

    if (eff === "flash-in") {
      const k = 1 - clamp01(localT / 0.18);
      if (k > 0.01) {
        ctx.globalAlpha = a * k * 0.85;
        ctx.fillStyle = "#fff";
        ctx.fillRect(-W, -H, W * 3, H * 3);
        ctx.globalAlpha = a;
      }
    }
    if (eff === "vhs") {
      ctx.globalAlpha = a * 0.5;
      const pat = this.vhsPatternLazy;
      if (pat) {
        try {
          ctx.globalCompositeOperation = "source-over";
          const p = ctx.createPattern(pat, "repeat");
          if (p) {
            ctx.globalAlpha = a * 0.35;
            ctx.fillStyle = p;
            ctx.fillRect(0, 0, W, H);
          }
        } catch {
          /* pattern failed */
        }
      }
      ctx.globalAlpha = a * (0.05 + 0.02 * Math.sin(localT * 30));
      ctx.fillStyle = "rgba(80,200,255,0.25)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
    }
    ctx.restore();
  }

  /** Deterministic per-clip motion-effect transform (seeded by clip id). */
  private effectTransform(
    c: MainClip,
    localT: number,
    W: number,
    H: number,
    dur: number,
  ): { tx: number; ty: number; scale: number; rot: number } {
    const r = { tx: 0, ty: 0, scale: 1, rot: 0 };
    switch (c.effect ?? "none") {
      case "zoom-pulse":
        r.scale = 1.04 + 0.05 * Math.sin((localT / 0.6) * Math.PI * 2);
        break;
      case "heartbeat": {
        const t0 = localT % 0.95;
        const bump =
          Math.pow(Math.max(0, Math.sin((t0 / 0.32) * Math.PI)), 3) +
          0.55 * Math.pow(Math.max(0, Math.sin(((t0 - 0.18) / 0.3) * Math.PI)), 3);
        r.scale = 1 + 0.045 * bump;
        break;
      }
      case "shake": {
        const seed = hashId(c.id);
        const m = H * 0.006;
        r.tx = Math.sin(localT * 31 + seed) * m;
        r.ty = Math.cos(localT * 27 + seed * 2) * m;
        r.rot = Math.sin(localT * 19 + seed) * 0.008;
        break;
      }
      case "spin":
        r.rot = (localT / Math.max(0.001, dur)) * Math.PI * 2;
        break;
      default:
        break;
    }
    return r;
  }

  /** Glitch bursts: ~70 ms window every ~500 ms, deterministic per clip. */
  private glitchWindow(localT: number): boolean {
    const seed = (hashId("g") + (localT * 10) | 0);
    void seed;
    const p = localT % 0.5;
    return p < 0.07 || (p > 0.31 && p < 0.36);
  }

  /** Horizontal-slice draw (glitch bursts / VHS wobble) with cover geometry. */
  private drawMainSliced(
    ctx: CanvasRenderingContext2D,
    el: HTMLVideoElement | HTMLImageElement,
    W: number,
    H: number,
    hard: boolean,
    localT: number,
  ) {
    const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
    if (!sw || !sh) return;
    const seed = hashId(el instanceof HTMLVideoElement ? "v" : "i");
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    const slices = hard ? 7 : 4;
    const amp = hard ? W * 0.03 : W * 0.004;
    for (let i = 0; i < slices; i++) {
      const sy = (dh / slices) * i;
      const shh = dh / slices + 1;
      const jitter = Math.sin(localT * (60 + i * 7) + seed * (i + 1)) * amp * (hard ? 1 : 0.4);
      ctx.drawImage(el, 0, (sy / dh) * sh, sw, (shh / dh) * sh, dx + jitter, dy + sy, dw, shh);
    }
  }

  /** LUT pass: render the clip to a reduced offscreen canvas, map, upscale. */
  private drawMainLut(
    ctx: CanvasRenderingContext2D,
    el: HTMLVideoElement | HTMLImageElement,
    W: number,
    H: number,
    lut: LutTable,
  ) {
    const s = Math.min(1, 1280 / Math.max(W, H));
    const W2 = Math.max(4, Math.round(W * s));
    const H2 = Math.max(4, Math.round(H * s));
    if (!this.lutOff) this.lutOff = document.createElement("canvas");
    if (this.lutOff.width !== W2 || this.lutOff.height !== H2) {
      this.lutOff.width = W2;
      this.lutOff.height = H2;
    }
    const octx = this.lutOff.getContext("2d", { willReadFrequently: true });
    if (!octx) {
      this.drawImageCover(ctx, el, W, H);
      return;
    }
    octx.filter = "none";
    octx.globalAlpha = 1;
    octx.drawImage(el, 0, 0, W2, H2);
    const img = octx.getImageData(0, 0, W2, H2);
    applyLut(lut, img.data);
    octx.putImageData(img, 0, 0);
    ctx.drawImage(this.lutOff, 0, 0, W, H);
  }

  /** Shape mask in the overlay's local (rotated/scaled) frame. */
  private applyMask(ctx: CanvasRenderingContext2D, mask: string, size: number, ar: number) {
    const w = size;
    const h = size / ar;
    ctx.beginPath();
    if (mask === "spotlight") {
      ctx.arc(0, 0, Math.min(w, h) * 0.5, 0, Math.PI * 2);
    } else if (mask === "bar") {
      ctx.rect(-w / 2, -h * 0.3, w, h * 0.6);
    } else if (mask === "line") {
      // half-plane: bottom half (rotate the overlay to aim it)
      ctx.rect(-w, 0, w * 2, h);
    } else {
      return;
    }
    ctx.clip();
  }

  private get vhsPatternLazy(): HTMLCanvasElement {
    if (!this.vhsPattern) {
      const c = document.createElement("canvas");
      c.width = 4;
      c.height = 4;
      const x = c.getContext("2d");
      if (x) {
        x.fillStyle = "rgba(0,0,0,0.28)";
        x.fillRect(0, 0, 4, 1);
      }
      this.vhsPattern = c;
    }
    return this.vhsPattern;
  }

  /**
   * Green-screen keying: the source is drawn to a reduced offscreen canvas and
   * pixels close to the sampled key color (corners of the source) get their
   * alpha cut, with a soft feather. Rendered small then upscaled to stay fast.
   */
  private drawChroma(
    ctx: CanvasRenderingContext2D,
    src: HTMLVideoElement | HTMLImageElement,
    c: OverlayClip,
    size: number,
    ar: number,
    alpha: number,
    cx: number,
    cy: number,
    rot: number,
    blend: GlobalCompositeOperation | null = null,
  ) {
    const maxW = 480;
    const s = Math.min(1, maxW / ar);
    const cw = Math.max(8, Math.round(size * s));
    const ch = Math.max(8, Math.round((size / ar) * s));
    let off = this.chromaCache.get(c.id);
    if (!off || off.width !== cw || off.height !== ch) {
      off = document.createElement("canvas");
      off.width = cw;
      off.height = ch;
      this.chromaCache.set(c.id, off);
    }
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) return;
    octx.clearRect(0, 0, cw, ch);
    octx.drawImage(src, 0, 0, cw, ch);
    const img = octx.getImageData(0, 0, cw, ch);
    const d = img.data;
    let key = this.keyColorCache.get(c.id);
    if (!key) {
      // sample the corners + mid-edges as the key color
      const pts: [number, number][] = [
        [0, 0],
        [cw - 1, 0],
        [0, ch - 1],
        [cw - 1, ch - 1],
        [(cw / 2) | 0, 0],
        [(cw / 2) | 0, ch - 1],
      ];
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [px, py] of pts) {
        const i = (py * cw + px) * 4;
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      key = [r / pts.length, g / pts.length, b / pts.length];
      this.keyColorCache.set(c.id, key);
    }
    const tol = Math.max(8, Math.min(255, c.chromaTol ?? 90));
    const tol2 = tol * tol * 3;
    const fea2 = tol * tol * 3 * 2.9;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - key[0];
      const dg = d[i + 1] - key[1];
      const db = d[i + 2] - key[2];
      const dist2 = dr * dr + dg * dg + db * db;
      if (dist2 < tol2) d[i + 3] = 0;
      else if (dist2 < fea2) d[i + 3] = Math.round((d[i + 3] * (dist2 - tol2)) / (fea2 - tol2));
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (blend) ctx.globalCompositeOperation = blend;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, -size / 2, -size / (2 * ar), size, size / ar);
    ctx.restore();
  }

  private drawImageCover(
    ctx: CanvasRenderingContext2D,
    src: CanvasImageSource,
    W: number,
    H: number,
  ) {
    let sw = 0;
    let sh = 0;
    if (src instanceof HTMLVideoElement) {
      sw = src.videoWidth;
      sh = src.videoHeight;
    } else if (src instanceof HTMLImageElement) {
      sw = src.naturalWidth;
      sh = src.naturalHeight;
    }
    if (!sw || !sh) return;
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  private drawPlaceholder(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    mediaId: string,
    alpha: number,
    broken?: boolean,
  ) {
    const m = this.media.get(mediaId);
    ctx.save();
    ctx.globalAlpha = alpha;
    // Exports must not bake placeholder text into the video — plain black.
    if (this.exporting) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#101625");
    g.addColorStop(1, "#1b1030");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    if (broken) {
      ctx.fillStyle = "rgba(255,196,88,0.95)";
      ctx.font = `600 ${Math.round(H * 0.024)}px system-ui, sans-serif`;
      ctx.fillText("⚠  video can't play on this device", W / 2, H / 2 - H * 0.05);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `500 ${Math.round(H * 0.019)}px system-ui, sans-serif`;
      ctx.fillText("(codec not supported — often HEVC camera clips)", W / 2, H / 2 + H * 0.005);
      ctx.fillStyle = "rgba(125,255,210,0.85)";
      ctx.fillText("audio + captions still work", W / 2, H / 2 + H * 0.045);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `500 ${Math.round(H * 0.016)}px system-ui, sans-serif`;
      ctx.fillText(m?.name ?? "", W / 2, H / 2 + H * 0.085);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = `500 ${Math.round(H * 0.022)}px system-ui, sans-serif`;
      ctx.fillText(m ? m.name : "media loading…", W / 2, H / 2);
    }
    ctx.restore();
  }

  /** Text is drawn centered on the anchor point after the anim transform. */
  private drawText(
    ctx: CanvasRenderingContext2D,
    c: OverlayClip,
    W: number,
    H: number,
    alpha: number,
    localT: number,
    dur: number,
    anim: AnimValues,
  ) {
    const text = c.text ?? "";
    if (!text) return;
    const px = Math.max(4, (c.size ?? 64) * (H / 1080) * anim.scale);
    const weight = c.bold ? 700 : 500;
    const anim2 = c.anim ?? "none";
    ctx.save();
    ctx.globalAlpha = alpha;

    // Ken Burns: slow zoom + pan across the clip
    let kbScale = 1;
    let kbX = 0;
    if (anim2 === "kenburns" && dur > 0.01) {
      const k = clamp01(localT / dur);
      kbScale = 1 + 0.09 * k;
      kbX = (k - 0.5) * W * 0.03;
    }
    // entrance offsets
    let yOff = 0;
    if (anim2 === "bounce") yOff = -px * 0.9 * (1 - easeOutBounce(clamp01(localT / 0.55)));
    if (anim2 === "slideup") yOff = (1 - clamp01(localT / 0.4)) * H * 0.03;

    ctx.font = `${weight} ${Math.round(px)}px ${fontCss(c.font)}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (anim2 === "karaoke" && (c.words?.length ?? 0) > 0) {
      this.drawTextKaraoke(ctx, c, W, H, px, localT);
      ctx.restore();
      return;
    }

    // typewriter reveal (across newlines)
    let reveal = Infinity;
    if (anim2 === "typewriter") reveal = Math.floor(Math.max(0, localT - 0.05) / 0.05) + 1;
    const rawLines = text.split("\n");
    let prefix = 0;
    const lines = rawLines.map((l) => {
      const n = Math.max(0, Math.min(l.length, reveal - prefix));
      prefix += l.length + 1;
      return l.slice(0, n);
    });
    const totalChars = text.length;
    const doneTyping = reveal >= totalChars;
    const lineH = px * 1.18;
    const maxW = Math.max(...rawLines.map((l) => ctx.measureText(l).width), 0);
    const totalH = lines.length * lineH;
    const pos: TextPos = c.pos ?? "mc";
    const mx = W * 0.08;
    const my = H * 0.08;
    let x = W / 2;
    let y = H / 2;
    const col = pos[1] as "l" | "c" | "r";
    if (col === "l") x = mx + maxW / 2 + px * 0.4;
    if (col === "r") x = W - mx - maxW / 2 - px * 0.4;
    const row = pos[0] as "t" | "m" | "b";
    if (row === "t") y = my + totalH / 2;
    if (row === "b") y = H - my - totalH / 2;
    const xC = x + anim.x * (W / 2) + kbX;
    const yC = y + anim.y * (H / 2) + yOff;
    this.overlayRects.push({
      clipId: c.id,
      x: xC - maxW / 2 - px * 0.4,
      y: yC - totalH / 2 - px * 0.28,
      w: maxW + px * 0.8,
      h: totalH + px * 0.56,
    });
    ctx.translate(xC, yC);
    if (anim.rotation !== 0) ctx.rotate((anim.rotation * Math.PI) / 180);
    if (kbScale !== 1) ctx.scale(kbScale, kbScale);
    if (c.bg && (anim2 !== "typewriter" || doneTyping)) {
      ctx.fillStyle = c.bg;
      const padX = px * 0.5;
      const padY = px * 0.28;
      const bw = maxW + padX * 2;
      const bh = totalH + padY * 2;
      roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, Math.min(bh / 2, px * 0.4));
      ctx.fill();
    }
    const color = c.color ?? "#ffffff";
    if (anim2 === "neon") {
      ctx.shadowColor = color;
      ctx.shadowBlur = px * (0.3 + 0.14 * Math.sin(localT * 5));
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = color;
      lines.forEach((l, i) => {
        const yy = -totalH / 2 + lineH / 2 + i * lineH;
        ctx.fillText(l, 0, yy);
        ctx.fillText(l, 0, yy); // second pass for glow intensity
      });
    } else {
      ctx.fillStyle = color;
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = px * 0.12;
      ctx.shadowOffsetY = px * 0.04;
      lines.forEach((l, i) => {
        ctx.fillText(l, 0, -totalH / 2 + lineH / 2 + i * lineH);
      });
      // typewriter caret
      if (anim2 === "typewriter" && !doneTyping && localT < dur - 0.1) {
        let count = 0;
        let caretLine = 0;
        let caretX = 0;
        for (let i = 0; i < lines.length; i++) {
          if (reveal <= count) break;
          caretLine = i;
          caretX = ctx.measureText(lines[i]).width / 2;
          count += lines[i].length + 1;
        }
        const blink = Math.floor(localT * 3) % 2 === 0;
        if (blink) {
          ctx.fillStyle = color;
          ctx.shadowBlur = 0;
          ctx.fillRect(caretX + 2, -totalH / 2 + lineH / 2 + caretLine * lineH - px * 0.4, px * 0.12, px * 0.8);
        }
      }
    }
    ctx.restore();
  }

  /** Karaoke: per-word highlight using c.words timing (clip-local seconds). */
  private drawTextKaraoke(
    ctx: CanvasRenderingContext2D,
    c: OverlayClip,
    W: number,
    H: number,
    px: number,
    localT: number,
  ) {
    const words = (c.words ?? []).map((w) => ({ t: w.t, w: w.text, ws: ctx.measureText(w.text).width }));
    const gap = px * 0.32;
    const maxLineW = W * 0.84;
    type Line = { items: { t: number; w: string; ws: number }[]; width: number };
    const lines: Line[] = [];
    let cur: Line = { items: [], width: 0 };
    for (const it of words) {
      const add = it.ws + (cur.items.length ? gap : 0);
      if (cur.items.length && cur.width + add > maxLineW) {
        lines.push(cur);
        cur = { items: [], width: 0 };
      }
      cur.items.push(it);
      cur.width += add;
    }
    if (cur.items.length) lines.push(cur);
    const lineH = px * 1.4;
    const totalW = Math.max(...lines.map((l) => l.width), 0);
    const totalH = lines.length * lineH;
    const pos: TextPos = c.pos ?? "bc";
    let x = W / 2;
    let y = H / 2;
    const mx = W * 0.08;
    const my = H * 0.08;
    const col = pos[1] as "l" | "c" | "r";
    if (col === "l") x = mx + totalW / 2 + px * 0.3;
    if (col === "r") x = W - mx - totalW / 2 - px * 0.3;
    const row = pos[0] as "t" | "m" | "b";
    if (row === "t") y = my + totalH / 2;
    if (row === "b") y = H - my - totalH / 2;
    // free placement (drag on the preview / X-Y sliders) offsets the pos anchor
    x += (c.x ?? 0) * (W / 2);
    y += (c.y ?? 0) * (H / 2);
    this.overlayRects.push({
      clipId: c.id,
      x: x - totalW / 2 - px * 0.4,
      y: y - totalH / 2 - px * 0.18,
      w: totalW + px * 0.8,
      h: totalH + px * 0.36,
    });
    ctx.translate(x, y);
    // background plate
    ctx.fillStyle = c.bg || "rgba(0,0,0,0.35)";
    roundRectPath(ctx, -totalW / 2 - px * 0.4, -totalH / 2 - px * 0.18, totalW + px * 0.8, totalH + px * 0.36, px * 0.3);
    ctx.fill();
    // words
    let activeIndex = -1;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let cx = -line.width / 2;
      for (let wi = 0; wi < line.items.length; wi++) {
        const it = line.items[wi];
        const on = localT >= it.t;
        if (on) activeIndex = li * 1000 + wi;
        ctx.fillStyle = on ? c.color ?? "#ffffff" : "rgba(255,255,255,0.38)";
        ctx.shadowColor = on ? "rgba(0,0,0,0.6)" : "transparent";
        ctx.shadowBlur = on ? px * 0.1 : 0;
        ctx.fillText(it.w, cx + it.ws / 2, -totalH / 2 + lineH / 2 + li * lineH);
        cx += it.ws + gap;
      }
    }
    // underline the active word
    if (activeIndex >= 0) {
      const li = Math.floor(activeIndex / 1000);
      const wi = activeIndex % 1000;
      const line = lines[li];
      if (line) {
        let cx = -line.width / 2;
        for (let i = 0; i < wi; i++) cx += line.items[i].ws + gap;
        const it = line.items[wi];
        ctx.fillStyle = c.color ?? "#ffffff";
        ctx.fillRect(cx, -totalH / 2 + lineH / 2 + li * lineH + px * 0.62, it.ws, Math.max(2, px * 0.07));
      }
    }
  }

  // ------------------------------------------------------------- mutations

  private bump() {
    this.version++;
    this.onVersion?.();
  }

  addMainClip(media: MediaItem, atEnd = true) {
    const dur =
      media.kind === "video"
        ? media.duration ?? 5
        : media.kind === "audio"
          ? media.duration ?? 3
          : 3;
    const clip: MainClip = {
      id: uid("mc"),
      mediaId: media.id,
      in: 0,
      out: media.kind === "image" ? 3 : Math.max(0.5, dur),
      speed: 1,
      reverse: false,
      filter: "none",
      adjust: { ...DEFAULT_ADJUST },
      volume: 1,
      muted: false,
      transitionIn: "crossfade",
      transitionDur: 0.5,
    };
    if (!atEnd) this.project.main.unshift(clip);
    else this.project.main.push(clip);
    this.bump();
    return clip;
  }

  /**
   * Split the main clip under the playhead. Keyframes are carried over to the
   * two halves at their clip-local offsets. Returns true on success.
   */
  splitAt(t: number): boolean {
    const spans = mainSpans(this.project);
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (t <= s.start || t >= s.end) continue;
      const c = s.clip;
      const srcAt = mainSrcAt(c, t - s.start);
      if (srcAt - c.in < 0.08 || c.out - srcAt < 0.08) return false;
      const local = t - s.start;
      const kfsA = c.keyframes?.filter((k) => k.at < local);
      const kfsB = c.keyframes?.filter((k) => k.at >= local).map((k) => ({ at: k.at - local, v: { ...k.v } }));
      const a: MainClip = {
        ...c,
        id: uid("mc"),
        in: c.in,
        out: srcAt,
        transitionIn: "none",
        transitionDur: 0,
        keyframes: kfsA && kfsA.length ? kfsA : undefined,
      };
      const b: MainClip = {
        ...c,
        id: uid("mc"),
        in: srcAt,
        out: c.out,
        keyframes: kfsB && kfsB.length ? kfsB : undefined,
      };
      this.project.main.splice(i, 1, a, b);
      this.bump();
      return true;
    }
    return false;
  }

  deleteMainClip(id: string) {
    const i = this.project.main.findIndex((c) => c.id === id);
    if (i === -1) return;
    this.project.main.splice(i, 1);
    this.bump();
  }

  duplicateMainClip(id: string) {
    const i = this.project.main.findIndex((c) => c.id === id);
    if (i === -1) return;
    const src = this.project.main[i];
    this.project.main.splice(i + 1, 0, {
      ...src,
      id: uid("mc"),
      adjust: { ...src.adjust },
      keyframes: src.keyframes?.map((k) => ({ at: k.at, v: { ...k.v } })),
      transitionIn: "none",
      transitionDur: 0,
    });
    this.bump();
  }

  replaceMainClipMedia(id: string, media: MediaItem) {
    const c = this.project.main.find((x) => x.id === id);
    if (!c) return;
    const maxOut = media.kind === "image" ? (media.duration ?? 3) : media.duration ?? c.out - c.in;
    const keepDur = c.out - c.in;
    c.mediaId = media.id;
    c.in = 0;
    c.out = media.kind === "image" ? Math.min(3, keepDur || 3) : Math.min(maxOut, Math.max(0.5, keepDur));
    c.reverse = false;
    this.bump();
  }

  moveMainClip(id: string, dir: -1 | 1) {
    const i = this.project.main.findIndex((c) => c.id === id);
    if (i === -1) return;
    const j = i + dir;
    if (j < 0 || j >= this.project.main.length) return;
    const arr = this.project.main;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.bump();
  }

  addTextClip(trackId: string, start: number, overrides?: Partial<OverlayClip>): OverlayClip {
    const track = this.project.tracks.find((t) => t.id === trackId) ?? this.project.tracks[0];
    const clip: OverlayClip = {
      id: uid("tc"),
      kind: "text",
      start: Math.max(0, start),
      duration: Math.max(1, Math.min(3, this.duration() - start || 3)),
      text: "Your text",
      size: 72,
      color: "#ffffff",
      bg: "",
      bold: true,
      pos: "bc",
      anim: "fade",
      ...overrides,
    };
    clip.id = uid("tc");
    clip.kind = "text";
    track.clips.push(clip);
    this.bump();
    return clip;
  }

  addImageOverlay(trackId: string, media: MediaItem, start: number): OverlayClip {
    const track = this.project.tracks.find((t) => t.id === trackId) ?? this.project.tracks[1];
    const clip: OverlayClip = {
      id: uid("ic"),
      kind: media.kind === "video" ? "video" : "image",
      mediaId: media.id,
      start: Math.max(0, start),
      duration: media.kind === "video" ? Math.min(6, media.duration ?? 6) : 3,
      scale: 0.5,
      x: 0,
      y: -0.4,
      rot: 0,
      chroma: false,
    };
    track.clips.push(clip);
    this.bump();
    return clip;
  }

  addAudioClip(trackId: string, media: MediaItem, start: number): OverlayClip {
    const track = this.project.tracks.find((t) => t.id === trackId) ?? this.project.tracks[2];
    const clip: OverlayClip = {
      id: uid("ac"),
      kind: "audio",
      mediaId: media.id,
      start: Math.max(0, start),
      duration: Math.max(1, media.duration ?? 10),
      volume: 1,
      fadeIn: 0.15,
      fadeOut: 0.15,
    };
    track.clips.push(clip);
    this.bump();
    return clip;
  }

  updateOverlay(clipId: string, patch: Partial<OverlayClip>) {
    for (const tr of this.project.tracks) {
      const c = tr.clips.find((x) => x.id === clipId);
      if (c) {
        Object.assign(c, patch);
        this.bump();
        return;
      }
    }
  }

  deleteOverlay(clipId: string) {
    for (const tr of this.project.tracks) {
      const i = tr.clips.findIndex((x) => x.id === clipId);
      if (i !== -1) {
        tr.clips.splice(i, 1);
        this.bump();
        return;
      }
    }
  }

  /** Public lookup used by the Assist tools. */
  getClip(clipId: string): MainClip | OverlayClip | null {
    return this.findClipAny(clipId);
  }

  /**
   * Beat-cut: replace the main timeline with one hard-cut clip per beat
   * segment of the given media, keeping that media's filter/volume if it was
   * already on the timeline.
   */
  applyBeatCuts(media: MediaItem, segments: { in: number; out: number }[]) {
    const src = this.project.main.find((c) => c.mediaId === media.id);
    this.project.main = segments.map((sg, i) => ({
      id: uid("mc"),
      mediaId: media.id,
      in: sg.in,
      out: sg.out,
      speed: 1,
      reverse: false,
      filter: src?.filter ?? "none",
      adjust: src ? { ...src.adjust } : { ...DEFAULT_ADJUST },
      volume: src?.volume ?? 1,
      muted: src?.muted ?? false,
      transitionIn: (i === 0 ? "none" : "none") as "none",
      transitionDur: 0,
    }));
    this.bump();
  }

  // ------------------------------------------------------------- keyframes

  private findClipAny(clipId: string): MainClip | OverlayClip | null {
    const m = this.project.main.find((c) => c.id === clipId);
    if (m) return m;
    for (const tr of this.project.tracks) {
      const c = tr.clips.find((x) => x.id === clipId);
      if (c) return c;
    }
    return null;
  }

  /** Add (or update, if one sits within 50 ms) a keyframe at clip-local time. */
  addKeyframe(clipId: string, at: number): Keyframe | null {
    const c = this.findClipAny(clipId);
    if (!c) return null;
    const clamped = Math.max(0, at);
    const cur = animAt(c.keyframes, this.animBase(c), clamped);
    const existing = c.keyframes?.find((k) => Math.abs(k.at - clamped) < 0.05);
    if (existing) {
      existing.v = { ...cur };
      this.bump();
      return existing;
    }
    c.keyframes ??= [];
    const kf: Keyframe = { at: clamped, v: { ...cur } };
    c.keyframes.push(kf);
    c.keyframes.sort((a, b) => a.at - b.at);
    this.bump();
    return kf;
  }

  /** The keyframe nearest `at` within eps seconds, if any. */
  keyframeNear(clipId: string, at: number, eps = 0.12): Keyframe | null {
    const c = this.findClipAny(clipId);
    if (!c?.keyframes?.length) return null;
    let best: Keyframe | null = null;
    let bestD = eps;
    for (const k of c.keyframes) {
      const d = Math.abs(k.at - at);
      if (d <= bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  /** Patch the values of the keyframe within eps of `at` (CapCut-style edit). */
  updateKeyframeAt(clipId: string, at: number, patch: Partial<AnimValues>): boolean {
    const kf = this.keyframeNear(clipId, at);
    if (!kf) return false;
    Object.assign(kf.v, patch);
    this.bump();
    return true;
  }

  deleteKeyframe(clipId: string, at: number, eps = 0.05): boolean {
    const c = this.findClipAny(clipId);
    if (!c?.keyframes) return false;
    const i = c.keyframes.findIndex((k) => Math.abs(k.at - at) < eps);
    if (i === -1) return false;
    c.keyframes.splice(i, 1);
    if (c.keyframes.length === 0) c.keyframes = undefined;
    this.bump();
    return true;
  }

  // ------------------------------------------------------------- undo/redo

  snapshot(): string {
    return JSON.stringify(this.project);
  }

  restore(snap: string) {
    this.project = JSON.parse(snap);
    this.t = Math.min(this.t, this.duration());
    this.bump();
    this.draw();
  }

  // ------------------------------------------------------------- export (WebM)

  async exportMedia(opts: ExportOptions, onProgress: (p: number) => void): Promise<Blob> {
    if (!this.canvas) throw new Error("Canvas not ready");
    const picked = pickMime();
    if (!picked) throw new Error("This browser does not support video recording. Use Chrome/Edge.");
    await this.ensureAudio();
    if (!this.audioCtx || !this.exportDest) throw new Error("Audio engine unavailable");
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0; // exports always render at full quality
    for (const [id, rec] of this.els) {
      if (rec.el instanceof HTMLImageElement) continue;
      const target = (rec.videoBroken ? rec.audioFallback : rec.el) as AudioEl | undefined;
      if (!target) continue;
      if (!rec.sourceNode) {
        rec.sourceNode = this.audioCtx.createMediaElementSource(target);
        rec.sourceNode.connect(this.ensureFx(id)!.in);
      }
    }
    const wasLoop = this.loop;
    this.loop = false;
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.seek(0);
    this.draw();

    const canvasStream = this.canvas.captureStream(opts.fps);
    const mixed = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...this.exportDest.stream.getAudioTracks(),
    ]);
    const rec = new MediaRecorder(mixed, {
      mimeType: picked.mime,
      videoBitsPerSecond: opts.videoBitsPerSecond,
      audioBitsPerSecond: opts.audioBitsPerSecond,
    });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: picked.mime }));
    });

    const dur = this.duration();
    try {
      rec.start(500);
      await this.play();
      const deadline = performance.now() + (dur + 15) * 1000;
      while (rec.state === "recording") {
        onProgress(Math.min(1, this.t / Math.max(0.001, dur)));
        if (performance.now() > deadline) break;
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      if (!wasPlaying) this.pause();
      this.loop = wasLoop;
      if (rec.state !== "inactive") rec.stop();
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
    }
    const blob = await stopped;
    canvasStream.getTracks().forEach((t) => t.stop());
    if (blob.size < 1000) throw new Error("Export produced no data — try again");
    onProgress(1);
    return blob;
  }

  // ------------------------------------------------------------- export (MP4)
  // WebCodecs: H.264 video + Opus audio, muxed by mp4-muxer. Real-time render
  // (the timeline plays once while frames are captured), same as the WebM path.

  async exportMP4(opts: ExportOptions, onProgress: (p: number) => void): Promise<Blob> {
    if (!this.canvas) throw new Error("Canvas not ready");
    if (!mp4Supported()) throw new Error("MP4 export needs WebCodecs — use Chrome or Edge (WebM also works).");
    const { w: W, h: H } = ASPECTS[this.project.aspect];
    const codec = await pickAvcCodec(W, H, opts.fps, opts.videoBitsPerSecond);
    if (!codec) throw new Error("H.264 encoding is not supported at this resolution here — use WebM.");
    await this.ensureAudio();
    if (!this.audioCtx || !this.exportDest) throw new Error("Audio engine unavailable");
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0; // exports always render at full quality
    try {
      for (const [id, rec] of this.els) {
        if (rec.el instanceof HTMLImageElement) continue;
        const target = (rec.videoBroken ? rec.audioFallback : rec.el) as AudioEl | undefined;
        if (!target) continue;
        if (!rec.sourceNode) {
          rec.sourceNode = this.audioCtx.createMediaElementSource(target);
          rec.sourceNode.connect(this.ensureFx(id)!.in);
        }
      }

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: "avc", width: W, height: H, frameRate: opts.fps },
        audio: { codec: "opus", numberOfChannels: 2, sampleRate: this.audioCtx.sampleRate },
        fastStart: "in-memory",
      });

      let encError: unknown = null;
      const W_ = window as unknown as {
        VideoEncoder: typeof VideoEncoder;
        AudioEncoder: typeof AudioEncoder;
        VideoFrame: typeof VideoFrame;
      };
      const videoEncoder = new W_.VideoEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addVideoChunk(chunk, meta);
          } catch (e) {
            encError = e;
          }
        },
        error: (e) => {
          encError = e;
        },
      });
      await videoEncoder.configure({
        codec,
        width: W,
        height: H,
        framerate: opts.fps,
        bitrate: opts.videoBitsPerSecond,
      });
      const audioEncoder = new W_.AudioEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addAudioChunk(chunk, meta);
          } catch (e) {
            encError = e;
          }
        },
        error: (e) => {
          encError = e;
        },
      });
      await audioEncoder.configure({
        codec: "opus",
        sampleRate: this.audioCtx.sampleRate,
        numberOfChannels: 2,
        bitrate: opts.audioBitsPerSecond,
      });
      // Bridge: exportDest's MediaStream → ScriptProcessor → AudioData → AudioEncoder.
      // (WebAudio nodes cannot be connected directly to a WebCodecs encoder.)
      const streamSource = this.audioCtx.createMediaStreamSource(this.exportDest.stream);
      const sp = this.audioCtx.createScriptProcessor(4096, 2, 2);
      const silence = this.audioCtx.createGain();
      silence.gain.value = 0;
      streamSource.connect(sp);
      sp.connect(silence);
      silence.connect(this.audioCtx.destination);
      let audioArmed = false;
      let audioT0: number | null = null;
      sp.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!audioArmed || encError) return;
        const ab = e.inputBuffer;
        const rawTs = (this.audioCtx!.currentTime - ab.length / ab.sampleRate) * 1_000_000;
        if (audioT0 == null) audioT0 = rawTs;
        try {
          const ch0 = ab.getChannelData(0);
          const ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : ch0;
          const ad = new AudioData({
            format: "f32-planar",
            sampleRate: ab.sampleRate,
            numberOfFrames: ab.length,
            numberOfChannels: 2,
            timestamp: Math.max(0, Math.round(rawTs - audioT0)),
            // f32-planar: one Float32Array per channel (lib.dom types lag the spec)
            data: [ch0.slice(0), ch1.slice(0)] as unknown as BufferSource,
          });
          audioEncoder.encode(ad);
        } catch (er) {
          encError = encError ?? er;
        }
      };

      const wasLoop = this.loop;
      this.loop = false;
      const wasPlaying = this.playing;
      if (wasPlaying) this.pause();
      this.seek(0);
      this.draw();

      const dur = this.duration();
      const frameDurUs = 1_000_000 / opts.fps;
      const keyEvery = opts.fps * 2; // IDR roughly every 2s
      let frame = 0;
      let lastKeyFrame = -keyEvery; // force frame 0 to be a keyframe
      void this.play();
      audioArmed = true; // audio timestamps start now (no pre-roll silence)

      const deadline = performance.now() + (dur + 15) * 1000;
      while (this.playing || this.t < dur - 0.03) {
        const targetT = frame / opts.fps;
        if (this.t >= targetT - 0.002) {
          try {
            const wantKey = frame - lastKeyFrame >= keyEvery;
            const vf = new W_.VideoFrame(this.canvas, { timestamp: Math.round(frame * frameDurUs) });
            videoEncoder.encode(vf, { keyFrame: wantKey });
            if (wantKey) lastKeyFrame = frame;
            vf.close();
            frame++;
          } catch (e) {
            encError = encError ?? e;
          }
        }
        onProgress(Math.min(1, this.t / Math.max(0.001, dur)));
        if (encError) break;
        if (performance.now() > deadline) break;
        await new Promise((r) => setTimeout(r, 16));
      }
      // final frame at the end
      if (!encError && this.t >= dur - 0.05) {
        try {
          const vf = new W_.VideoFrame(this.canvas, { timestamp: Math.round(frame * frameDurUs) });
          videoEncoder.encode(vf);
          vf.close();
          frame++;
        } catch {
          /* ignore */
        }
      }

      try {
        await videoEncoder.flush();
        await audioEncoder.flush();
      } finally {
        audioArmed = false;
        sp.onaudioprocess = null;
        try {
          sp.disconnect();
          silence.disconnect();
          streamSource.disconnect();
        } catch {
          /* ignore */
        }
        try {
          audioEncoder.close();
        } catch {
          /* ignore */
        }
        try {
          videoEncoder.close();
        } catch {
          /* ignore */
        }
        if (!wasPlaying) this.pause();
        this.loop = wasLoop;
        this.exportScale = prevScale;
        this.exporting = false;
        this.previewMaxSide = prevCap;
      }
      if (encError) throw encError instanceof Error ? encError : new Error("Encoder failed: " + String(encError));
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      if (blob.size < 1000) throw new Error("Export produced no data — try again");
      onProgress(1);
      return blob;
    } finally {
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
    }
  }

  destroy() {
    this.pause();
    for (const [id, rec] of this.els) {
      this.stopBufSource(id);
      const e = rec.el as Partial<AudioEl>;
      if (e) e.pause?.();
      if (rec.audioFallback) rec.audioFallback.pause();
      if (rec.url) URL.revokeObjectURL(rec.url);
      (rec.el as HTMLVideoElement).src = "";
    }
    this.els.clear();
    this.chromaCache.clear();
    this.keyColorCache.clear();
    try {
      void this.audioCtx?.close();
    } catch {
      /* ignore */
    }
    this.audioCtx = null;
  }
}
