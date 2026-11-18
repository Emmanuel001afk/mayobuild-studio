// MayoCut client helpers: media import, thumbnails, formatting.

import { GifReader } from "omggif";
import type { MediaItem, MediaKind } from "./types";
import { uid } from "./types";

export function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const d = Math.floor((s % 1) * 30);
  return `${m}:${sec.toString().padStart(2, "0")}.${d.toString().padStart(2, "0")}`;
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function kindFromMime(mime: string, name: string): MediaKind | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) return "image";
  return null;
}

function probeDuration(el: HTMLVideoElement | HTMLAudioElement): Promise<number> {
  return new Promise((resolve) => {
    const done = (v: number) => resolve(isFinite(v) && v > 0 ? v : 0);
    const to = setTimeout(() => done(el.duration), 4000);
    el.onloadedmetadata = () => {
      clearTimeout(to);
      done(el.duration);
    };
    el.onerror = () => {
      clearTimeout(to);
      done(0);
    };
  });
}

/**
 * Can this device actually DECODE and play the video (not just read its
 * metadata)? Metadata loads fine for many formats the WebView can't render
 * (e.g. HEVC camera clips) — checking `loadeddata` (a real decoded frame) is
 * what separates "plays" from "reads a header but stays a placeholder".
 */
function probePlayable(el: HTMLVideoElement, timeoutMs = 4500): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      resolve(v);
    };
    const to = setTimeout(() => finish(false), timeoutMs);
    if (el.readyState >= 2) {
      finish(true);
      return;
    }
    el.onloadeddata = () => finish(true);
    el.onerror = () => finish(false);
  });
}

export async function makeThumb(kind: MediaKind, url: string): Promise<string | undefined> {
  try {
    if (kind === "image") {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const c = document.createElement("canvas");
      const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.6);
    }
    if (kind === "video") {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = url;
      await new Promise<void>((res, rej) => {
        const to = setTimeout(rej, 6000);
        v.onloadeddata = () => {
          clearTimeout(to);
          res();
        };
        v.onerror = () => {
          clearTimeout(to);
          rej(new Error("video load failed"));
        };
      });
      const t = Math.min(0.5, (v.duration || 1) / 2);
      v.currentTime = t;
      await new Promise<void>((res) => {
        const to = setTimeout(res, 3000);
        v.onseeked = () => {
          clearTimeout(to);
          res();
        };
      });
      const c = document.createElement("canvas");
      const scale = Math.min(1, 320 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.max(1, Math.round(v.videoWidth * scale));
      c.height = Math.max(1, Math.round(v.videoHeight * scale));
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.55);
    }
  } catch {
    /* thumbnails are best-effort */
  }
  return undefined;
}

export async function importFiles(
  files: FileList | File[],
  onProgress?: (done: number, total: number) => void,
): Promise<MediaItem[]> {
  const out: MediaItem[] = [];
  const list = Array.from(files);
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const kind = kindFromMime(f.type, f.name);
    if (!kind) continue;
    const id = uid("med");
    const url = URL.createObjectURL(f);
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let playable: boolean | undefined; // video: decodable on THIS device
    try {
      if (kind === "image") {
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = url;
        });
        width = img.naturalWidth;
        height = img.naturalHeight;
        duration = 0;
      } else {
        const el = document.createElement(kind === "video" ? "video" : "audio") as HTMLVideoElement;
        el.preload = "auto";
        if (kind === "video") el.muted = true;
        el.src = url;
        duration = await probeDuration(el);
        if (kind === "video") {
          width = el.videoWidth;
          height = el.videoHeight;
          playable = await probePlayable(el);
        }
      }
    } catch {
      duration = 0;
      if (kind === "video") playable = false;
    }
    const thumb = kind === "video" && playable === false ? undefined : await makeThumb(kind, url);
    URL.revokeObjectURL(url);
    const item: MediaItem = {
      id,
      name: f.name,
      kind,
      size: f.size,
      createdAt: Date.now(),
      duration,
      width,
      height,
      thumb,
    };
    if (kind === "video") item.unplayable = playable === false;
    if (kind === "audio") {
      // waveform + true loudness, computed locally at import time
      const audio = await analyzeAudioFile(f);
      if (audio) {
        item.wave = audio.wave;
        item.rms = audio.rms;
      }
    }
    if (kind === "image" && isGifFile(f)) {
      const g = await probeGif(f);
      if (g) {
        item.isGif = true;
        item.gifFrames = g.count;
        item.duration = Math.max(0.5, g.count / g.fps);
      }
    }
    out.push(item);
    onProgress?.(i + 1, list.length);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Audio decode (16 kHz mono) — input for the local Whisper captions engine.
