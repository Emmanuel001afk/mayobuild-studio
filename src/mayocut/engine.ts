// MayoCut engine — client-side playback, compositing and export.
// Runs entirely in the browser (also inside Electron / Capacitor).
// No server, no database: media lives in IndexedDB, export is canvas + WebAudio.

import {
  ASPECTS,
  DEFAULT_ADJUST,
  mainClipDuration,
  mainSpans,
  projectDuration,
  uid,
  type FilterAdjust,
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

  private ensureEl(media: MediaItem): MediaEl {
    const rec = this.els.get(media.id);
    if (rec) return rec.el;
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
    return el;
  }

  attachUrl(mediaId: string, url: string) {
    const media = this.media.get(mediaId);
    if (!media) return;
    const rec = this.ensureEl(media);
    rec.url = url;
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

  private audioEl(mediaId: string): AudioEl | undefined {
    const media = this.media.get(mediaId);
    if (!media || media.kind === "image") return undefined;
    return this.ensureEl(media) as AudioEl;
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
    for (const e of els) void e.el.play().catch(() => undefined);
    this.loopRaf();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const rec of this.els.values()) {
      const e = rec.el as Partial<AudioEl>;
      if (e && !e.paused) e.pause();
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
            if (e && !e.paused) e.pause();
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

  /** Keep media elements glued to the timeline clock. */
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
        const local = s.clip.in + (t - s.start) * s.clip.speed;
        if (Math.abs(el.currentTime - local) > (hard ? 0.1 : 0.35)) {
          try {
            el.currentTime = Math.max(0, local);
          } catch {
            /* not seekable yet */
          }
        }
        el.playbackRate = s.clip.speed;
        el.volume = this.effectiveVolume(s.clip, t, s);
        if (this.playing && el.paused) void el.play().catch(() => undefined);
      } else if (!this.playing && !el.paused) {
        el.pause();
      }
    }
    // overlay audio clips
    for (const tr of this.project.tracks) {
      for (const c of tr.clips) {
        if (c.kind !== "audio") continue;
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
            const edge = Math.min(t - c.start, c.start + c.duration - t);
            el.volume = (c.volume ?? 1) * Math.min(1, edge / 0.15);
            if (this.playing && el.paused) void el.play().catch(() => undefined);
          }
        }
      }
    }
    // pause everything else
    for (const [id, rec] of this.els) {
      if (activeIds.has(id)) continue;
      const e = rec.el as Partial<AudioEl>;
      if (e && !e.paused) e.pause();
    }
  }

  private activeAudioEls(): { el: AudioEl }[] {
    const spans = mainSpans(this.project);
    const out: { el: AudioEl }[] = [];
    const t = this.t;
    for (const s of spans) {
      const winStart = s.clip.transitionIn !== "none" ? s.start - s.clip.transitionDur : s.start;
      if (t >= winStart && t < s.end) {
        const el = this.audioEl(s.clip.mediaId);
        if (el) out.push({ el });
      }
    }
    for (const tr of this.project.tracks)
      for (const c of tr.clips)
        if (c.kind === "audio" && t >= c.start && t < c.start + c.duration) {
          const el = this.audioEl(c.mediaId);
          if (el) out.push({ el });
        }
    return out;
  }

  private effectiveVolume(clip: MainClip, t: number, s: { start: number; end: number }): number {
    let v = clip.muted ? 0 : clip.volume;
    if (clip.transitionIn !== "none" && t < s.start && clip.transitionDur > 0) {
      const k = (t - (s.start - clip.transitionDur)) / clip.transitionDur;
      v *= Math.max(0, Math.min(1, k));
    }
    if (s.end - t < 0.3 && clip.transitionIn === "none") v *= Math.max(0, Math.min(1, (s.end - t) / 0.3));
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
      let alpha = 1;
      if (c.transitionIn !== "none" && t < s.start && c.transitionDur > 0) {
        const k = Math.max(0, Math.min(1, (t - (s.start - c.transitionDur)) / c.transitionDur));
        // previous clip fades out
        if (i > 0) {
          const prev = spans[i - 1];
          if (items.length === 0) items.push({ s: prev, alpha: 1 - k });
          alpha = k;
        }
      }
      items.push({ s, alpha });
    }
    for (const { s, alpha } of items) {
      const c = s.clip;
      const rec = this.els.get(c.mediaId);
      if (!rec || !rec.url) {
        this.drawPlaceholder(ctx, W, H, c.mediaId, alpha);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter = buildFilterCss(c);
      if (rec.el instanceof HTMLImageElement) {
        this.drawImageCover(ctx, rec.el as HTMLImageElement, W, H);
      } else if (rec.el instanceof HTMLVideoElement) {
        if (rec.el.readyState >= 2 && rec.el.videoWidth > 0) {
          this.drawImageCover(ctx, rec.el, W, H);
        } else {
          this.drawPlaceholder(ctx, W, H, c.mediaId, alpha);
        }
      }
      ctx.restore();
    }

    // --- overlay tracks ---
    for (const tr of this.project.tracks) {
      for (const c of tr.clips) {
        if (t < c.start || t >= c.start + c.duration) continue;
        const localT = t - c.start;
        const ramp = Math.min(1, localT / 0.4);
        const fadeAlpha = c.anim === "none" ? 1 : ramp;
        if (c.kind === "text") this.drawText(ctx, c, W, H, fadeAlpha, ramp);
        if (c.kind === "image" && c.mediaId) {
          const rec = this.els.get(c.mediaId);
          if (rec?.el instanceof HTMLImageElement && rec.url) {
            ctx.save();
            ctx.globalAlpha = fadeAlpha;
            const size = (c.scale ?? 0.5) * W;
            const cx = W / 2 + (c.x ?? 0) * (W / 2);
            const cy = H / 2 + (c.y ?? 0) * (H / 2);
            ctx.translate(cx, cy);
            ctx.rotate(((c.rot ?? 0) * Math.PI) / 180);
            const img = rec.el;
            const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
            const dw = size;
            const dh = size / ar;
            ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
          }
        }
      }
    }

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

  private drawText(
    ctx: CanvasRenderingContext2D,
    c: OverlayClip,
    W: number,
    H: number,
    alpha: number,
    ramp: number,
  ) {
    const text = c.text ?? "";
    if (!text) return;
    const px = (c.size ?? 64) * (H / 1080);
    const weight = c.bold ? 700 : 500;
    ctx.save();
    ctx.globalAlpha = alpha;
    const dy = c.anim === "slideup" ? (1 - ramp) * H * 0.03 : 0;
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
    let y = H / 2 + dy;
    const col = pos[1] as "l" | "c" | "r";
    if (col === "l") x = mx + maxW / 2 + px * 0.4;
    if (col === "r") x = W - mx - maxW / 2 - px * 0.4;
    const row = pos[0] as "t" | "m" | "b";
    if (row === "t") y = my + totalH / 2 + dy;
    if (row === "b") y = H - my - totalH / 2 + dy;
    if (c.bg) {
      ctx.fillStyle = c.bg;
      const padX = px * 0.5;
      const padY = px * 0.28;
      const bw = maxW + padX * 2;
      const bh = totalH + padY * 2;
      const bx = x - bw / 2;
      const by = y - bh / 2;
      const r = Math.min(bh / 2, px * 0.4);
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r);
      ctx.arcTo(bx, by, bx + bw, by, r);
      ctx.fill();
    }
    ctx.fillStyle = c.color ?? "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = px * 0.12;
    ctx.shadowOffsetY = px * 0.04;
    lines.forEach((l, i) => {
      ctx.fillText(l, x, y - totalH / 2 + lineH / 2 + i * lineH);
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
      media.kind === "video" ? media.duration ?? 5 : media.kind === "audio" ? 0 : 3;
    const clip: MainClip = {
      id: uid("mc"),
      mediaId: media.id,
      in: 0,
      out: media.kind === "image" ? 3 : Math.max(0.5, dur),
      speed: 1,
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

  /** Split the main clip under the playhead. Returns the two halves or null. */
  splitAt(t: number): boolean {
    const spans = mainSpans(this.project);
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (t <= s.start || t >= s.end) continue;
      const c = s.clip;
      const srcAt = c.in + (t - s.start) * c.speed;
      if (srcAt - c.in < 0.08 || c.out - srcAt < 0.08) return false;
      const a: MainClip = { ...c, id: uid("mc"), in: c.in, out: srcAt, transitionIn: "none", transitionDur: 0 };
      const b: MainClip = { ...c, id: uid("mc"), in: srcAt, out: c.out };
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
      kind: "image",
      mediaId: media.id,
      start: Math.max(0, start),
      duration: 3,
      scale: 0.5,
      x: 0,
      y: -0.4,
      rot: 0,
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

  // ------------------------------------------------------------- export

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

  destroy() {
    this.pause();
    for (const rec of this.els.values()) {
      const e = rec.el as Partial<AudioEl>;
      if (e) e.pause();
      if (rec.url) URL.revokeObjectURL(rec.url);
      (rec.el as HTMLVideoElement).src = "";
    }
    this.els.clear();
    try {
      void this.audioCtx?.close();
    } catch {
      /* ignore */
    }
    this.audioCtx = null;
  }
}
