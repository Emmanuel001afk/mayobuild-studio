// MayoCut Auto Captions — local Whisper (OpenAI's public model) via
// @xenova/transformers (ONNX in WebAssembly). Fully on-device:
//  • one-time model download (cached by the browser), or
//  • bring your own model files (strict offline).
// The editor works with no model at all — captions are an assistive add-on.

import { mainSrcAt, mainSpans, type OverlayClip, type TextWord } from "./types";
import type { Engine } from "./engine";

export interface CaptionWord {
  t: number;
  end: number;
  text: string;
}

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
  words?: CaptionWord[];
}

export type WhisperModelId = "Xenova/whisper-tiny" | "Xenova/whisper-base";

export const WHISPER_MODELS: { id: WhisperModelId; name: string; size: string }[] = [
  { id: "Xenova/whisper-tiny", name: "Tiny — fast", size: "~40 MB" },
  { id: "Xenova/whisper-base", name: "Base — more accurate", size: "~75 MB" },
];

export const CAPTION_LANGUAGES: { id: string; name: string }[] = [
  { id: "auto", name: "Auto detect" },
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
  { id: "es", name: "Español" },
  { id: "de", name: "Deutsch" },
  { id: "it", name: "Italiano" },
  { id: "pt", name: "Português" },
  { id: "nl", name: "Nederlands" },
  { id: "pl", name: "Polski" },
  { id: "tr", name: "Türkçe" },
  { id: "ru", name: "Русский" },
  { id: "hi", name: "हिन्दी" },
  { id: "ar", name: "العربية" },
  { id: "id", name: "Bahasa" },
  { id: "vi", name: "Tiếng Việt" },
  { id: "zh", name: "中文" },
  { id: "ja", name: "日本語" },
  { id: "ko", name: "한국어" },
];

interface RawChunk {
  text?: string;
  timestamp?: [number, number | null];
}

/**
 * Runtime asset base — the platform serves public/ at the origin root on the
 * web; the packaged shells (Electron/Capacitor) serve next to index.html.
 */
function assetBase(): string {
  const proto = window.location.protocol;
  if (proto === "file:" || proto === "capacitor:" || proto === "http-capacitor:") {
    return new URL("./", window.location.href).href;
  }
  return window.location.origin + "/";
}

class WhisperEngine {
  private pipe: ((audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text?: string; chunks?: RawChunk[] }>) | null =
    null;
  model: string | null = null;

  get ready(): boolean {
    return this.pipe !== null;
  }

  async load(
    modelId: WhisperModelId,
    onProgress?: (msg: string, pct?: number) => void,
    localFiles?: File[],
  ): Promise<void> {
    onProgress?.("Loading Whisper…");
    const { pipeline, env } = await import("@xenova/transformers");
    // keep everything local: no proxy worker, wasm from our own /onnx/ folder
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = assetBase() + "onnx/";
    if (localFiles && localFiles.length > 0) {
      // v2 runtime accepts File[] (loaded from blob URLs) — types lag behind
      this.pipe = (await pipeline(
        "automatic-speech-recognition",
        localFiles as unknown as string,
      )) as unknown as typeof this.pipe;
      this.model = "local files";
    } else {
      this.pipe = (await pipeline(
        "automatic-speech-recognition",
        modelId,
        {
          dtype: "q8",
          progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
            if (p.status === "progress" && typeof p.progress === "number") {
              onProgress?.(`Downloading ${p.file ?? "model"}…`, p.progress);
            } else if (p.status === "done") {
              onProgress?.("Model cached — offline from now on");
            }
          },
        } as unknown as Parameters<typeof pipeline>[2],
      )) as unknown as typeof this.pipe;
      this.model = modelId;
    }
    onProgress?.("Whisper ready");
  }

  unload(): void {
    this.pipe = null;
    this.model = null;
  }

  /** Transcribe 16 kHz mono float audio → segments with word timing. */
  async transcribe(
    audio: Float32Array,
    language: string,
    onStage?: (msg: string) => void,
  ): Promise<CaptionSegment[]> {
    if (!this.pipe) throw new Error("No Whisper model loaded");
    onStage?.("Transcribing… (local, first pass can take a while)");
    const opts: Record<string, unknown> = {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
      top_k: 0,
      do_sample: false,
    };
    if (language && language !== "auto") {
      opts.language = language;
      opts.task = "transcribe";
    }
    let out: { text?: string; chunks?: RawChunk[] };
    try {
      out = await this.pipe(audio, opts);
    } catch {
      // word-level timestamps can fail on some models — fall back to phrase level
      out = await this.pipe(audio, { ...opts, return_timestamps: true });
    }
    const chunks = out.chunks ?? [];
    if (chunks.length === 0) return [];
    // group word chunks into subtitle lines (gap / length / punctuation)
    const segs: CaptionSegment[] = [];
    type Cur = { start: number; end: number; text: string; words: CaptionWord[] };
    let cur: Cur | null = null;
    const flush = () => {
      if (cur && cur.text.trim()) {
        const c = cur;
        segs.push({
          start: c.start,
          end: Math.max(c.start + 0.5, c.end),
          text: c.text.trim().replace(/\s+/g, " "),
          words: c.words,
        });
      }
      cur = null;
    };
    for (const ch of chunks) {
      const text = (ch.text ?? "").trim();
      if (!text) continue;
      const s = ch.timestamp?.[0] ?? 0;
      const e = ch.timestamp?.[1] ?? s;
      if (!cur) {
        cur = { start: s, end: e, text: "", words: [] };
      } else {
        const c = cur;
        if (s - c.end > 0.7 || c.text.length + text.length > 42 || /[\.\!\?\:]$/.test(c.text)) {
          flush();
          cur = { start: s, end: e, text: "", words: [] };
        }
      }
      const c2 = cur;
      if (!c2) continue;
      c2.text += (c2.text ? " " : "") + text;
      c2.end = e;
      c2.words.push({ t: s, end: e, text });
    }
    flush();
    return segs;
  }
}

