// MayoCut engine — client-side playback, compositing and export.
// Runs entirely in the browser (also inside Electron / Capacitor).
// No server, no database: media lives in IndexedDB, export is canvas + WebAudio
// (WebM via MediaRecorder, MP4 via WebCodecs + mp4-muxer).

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import {
  ASPECTS,
  DEFAULT_ADJUST,
  DEFAULT_ANIM,
  fontCss,
  mainClipDuration,
  mainClipGain,
  wipeDir,
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
  type TransitionKind,
  isDipTo,
  freezeClipFrom,
} from "./types";
import { resolveComposition } from "./timeline-resolver";
import { planSteppedExport, recordThroughput, type ExportPlan } from "./export-plan";
import { audioFxRecipe, buildAudioFx, makeImpulse, type AudioFxId } from "./audio-fx";
import { applyCurveLuts, buildCurveLuts, curvesActive } from "./curves";
import { applyHsl, hslActive } from "./hsl";
import { sourceFor } from "./proxy";
import { applyLut, type LutTable } from "./luts";
import { sampleTimeline } from "./timeline";
import { probeGif } from "./utils";
import { GifReader, GifWriter } from "omggif";

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
  {
    id: "vintage",
    name: "Vintage",
    css: "sepia(0.4) contrast(1.05) brightness(1.06) saturate(0.85)",
  },
  { id: "cinema", name: "Cinema", css: "contrast(1.18) saturate(1.12) brightness(0.97)" },
  { id: "soft", name: "Soft", css: "brightness(1.08) saturate(1.06) blur(0.4px)" },
  { id: "punch", name: "Punch", css: "contrast(1.28) saturate(1.45)" },
  {
    id: "tealorange",
    name: "Teal & Orange",
    css: "contrast(1.1) saturate(1.35) sepia(0.14) hue-rotate(-14deg)",
  },
  {
    id: "golden",
    name: "Golden Hour",
    css: "sepia(0.32) saturate(1.4) brightness(1.06) contrast(1.03)",
  },
  { id: "faded", name: "Faded", css: "contrast(0.9) brightness(1.07) saturate(0.72) sepia(0.16)" },
  { id: "dreamy", name: "Dreamy", css: "brightness(1.12) saturate(1.18) blur(0.6px)" },
  { id: "moody", name: "Moody", css: "contrast(1.26) brightness(0.88) saturate(0.82)" },
  {
    id: "pastel",
    name: "Pastel",
    css: "brightness(1.09) saturate(1.25) contrast(0.88) hue-rotate(6deg)",
  },
  { id: "dramatic", name: "Dramatic", css: "contrast(1.38) saturate(1.22) brightness(0.94)" },
  {
    id: "night",
    name: "Night",
    css: "hue-rotate(12deg) saturate(1.08) brightness(0.9) contrast(1.12)",
  },
  {
    id: "retro",
    name: "Retro Film",
    css: "sepia(0.45) contrast(1.1) saturate(1.25) brightness(1.02) hue-rotate(-6deg)",
  },
  // --- second wave: film stocks, moods and social looks -------------------
  {
    id: "kodachrome",
    name: "Kodachrome",
    css: "saturate(1.3) contrast(1.12) sepia(0.1) brightness(1.03)",
  },
  {
    id: "portra",
    name: "Portra 400",
    css: "saturate(0.95) contrast(0.96) brightness(1.06) sepia(0.12)",
  },
  { id: "technicolor", name: "Technicolor", css: "saturate(1.6) contrast(1.2) hue-rotate(-4deg)" },
  { id: "bleach", name: "Bleach Bypass", css: "saturate(0.45) contrast(1.42) brightness(1.05)" },
  { id: "sepia", name: "Sepia", css: "sepia(0.85) contrast(1.05) brightness(1.02)" },
  {
    id: "cyanotype",
    name: "Cyanotype",
    css: "grayscale(1) sepia(1) hue-rotate(160deg) saturate(1.8) contrast(1.1)",
  },
  { id: "infrared", name: "Infrared", css: "hue-rotate(155deg) saturate(1.7) contrast(1.15)" },
  {
    id: "duotone",
    name: "Duotone",
    css: "grayscale(1) contrast(1.25) sepia(0.4) hue-rotate(180deg) saturate(1.6)",
  },
  {
    id: "fifties",
    name: "Fifties",
    css: "sepia(0.3) saturate(0.9) contrast(0.95) brightness(1.08) hue-rotate(-10deg)",
  },
  { id: "grunge", name: "Grunge", css: "contrast(1.35) saturate(0.7) brightness(0.92) sepia(0.2)" },
  {
    id: "arctic",
    name: "Arctic",
    css: "hue-rotate(-18deg) saturate(1.2) brightness(1.08) contrast(1.05)",
  },
  {
    id: "sunset",
    name: "Sunset",
    css: "sepia(0.3) saturate(1.5) hue-rotate(-18deg) brightness(1.06)",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    css: "contrast(1.3) saturate(1.6) hue-rotate(-25deg) brightness(0.95)",
  },
  { id: "darkmood", name: "Dark & Moody", css: "brightness(0.82) contrast(1.3) saturate(0.85)" },
  { id: "clean", name: "Clean", css: "brightness(1.04) contrast(1.04) saturate(1.05)" },
  { id: "clarity", name: "Clarity", css: "contrast(1.14) saturate(1.1) brightness(1.02)" },
  { id: "silvertone", name: "Silver", css: "grayscale(0.85) contrast(1.2) brightness(1.04)" },
  {
    id: "winter",
    name: "Winter",
    css: "hue-rotate(8deg) saturate(0.88) brightness(1.06) contrast(1.05)",
  },
  {
    id: "autumn",
    name: "Autumn",
    css: "sepia(0.22) saturate(1.35) hue-rotate(-12deg) brightness(1.02)",
  },
  { id: "mono-high", name: "Mono High", css: "grayscale(1) contrast(1.55) brightness(1.08)" },
  {
    id: "neon-night",
    name: "Neon Night",
    css: "hue-rotate(200deg) saturate(2) contrast(1.25) brightness(0.92)",
  },
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
  // Fade (matte film look): squash contrast and lift the mids a touch.
  const fade = a.fade ?? 0;
  if (fade > 0) {
    parts2.push(`contrast(${(1 - 0.32 * (fade / 100)).toFixed(3)})`);
    parts2.push(`brightness(${(1 + 0.07 * (fade / 100)).toFixed(3)})`);
  }
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

/** Overshoot easing — the "pop" that settles slightly past its target. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
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
  /** wet level for the echo path — 0 unless the clip asks for echo */
  delayWet: GainNode;
  feedback: GainNode;
  conv: ConvolverNode;
  convWet: GainNode;
  /** voice shaping: low shelf → mid peak → high shelf */
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  /**
   * The one-tap audio effect (telephone, chipmunk, cave…), rebuilt whenever the
   * active clip changes effect. Sits between the voice EQ and the output, and
   * is bypassed by setting its gain to 1 with no filters — never by leaving a
   * stale half-built chain connected.
   */
  fxIn?: GainNode;
  fxOut?: GainNode;
  fxNodes: AudioNode[];
  /** which effect the chain currently holds, so we rebuild only on change */
  fxId?: string;
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
  /** low-res preview copy (never used for export) */
  proxyUrl?: string;
  /** which url is currently applied to the element */
  appliedUrl?: string;
  videoLoadRequested?: boolean;
  videoLoadTimer?: number;
  /** true once a slow load has already been retried — avoids a retry loop */
  videoSlowLoadRetried?: boolean;
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

/** Human-readable reason a video export cannot run on this device, or null. */
export function exportBlocker(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return "This browser has no video recorder (MediaRecorder), so it cannot write a video file. Export a PNG frame or the WAV audio instead — both work here.";
  }
  if (!pickMime()) {
    return "This browser's recorder supports none of the formats this editor can write (WebM/MP4), so a video file cannot be produced here. Export a PNG frame or the WAV audio instead.";
  }
  return null;
}

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

/**
 * Pick a WebM video codec string this device can actually encode.
 *
 * VP9 first (better quality per bit), then VP8 (older phones), then AV1 (rare
 * but real). Returns both the WebCodecs config codec and the Matroska
 * `CodecID` the muxer needs, because they are not the same string.
 */
