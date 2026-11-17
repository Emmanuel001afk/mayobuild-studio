// MayoCut client helpers: media import, thumbnails, formatting.

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

export async function makeThumb(
  kind: MediaKind,
  url: string,
): Promise<string | undefined> {
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
        el.preload = "metadata";
        if (kind === "video") el.muted = true;
        el.src = url;
        duration = await probeDuration(el);
        if (kind === "video") {
          width = el.videoWidth;
          height = el.videoHeight;
        }
      }
    } catch {
      duration = 0;
    }
    const thumb = await makeThumb(kind, url);
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
    if (kind === "audio") {
      // waveform + true loudness, computed locally at import time
      const audio = await analyzeAudioFile(f);
      if (audio) {
        item.wave = audio.wave;
        item.rms = audio.rms;
      }
    }
    out.push(item);
    onProgress?.(i + 1, list.length);
  }
  return out;
}

/** Decode a file to ~128 amplitude bins + RMS. Best-effort (undefined on failure). */
async function analyzeAudioFile(f: File): Promise<{ wave: number[]; rms: number } | undefined> {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