export const whisper = new WhisperEngine();

// ---------------------------------------------------------------------------
// Project audio → 16 kHz mono (main track, speed/reverse aware)
// ---------------------------------------------------------------------------

export async function projectAudio16k(
  eng: Engine,
  onStage?: (msg: string) => void,
): Promise<{ samples: Float32Array; duration: number } | null> {
  const spans = eng.mainSpansPublic();
  if (spans.length === 0) return null;
  const total = spans.reduce((a, s) => a + (s.end - s.start), 0);
  if (total < 0.5) return null;
  const RATE = 16000;
  const out = new Float32Array(Math.round(total * RATE));
  let cursor = 0;
  const monoCache = new Map<string, Float32Array | null>();
  for (const s of spans) {
    const c = s.clip;
    const media = eng.getMedia(c.mediaId);
    if (!media || media.kind === "image") continue;
    onStage?.(`Reading audio: ${media.name}`);
    let mono = monoCache.get(media.id);
    if (mono === undefined) {
      const buf = await eng.audioBuffer(media.id);
      if (!buf) {
        mono = null;
      } else {
        // downmix + resample to 16k (source rate)
        let src: Float32Array;
        if (buf.numberOfChannels === 1) src = buf.getChannelData(0);
        else {
          src = new Float32Array(buf.length);
          for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const d = buf.getChannelData(ch);
            const g = 1 / buf.numberOfChannels;
            for (let i = 0; i < d.length; i++) src[i] += d[i] * g;
          }
        }
        const ratio = RATE / buf.sampleRate;
        if (Math.abs(ratio - 1) > 0.001) {
          const n = Math.max(1, Math.round(src.length * ratio));
          const r = new Float32Array(n);
          const span = src.length / n;
          for (let i = 0; i < n; i++) {
            const x = i * span;
            const i0 = x | 0;
            const i1 = Math.min(src.length - 1, i0 + 1);
            r[i] = src[i0] + (src[i1] - src[i0]) * (x - i0);
          }
          mono = r;
        } else mono = src;
      }
      monoCache.set(media.id, mono);
    }
    if (!mono) continue;
    const localDur = s.end - s.start;
    const n = Math.round(localDur * RATE);
    for (let i = 0; i < n && cursor + i < out.length; i++) {
      const srcT = mainSrcAt(c, i / RATE) * RATE; // source seconds → 16k index
      const i0 = Math.max(0, Math.min(mono.length - 1, srcT | 0));
      const i1 = Math.min(mono.length - 1, i0 + 1);
      const f = srcT - i0;
      out[cursor + i] = mono[i0] + (mono[i1] - mono[i0]) * f;
    }
    cursor += n;
  }
  return { samples: out.subarray(0, cursor), duration: cursor / RATE };
}

// ---------------------------------------------------------------------------
// Captions → text clips
// ---------------------------------------------------------------------------

export function captionsToTextClips(
  segs: CaptionSegment[],
  opts: { karaoke: boolean },
): Omit<OverlayClip, "id">[] {
  return segs.map((seg) => {
    const words: TextWord[] | undefined =
      opts.karaoke && seg.words?.length
        ? seg.words.map((w) => ({ t: w.t - seg.start, text: w.text }))
        : undefined;
    return {
      kind: "text",
      start: Math.max(0, seg.start),
      duration: Math.max(0.6, seg.end - seg.start + 0.2),
      text: seg.text,
      words,
      size: 52,
      color: "#ffffff",
      bg: opts.karaoke ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.35)",
      bold: true,
      pos: "bc",
      anim: opts.karaoke && words ? "karaoke" : "fade",
    };
  });
}

export function captionSourceLabel(eng: Engine): string {
  const spans = eng.mainSpansPublic();
  const dur = spans.reduce((a, s) => a + (s.end - s.start), 0);
  return dur > 0 ? `${spans.length} clip(s), ${Math.round(dur)} s of main-track audio` : "no audio on the main track";
}
