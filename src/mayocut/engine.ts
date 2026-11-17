// MayoCut engine — client-side playback, compositing and export.
// Runs entirely in the browser (also inside Electron / Capacitor).
// No server, no database: media lives in IndexedDB, export is canvas + WebAudio
// (WebM via MediaRecorder, MP4 via WebCodecs + mp4-muxer).

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import {
  ASPECTS,
  DEFAULT_ADJUST,
  DEFAULT_ANIM,
  mainClipDuration,
  mainSpans,
  projectDuration,
  uid,
  type AnimValues,
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

interface ElRecord {
  el: MediaEl;
  url: string;
  sourceNode?: MediaElementAudioSourceNode;
}

export interface ExportOptions {
  fps: number;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
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
    }
  }

  private clipUsingMedia(clipId: string, mediaId: string): boolean {
    if (this.project.main.some((c) => c.id === clipId && c.mediaId === mediaId)) return true;
    for (const tr of this.project.tracks) if (tr.clips.some((c) => c.id === clipId && c.mediaId === mediaId)) return true;
    return false;
  }

  private audioEl(mediaId: string): AudioEl | undefined {
    const media = this.media.get(mediaId);
    if (!media || media.kind === "image") return undefined;
    return this.ensureEl(media).el as AudioEl;
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
    const spans = mainSpans(this.project);
    const t = this.t;
    const activeIds = new Set<string>();
    for (const s of spans) {
      const winStart = s.clip.transitionIn !== "none" ? s.start - s.clip.transitionDur : s.start;
      const active = t >= winStart && t < s.end + 0.001;
      if (!active) continue;
      activeIds.add(s.clip.mediaId);
      const el = this.audioEl(s.clip.mediaId);
      if (!el) continue;
      if (el instanceof HTMLVideoElement) {
        const local = s.clip.reverse
          ? s.clip.out - (t - s.start) * s.clip.speed
          : s.clip.in + (t - s.start) * s.clip.speed;
        if (Math.abs(el.currentTime - local) > (hard ? 0.1 : 0.35)) {
          try {
            el.currentTime = Math.max(0, local);
          } catch {
            /* not seekable yet */
          }
        }
        el.playbackRate = s.clip.speed;
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
            if (el) {
              const local = t - c.start;
              if (Math.abs(el.currentTime - local) > (hard ? 0.1 : 0.35)) {
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
              if (Math.abs(el.currentTime - local) > (hard ? 0.1 : 0.35)) {
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
    // pause everything else
    for (const [id, rec] of this.els) {
      if (activeIds.has(id)) continue;
      const e = rec.el as Partial<AudioEl>;
      if (e && !e.paused) e.pause?.();
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
      for (const rec of this.els.values()) {
        if (rec.el instanceof HTMLImageElement) continue;
        if (rec.sourceNode) continue;
        try {
          rec.sourceNode = this.audioCtx.createMediaElementSource(rec.el as AudioEl);
          rec.sourceNode.connect(this.master);
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
    return { ...DEFAULT_ANIM };
  }

  /** Interpolated animation values at the playhead for a clip. */
  animAtPlayhead(clip: MainClip | OverlayClip, clipStart: number): AnimValues {
    const local = Math.max(0, Math.min(this.duration(), this.t) - clipStart);
    return animAt(clip.keyframes, this.animBase(clip), local);
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    const { w: W, h: H } = ASPECTS[this.project.aspect];
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
      const c = s.clip;
      const rec = this.els.get(c.mediaId);
      const anim = animAt(c.keyframes, DEFAULT_ANIM, t - s.start);
      const a = clamp01(alpha * anim.opacity);
      if (!rec || !rec.url) {
        this.drawPlaceholder(ctx, W, H, c.mediaId, a);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = a;
      ctx.filter = buildFilterCss(c);
      if (anim.x !== 0 || anim.y !== 0 || anim.scale !== 1 || anim.rotation !== 0) {
        ctx.translate(W / 2 + anim.x * (W / 2), H / 2 + anim.y * (H / 2));
        ctx.rotate((anim.rotation * Math.PI) / 180);
        ctx.scale(anim.scale, anim.scale);
        ctx.translate(-W / 2, -H / 2);
      }
      if (rec.el instanceof HTMLImageElement) {
        this.drawImageCover(ctx, rec.el as HTMLImageElement, W, H);
      } else if (rec.el instanceof HTMLVideoElement) {
        if (rec.el.readyState >= 2 && rec.el.videoWidth > 0) {
          this.drawImageCover(ctx, rec.el, W, H);
        } else {
          this.drawPlaceholder(ctx, W, H, c.mediaId, a);
        }
      }
      ctx.restore();
    }

    // --- overlay tracks ---
    for (const tr of this.project.tracks) {
      for (const c of tr.clips) {
        if (t < c.start || t >= c.start + c.duration) continue;
        const localT = t - c.start;
        const rampIn = Math.min(1, localT / 0.4);
        const rampOut = Math.min(1, (c.start + c.duration - t) / 0.3);
        const fadeAlpha = c.anim === "none" ? 1 : rampIn * rampOut;
        const anim = animAt(c.keyframes, this.animBase(c), localT);
        if (c.kind === "text") this.drawText(ctx, c, W, H, fadeAlpha * clamp01(anim.opacity), rampIn, anim);
        if ((c.kind === "image" || c.kind === "video") && c.mediaId) {
          const rec = this.els.get(c.mediaId);
          if (!rec || !rec.url) continue;
          let sw = 0;
          let sh = 0;
          if (rec.el instanceof HTMLImageElement) {
            sw = rec.el.naturalWidth;
            sh = rec.el.naturalHeight;
          } else if (rec.el instanceof HTMLVideoElement) {
            sw = rec.el.videoWidth;
            sh = rec.el.videoHeight;
          }
          if (!sw || !sh) continue;
          const size = Math.max(1, anim.scale * W);
          const ar = sw / sh;
          const cx = W / 2 + anim.x * (W / 2);
          const cy = H / 2 + anim.y * (H / 2);
          const rot = (anim.rotation * Math.PI) / 180;
          const alpha = clamp01(fadeAlpha * anim.opacity);
          if (c.chroma && sw * sh > 4) {
            this.drawChroma(ctx, rec.el as HTMLVideoElement | HTMLImageElement, c, size, ar, alpha, cx, cy, rot);
          } else {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            ctx.drawImage(rec.el as HTMLImageElement | HTMLVideoElement, -size / 2, -size / (2 * ar), size, size / ar);
            ctx.restore();
          }
        }
      }
    }

    ctx.restore();
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
  ) {
    const m = this.media.get(mediaId);
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#101625");
    g.addColorStop(1, "#1b1030");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `500 ${Math.round(H * 0.022)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(m ? m.name : "media loading…", W / 2, H / 2);
    ctx.restore();
  }

  /** Text is drawn centered on the anchor point after the anim transform. */
  private drawText(
    ctx: CanvasRenderingContext2D,
    c: OverlayClip,
    W: number,
    H: number,
    alpha: number,
    ramp: number,
    anim: AnimValues,
  ) {
    const text = c.text ?? "";
    if (!text) return;
    const px = Math.max(4, (c.size ?? 64) * (H / 1080) * anim.scale);
    const weight = c.bold ? 700 : 500;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${Math.round(px)}px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = text.split("\n");
    const lineH = px * 1.18;
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
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
    const dy = c.anim === "slideup" ? (1 - ramp) * H * 0.03 : 0;
    ctx.translate(x + anim.x * (W / 2), y + anim.y * (H / 2) + dy);
    if (anim.rotation !== 0) ctx.rotate((anim.rotation * Math.PI) / 180);
    if (c.bg) {
      ctx.fillStyle = c.bg;
      const padX = px * 0.5;
      const padY = px * 0.28;
      const bw = maxW + padX * 2;
      const bh = totalH + padY * 2;
      const bx = -bw / 2;
      const by = -bh / 2;
      const r = Math.min(bh / 2, px * 0.4);
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx + bw, by + bh - r, r);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r);
      ctx.fill();
    }
    ctx.fillStyle = c.color ?? "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = px * 0.12;
    ctx.shadowOffsetY = px * 0.04;
    lines.forEach((l, i) => {
      ctx.fillText(l, 0, -totalH / 2 + lineH / 2 + i * lineH);
    });
    ctx.restore();
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
      const srcAt = c.in + (t - s.start) * c.speed;
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

  addTextClip(trackId: string, start: number): OverlayClip {
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
    };
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
    for (const rec of this.els.values()) {
      if (rec.el instanceof HTMLImageElement) continue;
      if (!rec.sourceNode) {
        rec.sourceNode = this.audioCtx.createMediaElementSource(rec.el as AudioEl);
        rec.sourceNode.connect(this.master!);
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
    rec.start(500);
    await this.play();
    const deadline = performance.now() + (dur + 15) * 1000;
    while (rec.state === "recording") {
      onProgress(Math.min(1, this.t / Math.max(0.001, dur)));
      if (performance.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!wasPlaying) this.pause();
    this.loop = wasLoop;
    if (rec.state !== "inactive") rec.stop();
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
    for (const rec of this.els.values()) {
      if (rec.el instanceof HTMLImageElement) continue;
      if (!rec.sourceNode) {
        rec.sourceNode = this.audioCtx.createMediaElementSource(rec.el as AudioEl);
        rec.sourceNode.connect(this.master!);
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
    }
    if (encError) throw encError instanceof Error ? encError : new Error("Encoder failed: " + String(encError));
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: "video/mp4" });
    if (blob.size < 1000) throw new Error("Export produced no data — try again");
    onProgress(1);
    return blob;
  }

  destroy() {
    this.pause();
    for (const rec of this.els.values()) {
      const e = rec.el as Partial<AudioEl>;
      if (e) e.pause?.();
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