// Pure WebAudio, fully offline.
// ---------------------------------------------------------------------------

export function decodeAudioToMono16(blob: Blob): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return resolve(null);
    const ctx = new Ctor();
    blob
      .arrayBuffer()
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        // downmix to mono
        let mono: Float32Array;
        if (buf.numberOfChannels === 1) {
          mono = buf.getChannelData(0);
        } else {
          mono = new Float32Array(buf.length);
          for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const d = buf.getChannelData(ch);
            const g = 1 / buf.numberOfChannels;
            for (let i = 0; i < d.length; i++) mono[i] += d[i] * g;
          }
        }
        // resample to 16 kHz (linear)
        const target = 16000;
        if (Math.abs(buf.sampleRate - target) < 1) resolve(mono);
        else {
          const outLen = Math.max(1, Math.round(mono.length * (target / buf.sampleRate)));
          const out = new Float32Array(outLen);
          const ratio = mono.length / outLen;
          for (let i = 0; i < outLen; i++) {
            const x = i * ratio;
            const i0 = x | 0;
            const i1 = Math.min(mono.length - 1, i0 + 1);
            out[i] = mono[i0] + (mono[i1] - mono[i0]) * (x - i0);
          }
          resolve(out);
        }
      })
      .catch(() => resolve(null))
      .finally(() => void ctx.close());
  });
}

/** Generate a decaying-noise impulse response (offline reverb). */
export function makeImpulse(ctx: BaseAudioContext, seconds = 1.8, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.round(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// GIF stickers (omggif — Google's tiny public decoder).
// Decoded once at import to a frame-count probe; full frames are decoded on
// demand by the engine from the stored blob (capped to stay in memory).
// ---------------------------------------------------------------------------

export const GIF_MAX_FRAMES = 48;
export const GIF_MAX_SIDE = 400;

export function probeGif(
  blob: Blob,
): Promise<{ fps: number; count: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (blob.size > 8 * 1024 * 1024) return resolve(null);
    blob
      .arrayBuffer()
      .then((ab) => {
        const reader = new GifReader(new Uint8Array(ab));
        if (reader.numFrames() === 0) return resolve(null);
        const info = reader.frameInfo(0);
        if (!info || info.width > GIF_MAX_SIDE || info.height > GIF_MAX_SIDE) return resolve(null);
        const count = Math.min(GIF_MAX_FRAMES, reader.numFrames());
        let ms = 0;
        for (let k = 0; k < count; k++) {
          const f = reader.frameInfo(k);
          ms += f?.delay ?? 0.1;
        }
        const fps = ms > 0 ? Math.min(60, Math.max(2, count / (ms / 1000))) : 12;
        resolve({ fps, count, width: info.width, height: info.height });
      })
      .catch(() => resolve(null));
  });
}

export function isGifFile(f: File): boolean {
  return f.type === "image/gif" || /\.gif$/i.test(f.name);
}

/** Decode a file to ~128 amplitude bins + RMS. Best-effort (undefined on failure). */
async function analyzeAudioFile(f: File): Promise<{ wave: number[]; rms: number } | undefined> {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    try {
      const audio = await ctx.decodeAudioData(await f.arrayBuffer());
      const data = audio.getChannelData(0);
      const bins = 128;
      const per = Math.max(1, Math.floor(data.length / bins));
      const wave: number[] = [];
      let sq = 0;
      let n = 0;
      let peak = 0;
      for (let b = 0; b < bins; b++) {
        let p = 0;
        const s0 = b * per;
        for (let i = s0; i < Math.min(data.length, s0 + per); i += 8) {
          const v = Math.abs(data[i]);
          if (v > p) p = v;
          sq += data[i] * data[i];
          n++;
        }
        wave.push(p);
        if (p > peak) peak = p;
      }
      const norm = peak > 0 ? 1 / peak : 1;
      return { wave: wave.map((v) => v * norm), rms: Math.sqrt(sq / Math.max(1, n)) };
    } finally {
      void ctx.close();
    }
  } catch {
    return undefined;
  }
}