async function pickVpCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<{ config: string; mkv: string } | null> {
  const Ctor = (
    window as unknown as {
      VideoEncoder?: { isConfigSupported: (c: object) => Promise<{ supported: boolean }> };
    }
  ).VideoEncoder;
  if (!Ctor?.isConfigSupported) return null;
  const candidates: { config: string; mkv: string }[] = [
    { config: "vp09.00.10.08", mkv: "V_VP9" },
    { config: "vp8", mkv: "V_VP8" },
    { config: "av01.0.04M.08", mkv: "V_AV1" },
  ];
  for (const c of candidates) {
    try {
      const res = await Ctor.isConfigSupported({
        codec: c.config,
        width,
        height,
        framerate: fps,
        bitrate,
      });
      if (res.supported) return c;
    } catch {
      /* try the next candidate */
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

async function pickAvcCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<string | null> {
  const Ctor = (
    window as unknown as {
      VideoEncoder?: { isConfigSupported: (c: object) => Promise<{ supported: boolean }> };
    }
  ).VideoEncoder;
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

async function supportsAacEncoder(
  sampleRate: number,
  numberOfChannels: number,
  bitrate: number,
): Promise<boolean> {
  const Ctor = (
    window as unknown as {
      AudioEncoder?: {
        isConfigSupported: (config: AudioEncoderConfig) => Promise<{ supported: boolean }>;
      };
    }
  ).AudioEncoder;
  if (!Ctor?.isConfigSupported) return false;
  try {
    const result = await Ctor.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels,
      bitrate,
    });
    return result.supported;
  } catch {
    return false;
  }
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
  /** ms the clock has been held waiting for a frame (reset when ready) */
  private stallMs = 0;
  /** measured frame throughput, from measureThroughput() */
  private throughput: import("./export-plan").ExportThroughput | null = null;
  /** proxies registered before their element existed */
  private pendingProxies = new Map<string, string>();
  private lastPaintAt = 0;
  private lastUiTimeAt = 0;
  private buffering = false;
  onBufferingChange: ((buffering: boolean) => void) | null = null;

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
      // Active clips are promoted to auto-preload by requestVideoLoad().
      v.preload = "metadata";
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

  hasMediaUrl(mediaId: string): boolean {
    return !!this.els.get(mediaId)?.url;
  }

  /**
   * Register a preview proxy for a media item.
   *
   * The proxy is used for decoding while editing; `attachUrl` is then re-called
   * for the active source. Exports never see this.
   */
  attachProxy(mediaId: string, proxyUrl: string) {
    const rec = this.els.get(mediaId);
    if (rec) {
      if (rec.proxyUrl && rec.proxyUrl !== proxyUrl) URL.revokeObjectURL(rec.proxyUrl);
      rec.proxyUrl = proxyUrl;
      return;
    }
    this.pendingProxies.set(mediaId, proxyUrl);
  }

  /** Which URL should a consumer use for this media right now? */
  private urlForMedia(mediaId: string, consumer: "preview" | "export"): string | undefined {
    const rec = this.els.get(mediaId);
    if (!rec) return undefined;
    return sourceFor(consumer, rec.url, rec.proxyUrl);
  }

  /**
   * Point the element at the right source for a consumer.
   *
   * Preview gets the proxy when one exists, export always gets the original.
   * Everything that chooses between the two goes through sourceFor(), so proxy
   * quality cannot leak into a delivered file.
   */
  private applySource(
    rec: ElRecord,
    media: MediaItem,
    mediaId: string,
    consumer: "preview" | "export",
  ) {
    const url = sourceFor(consumer, rec.url, rec.proxyUrl);
    if (!url) return;
    if (rec.appliedUrl === url) return;
    rec.appliedUrl = url;
    if (rec.el instanceof HTMLImageElement) {
      rec.el.src = url;
      return;
    }
    const element = rec.el as HTMLVideoElement | HTMLAudioElement;
    if (media.kind === "video") {
      const video = element as HTMLVideoElement;
      video.preload = "metadata";
      video.playsInline = true;
      // Attach listeners before src: cached object URLs may dispatch quickly.
      video.addEventListener("loadedmetadata", () => {
        if (
          Number.isFinite(video.duration) &&
          video.duration > 0 &&
          (!media.duration || media.duration <= 0)
        ) {
          media.duration = video.duration;
          this.bump();
        }
        if (video.readyState >= 2 && rec.videoLoadTimer) {
          window.clearTimeout(rec.videoLoadTimer);
          rec.videoLoadTimer = undefined;
        }
      });
      const clearWatchdog = () => {
        if (rec.videoLoadTimer) window.clearTimeout(rec.videoLoadTimer);
        rec.videoLoadTimer = undefined;
      };
      video.addEventListener("loadeddata", () => {
        clearWatchdog();
        this.draw();
      });
      video.addEventListener("seeked", () => {
        if (!this.playing) this.draw();
      });
      video.addEventListener("canplay", clearWatchdog);
      // A PROXY failing to decode must not condemn the original: fall back to
      // the real file before declaring the media unplayable.
      video.addEventListener("error", () => {
        clearWatchdog();
        if (consumer === "preview" && rec.proxyUrl && rec.appliedUrl === rec.proxyUrl) {
          rec.proxyUrl = undefined;
          rec.appliedUrl = undefined;
          this.applySource(rec, media, mediaId, "preview");
          return;
        }
        this.markVideoBroken(mediaId, "video decoder rejected this media file");
      });
    }
    element.src = url;
    element.load();
  }

  /** Re-point every element at the original files, for an export. */
  private useOriginalSources() {
    for (const [id, rec] of this.els) {
      const media = this.media.get(id);
      if (!media || !rec.url) continue;
      this.applySource(rec, media, id, "export");
    }
  }

  /** Re-point every element back at preview sources (proxies). */
  private usePreviewSources() {
    for (const [id, rec] of this.els) {
      const media = this.media.get(id);
      if (!media || !rec.url) continue;
      this.applySource(rec, media, id, "preview");
    }
  }

  attachUrl(mediaId: string, url: string) {
    const media = this.media.get(mediaId);
    if (!media) return;
    const rec = this.ensureEl(media);
    const proxy = rec.proxyUrl ?? this.pendingProxies.get(mediaId);
    if (proxy) {
      rec.proxyUrl = proxy;
      this.pendingProxies.delete(mediaId);
    }
    // preview prefers the proxy; keep BOTH urls alive so export can switch back
    rec.url = url;
    this.chromaCache.forEach((c, k) => {
      void c;
      if (this.clipUsingMedia(k, mediaId)) {
        this.chromaCache.delete(k);
        this.keyColorCache.delete(k);
      }
    });
    this.applySource(rec, media, mediaId, "preview");
    if (media.isGif && !rec.gif) {
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

  /** Load full video data only when a clip becomes active on the timeline. */
  private requestVideoLoad(mediaId: string) {
    const rec = this.els.get(mediaId);
    if (!rec || rec.videoBroken || !(rec.el instanceof HTMLVideoElement)) return;
    const video = rec.el;
    if (video.readyState >= 2) {
      // Already have frames — clear any stale latch so a later seek can
      // re-issue a load if the decoder dropped them.
      rec.videoLoadRequested = false;
      if (rec.videoLoadTimer) {
        window.clearTimeout(rec.videoLoadTimer);
        rec.videoLoadTimer = undefined;
      }
      return;
    }
    if (rec.videoLoadRequested) return;
    rec.videoLoadRequested = true;
    video.preload = "auto";
    // Changing preload is enough for a media element which already has a
    // source. Calling load() here resets its seek position and interrupts
    // playback, especially at cuts on slower phones.
    if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      try {
        video.load();
      } catch {
        /* browser rejected the load */
      }
    }
    rec.videoLoadTimer = window.setTimeout(() => {
      rec.videoLoadTimer = undefined;
      if (this.els.get(mediaId) !== rec || rec.videoBroken) return;
      if (video.readyState >= 2) return;
      // A hard decoder error is the only reliable evidence. Give a slow load
      // more rope instead of condemning the clip: retry once, and only call it
      // broken if the element has actively errored.
      rec.videoLoadRequested = false;
      if (video.error) {
        this.markVideoBroken(mediaId, `decoder error ${video.error.code}: ${video.error.message}`);
      } else if (!rec.videoSlowLoadRetried) {
        rec.videoSlowLoadRetried = true;
        this.requestVideoLoad(mediaId);
      }
      // still no frame and no error: leave it alone — it may yet arrive
    }, 45000);
  }

  /** A video track can't be decoded here: switch its sound to a shadow
   *  <audio> element so the editor stays fully usable (audio, captions,
   *  export audio) while the preview shows a clear placeholder. */
  private markVideoBroken(mediaId: string, why: string) {
    const rec = this.els.get(mediaId);
    if (!rec || rec.videoBroken) return;
    rec.videoBroken = true;
    if (rec.videoLoadTimer) {
      window.clearTimeout(rec.videoLoadTimer);
      rec.videoLoadTimer = undefined;
    }
    console.warn(
      `[mayocut] video not playable on this device — ${why}: ${this.media.get(mediaId)?.name ?? mediaId}`,
    );
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
    for (const tr of this.project.tracks)
      if (tr.clips.some((c) => c.id === clipId && c.mediaId === mediaId)) return true;
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
    // The echo must be a *send*: delay → delayWet → out. Without this gain
    // stage the dry and delayed signals were summed 1:1 into the output,
    // which is the "two voices at once" artefact.
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;
    const feedback = ctx.createGain();
    feedback.gain.value = 0;
    const conv = ctx.createConvolver();
    if (!this.impulse) this.impulse = makeImpulse(ctx, 1.8);
    conv.buffer = this.impulse;
    const convWet = ctx.createGain();
    convWet.gain.value = 0;
    // voice-shaping EQ sits on the dry path, before the output
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 220;
    low.gain.value = 0;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1600;
    mid.Q.value = 1;
    mid.gain.value = 0;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 4800;
    high.gain.value = 0;
    inNode.connect(low);
    low.connect(mid);
    mid.connect(high);
    // One-tap effects live in a swappable stage after the voice EQ, so
    // preview and export share one graph and a clip's effect can change
    // without tearing down the delay/reverb sends.
    const fxIn = ctx.createGain();
    const fxOut = ctx.createGain();
    high.connect(fxIn);
    fxIn.connect(fxOut);
    fxOut.connect(out); // dry
    inNode.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(out);
    delay.connect(feedback);
    feedback.connect(delay);
    inNode.connect(conv);
    conv.connect(convWet);
    convWet.connect(out);
    out.connect(this.master!);
    const chain: FxChain = {
      in: inNode,
      out,
      delay,
      delayWet,
      feedback,
      conv,
      convWet,
      low,
      mid,
      high,
      fxIn,
      fxOut,
      fxNodes: [],
    };
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
   * Decode a source segment [inS, outS), preserving its channels and also
   * producing a mono waveform for analysis. Powers "Extract audio". Limit: sources
   * up to ~15 min (decodeAudioData needs the whole file in memory).
   */
  async extractAudioWav(
    mediaId: string,
    inS: number,
    outS: number,
  ): Promise<{
    samples: Float32Array;
    channels: Float32Array[];
    sampleRate: number;
    duration: number;
  } | null> {
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
    const channels = Array.from({ length: chs }, (_, c) => buf.getChannelData(c).slice(start, end));
    return { samples: out, channels, sampleRate: sr, duration: n / sr };
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
    const active = new Map<
      string,
      {
        reverb: number;
        echo: number;
        low?: number;
        mid?: number;
        high?: number;
        fx: AudioFxId;
      }
    >();
    for (const tr of this.project.tracks)
      for (const c of tr.clips) {
        if (c.kind !== "audio" || !c.mediaId) continue;
        if (t >= c.start && t < c.start + c.duration) {
          active.set(c.mediaId, {
            reverb: clamp01(c.fx?.reverb ?? 0),
            echo: clamp01(c.fx?.echo ?? 0),
            fx: c.audioFx ?? "none",
          });
        }
      }
    // voice shaping from main clips (bass / mid / treble "voice enhance")
    for (const s2 of mainSpans(this.project)) {
      if (!s2.clip.voice) continue;
      if (t >= s2.start && t < s2.end) {
        const cur = active.get(s2.clip.mediaId) ?? { reverb: 0, echo: 0, fx: "none" as AudioFxId };
        active.set(s2.clip.mediaId, {
          ...cur,
          low: s2.clip.voice.low,
          mid: s2.clip.voice.mid,
          high: s2.clip.voice.high,
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
      // wet level scales with the amount; 0 means genuinely silent
      fx.delayWet.gain.value = echo > 0 ? 0.65 * echo : 0;
      fx.feedback.gain.value = echo > 0 ? 0.45 * echo : 0;
      fx.convWet.gain.value = reverb;
      // voice shaping (dB: ±12 for a strong but usable range)
      fx.low.gain.value = (a?.low ?? 0) * 12;
      fx.mid.gain.value = (a?.mid ?? 0) * 10;
      fx.high.gain.value = (a?.high ?? 0) * 12;
      // pull dry down slightly when wet is hot to avoid clipping
      fx.in.gain.value = 1 - 0.35 * Math.max(reverb, echo);
      // One-tap effect: swapped only when it changes, and cleared for media
      // that is not currently under an effected clip.
      this.setAudioFx(rec, a?.fx ?? "none");
    }
  }

  /**
   * Put a one-tap audio effect on a media's chain, or clear it.
   *
   * Rebuilds only when the effect actually changes: a rebuild disconnects and
   * reconnects nodes, which would click if it happened on every frame.
   */
  private setAudioFx(rec: ElRecord, id: AudioFxId) {
    const ctx = this.audioCtx;
    const fx = rec.fx;
    if (!ctx || !fx || !fx.fxIn || !fx.fxOut) return;
    if (fx.fxId === id) return;
    // tear down the previous effect
    for (const n of fx.fxNodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
      const maybe = n as AudioNode & { stop?: (when?: number) => void };
      if (typeof maybe.stop === "function") {
        try {
          maybe.stop();
        } catch {
          /* an oscillator can only be stopped once */
        }
      }
    }
    fx.fxNodes = [];
    try {
      fx.fxIn.disconnect();
    } catch {
      /* nothing connected yet */
    }
    if (id === "none") {
      fx.fxIn.connect(fx.fxOut);
      fx.fxId = id;
      return;
    }
    const chain = buildAudioFx(ctx, id, {
      impulse: (sec) => {
        if (!this.impulse || Math.abs(this.impulse.duration - sec) > 0.05) {
          this.impulse = makeImpulse(ctx, sec);
        }
        return this.impulse;
      },
    });
    fx.fxIn.connect(chain.input);
    chain.output.connect(fx.fxOut);
    fx.fxNodes = [chain.input, chain.output, ...chain.nodes];
    fx.fxId = id;
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
      Math.abs(rec.bufClip.start + (this.audioCtx.currentTime - (rec.bufStartWall ?? 0)) - local) <
        0.4
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
    rec.bufClip = { clipId: c.id, start: local };
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
    // Wait for the opening frame before the clock starts moving. Without this
    // the first ~0.3 s of every video played over a blank/placeholder frame
    // while the element was still seeking — the "starts black with no volume"
    // report. Bounded, so a broken source cannot hang Play.
    await this.awaitFrameFor(this.t, 700);
    this.playing = true;
    this.lastNow = performance.now();
    this.lastPaintAt = 0;
    this.lastUiTimeAt = 0;
    this.onPlayingChange?.(true);
    this.syncElements(true);
    const els = this.activeAudioEls();
    for (const e of els) if (!e.clipReverse) void e.el.play().catch(() => undefined);
    this.loopRaf();
  }

  private setBuffering(value: boolean) {
    if (this.buffering === value) return;
    this.buffering = value;
    this.onBufferingChange?.(value);
  }

  /** Only active visual sources can hold up the timeline. */
  private videosAwaitingFrame(): HTMLVideoElement[] {
    const ids = new Set<string>();
    const sample = sampleTimeline(this.project, this.t);
    for (const s of sample.main) ids.add(s.clip.mediaId);
    for (const layer of sample.overlays) {
      const track = this.project.tracks.find((tr) => tr.id === layer.trackId);
      if (!track?.hidden && layer.clip.kind === "video" && layer.clip.mediaId)
        ids.add(layer.clip.mediaId);
    }
    const pending: HTMLVideoElement[] = [];
    for (const id of ids) {
      const rec = this.els.get(id);
      if (!rec || rec.videoBroken || !(rec.el instanceof HTMLVideoElement)) continue;
      this.requestVideoLoad(id);
      if (rec.el.readyState < 2 || rec.el.seeking) pending.push(rec.el);
    }
    return pending;
  }

  /** Wait for the first frame before starting a real-time export recording. */
  private async prepareExportFrame() {
    this.syncElements(true);
    const pending = this.videosAwaitingFrame();
    await Promise.all(
      pending.map(
        (el) =>
          new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(timer);
              el.removeEventListener("loadeddata", check);
              el.removeEventListener("seeked", check);
              el.removeEventListener("error", fail);
            };
            const check = () => {
              if (el.readyState >= 2 && !el.seeking) {
                cleanup();
                resolve();
              }
            };
            const fail = () => {
              cleanup();
              reject(new Error("Video could not be decoded for export"));
            };
            el.addEventListener("loadeddata", check);
            el.addEventListener("seeked", check);
            el.addEventListener("error", fail);
            const timer = setTimeout(() => {
              cleanup();
              reject(
                new Error("Video took too long to load for export. Try a smaller H.264 video."),
              );
            }, 15000);
            check();
          }),
      ),
    );
    this.draw();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.setBuffering(false);
    cancelAnimationFrame(this.raf);
    for (const rec of this.els.values()) {
      const e = rec.el as Partial<AudioEl>;
      if (e && !e.paused) e.pause?.();
      if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
    }
    this.onPlayingChange?.(false);
    this.draw();
    this.onTime?.(this.t);
  }

  toggle() {
    if (this.playing) this.pause();
    else void this.play();
  }

  /**
   * Position the timeline at `t` and make sure the picture is actually ready
   * before a frame is captured.
   *
   * The real-time export paths sampled `draw()` on a timer, so any moment where
   * the element was still seeking became a blank (black) frame in the exported
   * file — the same class of bug as the black opening in the preview. Export
   * must never capture a frame it has not confirmed.
   */
  private async frameReadyAt(t: number, budgetMs = 500): Promise<void> {
    this.seek(t);
    const comp = resolveComposition(this.project, t);
    const waits: Promise<void>[] = [];
    for (const layer of comp.main) {
      const rec = this.els.get(layer.clip.mediaId);
      const el = rec?.el;
      if (!(el instanceof HTMLVideoElement)) continue;
      if (el.readyState >= 2 && Math.abs(el.currentTime - layer.src) <= 0.15) continue;
      waits.push(
        new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timer);
            el.removeEventListener("seeked", finish);
            el.removeEventListener("loadeddata", finish);
            el.removeEventListener("canplay", finish);
            resolve();
          };
          const timer = window.setTimeout(finish, budgetMs);
          el.addEventListener("seeked", finish);
          el.addEventListener("loadeddata", finish);
          el.addEventListener("canplay", finish);
          try {
            el.currentTime = layer.src;
          } catch {
            finish();
          }
        }),
      );
    }
    if (waits.length) await Promise.all(waits);
    this.draw();
  }

  /**
   * Is the picture for `t` actually on screen?
   *
   * Returns "loading" when a visible layer's element has no decoded frame yet,
   * so the transport can hold the clock rather than run over a blank frame.
   * Images and text are always ready; only video can be late.
   */
  private visibleLayerReady(t: number): "ready" | "loading" {
    const comp = resolveComposition(this.project, t);
    for (const layer of comp.main) {
      const rec = this.els.get(layer.clip.mediaId);
      const el = rec?.el;
      if (!(el instanceof HTMLVideoElement)) continue;
      if (el.readyState < 2 || el.videoWidth === 0) return "loading";
    }
    return "ready";
  }

  /**
   * Wait (bounded) until every visible media element has a frame for `t`.
   *
   * Resolves early if everything is already ready, and gives up after
   * `budgetMs` so a genuinely broken source cannot hang the transport. The
   * caller uses this before starting playback, which is what stops the first
   * moments of a clip from being black.
   */
  private awaitFrameFor(t: number, budgetMs = 700): Promise<void> {
    const comp = resolveComposition(this.project, t);
    const pending: { el: HTMLVideoElement; src: number }[] = [];
    for (const layer of comp.main) {
      const rec = this.els.get(layer.clip.mediaId);
      const el = rec?.el;
      if (!(el instanceof HTMLVideoElement)) continue;
      if (el.readyState >= 2) {
        // have data; nudge it to the exact position if it is far off
        if (Math.abs(el.currentTime - layer.src) > 0.2) {
          try {
            el.currentTime = layer.src;
          } catch {
            /* not seekable yet */
          }
        }
        continue;
      }
      this.requestVideoLoad(layer.clip.mediaId);
      pending.push({ el, src: layer.src });
    }
    if (!pending.length) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        for (const p of pending) {
          p.el.removeEventListener("loadeddata", onReady);
          p.el.removeEventListener("canplay", onReady);
          p.el.removeEventListener("seeked", onReady);
        }
        resolve();
      };
      const onReady = () => {
        if (pending.every((p) => p.el.readyState >= 2)) finish();
      };
      const timer = window.setTimeout(finish, budgetMs);
      for (const p of pending) {
        p.el.addEventListener("loadeddata", onReady);
        p.el.addEventListener("canplay", onReady);
        p.el.addEventListener("seeked", onReady);
      }
    });
  }

  private loopRaf() {
    cancelAnimationFrame(this.raf);
    const step = (now: number) => {
      if (!this.playing) return;
      // Do not advance the timeline or let audio run ahead while a preview
      // video is still loading or seeking. Real-time exports preflight their
      // first frame separately and must not silently insert recording time.
      if (!this.exporting && this.videosAwaitingFrame().length) {
        if (!this.buffering) {
          this.setBuffering(true);
          for (const [id, rec] of this.els) {
            const el = rec.el as Partial<AudioEl>;
            if (el && !el.paused) el.pause?.();
            if (rec.audioFallback && !rec.audioFallback.paused) rec.audioFallback.pause();
            if (rec.bufSrc) this.stopBufSource(id);
          }
        }
        this.lastNow = now;
        this.raf = requestAnimationFrame(step);
        return;
      }
      if (this.buffering) {
        this.setBuffering(false);
        this.syncElements(true);
        this.lastNow = now;
      }
      const dt = Math.min(0.25, (now - this.lastNow) / 1000);
      const dur = this.duration();
      this.lastNow = now;
      this.t += dt;
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
      // Keep clock precision at display refresh; composite preview at 30 fps
      // and update React's timeline state at 15 fps to avoid render thrashing.
      if (now - this.lastPaintAt >= 1000 / 30) {
        this.lastPaintAt = now;
        this.syncElements(false);
        this.draw();
      }
      if (now - this.lastUiTimeAt >= 1000 / 15) {
        this.lastUiTimeAt = now;
        this.onTime?.(this.t);
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /**
   * Glue media elements to the timeline clock.
   * Reverse clips: the element is held paused and re-seeked to the mirrored
   * source position every frame (its audio is muted by the timeline gain).
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
    // Warm the next source shortly before a cut instead of starting its
    // decoder only after the playhead arrives there.
    const next = spans.find((s) => s.start > t && s.start - t <= 3);
    if (next) this.requestVideoLoad(next.clip.mediaId);
    const activeIds = new Set<string>();
    const sample = sampleTimeline(this.project, t);
    for (const s of sample.main) {
      activeIds.add(s.clip.mediaId);
      const rec = this.els.get(s.clip.mediaId);
      const el = this.audioEl(s.clip.mediaId);
      if (!el) continue;
      if (el instanceof HTMLVideoElement || rec?.videoBroken) {
        if (el instanceof HTMLVideoElement) this.requestVideoLoad(s.clip.mediaId);
        if (s.clip.freeze) {
          // held frame: hold this exact frame, silent
          const at = s.clip.in + 1 / 60;
          if (Math.abs(el.currentTime - at) > 0.02) {
            try {
              el.currentTime = Math.max(0, at);
            } catch {
              /* not seekable yet */
            }
          }
          el.volume = 0;
          if (!el.paused) el.pause();
          continue;
        }
        const local = s.sourceTime;
        if (Math.abs(el.currentTime - local) > (hard ? 0.08 : 0.2)) {
          try {
            el.currentTime = Math.max(0, local);
          } catch {
            /* not seekable yet */
          }
        }
        // reverse clips advance the element forward, so use the clock rate.
        // Guarded: assigning NaN to playbackRate is a silent no-op in every
        // browser, which leaves the element at the previous clip's rate —
        // "speed says 1x but it plays at 2x".
        {
          const rate = s.playbackRate;
          const safe = Number.isFinite(rate) && rate > 0 ? Math.min(16, rate) : 1;
          if (el.playbackRate !== safe) el.playbackRate = safe;
        }
        el.volume = Math.max(
          0,
          Math.min(1, s.gain * (this.mainTrackAudible() ? this.duckFactor(t) : 0)),
        );
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
    for (const layer of sample.overlays) {
      const c = layer.clip;
      if (c.kind === "audio") {
        if (!c.mediaId) continue;
        if (t >= c.start && t < c.start + c.duration) {
          activeIds.add(c.mediaId);
          const el = this.audioEl(c.mediaId);
          if (!el) continue;
          const local = layer.sourceTime;
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
            if (el.playbackRate !== 1) el.playbackRate = 1;
            el.volume = this.overlayAudioVolume(c, t) * this.duckFactor(t);
            if (this.playing && el.paused) void el.play().catch(() => undefined);
          }
        }
      } else if (c.kind === "video" && c.mediaId) {
        // picture sticker from a video: frame-synced, always silent
        if (t >= c.start && t < c.start + c.duration) {
          activeIds.add(c.mediaId);
          const el = this.audioEl(c.mediaId);
          if (el instanceof HTMLVideoElement) {
            this.requestVideoLoad(c.mediaId);
            let local = layer.sourceTime;
            if (c.loop) {
              const md = this.media.get(c.mediaId)?.duration ?? 0;
              if (md > 0.05) local %= md;
            }
            if (Math.abs(el.currentTime - local) > (hard ? 0.08 : 0.2)) {
              try {
                el.currentTime = Math.max(0, local);
              } catch {
                /* ignore */
              }
            }
            el.playbackRate = Math.max(0.05, Math.min(16, c.speed ?? 1));
            el.volume = 0;
            if (this.playing && el.paused) void el.play().catch(() => undefined);
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
    const out: { el: AudioEl; clipReverse: boolean }[] = [];
    const sample = sampleTimeline(this.project, this.t);
    for (const s of sample.main) {
      if (s.clip.freeze) continue;
      const rec = this.els.get(s.clip.mediaId);
      if (rec?.videoBroken && rec.el instanceof HTMLVideoElement) {
        rec.el.muted = true;
        if (!rec.el.paused) rec.el.pause();
      }
      const el = this.audioEl(s.clip.mediaId);
      if (el) out.push({ el, clipReverse: !!s.clip.reverse });
    }
    for (const { clip } of sample.overlays) {
      if ((clip.kind !== "audio" && clip.kind !== "video") || !clip.mediaId) continue;
      const el = this.audioEl(clip.mediaId);
      if (el) out.push({ el, clipReverse: clip.kind === "video" });
    }
    return out;
  }

  private effectiveVolume(clip: MainClip, t: number, s: { start: number; end: number }): number {
    // The transition crossfade maths lives in types.ts so it can be asserted
    // without a DOM (see mainClipGain). Here we only add the runtime factors.
    const hasPrevious = this.project.main[0]?.id !== clip.id;
    let v = mainClipGain(clip, s, this.nextMainSpan(s), t, hasPrevious);
    v *= this.mainTrackAudible() ? this.duckFactor(t) : 0;
    return Math.max(0, Math.min(1, v));
  }

  /** The span immediately after `s`, or null when `s` is the last one. */
  private nextMainSpan(s: { start: number; end: number }) {
    const spans = mainSpans(this.project);
    const i = spans.findIndex((x) => Math.abs(x.start - s.start) < 1e-6);
    return i >= 0 && i + 1 < spans.length ? spans[i + 1] : null;
  }
  private overlayAudioVolume(c: OverlayClip, t: number): number {
    const fadeIn = c.fadeIn ?? 0.15;
    const fadeOut = c.fadeOut ?? 0.15;
    const inT = t - c.start;
    const outT = c.start + c.duration - t;
    let v = c.volume ?? 1;
    if (fadeIn > 0) v *= clamp01(inT / fadeIn);
    if (fadeOut > 0) v *= clamp01(outT / fadeOut);
    v *= this.trackGain(this.overlayTrackOf(c.id));
    return Math.max(0, Math.min(1, v));
  }

  /**
   * Track-level audio gain from mute/solo. Solo anywhere = every non-solo
   * track goes silent (CapCut behaviour). Applies to main-track sound and all
   * audio overlays, in preview and export alike.
   */
  private trackGain(trackId: string | null): number {
    const tracks = this.project.tracks;
    const anySolo = tracks.some((t) => t.solo);
    if (anySolo) {
      const tr = trackId ? tracks.find((t) => t.id === trackId) : null;
      if (!tr?.solo) return 0;
      return tr.muted ? 0 : 1;
    }
    const tr = trackId ? tracks.find((t) => t.id === trackId) : null;
    return tr?.muted ? 0 : 1;
  }

  /** Solo/mute for the main track (main sound is muted when any solo is on). */
  private mainTrackAudible(): boolean {
    return !this.project.tracks.some((t) => t.solo && t.clips.length > 0);
  }

  /**
   * Ducking: how much to pull music down while a `duck` clip is playing.
   *
   * Pure with respect to the project — it reads no live audio state — so the
   * offline scheduler can call it directly and get the same curve the preview
   * uses. It is deliberately *not* duplicated in the export path: music that
   * dips under a voiceover during editing must dip in the file too.
   */
  duckFactor(t: number): number {
    const amount = this.project.duckAmount ?? 0.7;
    if (amount <= 0) return 1;
    // a solo'd clip is the main event: nothing is allowed to quiet it
    let k = 1;
    for (const tr of this.project.tracks) {
      for (const c of tr.clips) {
        if (!c.duck || c.kind === "text") continue;
        // ramp the duck in/out over 250ms so it never clicks
        const inK = clamp01((t - c.start) / 0.25);
        const outK = clamp01((c.start + c.duration - t) / 0.25);
        const amt = Math.min(0.98, c.duck) * amount * Math.min(inK, outK);
        // isolated (solo'd) tracks are exempt from ducking
        if (this.project.tracks.some((x) => x.solo) && this.trackGain(tr.id) === 1) continue;
        k = Math.min(k, 1 - amt);
      }
    }
    return Math.max(0, k);
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
      this.master.gain.value = this.project.masterGain ?? 1;
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

  /**
   * Rotate the whole project between landscape and portrait.
   *
   * CapCut's version of this asks which direction to turn and then *flips the
   * picture*, not just the canvas: every main clip and every positioned overlay
   * gets mirrored across the diagonal, so a clip that was framed top-left in
   * landscape is still top-left after the turn. Rotating the canvas alone would
   * silently re-frame everything the user had placed.
   */
  rotateOrientation(dir: "cw" | "ccw" = "cw") {
    const a = ASPECTS[this.project.aspect];
    const landscape = a.w > a.h;
    const target: Project["aspect"] = landscape ? "9:16" : "16:9";
    const s = dir === "cw" ? 1 : -1;
    // x' = -s·y, y' = s·x — a quarter turn, mirrored correctly per direction
    const turn = (o: OverlayClip) => {
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      o.x = -s * y;
      o.y = s * x;
      if (o.rot !== undefined) o.rot = (o.rot + 90 * s) % 360;
    };
    for (const tr of this.project.tracks) for (const c of tr.clips) if (c.kind !== "text") turn(c);
    this.project.aspect = target;
    this.bump();
    if (this.canvas) {
      const b = ASPECTS[target];
      this.canvas.width = b.w;
      this.canvas.height = b.h;
      this.draw();
    }
    return target;
  }

  /** Base animation values for a clip (used when a param has no keyframes). */
  animBase(clip: MainClip | OverlayClip): AnimValues {
    if ("kind" in clip && (clip.kind === "image" || clip.kind === "video")) {
      return {
        x: clip.x ?? 0,
        y: clip.y ?? 0,
        scale: clip.scale ?? 0.5,
        rotation: clip.rot ?? 0,
        opacity: 1,
      };
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
    // canvas background (lets users put letterboxed footage on a color)
    ctx.fillStyle = this.project.background || "#000";
    ctx.fillRect(0, 0, W, H);

    // --- main track (with transitions) ---
    //
    // The decision of WHICH clips are visible at `t` and at what progress now
    // comes from the shared timeline resolver, not from transition-window maths
    // duplicated here. Preview, export and the node tests therefore agree by
    // construction.
    const comp = resolveComposition(this.project, t);
    const spans = mainSpans(this.project);
    if (comp.transition) {
      const from = comp.transition.from;
      const to = comp.transition.to;
      this.composeTransition(
        ctx,
        spans[from.index],
        spans[to.index],
        comp.transition.kind,
        comp.transition.progress,
        W,
        H,
        t,
      );
    } else {
      for (const layer of comp.main) {
        this.drawMainItem(ctx, spans[layer.index], layer.alpha, W, H, t);
      }
    }

    // --- overlay tracks ---
    this.overlayRects.length = 0;
    for (const layer of comp.overlays) {
      const tr = this.project.tracks.find((track) => track.id === layer.trackId);
      if (tr?.hidden) continue;
      const c = layer.clip;
      const localT = layer.local;
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
          if (c.filter && c.filter !== "none") {
            ctx.filter = presetCss(c.filter) || "none";
          }
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          if (c.flipX || c.flipY) ctx.scale(c.flipX ? -1 : 1, c.flipY ? -1 : 1);
          if (c.mask && c.mask !== "none") this.applyMask(ctx, c.mask, size, ar);
          const dw = size;
          const dh = size / ar;
          if (c.fit === "contain" || c.fit === "blur") {
            // letterbox inside the sticker box, optional blurred backdrop
            const k2 = Math.min(dw / sw, dh / sh);
            const iw = sw * k2;
            const ih = sh * k2;
            if (c.fit === "blur") {
              const s2 = Math.max(dw / sw, dh / sh) * 1.1;
              const bx = ctx.filter;
              ctx.filter = `${bx ? bx + " " : ""}blur(${Math.max(2, dh * 0.06).toFixed(1)}px)`;
              ctx.drawImage(src, (dw - sw * s2) / 2, (dh - sh * s2) / 2, sw * s2, sh * s2);
              ctx.filter = bx || "none";
            }
            ctx.drawImage(src, -iw / 2, -ih / 2, iw, ih);
          } else {
            ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
          }
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  // ------------------------------------------------------------ main render

  /**
   * Composite an A→B transition at progress k (0..1). Handles crossfade,
   * dip-to-black/white, directional slides, wipes, a zoom punch and a blur
   * dissolve. Both clips render through the exact same path as normal playback
   * (filters, keyframes, LUTs, effects), so preview and export stay identical.
   */
  private composeTransition(
    ctx: CanvasRenderingContext2D,
    a: { clip: MainClip; start: number; end: number },
    b: { clip: MainClip; start: number; end: number },
    kind: TransitionKind,
    k: number,
    W: number,
    H: number,
    t: number,
  ) {
    const dip = isDipTo(kind);
    if (dip) {
      // previous clip fades to the dip colour, the new one fades in from it
      if (k < 0.5) {
        this.drawMainItem(ctx, a, 1 - 2 * k, W, H, t);
        ctx.save();
        ctx.globalAlpha = k * 2;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = dip === "white" ? "#fff" : "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = dip === "white" ? "#fff" : "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        this.drawMainItem(ctx, b, 2 * k - 1, W, H, t);
      }
      return;
    }

    if (kind === "crossfade") {
      this.drawMainItem(ctx, a, 1, W, H, t);
      this.drawMainItem(ctx, b, k, W, H, t);
      return;
    }

    if (kind === "blur") {
      // crossfade with a blur that peaks mid-transition (4K-safe: capped px)
      const blurPx = Math.sin(Math.PI * k) * Math.max(3, H * 0.012);
      this.drawMainItem(ctx, a, 1, W, H, t, blurPx);
      this.drawMainItem(ctx, b, k, W, H, t, blurPx);
      return;
    }

    if (kind === "zoom") {
      // outgoing clip pushes in while the incoming one pops out to full frame
      this.drawMainItem(ctx, a, 1, W, H, t, 0, 1 + 0.22 * k);
      this.drawMainItem(ctx, b, clamp01(k * 1.15), W, H, t, 0, 1.18 - 0.18 * k);
      return;
    }

    // --- geometric transitions: draw A, then mask B in ---
    const e = k; // linear is what an edit feels like; keep it frame-accurate
    const soft = wipeDir(kind);

    if (soft?.soft) {
      // Feathered wipe: B is masked by a linear gradient whose soft edge travels
      // across the frame. One extra offscreen buffer (at preview scale), so the
      // cost is comparable to the blur transition and stays phone-friendly.
      this.drawMainItem(ctx, a, 1, W, H, t);
      this.drawFeatheredWipe(ctx, b, W, H, t, soft.dir, e);
      return;
    }

    this.drawMainItem(ctx, a, 1, W, H, t);
    ctx.save();
    if (
      kind === "slideleft" ||
      kind === "slideright" ||
      kind === "slideup" ||
      kind === "slidedown"
    ) {
      let dx = 0;
      let dy = 0;
      if (kind === "slideleft") dx = W - W * e; // B comes from the right
      if (kind === "slideright") dx = -(W - W * e);
      if (kind === "slideup") dy = H - H * e;
      if (kind === "slidedown") dy = -(H - H * e);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.translate(dx, dy);
      this.drawMainItem(ctx, b, 1, W, H, t);
    } else if (kind === "slide") {
      // Diagonal push: both frames travel along the ↘ axis, so the motion reads
      // as a single camera move rather than two panels sliding independently.
      const span = Math.hypot(W, H);
      const ux = W / span;
      const uy = H / span;
      const d = span * e;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.translate(d * ux, d * uy);
      this.drawMainItem(ctx, a, 1, W, H, t);
      ctx.translate(-span * ux, -span * uy);
      this.drawMainItem(ctx, b, 1, W, H, t);
    } else if (soft) {
      // hard-edged wipes: rectangular reveal growing from the side
      const w = W * e;
      const h = H * e;
      ctx.beginPath();
      if (soft.dir === "left") ctx.rect(W - w, 0, w, H);
      else if (soft.dir === "right") ctx.rect(0, 0, w, H);
      else if (soft.dir === "up") ctx.rect(0, H - h, W, h);
      else ctx.rect(0, 0, W, h);
      ctx.clip();
      this.drawMainItem(ctx, b, 1, W, H, t);
      // a soft edge line sells the wipe
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.5 * Math.sin(Math.PI * k);
      ctx.fillStyle = "#fff";
      if (soft.dir === "left") ctx.fillRect(W - w - 1, 0, 2, H);
      else if (soft.dir === "right") ctx.fillRect(w - 1, 0, 2, H);
      else if (soft.dir === "up") ctx.fillRect(0, H - h - 1, W, 2);
      else ctx.fillRect(0, h - 1, W, 2);
    }
    ctx.restore();
  }

  /**
   * Feathered (gradient-masked) wipe.
   *
   * The incoming frame renders into an offscreen buffer at preview scale and is
   * composited back through a `destination-in` linear gradient, so the reveal
   * edge is soft instead of a hard line — CapCut's "soft wipe". The edge
   * travels from fully outside the near side to fully outside the far side, so
   * k = 0 shows none of B and k = 1 shows all of it (no half-faded sliver).
   */
  private drawFeatheredWipe(
    ctx: CanvasRenderingContext2D,
    b: { clip: MainClip; start: number; end: number },
    W: number,
    H: number,
    t: number,
    dir: "left" | "right" | "up" | "down",
    e: number,
  ) {
    // half-res buffer: a feathered edge hides the resampling completely
    const scale = Math.min(1, 720 / Math.max(W, H));
    const bw = Math.max(2, Math.round(W * scale));
    const bh = Math.max(2, Math.round(H * scale));
    const buf = document.createElement("canvas");
    buf.width = bw;
    buf.height = bh;
    const bctx = buf.getContext("2d");
    if (!bctx) return;
    bctx.scale(bw / W, bh / H);
    this.drawMainItem(bctx, b, 1, W, H, t);
    bctx.setTransform(1, 0, 0, 1, 0, 0);

    const vertical = dir === "up" || dir === "down";
    const span = vertical ? bh : bw;
    const feather = Math.max(1, span * 0.12);
    const k = clamp01(e);
    // "right"/"down" reveal from the low edge of the axis, "left"/"up" from the
    // high edge — so the travelling edge runs in the opposite direction there.
    const lowSide = dir === "right" || dir === "down";
    const edge = lowSide
      ? -feather + k * (span + feather * 2)
      : span + feather - k * (span + feather * 2);
    const t0 = clamp01((edge - feather) / span);
    const t1 = clamp01((edge + feather) / span);

    const g = vertical
      ? bctx.createLinearGradient(0, 0, 0, bh)
      : bctx.createLinearGradient(0, 0, bw, 0);
    const A = (v: number) => `rgba(0,0,0,${v})`;
    g.addColorStop(0, A(lowSide ? 1 : 0));
    g.addColorStop(t0, A(lowSide ? 1 : 0));
    g.addColorStop(t1, A(lowSide ? 0 : 1));
    g.addColorStop(1, A(lowSide ? 0 : 1));

    bctx.globalCompositeOperation = "destination-in";
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, bw, bh);
    bctx.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.drawImage(buf, 0, 0, W, H);
    ctx.restore();
  }

  private drawMainItem(
    ctx: CanvasRenderingContext2D,
    s: { clip: MainClip; start: number; end: number },
    alpha: number,
    W: number,
    H: number,
    t: number,
    blurPx = 0,
    scaleMul = 1,
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
        // Never paint the filename card over live playback: a seek or a
        // dropped frame would flash text across the preview. Show it only
        // when we genuinely have nothing (no dimensions yet) or the clip is
        // known-broken, which is the case the card exists to explain.
        const hasFrame = el instanceof HTMLVideoElement && el.videoWidth > 0;
        if (rec.videoBroken || (!hasFrame && !this.playing)) {
          this.drawPlaceholder(ctx, W, H, c.mediaId, a, rec.videoBroken);
        }
        return;
      }
    } else {
      this.drawPlaceholder(ctx, W, H, c.mediaId, a, rec.videoBroken);
      return;
    }
    const eff: EffectId = c.effect ?? "none";
    // a frozen frame has no motion: hold it still regardless of effect
    const ef = c.freeze
      ? { tx: 0, ty: 0, scale: 1, rot: 0 }
      : this.effectTransform(c, localT, W, H, mainClipDuration(c));

    ctx.save();
    ctx.globalAlpha = a;
    let filterCss = buildFilterCss(c);
    if (eff === "blur-in") {
      const ramp = clamp01(localT / 0.45);
      const px = Math.round((1 - ramp) * H * 0.018 * 10) / 10;
      if (px > 0.05) filterCss = (filterCss + ` blur(${px}px)`).trim();
    }
    if (blurPx > 0.05) filterCss = (filterCss + ` blur(${blurPx.toFixed(2)}px)`).trim();
    ctx.filter = filterCss || "none";
    if (scaleMul !== 1) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(scaleMul, scaleMul);
      ctx.translate(-W / 2, -H / 2);
    }
    if (anim.x !== 0 || anim.y !== 0 || anim.scale !== 1 || anim.rotation !== 0) {
      ctx.translate(W / 2 + anim.x * (W / 2), H / 2 + anim.y * (H / 2));
      ctx.rotate((anim.rotation * Math.PI) / 180);
      ctx.scale(anim.scale, anim.scale);
      ctx.translate(-W / 2, -H / 2);
    }
    if (c.flipX || c.flipY) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(c.flipX ? -1 : 1, c.flipY ? -1 : 1);
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
    // Pixel-space grade (temperature / tint / vignette / sharpen / split-tone)
    // and LUTs need readback, so they render through the reduced offscreen pass.
    const needsGrade = this.gradeActive(c.adjust) || curvesActive(c.curves) || hslActive(c.hsl);
    if (lut || needsGrade) {
      this.drawMainGrade(ctx, el, W, H, c, lut ?? null);
    } else if (glitching || eff === "vhs") {
      this.drawMainSliced(ctx, el, W, H, glitching, localT);
    } else {
      this.drawImageFit(ctx, el, W, H, c.fit);
    }

    if (eff === "pulse-color") {
      const pulse = 0.5 + 0.5 * Math.sin((localT / 0.7) * Math.PI * 2);
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = a * 0.22 * pulse;
      ctx.fillStyle = "#ff5ea8";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
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
      case "zoom-out":
        r.scale = 1.16 - 0.16 * clamp01(localT / Math.max(0.6, dur * 0.6));
        break;
      case "pan-left":
        r.tx = -(W * 0.05) * clamp01(localT / Math.max(0.6, dur));
        r.scale = 1.08;
        break;
      case "pan-right":
        r.tx = W * 0.05 * clamp01(localT / Math.max(0.6, dur));
        r.scale = 1.08;
        break;
      case "tilt-up":
        r.ty = H * 0.045 * (1 - clamp01(localT / Math.max(0.6, dur)));
        r.scale = 1.06;
        break;
      case "kenburns": {
        const k = clamp01(localT / Math.max(0.001, dur));
        r.scale = 1.04 + 0.07 * k;
        r.tx = (k - 0.5) * W * 0.035;
        r.ty = (k - 0.5) * H * -0.02;
        break;
      }
      case "sway": {
        const seed = hashId(c.id);
        r.rot = Math.sin(localT * 1.6 + seed) * 0.012;
        r.tx = Math.sin(localT * 1.1 + seed) * W * 0.008;
        break;
      }
      case "tilt-down":
        r.ty = H * 0.045 * clamp01(localT / Math.max(0.6, dur));
        r.scale = 1.06;
        break;
      case "roll":
        // one full slow roll across the clip, starting flat
        r.rot = (clamp01(localT / Math.max(0.001, dur)) - 1) * Math.PI * 2;
        r.scale = 1.12;
        break;
      case "float": {
        // gentle vertical hover, ~3 s period, deterministic per clip
        const seed = hashId(c.id);
        r.ty = Math.sin(localT * 2.1 + seed) * H * 0.012;
        r.tx = Math.cos(localT * 1.4 + seed) * W * 0.004;
        r.scale = 1.04;
        break;
      }
      case "breathe":
        // slow in/out push, 4 s cycle — reads as a calm "alive" frame
        r.scale = 1.02 + 0.028 * (0.5 - 0.5 * Math.cos((localT / 4) * Math.PI * 2));
        break;
      case "jitter": {
        // high-frequency noise, no smooth sine: feels handheld/impactful
        const seed = hashId(c.id);
        const n = (a: number) =>
          Math.sin(localT * a + seed) * Math.sin(localT * (a * 0.37) + seed * 3);
        r.tx = n(47) * W * 0.007;
        r.ty = n(53) * H * 0.007;
        r.rot = n(41) * 0.004;
        break;
      }
      case "whip-left":
      case "whip-right": {
        // ease-in-out whip: fast through the middle, settled at both ends
        const k = clamp01(localT / Math.max(0.001, dur));
        const e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const dirSign = (c.effect ?? "") === "whip-left" ? -1 : 1;
        r.tx = dirSign * (1 - e2) * W * 0.5;
        r.scale = 1.18;
        break;
      }
      case "dolly-in":
        r.scale = 1 + 0.16 * clamp01(localT / Math.max(0.001, dur));
        break;
      case "dolly-out":
        r.scale = 1.16 - 0.16 * clamp01(localT / Math.max(0.001, dur));
        break;
      case "tilt-shift":
        // a subtle "miniature" push plus a slight downward drift
        r.scale = 1.08;
        r.ty = (clamp01(localT / Math.max(0.001, dur)) - 0.5) * H * 0.03;
        break;
      case "earthquake": {
        // low-frequency rumble with a burst-and-decay envelope
        const seed = hashId(c.id);
        const env = Math.exp(-((localT % 1.6) / 0.9));
        r.tx = Math.sin(localT * 63 + seed) * W * 0.012 * env;
        r.ty = Math.cos(localT * 57 + seed * 2) * H * 0.012 * env;
        r.rot = Math.sin(localT * 39 + seed) * 0.006 * env;
        break;
      }
      case "orbit": {
        // the frame circles the centre while staying upright
        const a2 = (localT / Math.max(0.001, dur)) * Math.PI * 2;
        r.tx = Math.sin(a2) * W * 0.035;
        r.ty = (1 - Math.cos(a2)) * H * 0.035;
        r.scale = 1.12;
        break;
      }
      default:
        break;
    }
    return r;
  }

  /** Glitch bursts: ~70 ms window every ~500 ms, deterministic per clip. */
  private glitchWindow(localT: number): boolean {
    const seed = (hashId("g") + localT * 10) | 0;
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

  /** Does this adjust need a pixel pass (anything CSS filters can't do)? */
  private gradeActive(a: FilterAdjust): boolean {
    return (
      (a.temperature ?? 0) !== 0 ||
      (a.tint ?? 0) !== 0 ||
      (a.vignette ?? 0) > 0 ||
      (a.sharpen ?? 0) > 0 ||
      (a.splitTone ?? 0) > 0
    );
  }

  /**
   * Main-clip render with pixel grading and/or a LUT applied.
   *
   * The source is drawn (cover/contain/blur fit) to a reduced offscreen canvas
   * (≤1280px long side), graded with one pass over the pixels, then upscaled in
   * a single drawImage. That keeps 4K exports and phone previews affordable
   * while filters, motion and transitions stay exact.
   */
  private drawMainGrade(
    ctx: CanvasRenderingContext2D,
    el: HTMLVideoElement | HTMLImageElement,
    W: number,
    H: number,
    c: MainClip,
    lut: LutTable | null,
  ) {
    const scale = Math.min(1, 1280 / Math.max(W, H));
    const W2 = Math.max(4, Math.round(W * scale));
    const H2 = Math.max(4, Math.round(H * scale));
    if (!this.lutOff) this.lutOff = document.createElement("canvas");
    const off = this.lutOff;
    if (off.width !== W2 || off.height !== H2) {
      off.width = W2;
      off.height = H2;
    }
    const octx = off.getContext("2d", { willReadFrequently: true });
    if (!octx) {
      this.drawImageFit(ctx, el, W, H, c.fit);
      return;
    }
    octx.filter = "none";
    octx.globalAlpha = 1;
    octx.clearRect(0, 0, W2, H2);
    this.paintFit(octx, el, W2, H2, c.fit);
    const img = octx.getImageData(0, 0, W2, H2);
    this.gradePixels(img.data, W2, H2, c.adjust);
    if (lut) applyLut(lut, img.data);
    // Tone / RGB curves run last, in the same pass — after the LUT so a curve
    // shapes the *look* rather than being flattened by it.
    const curveLuts = buildCurveLuts(c.curves);
    if (curveLuts) applyCurveLuts(img.data, curveLuts);
    // HSL targets specific colours, so it runs last — after the overall grade
    // has moved the pixels to where the user actually sees them.
    if (hslActive(c.hsl)) applyHsl(img.data, c.hsl!);
    octx.putImageData(img, 0, 0);
    ctx.drawImage(off, 0, 0, W, H);
  }

  /**
   * One-pass colour grade over RGBA pixels:
   *  • temperature — warm/cool channel push
   *  • tint        — green↔magenta balance
   *  • splitTone   — teal shadows, orange highlights
   *  • sharpen     — 3×1 luma unsharp mask (cheap but effective)
   *  • vignette    — radial darkening that follows the canvas aspect
   */
  private gradePixels(d: Uint8ClampedArray, W: number, H: number, a: FilterAdjust) {
    const temp = (a.temperature ?? 0) / 100; // -1..1
    const tint = (a.tint ?? 0) / 100;
    const split = (a.splitTone ?? 0) / 100;
    const sharp = (a.sharpen ?? 0) / 100;
    const vig = (a.vignette ?? 0) / 100;

    if (temp !== 0 || tint !== 0 || split > 0) {
      const tr = temp * 26;
      const tb = -temp * 26;
      const tg = tint * 20;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        // temperature + tint (a slight green lift is what "tint" does in CapCut)
        r += tr;
        b += tb;
        g += tg;
        if (split > 0) {
          // highlight lift (orange) / shadow push (teal), weighted by luma
          const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const kHigh = Math.max(0, l - 0.5) * 2 * split;
          const kLow = Math.max(0, 0.5 - l) * 2 * split;
          r += 26 * kHigh - 10 * kLow;
          g += 8 * kHigh + 12 * kLow;
          b += -18 * kHigh + 30 * kLow;
        }
        d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }

    if (sharp > 0) {
      // luma unsharp: out = src + amount * (src - blur3)
      const stride = W * 4;
      const centre = new Uint8ClampedArray(d.length);
      centre.set(d);
      const amt = 0.85 * sharp;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * stride + x * 4;
          if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
          for (let ch = 0; ch < 3; ch++) {
            const v = centre[i + ch];
            const blur =
              (centre[i + ch - 4] +
                centre[i + ch + 4] +
                centre[i + ch - stride] +
                centre[i + ch + stride]) /
              4;
            d[i + ch] = v + (v - blur) * amt;
          }
        }
      }
    }

    if (vig > 0) {
      const cx = W / 2;
      const cy = H / 2;
      const maxD = Math.hypot(cx, cy);
      // step over pixels coarsely for speed on big canvases; still per-pixel
      for (let y = 0; y < H; y++) {
        const dy = (y - cy) / maxD;
        for (let x = 0; x < W; x++) {
          const dx = (x - cx) / maxD;
          const r = Math.hypot(dx, dy);
          if (r < 0.55) continue;
          const k = 1 - vig * 0.85 * Math.min(1, (r - 0.55) / 0.45) ** 1.4;
          const i = (y * W + x) * 4;
          d[i] *= k;
          d[i + 1] *= k;
          d[i + 2] *= k;
        }
      }
    }
  }

  /** Frame-fit modes: cover (crop) · contain (letterbox) · blur (blurred fill). */
  private drawImageFit(
    ctx: CanvasRenderingContext2D,
    src: CanvasImageSource,
    W: number,
    H: number,
    fit: MainClip["fit"],
  ) {
    this.paintFit(ctx, src, W, H, fit);
  }

  private paintFit(
    ctx: CanvasRenderingContext2D,
    src: CanvasImageSource,
    W: number,
    H: number,
    fit: MainClip["fit"],
  ) {
    const sw = srcW(src);
    const sh = srcH(src);
    if (!sw || !sh) return;
    const mode = fit ?? "cover";
    if (mode === "cover") {
      const scale = Math.max(W / sw, H / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
      return;
    }
    const scale = Math.min(W / sw, H / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    if (mode === "blur") {
      // fill the frame with a heavily blurred cover copy, then the sharp fit
      ctx.save();
      ctx.filter = `blur(${Math.max(6, Math.round(Math.min(W, H) * 0.035))}px)`;
      const s2 = Math.max(W / sw, H / sh) * 1.12;
      ctx.drawImage(src, (W - sw * s2) / 2, (H - sh * s2) / 2, sw * s2, sh * s2);
      ctx.restore();
    }
    ctx.drawImage(src, dx, dy, dw, dh);
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
    const rawText = c.text ?? "";
    if (!rawText) return;
    const text = c.upper ? rawText.toUpperCase() : rawText;
    const px = Math.max(4, (c.size ?? 64) * (H / 1080) * anim.scale);
    const weight = c.bold ? 700 : 500;
    const italic = c.italic ? "italic " : "";
    const anim2 = c.anim ?? "none";
    ctx.save();
    ctx.globalAlpha = alpha * clamp01(c.opacity ?? 1);

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
    let xOff = 0;
    let popScale = 1;
    let riseAlpha = 1;
    let swingAngle = 0;
    let blurPx2 = 0;
    let flipScale = 1;
    let skewX = 0;
    let trackMul = 1;
    let wavePhase = 0;
    if (anim2 === "bounce") yOff = -px * 0.9 * (1 - easeOutBounce(clamp01(localT / 0.55)));
    if (anim2 === "slideup") yOff = (1 - clamp01(localT / 0.4)) * H * 0.03;
    if (anim2 === "slideleft") xOff = (1 - clamp01(localT / 0.4)) * W * 0.06;
    if (anim2 === "zoom-in") popScale = 0.72 + 0.28 * easeOutBounce(clamp01(localT / 0.5));
    if (anim2 === "rise") {
      const k = clamp01(localT / 0.55);
      yOff = (1 - k) * H * 0.06;
      riseAlpha = k;
    }
    if (anim2 === "wipe-in") riseAlpha = 1; // handled by the clip mask below
    // --- second wave entrances ---
    if (anim2 === "pop") popScale = 0.4 + 0.6 * easeOutBack(clamp01(localT / 0.42));
    if (anim2 === "drop-in") yOff = -H * 0.28 * (1 - easeOutBounce(clamp01(localT / 0.7)));
    if (anim2 === "swing") swingAngle = (1 - easeOutBack(clamp01(localT / 0.75))) * -0.9;
    if (anim2 === "blur-in") blurPx2 = (1 - clamp01(localT / 0.5)) * px * 0.55;
    if (anim2 === "flip") {
      // 3D-ish card flip faked by squashing the horizontal axis through zero:
      // 0 → edge-on, 0.5 → back to full width, as if the card turned over.
      const k = clamp01(localT / 0.5);
      flipScale = Math.max(0.02, Math.abs(Math.cos(k * Math.PI)));
    }
    if (anim2 === "skew-in") skewX = (1 - clamp01(localT / 0.5)) * 0.55;
    if (anim2 === "tracking-in") {
      // letter-spacing collapses into place — the classic "wide to tight" title
      const k = easeOutCubic(clamp01(localT / 0.8));
      trackMul = 6 + (1 - 6) * k;
      riseAlpha = clamp01(localT / 0.25);
    }
    if (anim2 === "wave") wavePhase = localT * 3.4;

    ctx.font = `${italic}${weight} ${Math.round(px)}px ${fontCss(c.font)}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tracking = ((c.tracking ?? 0) * trackMul * px) / 100;

    ctx.globalAlpha = alpha * clamp01(c.opacity ?? 1) * riseAlpha;

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
    const lineH = px * (c.leading ?? 1.18);
    // letter tracking widens every line by (chars-1)*tracking
    const measure = (l: string) => ctx.measureText(l).width + Math.max(0, l.length - 1) * tracking;
    const maxW = Math.max(...lines.map((l) => measure(l)), 0);
    const rawMaxW = Math.max(...rawLines.map((l) => measure(l)), 0);
    const totalH = lines.length * lineH;
    const pos: TextPos = c.pos ?? "mc";
    const mx = W * 0.08;
    const my = H * 0.08;
    let x = W / 2;
    let y = H / 2;
    const col = pos[1] as "l" | "c" | "r";
    const widest = Math.max(maxW, rawMaxW);
    if (col === "l") x = mx + widest / 2 + px * 0.4;
    if (col === "r") x = W - mx - widest / 2 - px * 0.4;
    const row = pos[0] as "t" | "m" | "b";
    if (row === "t") y = my + totalH / 2;
    if (row === "b") y = H - my - totalH / 2;
    const xC = x + anim.x * (W / 2) + kbX + xOff;
    const yC = y + anim.y * (H / 2) + yOff;
    this.overlayRects.push({
      clipId: c.id,
      x: xC - widest / 2 - px * 0.4,
      y: yC - totalH / 2 - px * 0.28,
      w: widest + px * 0.8,
      h: totalH + px * 0.56,
    });
    ctx.translate(xC, yC);
    const rot = anim.rotation + (swingAngle * 180) / Math.PI;
    if (rot !== 0) ctx.rotate((rot * Math.PI) / 180);
    if (skewX !== 0) ctx.transform(1, 0, skewX, 1, 0, 0);
    const sc = kbScale * popScale;
    if (sc !== 1) ctx.scale(sc, sc);
    if (flipScale !== 1) ctx.scale(flipScale, 1);
    if (blurPx2 > 0.05) ctx.filter = `blur(${blurPx2.toFixed(2)}px)`;
    if (c.bg && (anim2 !== "typewriter" || doneTyping)) {
      ctx.fillStyle = c.bg;
      const padX = px * 0.5;
      const padY = px * 0.28;
      const bw = widest + padX * 2;
      const bh = totalH + padY * 2;
      const radius = c.radius != null ? (c.radius * px) / 100 : Math.min(bh / 2, px * 0.4);
      roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, Math.max(0, Math.min(bh / 2, radius)));
      ctx.fill();
    }
    const color = c.color ?? "#ffffff";
    // Draw one line with optional letter-tracking, outline and underline.
    const drawLine = (l: string, yy: number) => {
      const startX = -measure(l) / 2;
      if (tracking > 0.01 || anim2 === "wave") {
        // manual glyph advance keeps tracking exact on every device, and gives
        // "wave" a per-letter origin to bob around.
        let cx = startX;
        let gi = 0;
        for (const ch of l) {
          const gw = ctx.measureText(ch).width;
          const bob = anim2 === "wave" ? Math.sin(wavePhase + gi * 0.55) * px * 0.16 : 0;
          const tilt = anim2 === "wave" ? Math.sin(wavePhase + gi * 0.55) * 0.09 : 0;
          if (bob !== 0 || tilt !== 0) {
            ctx.save();
            ctx.translate(cx + gw / 2, yy + bob);
            ctx.rotate(tilt);
            ctx.fillText(ch, 0, 0);
            if (c.stroke && c.stroke > 0) ctx.strokeText(ch, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(ch, cx + gw / 2, yy);
            if (c.stroke && c.stroke > 0) ctx.strokeText(ch, cx + gw / 2, yy);
          }
          cx += gw + tracking;
          gi++;
        }
      } else {
        ctx.fillText(l, 0, yy);
        if (c.stroke && c.stroke > 0) ctx.strokeText(l, 0, yy);
      }
      if (c.underline) {
        const w = measure(l);
        const uy = yy + px * 0.58;
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = ctx.globalAlpha * 0.95;
        ctx.fillRect(-w / 2, uy, w, Math.max(1.5, px * 0.06));
        ctx.restore();
      }
    };
    const strokeW = c.stroke && c.stroke > 0 ? (c.stroke * px) / 100 : 0;
    if (strokeW > 0) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = c.strokeColor || "rgba(0,0,0,0.85)";
      ctx.lineWidth = strokeW;
    }
    const shadowStrength = c.shadow ?? 0.55;
    if (anim2 === "neon") {
      ctx.shadowColor = color;
      ctx.shadowBlur = px * (0.3 + 0.14 * Math.sin(localT * 5));
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = color;
      lines.forEach((l, i) => {
        const yy = -totalH / 2 + lineH / 2 + i * lineH;
        drawLine(l, yy);
        drawLine(l, yy); // second pass for glow intensity
      });
    } else {
      ctx.fillStyle = color;
      if (shadowStrength > 0.02) {
        ctx.shadowColor = `rgba(0,0,0,${Math.min(1, 0.75 * shadowStrength)})`;
        ctx.shadowBlur = px * 0.12 * shadowStrength * (1 / 0.55);
        ctx.shadowOffsetY = px * 0.04 * (shadowStrength / 0.55);
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      lines.forEach((l, i) => {
        drawLine(l, -totalH / 2 + lineH / 2 + i * lineH);
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
          ctx.fillRect(
            caretX + 2,
            -totalH / 2 + lineH / 2 + caretLine * lineH - px * 0.4,
            px * 0.12,
            px * 0.8,
          );
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
    const words = (c.words ?? []).map((w) => ({
      t: w.t,
      w: w.text,
      ws: ctx.measureText(w.text).width,
    }));
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
    roundRectPath(
      ctx,
      -totalW / 2 - px * 0.4,
      -totalH / 2 - px * 0.18,
      totalW + px * 0.8,
      totalH + px * 0.36,
      px * 0.3,
    );
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
        ctx.fillStyle = on ? (c.color ?? "#ffffff") : "rgba(255,255,255,0.38)";
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
        ctx.fillRect(
          cx,
          -totalH / 2 + lineH / 2 + li * lineH + px * 0.62,
          it.ws,
          Math.max(2, px * 0.07),
        );
      }
    }
  }

  // ------------------------------------------------------------- mutations

  /** Notify the editor after a direct model edit and update playback immediately. */
  commitChange() {
    this.bump();
    this.syncElements(false);
    this.draw();
  }

  private bump() {
    this.version++;
    this.onVersion?.();
  }

  addMainClip(media: MediaItem, atEnd = true) {
    const dur =
      media.kind === "video"
        ? (media.duration ?? 5)
        : media.kind === "audio"
          ? (media.duration ?? 3)
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
      transitionIn: "none",
      transitionDur: 0,
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
      // Splitting a variable-speed curve requires reparameterizing its curve.
      // Refuse rather than silently change the duration and sync of the edit.
      if (c.freeze || c.rampTo != null || (c.curve?.length ?? 0) >= 2) return false;
      const srcAt = mainSrcAt(c, t - s.start);
      if (srcAt - c.in < 0.08 || c.out - srcAt < 0.08) return false;
      const local = t - s.start;
      const kfsA = c.keyframes?.filter((k) => k.at < local);
      const kfsB = c.keyframes
        ?.filter((k) => k.at >= local)
        .map((k) => ({ at: k.at - local, v: { ...k.v } }));
      const a: MainClip = {
        ...c,
        id: uid("mc"),
        in: c.reverse ? srcAt : c.in,
        out: c.reverse ? c.out : srcAt,
        keyframes: kfsA && kfsA.length ? kfsA : undefined,
      };
      const b: MainClip = {
        ...c,
        id: uid("mc"),
        in: c.reverse ? c.in : srcAt,
        out: c.reverse ? srcAt : c.out,
        transitionIn: "none",
        transitionDur: 0,
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
    const maxOut =
      media.kind === "image" ? (media.duration ?? 3) : (media.duration ?? c.out - c.in);
    const keepDur = c.out - c.in;
    c.mediaId = media.id;
    c.in = 0;
    c.out =
      media.kind === "image" ? Math.min(3, keepDur || 3) : Math.min(maxOut, Math.max(0.5, keepDur));
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
    // A generated sticker (light leak, dust, bokeh) is meant to cover the
    // frame; a normal overlay image is a picture-in-picture. Sizing both the
    // same meant a light leak arrived as a small postage stamp you had to
    // pinch to full screen.
    const isStickerVideo = media.kind === "video" && (media.duration ?? 0) <= 6;
    const clip: OverlayClip = {
      id: uid("ic"),
      kind: media.kind === "video" ? "video" : "image",
      mediaId: media.id,
      start: Math.max(0, start),
      // full source length: silently cutting to 6s truncated real footage
      duration: media.kind === "video" ? Math.max(0.5, media.duration ?? 6) : 3,
      scale: isStickerVideo ? 1 : 0.5,
      x: 0,
      y: isStickerVideo ? 0 : -0.4,
      rot: 0,
      chroma: false,
      ...(isStickerVideo ? { blend: "screen" as const, loop: true } : {}),
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

  /**
   * Freeze the frame under the playhead: splits the main clip at the playhead
   * and inserts a held-frame clip (CapCut's Freeze). Returns the new clip.
   */
  freezeAt(t: number, hold = 3): MainClip | false {
    const spans = mainSpans(this.project);
    const idx = spans.findIndex((s) => t >= s.start && t < s.end);
    if (idx === -1) return false;
    const s = spans[idx];
    const c = s.clip;
    const srcAt = mainSrcAt(c, t - s.start);
    const atEnd = t - s.start > s.end - s.start - 0.2;
    if (atEnd) {
      const f = freezeClipFrom(c, srcAt, hold);
      this.project.main.splice(idx + 1, 0, f);
      this.bump();
      return f;
    }
    if (!this.splitAt(t)) return false;
    const spans2 = mainSpans(this.project);
    const idx2 = spans2.findIndex((sp) => t >= sp.start - 0.001 && t < sp.start + 0.02);
    const f = freezeClipFrom(c, srcAt, hold);
    const insertAt = idx2 === -1 ? idx + 1 : idx2;
    this.project.main.splice(insertAt, 0, f);
    this.bump();
    return f;
  }

  /** Apply a transition to a clip (also used by the batch "apply to all"). */
  setTransition(clipId: string, kind: TransitionKind, dur: number) {
    const c = this.project.main.find((x) => x.id === clipId);
    if (!c) return;
    c.transitionIn = kind;
    c.transitionDur = kind === "none" ? 0 : Math.max(0.1, dur);
    this.bump();
  }

  /** Apply one transition to every clip after the first (CapCut "apply to all"). */
  setTransitionAll(kind: TransitionKind, dur: number) {
    this.project.main.forEach((c, i) => {
      if (i === 0) {
        c.transitionIn = "none";
        c.transitionDur = 0;
        return;
      }
      c.transitionIn = kind;
      c.transitionDur = kind === "none" ? 0 : Math.max(0.1, dur);
    });
    this.bump();
  }

  /** Duplicate every overlay clip on a track (CapCut "duplicate track"). */
  duplicateTrack(trackId: string): number {
    const tr = this.project.tracks.find((t) => t.id === trackId);
    if (!tr || tr.clips.length === 0) return 0;
    const copies = tr.clips.map((c) => ({
      ...c,
      id: uid("ov"),
      start: c.start + 0.05,
      keyframes: c.keyframes?.map((k) => ({ at: k.at, v: { ...k.v } })),
    }));
    tr.clips.push(...copies);
    this.bump();
    return copies.length;
  }

  /** Move an overlay clip to another track (CapCut drag between lanes). */
  moveOverlayToTrack(clipId: string, trackId: string): boolean {
    let found: OverlayClip | null = null;
    let from: OverlayTrack | null = null;
    for (const tr of this.project.tracks) {
      const i = tr.clips.findIndex((c) => c.id === clipId);
      if (i !== -1) {
        found = tr.clips[i];
        from = tr;
        break;
      }
    }
    const to = this.project.tracks.find((t) => t.id === trackId);
    if (!found || !from || !to || from.id === to.id) return false;
    // audio can't live on a visual track and text can't live on the audio lane
    const wantsAudio = found.kind === "audio";
    if (wantsAudio && to.id !== "t_audio") return false;
    if (!wantsAudio && to.id === "t_audio") return false;
    from.clips = from.clips.filter((c) => c.id !== clipId);
    to.clips.push(found);
    this.bump();
    return true;
  }

  /**
   * Drag-reorder on the main track: move a clip to a new index. Keeps
   * transitions sane (a clip moved to the head can't fade in from nothing).
   */
  reorderMainClip(id: string, toIndex: number): boolean {
    const from = this.project.main.findIndex((c) => c.id === id);
    if (from === -1) return false;
    const to = Math.max(0, Math.min(this.project.main.length - 1, toIndex));
    if (to === from) return false;
    const [c] = this.project.main.splice(from, 1);
    this.project.main.splice(to, 0, c);
    if (to === 0) {
      c.transitionIn = "none";
      c.transitionDur = 0;
    }
    this.bump();
    return true;
  }

  /** Split the main track at every beat marker (whole-project beat sync). */
  splitAtAllBeats(): number {
    const beats = (this.project.beats ?? []).slice().sort((a, b) => a - b);
    if (beats.length === 0) return 0;
    let n = 0;
    // walk backwards so earlier splits don't shift the beat times
    for (let i = beats.length - 1; i >= 0; i--) {
      if (this.splitAt(beats[i])) n++;
    }
    return n;
  }

  setBeats(beats: number[]) {
    this.project.beats = beats.slice(0, 400).sort((a, b) => a - b);
    this.bump();
  }

  /** Track mute/solo/hidden (visual tracks use hidden, audio ones mute/solo). */
  setTrackFlag(trackId: string, patch: Partial<Pick<OverlayTrack, "muted" | "solo" | "hidden">>) {
    const tr = this.project.tracks.find((t) => t.id === trackId);
    if (!tr) return;
    Object.assign(tr, patch);
    this.bump();
    this.draw();
  }

  /** Patch a clip wherever it lives (main or overlay). */
  patchClip(clipId: string, patch: Partial<MainClip> & Partial<OverlayClip>): boolean {
    const c = this.findClipAny(clipId);
    if (!c) return false;
    Object.assign(c, patch);
    this.bump();
    return true;
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
    if (!this.canvas)
      throw new Error("Canvas not ready — wait for the preview to appear, then retry.");
    const blocked = exportBlocker();
    if (blocked) throw new Error(blocked);
    const picked = pickMime();
    if (!picked)
      throw new Error(
        "This browser does not support video recording, so a video file cannot be written here. Export a PNG frame or the WAV audio instead.",
      );
    await this.ensureAudio();
    if (!this.audioCtx || !this.exportDest) {
      throw new Error(
        "Could not start the audio engine. Tap anywhere in the editor first (browsers block audio until you interact), then retry.",
      );
    }
    if (this.duration() <= 0.05) {
      throw new Error("Nothing to export — add a clip to the timeline first.");
    }
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0; // exports always render at full quality

    const wasLoop = this.loop;
    let canvasStream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    this.loop = false;
    try {
      this.useOriginalSources(); // exports always use original media
      for (const [id, rec] of this.els) {
        if (rec.el instanceof HTMLImageElement) continue;
        const target = (rec.videoBroken ? rec.audioFallback : rec.el) as AudioEl | undefined;
        if (!target) continue;
        if (!rec.sourceNode) {
          rec.sourceNode = this.audioCtx.createMediaElementSource(target);
          rec.sourceNode.connect(this.ensureFx(id)!.in);
        }
      }
      if (this.playing) this.pause();
      this.seek(0);
      await this.prepareExportFrame();
      canvasStream = this.canvas.captureStream(opts.fps);
      const mixed = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...this.exportDest.stream.getAudioTracks(),
      ]);
      recorder = new MediaRecorder(mixed, {
        mimeType: picked.mime,
        videoBitsPerSecond: opts.videoBitsPerSecond,
        audioBitsPerSecond: opts.audioBitsPerSecond,
      });
      const rec = recorder;
      const chunks: BlobPart[] = [];
      let recorderError: Error | undefined;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        rec.onerror = (event) => {
          recorderError =
            (event as Event & { error?: DOMException }).error ??
            new Error("Video recording failed");
          resolve();
        };
      });
      const dur = this.duration();
      rec.start(500);
      await this.play();
      const deadline = performance.now() + (dur + 15) * 1000;
      while (rec.state === "recording" && !recorderError) {
        onProgress(Math.min(1, this.t / Math.max(0.001, dur)));
        if (!this.playing) break;
        if (performance.now() > deadline)
          throw new Error("Export timed out before playback finished");
        await new Promise((r) => setTimeout(r, 200));
      }
      const endedEarly = this.t < dur - 0.03;
      if (rec.state !== "inactive") rec.stop();
      await stopped;
      if (recorderError) throw recorderError;
      if (endedEarly) throw new Error("Recording stopped before the timeline finished");
      const blob = new Blob(chunks, { type: picked.mime });
      if (blob.size < 1000) throw new Error("Export produced no data — try again");
      onProgress(1);
      return blob;
    } finally {
      this.pause();
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* already stopping */
        }
      }
      // Only the canvas tracks are owned by this export. Audio tracks belong
      // to the shared audio graph and must remain available for later exports.
      canvasStream?.getTracks().forEach((track) => track.stop());
      this.loop = wasLoop;
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
      this.usePreviewSources();
    }
  }

  // ------------------------------------------- export (MP4, frame-stepped)
  //
  // The reliable path. Instead of playing the timeline in real time and hoping
  // the recorder samples each frame, this walks the timeline one output frame at
  // a time:
  //
  //   for each frame index f:
  //     t = f / fps
  //     seek every visible element and WAIT for its decoded frame
  //     draw
  //     hand the canvas to the encoder with an explicit timestamp
  //
  // Wall-clock no longer matters. A slow phone produces the same file as a fast
  // laptop, just later — no dropped frames, no black frames from a half-seeked
  // element, no audio drifting out of sync. Audio is rendered offline from the
  // same resolver gains the preview uses, so what you hear while editing is what
  // lands in the file.

  /** Can this device export frame-stepped MP4? */
  async canExportStepped(): Promise<boolean> {
    if (!mp4Supported()) return false;
    const { w, h } = ASPECTS[this.project.aspect];
    return !!(await pickAvcCodec(w, h, 30, 4_000_000));
  }

  /**
   * Can this device export frame-stepped WebM?
   *
   * This matters on Safari and Firefox, which have no H.264 *encoder*: until
   * now those users got the real-time recorder and all of its dropped frames.
   * `VideoEncoder` + VP9 closes that gap without adding a codec of our own.
   */
  async canExportSteppedWebm(): Promise<boolean> {
    const Ctor = (window as unknown as { VideoEncoder?: unknown }).VideoEncoder;
    if (!Ctor) return false;
    const { w, h } = ASPECTS[this.project.aspect];
    return !!(await pickVpCodec(w, h, 30, 4_000_000));
  }

  /**
   * Render the project's audio to PCM, offline.
   *
   * Used by the frame-stepped exporter. Returns null when there is no audio at
   * all (a timeline of stills), so the caller can produce a valid video-only
   * file instead of failing.
   */
  async renderOfflineAudioTrack(): Promise<{
    channels: Float32Array[];
    sampleRate: number;
    frames: number;
  } | null> {
    const dur = this.duration();
    if (dur <= 0.05) return null;
    const OCtor: typeof OfflineAudioContext | undefined =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!OCtor) return null;
    const sampleRate = 48000;
    const frames = Math.ceil(dur * sampleRate);
    const off = new OCtor(2, frames, sampleRate);
    const ids = new Set<string>();
    for (const c of this.project.main) ids.add(c.mediaId);
    for (const tr of this.project.tracks)
      for (const c of tr.clips) if (c.mediaId) ids.add(c.mediaId);
    const bufs = await this.decodeAllAudio(off, ids);
    await this.scheduleOfflineAudio(off, off.destination, bufs);
    const rendered = await off.startRendering();
    const channels: Float32Array[] = [];
    for (let i = 0; i < rendered.numberOfChannels; i++) {
      channels.push(rendered.getChannelData(i).slice(0));
    }
    if (channels.length === 0) return null;
    if (channels.length === 1) channels.push(channels[0].slice(0));
    return { channels, sampleRate, frames: rendered.length };
  }

  /**
   * Measure how fast THIS device can render frames.
   *
   * Frame-stepped export is slower than real time, and how much slower varies by
   * an order of magnitude across devices. Rather than guess, we time a small
   * number of real frames through the same path the exporter uses (seek, wait,
   * draw, hand to the encoder) and keep the result.
   *
   * The sample is intentionally small — 12 frames — so calling this before an
   * export costs well under a second on any device.
   */
  async measureThroughput(sampleFrames = 12): Promise<ExportPlan | null> {
    if (!this.canvas || !mp4Supported()) return null;
    const dur = this.duration();
    if (dur <= 0.05) return null;
    const { w, h } = ASPECTS[this.project.aspect];
    const fps = 30;
    const codec = await pickAvcCodec(w, h, fps, 2_000_000);
    if (!codec) return null;

    const W_ = window as unknown as {
      VideoEncoder: typeof VideoEncoder;
      VideoFrame: typeof VideoFrame;
    };
    let counted = 0;
    let encError: unknown = null;
    const probe = new W_.VideoEncoder({
      output: () => {
        counted++;
      },
      error: (e) => {
        encError = encError ?? e;
      },
    });
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    try {
      await probe.configure({ codec, width: w, height: h, framerate: fps, bitrate: 2_000_000 });
      const n = Math.max(4, Math.min(24, sampleFrames));
      const started = performance.now();
      for (let f = 0; f < n; f++) {
        if (encError) break;
        const t = (f / n) * dur;
        await this.frameReadyAt(t, 1500);
        const vf = new W_.VideoFrame(this.canvas, { timestamp: f * 33333 });
        probe.encode(vf, { keyFrame: f === 0 });
        vf.close();
      }
      await probe.flush();
      const elapsed = performance.now() - started;
      if (encError || counted === 0) return null;
      const throughput = recordThroughput(counted, elapsed, { width: w, height: h });
      this.throughput = throughput;
      return planSteppedExport({ durationSec: dur, fps, width: w, height: h }, throughput);
    } catch {
      return null;
    } finally {
      try {
        probe.close();
      } catch {
        /* already closed */
      }
      this.exportScale = prevScale;
      this.previewMaxSide = prevCap;
      this.seek(this.t);
      if (wasPlaying) void this.play();
    }
  }

  /** Plan an export from the last measurement, if any. */
  planExport(opts: { fps: number; scale?: number }): ExportPlan {
    const { w, h } = ASPECTS[this.project.aspect];
    const scale = opts.scale ?? 1;
    return planSteppedExport(
      {
        durationSec: this.duration(),
        fps: opts.fps,
        width: Math.round(w * scale),
        height: Math.round(h * scale),
      },
      this.throughput,
    );
  }

  async exportMP4Stepped(opts: ExportOptions, onProgress: (p: number) => void): Promise<Blob> {
    if (!this.canvas) throw new Error("Canvas not ready — wait for the preview, then retry.");
    if (!mp4Supported()) {
      throw new Error(
        "This browser cannot encode H.264, so frame-accurate MP4 is unavailable here. The frame-accurate WebM path produces the same result.",
      );
    }
    const dur0 = this.duration();
    if (dur0 <= 0.05) throw new Error("Nothing to export — add a clip to the timeline first.");
    const { w: W, h: H } = ASPECTS[this.project.aspect];
    const fps = Math.max(1, Math.round(opts.fps));
    const codec = await pickAvcCodec(W, H, fps, opts.videoBitsPerSecond);
    if (!codec) {
      throw new Error(`H.264 encoding is not available at ${W}×${H} here — try WebM.`);
    }

    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0;
    this.loop = false;
    // Exports always read the ORIGINAL files, never a preview proxy.
    this.useOriginalSources();

    const W_ = window as unknown as {
      VideoEncoder: typeof VideoEncoder;
      VideoFrame: typeof VideoFrame;
    };
    const W2Audio = window as unknown as {
      AudioEncoder: typeof AudioEncoder;
      AudioData: typeof AudioData;
    };
    // Render the audio ONCE, offline, from the same resolver gains the preview
    // uses. Doing it up front means the file can never end up video-only by
    // accident, and it is not tied to rendering speed.
    const audio = await this.renderOfflineAudioTrack();
    const sampleRate = audio?.sampleRate ?? 48000;

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width: W, height: H, frameRate: fps },
      ...(audio ? { audio: { codec: "aac" as const, numberOfChannels: 2, sampleRate } } : {}),
      fastStart: "in-memory",
    });
    let encError: unknown = null;
    const videoEncoder = new W_.VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (e) {
          encError = encError ?? e;
        }
      },
      error: (e) => {
        encError = encError ?? e;
      },
    });

    try {
      // Round to whole frames so the last one is never a sliver.
      const totalFrames = Math.max(1, Math.round(dur0 * fps));
      await videoEncoder.configure({
        codec,
        width: W,
        height: H,
        framerate: fps,
        bitrate: opts.videoBitsPerSecond,
        latencyMode: "quality",
      });
      const keyEvery = Math.max(1, fps * 2);
      const frameDurUs = Math.round(1_000_000 / fps);

      for (let f = 0; f < totalFrames; f++) {
        if (encError) break;
        const t = Math.min(dur0, f / fps);
        // waits for the decoder, then draws — never captures a blank frame
        await this.frameReadyAt(t, 3000);
        const vf = new W_.VideoFrame(this.canvas, { timestamp: f * frameDurUs });
        videoEncoder.encode(vf, { keyFrame: f % keyEvery === 0 });
        vf.close();
        onProgress(Math.min(0.99, (f + 1) / totalFrames));
        // yield so the UI stays responsive and the decoder can progress
        if (f % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      await videoEncoder.flush();

      // Audio: one AAC pass over the pre-rendered PCM.
      if (audio && !encError) {
        const audioEncoder = new W2Audio.AudioEncoder({
          output: (chunk, meta) => {
            try {
              muxer.addAudioChunk(chunk, meta);
            } catch (e) {
              encError = encError ?? e;
            }
          },
          error: (e) => {
            encError = encError ?? e;
          },
        });
        await audioEncoder.configure({
          codec: "mp4a.40.2",
          sampleRate,
          numberOfChannels: 2,
          bitrate: opts.audioBitsPerSecond,
        });
        // feed in ~1 s chunks so memory stays flat on long timelines
        const chunkFrames = sampleRate;
        const data = audio.channels;
        for (let off = 0; off < audio.frames; off += chunkFrames) {
          const n = Math.min(chunkFrames, audio.frames - off);
          const l = data[0].slice(off, off + n);
          const r = data[1].slice(off, off + n);
          const ad = new W2Audio.AudioData({
            format: "f32-planar",
            sampleRate,
            numberOfFrames: n,
            numberOfChannels: 2,
            timestamp: Math.round((off / sampleRate) * 1_000_000),
            data: [l, r] as unknown as BufferSource,
          });
          audioEncoder.encode(ad);
          ad.close();
          if (off % (chunkFrames * 20) === 0) await new Promise((r) => setTimeout(r, 0));
        }
        await audioEncoder.flush();
        try {
          audioEncoder.close();
        } catch {
          /* already closed */
        }
      }

      if (encError) {
        throw encError instanceof Error ? encError : new Error(String(encError));
      }
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      if (blob.size < 1000) throw new Error("Export produced no data — try again.");
      onProgress(1);
      return blob;
    } finally {
      try {
        videoEncoder.close();
      } catch {
        /* already closed */
      }
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
      this.usePreviewSources();
      this.seek(0);
      if (wasPlaying) void this.play();
    }
  }

  // ------------------------------------------ export (WebM, frame-stepped)
  //
  // The same frame-by-frame guarantee as the MP4 path, for the browsers that
  // cannot encode H.264 (Safari, Firefox). WebCodecs + VP8/VP9 + webm-muxer,
  // so this is still the platform's encoder — not a codec of our own.
  //
  // Audio is Opus, fed from the same offline PCM render the MP4 path uses, so
  // muting, crossfades and extracted-and-muted sources sound identical in
  // both formats.

  async exportWebmStepped(opts: ExportOptions, onProgress: (p: number) => void): Promise<Blob> {
    if (!this.canvas) throw new Error("Canvas not ready — wait for the preview, then retry.");
    const dur0 = this.duration();
    if (dur0 <= 0.05) throw new Error("Nothing to export — add a clip to the timeline first.");
    const { w: W, h: H } = ASPECTS[this.project.aspect];
    const fps = Math.max(1, Math.round(opts.fps));
    const vp = await pickVpCodec(W, H, fps, opts.videoBitsPerSecond);
    if (!vp) {
      throw new Error("Frame-accurate WebM needs WebCodecs VP8/VP9 — this browser can't do it.");
    }

    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0;
    this.loop = false;
    // Exports always read the ORIGINAL files, never a preview proxy.
    this.useOriginalSources();

    const W_ = window as unknown as {
      VideoEncoder: typeof VideoEncoder;
      VideoFrame: typeof VideoFrame;
    };
    const W2Audio = window as unknown as {
      AudioEncoder: typeof AudioEncoder;
      AudioData: typeof AudioData;
    };

    const audio = await this.renderOfflineAudioTrack();
    const sampleRate = audio?.sampleRate ?? 48000;
    // Opus is defined at 48 kHz. If the offline render ever came back at a
    // different rate, resample here rather than declaring a rate the encoder
    // will not honour (that plays back at the wrong speed).
    const opusRate = 48000;
    if (audio && audio.sampleRate !== opusRate) {
      const ratio = opusRate / audio.sampleRate;
      const n = Math.max(1, Math.round(audio.frames * ratio));
      const resampled: Float32Array[] = [];
      for (let ch = 0; ch < 2; ch++) {
        const src = audio.channels[ch] ?? audio.channels[0];
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = i / ratio;
          const i0 = Math.floor(x);
          const i1 = Math.min(src.length - 1, i0 + 1);
          const frac = x - i0;
          out[i] = (src[i0] ?? 0) * (1 - frac) + (src[i1] ?? 0) * frac;
        }
        resampled.push(out);
      }
      audio.channels = resampled;
      audio.frames = n;
      audio.sampleRate = opusRate;
    }

    const target = new WebmTarget();
    const muxer = new WebmMuxer({
      target,
      video: { codec: vp.mkv, width: W, height: H, frameRate: fps },
      ...(audio
        ? { audio: { codec: "A_OPUS" as const, numberOfChannels: 2, sampleRate: opusRate } }
        : {}),
    });
    let encError: unknown = null;
    const videoEncoder = new W_.VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (e) {
          encError = encError ?? e;
        }
      },
      error: (e) => {
        encError = encError ?? e;
      },
    });

    try {
      const totalFrames = Math.max(1, Math.round(dur0 * fps));
      await videoEncoder.configure({
        codec: vp.config,
        width: W,
        height: H,
        framerate: fps,
        bitrate: opts.videoBitsPerSecond,
        latencyMode: "quality",
      });
      const keyEvery = Math.max(1, fps * 2);
      const frameDurUs = Math.round(1_000_000 / fps);

      for (let f = 0; f < totalFrames; f++) {
        if (encError) break;
        const t = Math.min(dur0, f / fps);
        await this.frameReadyAt(t, 3000);
        const vf = new W_.VideoFrame(this.canvas, { timestamp: f * frameDurUs });
        videoEncoder.encode(vf, { keyFrame: f % keyEvery === 0 });
        vf.close();
        onProgress(Math.min(0.99, (f + 1) / totalFrames));
        if (f % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      await videoEncoder.flush();

      if (audio && !encError) {
        const audioEncoder = new W2Audio.AudioEncoder({
          output: (chunk, meta) => {
            try {
              muxer.addAudioChunk(chunk, meta);
            } catch (e) {
              encError = encError ?? e;
            }
          },
          error: (e) => {
            encError = encError ?? e;
          },
        });
        await audioEncoder.configure({
          codec: "opus",
          sampleRate: opusRate,
          numberOfChannels: 2,
          bitrate: opts.audioBitsPerSecond,
        });
        // Resample on the fly only if the offline render used another rate.
        const data = audio.channels;
        const chunkFrames = sampleRate;
        for (let off = 0; off < audio.frames; off += chunkFrames) {
          if (encError) break;
          const n = Math.min(chunkFrames, audio.frames - off);
          const l = data[0].slice(off, off + n);
          const r = data[1].slice(off, off + n);
          const ad = new W2Audio.AudioData({
            format: "f32-planar",
            sampleRate,
            numberOfFrames: n,
            numberOfChannels: 2,
            timestamp: Math.round((off / sampleRate) * 1_000_000),
            data: [l, r] as unknown as BufferSource,
          });
          audioEncoder.encode(ad);
          ad.close();
          if (off % (chunkFrames * 20) === 0) await new Promise((r) => setTimeout(r, 0));
        }
        await audioEncoder.flush();
        try {
          audioEncoder.close();
        } catch {
          /* already closed */
        }
      }

      if (encError) {
        throw encError instanceof Error ? encError : new Error(String(encError));
      }
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/webm" });
      if (blob.size < 1000) throw new Error("Export produced no data — try again.");
      onProgress(1);
      return blob;
    } finally {
      try {
        videoEncoder.close();
      } catch {
        /* already closed */
      }
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
      this.usePreviewSources();
      this.seek(0);
      if (wasPlaying) void this.play();
    }
  }

  // ------------------------------------------------------------- export (MP4)
  // WebCodecs: H.264 video + AAC audio, muxed by mp4-muxer. Real-time render
  // (the timeline plays once while frames are captured), same as the WebM path.

  async exportMP4(opts: ExportOptions, onProgress: (p: number) => void): Promise<Blob> {
    if (!this.canvas) throw new Error("Canvas not ready");
    if (!mp4Supported())
      throw new Error(
        "This browser cannot encode H.264 through WebCodecs, so MP4 is unavailable here. WebM works and can be exported frame-accurately.",
      );
    const baseSize = ASPECTS[this.project.aspect];
    const W = baseSize.w * (opts.scale ?? 1);
    const H = baseSize.h * (opts.scale ?? 1);
    const codec = await pickAvcCodec(W, H, opts.fps, opts.videoBitsPerSecond);
    if (!codec)
      throw new Error("H.264 encoding is not supported at this resolution here — use WebM.");
    await this.ensureAudio();
    if (!this.audioCtx || !this.exportDest) throw new Error("Audio engine unavailable");
    const aacConfig: AudioEncoderConfig = {
      codec: "mp4a.40.2",
      sampleRate: this.audioCtx.sampleRate,
      numberOfChannels: 2,
      bitrate: opts.audioBitsPerSecond,
    };
    if (
      !(await supportsAacEncoder(
        aacConfig.sampleRate!,
        aacConfig.numberOfChannels!,
        aacConfig.bitrate!,
      ))
    ) {
      throw new Error(
        "This device cannot encode AAC audio for a standard MP4 file. Choose WebM or use a device with AAC WebCodecs encoding support.",
      );
    }
    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    this.exportScale = opts.scale ?? 1;
    this.exporting = true;
    this.previewMaxSide = 0; // exports always render at full quality
    const wasLoop = this.loop;
    const wasPlaying = this.playing;
    this.loop = false;
    let videoEncoder: VideoEncoder | undefined;
    let audioEncoder: AudioEncoder | undefined;
    let streamSource: MediaStreamAudioSourceNode | undefined;
    let sp: ScriptProcessorNode | undefined;
    let silence: GainNode | undefined;
    let audioArmed = false;
    try {
      this.useOriginalSources(); // exports always use original media
      for (const [id, rec] of this.els) {
        if (rec.el instanceof HTMLImageElement) continue;
        const target = (rec.videoBroken ? rec.audioFallback : rec.el) as AudioEl | undefined;
        if (!target) continue;
        if (!rec.sourceNode) {
          rec.sourceNode = this.audioCtx.createMediaElementSource(target);
          rec.sourceNode.connect(this.ensureFx(id)!.in);
        }
      }

      if (wasPlaying) this.pause();
      this.seek(0);
      await this.prepareExportFrame();

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: { codec: "avc", width: W, height: H, frameRate: opts.fps },
        audio: { codec: "aac", numberOfChannels: 2, sampleRate: this.audioCtx.sampleRate },
        fastStart: "in-memory",
      });

      let encError: unknown = null;
      const W_ = window as unknown as {
        VideoEncoder: typeof VideoEncoder;
        AudioEncoder: typeof AudioEncoder;
        VideoFrame: typeof VideoFrame;
      };
      videoEncoder = new W_.VideoEncoder({
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
      audioEncoder = new W_.AudioEncoder({
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
      await audioEncoder.configure(aacConfig);
      // Bridge: exportDest's MediaStream → ScriptProcessor → AudioData → AudioEncoder.
      // (WebAudio nodes cannot be connected directly to a WebCodecs encoder.)
      streamSource = this.audioCtx.createMediaStreamSource(this.exportDest.stream);
      sp = this.audioCtx.createScriptProcessor(4096, 2, 2);
      silence = this.audioCtx.createGain();
      silence.gain.value = 0;
      streamSource.connect(sp);
      sp.connect(silence);
      silence.connect(this.audioCtx.destination);
      let audioT0: number | null = null;
      sp.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!audioArmed || encError) return;
        const ab = e.inputBuffer;
        const rawTs = (this.audioCtx!.currentTime - ab.length / ab.sampleRate) * 1_000_000;
        if (audioT0 == null) audioT0 = rawTs;
        try {
          const ch0 = ab.getChannelData(0);
          const ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : ch0;
          const samples = new Float32Array(ab.length * 2);
          samples.set(ch0, 0);
          samples.set(ch1, ab.length);
          const ad = new AudioData({
            format: "f32-planar",
            sampleRate: ab.sampleRate,
            numberOfFrames: ab.length,
            numberOfChannels: 2,
            timestamp: Math.max(0, Math.round(rawTs - audioT0)),
            data: samples,
          });
          try {
            audioEncoder!.encode(ad);
          } finally {
            ad.close();
          }
        } catch (er) {
          encError = encError ?? er;
        }
      };

      const dur = this.duration();
      const frameDurUs = 1_000_000 / opts.fps;
      const keyEvery = opts.fps * 2; // IDR roughly every 2s
      let frame = 0;
      let lastKeyFrame = -keyEvery; // force frame 0 to be a keyframe
      await this.play();
      audioArmed = true; // audio timestamps start now (no pre-roll silence)

      const deadline = performance.now() + (dur + 15) * 1000;
      while (this.playing || this.t < dur - 0.03) {
        const targetT = frame / opts.fps;
        if (this.t >= targetT - 0.002) {
          try {
            // Keep timestamps tied to the timeline even if a slow device
            // misses a frame, rather than compressing time and desyncing audio.
            frame = Math.max(frame, Math.floor(this.t * opts.fps));
            const wantKey = frame - lastKeyFrame >= keyEvery;
            const vf = new W_.VideoFrame(this.canvas, {
              timestamp: Math.round(frame * frameDurUs),
            });
            try {
              videoEncoder.encode(vf, { keyFrame: wantKey });
            } finally {
              vf.close();
            }
            if (wantKey) lastKeyFrame = frame;
            frame++;
          } catch (e) {
            encError = encError ?? e;
          }
        }
        onProgress(Math.min(1, this.t / Math.max(0.001, dur)));
        if (encError) break;
        if (performance.now() > deadline) {
          encError = new Error("MP4 export timed out before the timeline finished");
          break;
        }
        await new Promise((r) => setTimeout(r, 16));
      }
      // The playhead at exactly duration lies beyond every clip. Encoding
      // the canvas there would append a black frame to the finished video.

      audioArmed = false;
      await videoEncoder.flush();
      await audioEncoder.flush();
      if (encError)
        throw encError instanceof Error
          ? encError
          : new Error("Encoder failed: " + String(encError));
      muxer.finalize();
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      if (blob.size < 1000) throw new Error("Export produced no data — try again");
      onProgress(1);
      return blob;
    } finally {
      audioArmed = false;
      if (sp) sp.onaudioprocess = null;
      for (const node of [sp, silence, streamSource]) {
        try {
          node?.disconnect();
        } catch {
          /* partially constructed graph */
        }
      }
      for (const encoder of [audioEncoder, videoEncoder]) {
        try {
          if (encoder && encoder.state !== "closed") encoder.close();
        } catch {
          /* already closed */
        }
      }
      this.pause();
      this.loop = wasLoop;
      this.exportScale = prevScale;
      this.exporting = false;
      this.previewMaxSide = prevCap;
      this.usePreviewSources();
    }
  }

  // ------------------------------------------------------------- export (GIF)

  /**
   * Animated GIF export (CapCut ships one; ours works fully offline).
   * Renders the timeline at a reduced grid with a per-frame web-safe palette.
   * Sizes are capped so a phone can actually finish the encode.
   */
  async exportGIF(
    opts: { fps?: number; maxSide?: number; maxSeconds?: number; dither?: boolean },
    onProgress: (p: number) => void,
  ): Promise<Blob> {
    if (!this.canvas) throw new Error("Canvas not ready");
    const fps = Math.min(20, Math.max(6, opts.fps ?? 12));
    const maxSide = Math.min(720, Math.max(160, opts.maxSide ?? 480));
    const maxSeconds = Math.min(120, Math.max(1, opts.maxSeconds ?? 20));
    const base = ASPECTS[this.project.aspect];
    const k = maxSide / Math.max(base.w, base.h);
    const W = Math.max(16, Math.round((base.w * k) / 2) * 2);
    const H = Math.max(16, Math.round((base.h * k) / 2) * 2);
    const dur = Math.min(maxSeconds, this.duration());
    if (dur <= 0.05) throw new Error("Nothing to export — add media first");

    const prevScale = this.exportScale;
    const prevCap = this.previewMaxSide;
    const wasLoop = this.loop;
    const wasPlaying = this.playing;
    this.exporting = true;
    this.loop = false;
    this.previewMaxSide = 0;
    // Force the compositor to the GIF grid via exportScale (cap is disabled).
    this.exportScale = W / base.w;
    try {
      if (wasPlaying) this.pause();
      this.seek(0);
      await this.ensureAudio();
      // 256-colour web-safe-ish palette (6·6·6 cube = 216 + greys)
      const palette: number[] = [];
      for (let r = 0; r < 6; r++)
        for (let g = 0; g < 6; g++)
          for (let b = 0; b < 6; b++) palette.push(((r * 51) << 16) | ((g * 51) << 8) | (b * 51));
      for (let i = 0; i < 40; i++) {
        const v = Math.round((i / 39) * 255);
        palette.push((v << 16) | (v << 8) | v);
      }
      const frames = Math.max(1, Math.floor(dur * fps));
      const buf = new Uint8Array(W * H * frames + 1024 * 1024);
      const writer = new GifWriter(buf, W, H, { loop: 0, palette });
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) throw new Error("No 2D canvas context");
      const delayCs = Math.max(2, Math.round(100 / fps));
      const frameDur = dur / frames;
      void this.play();
      // stop playback the moment we've sampled every frame
      for (let f = 0; f < frames; f++) {
        const targetT = f * frameDur;
        // let the clock reach targetT (bounded wait: 400 ms per frame)
        const deadline = performance.now() + 400;
        while (this.t < targetT && performance.now() < deadline) {
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
        // readiness-checked capture: never sample a half-seeked frame
        await this.frameReadyAt(Math.min(dur, targetT), 400);
        octx.filter = "none";
        octx.globalAlpha = 1;
        octx.drawImage(this.canvas, 0, 0, W, H);
        const img = octx.getImageData(0, 0, W, H);
        writer.addFrame(0, 0, W, H, gifIndices(img.data, palette, opts.dither !== false), {
          delay: delayCs,
          disposal: 1,
        });
        onProgress(Math.min(1, (f + 1) / frames));
      }
      if (!wasPlaying) this.pause();
      this.loop = wasLoop;
      return new Blob([buf.subarray(0, writer.end())], { type: "image/gif" });
    } finally {
      if (!wasPlaying) this.pause();
      this.loop = wasLoop;
      this.exportScale = prevScale;
      this.previewMaxSide = prevCap;
      this.exporting = false;
    }
  }

  /**
   * Audio-only export: render the full mix offline through an
   * OfflineAudioContext, then encode 16-bit WAV. Used for podcast / voiceover
   * workflows and as the audio half of the WAV download option.
   */
  /**
   * Decode every media blob to an AudioBuffer once, for the offline mixers.
   *
   * Shared by the WAV export and the frame-stepped MP4/WebM export so both get
   * identical audio. Returns null for media whose audio cannot be decoded
   * (silent videos, broken files) rather than throwing.
   */
  async decodeAllAudio(
    ctx: BaseAudioContext,
    mediaIds: Iterable<string>,
  ): Promise<Map<string, AudioBuffer | null>> {
    const bufs = new Map<string, AudioBuffer | null>();
    for (const mediaId of mediaIds) {
      if (bufs.has(mediaId)) continue;
      const rec = this.els.get(mediaId);
      let buf: AudioBuffer | null = null;
      try {
        if (rec?.url) {
          const blob = await fetch(rec.url).then((r) => r.blob());
          buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        }
      } catch {
        buf = null;
      }
      bufs.set(mediaId, buf);
    }
    return bufs;
  }

  /**
   * Schedule the whole project's audio into an offline context.
   *
   * This is the audio half of a frame-stepped export. The gains come from
   * `mainClipGain` — the SAME function the preview's clock uses — so a muted
   * clip, a transition crossfade or an extracted-and-muted source behaves
   * identically in the exported file. The previous recorder path sampled a live
   * graph and could not guarantee that.
   *
   * Fades are written with short ramps rather than steps so transitions do not
   * click.
   */
  async scheduleOfflineAudio(
    off: BaseAudioContext,
    dest: AudioNode,
    bufs: Map<string, AudioBuffer | null>,
    opts: { from?: number; to?: number; step?: number } = {},
  ): Promise<void> {
    const spans = mainSpans(this.project);
    const from = Math.max(0, opts.from ?? 0);
    const to = Math.min(this.duration(), opts.to ?? this.duration());
    if (to <= from) return;
    // 60 Hz is finer than any visible fade and cheap to schedule.
    const step = Math.max(0.004, opts.step ?? 1 / 60);
    const hasSolo = this.project.tracks.some((t) => t.solo);
    const master = off.createGain();
    master.gain.value = this.project.masterGain ?? 1;
    master.connect(dest);

    const rampedSource = (
      buf: AudioBuffer,
      startAt: number,
      srcOffset: number,
      length: number,
      rate: number,
      gainAt: (localSec: number) => number,
      fxId: AudioFxId = "none",
    ) => {
      const src = off.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.max(0.05, rate);
      const g = off.createGain();
      src.connect(g);
      // One-tap audio effects are built from the SAME recipe the preview uses,
      // on the offline context, so the exported file cannot sound different.
      const fx =
        fxId !== "none"
          ? buildAudioFx(off, fxId, {
              impulse: (sec) => makeImpulse(off, sec),
            })
          : null;
      if (fx) {
        g.connect(fx.input);
        fx.output.connect(master);
      } else {
        g.connect(master);
      }
      // piecewise-constant gain, smoothed with linear ramps
      let last = Math.max(0, Math.min(2, gainAt(0)));
      g.gain.setValueAtTime(last, startAt);
      for (let dt = step; dt < length; dt += step) {
        const v = Math.max(0, Math.min(2, gainAt(dt)));
        if (Math.abs(v - last) > 1e-4) {
          g.gain.linearRampToValueAtTime(v, startAt + dt);
          last = v;
        }
      }
      const dur2 = Math.min(length, buf.duration - srcOffset);
      if (dur2 > 0.001) src.start(startAt, Math.max(0, srcOffset), dur2);
    };

    // --- main track ---
    if (!hasSolo) {
      for (const s of spans) {
        if (s.clip.freeze || s.clip.reverse || s.clip.muted) continue;
        if (s.end <= from || s.start >= to) continue;
        const buf = bufs.get(s.clip.mediaId);
        if (!buf) continue;
        const idx = spans.indexOf(s);
        const nextSpan = idx + 1 < spans.length ? spans[idx + 1] : null;
        const clipDur = Math.max(0.01, s.end - s.start);
        const mainFx = s.clip.audioFx ?? "none";
        // The main track is ducked by overlay clips that ask for it, exactly
        // as the preview ducks it.
        rampedSource(
          buf,
          Math.max(from, s.start),
          s.clip.in,
          clipDur,
          s.clip.speed * audioFxRecipe(mainFx).rate,
          (dt) =>
            mainClipGain(s.clip, s, nextSpan, s.start + dt, idx > 0) *
            this.duckFactor(s.start + dt),
          mainFx,
        );
      }
    }

    // --- overlay tracks (audio clips and any video with sound) ---
    for (const tr of this.project.tracks) {
      if (tr.hidden) continue;
      // A muted track (or one excluded by another track's solo) is inaudible:
      // schedule nothing rather than a source with a zero gain.
      const trackGain = hasSolo ? (tr.solo ? 1 : 0) : tr.muted ? 0 : 1;
      if (trackGain === 0) continue;
      for (const c of tr.clips) {
        if (!c.mediaId) continue;
        if (c.kind === "text") continue;
        if (c.kind === "video") continue; // sticker video is silent by design
        const start = Math.max(0, c.start);
        const end = start + Math.max(0, c.duration);
        if (end <= from || start >= to) continue;
        const buf = bufs.get(c.mediaId);
        if (!buf) continue;
        const vol = Math.max(0, Math.min(1, c.volume ?? 1));
        const fadeIn = Math.max(0, c.fadeIn ?? 0.15);
        const fadeOut = Math.max(0, c.fadeOut ?? 0.15);
        // A pitch effect changes the source rate, so the same clip covers a
        // different amount of source audio. Without this the file would run
        // out of sound (or overrun) compared with the preview.
        const fxId = c.audioFx ?? "none";
        const fxRate = audioFxRecipe(fxId).rate;
        rampedSource(
          buf,
          Math.max(from, start),
          0,
          end - start,
          fxRate,
          (dt) => {
            let v = vol;
            if (fadeIn > 0) v *= Math.min(1, dt / fadeIn);
            if (fadeOut > 0) v *= Math.min(1, (end - start - dt) / fadeOut);
            // Music ducks under a voiceover here too, not just on screen.
            return v * trackGain * this.duckFactor(start + dt);
          },
          fxId,
        );
      }
    }
  }

  /**
   * Export the project's audio as a 16-bit stereo WAV.
   *
   * This used to carry its OWN copy of the mix logic — a second scheduler with
   * its own idea of fades, solos and muted clips. That copy is why audio
   * effects, curves and ducking only ever appeared in the video exports: every
   * fix had to be made twice, and the second time was forgotten.
   *
   * It now renders through `scheduleOfflineAudio`, the same function the MP4
   * and WebM exporters use, so there is exactly one description of what the
   * project sounds like. A change to the mix cannot land in one format only.
   */
  async exportAudioWav(
    onProgress: (p: number) => void,
    opts: { sampleRate?: number; seconds?: number; from?: number; to?: number } = {},
  ): Promise<Blob> {
    const sr = Math.min(48000, Math.max(22050, opts.sampleRate ?? 44100));
    const from = Math.max(0, opts.from ?? 0);
    const to = Math.min(opts.to ?? this.duration(), 60 * 30);
    if (to - from <= 0.05) throw new Error("Nothing to export — add media first");
    const OCtor =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!OCtor) throw new Error("Offline audio rendering isn't available in this browser");

    const frames = Math.ceil((to - from) * sr);
    const off = new OCtor(2, frames, sr);
    onProgress(0.1);

    // Decode every distinct media the timeline references, once.
    const ids = new Set<string>();
    for (const c of this.project.main) ids.add(c.mediaId);
    for (const tr of this.project.tracks)
      for (const c of tr.clips) if (c.mediaId) ids.add(c.mediaId);
    const bufs = await this.decodeAllAudio(off, ids);
    onProgress(0.4);

    await this.scheduleOfflineAudio(off, off.destination, bufs, { from, to });
    onProgress(0.6);

    const rendered = await off.startRendering();
    onProgress(0.9);

    // interleave to stereo 16-bit PCM
    const L = rendered.getChannelData(0);
    const R = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : L;
    const n = L.length;
    const ab = new ArrayBuffer(44 + n * 4);
    const v = new DataView(ab);
    const tag = (o: number, t: string) => {
      for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
    };
    tag(0, "RIFF");
    v.setUint32(4, 36 + n * 4, true);
    tag(8, "WAVE");
    tag(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    tag(36, "data");
    v.setUint32(40, n * 4, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true);
      o += 2;
      v.setInt16(o, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      o += 2;
    }
    onProgress(1);
    return new Blob([ab], { type: "audio/wav" });
  }

  /** PNG still of the current frame — instant thumbnail/cover export. */
  /**
   * Render one frame at an arbitrary time, guaranteeing it is real.
   *
   * This is the primitive a frame-stepping (non-real-time) exporter needs: it
   * seeks, waits for the decoder, and only then reports the canvas as valid.
   * The real-time recorder paths cannot use it directly, but the GIF path and
   * any future offline encoder can — and, importantly, it is the same code the
   * tests exercise.
   */
  async renderFrameAt(t: number, budgetMs = 500): Promise<HTMLCanvasElement | null> {
    if (!this.canvas) return null;
    await this.frameReadyAt(t, budgetMs);
    return this.canvas;
  }

  async exportStill(width = 1080): Promise<Blob> {
    if (!this.canvas) throw new Error("Canvas not ready");
    this.draw();
    const base = ASPECTS[this.project.aspect];
    const k = width / base.w;
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(base.w * k));
    c.height = Math.max(2, Math.round(base.h * k));
    const x = c.getContext("2d");
    if (!x) throw new Error("No 2D canvas context");
    x.drawImage(this.canvas, 0, 0, c.width, c.height);
    return new Promise((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
    );
  }

  destroy() {
    this.pause();
    for (const [id, rec] of this.els) {
      this.stopBufSource(id);
      if (rec.videoLoadTimer) window.clearTimeout(rec.videoLoadTimer);
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

// ---------------------------------------------------------------------------
// GIF palette mapping (nearest colour in a 256-entry palette)
// ---------------------------------------------------------------------------

function gifIndices(rgba: Uint8ClampedArray, palette: number[], dither: boolean): Uint8Array {
  const px = rgba.length / 4;
  const out = new Uint8Array(px);
  const pal = palette.map((v) => [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff] as const);
  // cache: 15-bit RGB key → palette index (big win on flat frames)
  const cache = new Int16Array(32768).fill(-1);
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let best = cache[key];
    if (best < 0) {
      best = 0;
      let bd = Infinity;
      for (let p = 0; p < pal.length; p++) {
        const dr = r - pal[p][0];
        const dg = g - pal[p][1];
        const db = b - pal[p][2];
        // luma-weighted distance looks better than raw RGB to the eye
        const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      cache[key] = best;
    }
    out[i] = best;
    if (dither && i + 1 < px) {
      // cheap 1-neighbour error diffusion on the green channel only (fast)
      const o2 = o + 4;
      const er = (r - pal[best][0]) * 0.5;
      const eb = (b - pal[best][2]) * 0.5;
      rgba[o2] = Math.max(0, Math.min(255, rgba[o2] + er));
      rgba[o2 + 2] = Math.max(0, Math.min(255, rgba[o2 + 2] + eb));
    }
  }
  return out;
}
