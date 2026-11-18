// MayoCut — local text-to-speech (sherpa-onnx VITS, piper voice "en_US-amy-low").
//
// Grounding: k2-fsa/sherpa-onnx (MIT), the engine behind the official browser
// TTS demo (wasm/tts). The emscripten runtime + TTS glue are vendored into
// public/tts/ (scripts/tts-assets.mjs; the only change is a browser-safe
// `path` polyfill). Model files come from k2-fsa's own Hugging Face repo
// `csukuangfj/vits-piper-en_US-amy-low` (pre-extracted mirror of the official
// `tts-models` release tarball) plus the `lexicon-en-us.txt` release asset —
// one-time download, cached in IndexedDB, then fully offline.
//
// Generation runs in a dedicated Web Worker on a single CPU thread: a few
// seconds per 10 s of audio on a modern desktop, slower on phones.

import { db } from "./idb";
import { encodeWavMono } from "./denoise";

export const TTS_MODEL_ID = "amy-low-en-us";
export const TTS_MODEL_BYTES = 63_104_657 + 763 + 6_305_773; // ≈ 70 MB one-time

interface TtsFileSpec {
  key: string;
  /** MEMFS path inside the wasm runtime */
  path: string;
  url: string;
  size: number;
}

const HF = "https://huggingface.co/csukuangfj/vits-piper-en_US-amy-low/resolve/main/";

export const TTS_FILES: TtsFileSpec[] = [
  {
    key: "model",
    path: "/tts/en_US-amy-low.onnx",
    url: HF + "en_US-amy-low.onnx",
    size: 63_104_657,
  },
  { key: "tokens", path: "/tts/tokens.txt", url: HF + "tokens.txt", size: 763 },
  {
    key: "lexicon",
    path: "/tts/lexicon-en-us.txt",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/lexicon-en-us.txt",
    size: 6_305_773,
  },
];

export interface TtsInfo {
  sampleRate: number;
  numSpeakers: number;
}

export interface TtsAudio {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  wav: Blob;
}

function assetBase(): string {
  const proto = window.location.protocol;
  if (proto === "file:" || proto === "capacitor:" || proto === "http-capacitor:") {
    return new URL("./", window.location.href).href;
  }
  return window.location.origin + "/";
}

/** fetch with progress; falls back to plain arrayBuffer when size unknown. */
async function fetchWithProgress(
  url: string,
  knownSize: number,
  onBytes: (got: number) => void,
): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed (HTTP ${r.status})`);
  if (!r.body || !knownSize) return r.arrayBuffer();
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      got += value.length;
      onBytes(got);
    }
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

type Pending = {
  resolve: (a: { samples: Float32Array; sampleRate: number }) => void;
  reject: (e: Error) => void;
};

export class TtsEngine {
  private worker: Worker | null = null;
  private readyPromise: Promise<TtsInfo> | null = null;
  private info: TtsInfo | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private statusFn: ((msg: string) => void) | null = null;

  get ready(): boolean {
    return this.info !== null;
  }

  get modelLabel(): string {
    return "en_US-amy-low · piper VITS · 22.05 kHz";
  }

  async ensure(onStatus?: (msg: string, pct?: number) => void): Promise<TtsInfo> {
    if (this.info) return this.info;
    if (!this.readyPromise) {
      this.readyPromise = this.doEnsure(onStatus).catch((e) => {
        this.readyPromise = null;
        this.dispose();
        throw e;
      });
    }
    return this.readyPromise;
  }

  private async doEnsure(onStatus?: (msg: string, pct?: number) => void): Promise<TtsInfo> {
    // 1) gather model bytes (IndexedDB cache first — one-time download)
    const bytes = new Map<string, ArrayBuffer>();
    for (const f of TTS_FILES) {
      const id = "tts-" + f.key;
      let blob: Blob | undefined = await db.getBlob(id);
      if (!blob) {
        const mb = (n: number) => (n / 1048576).toFixed(1);
        onStatus?.(`Downloading ${f.path.split("/").pop()} (0/${mb(f.size)} MB)…`, 0);
        const buf = await fetchWithProgress(f.url, f.size, (got) =>
          onStatus?.(
            `Downloading ${f.path.split("/").pop()} (${mb(got)}/${mb(f.size)} MB)…`,
            got / f.size,
          ),
        );
        if (buf.byteLength !== f.size) {
          throw new Error(`unexpected size for ${f.key}: got ${buf.byteLength} want ${f.size}`);
        }
        blob = new Blob([buf]);
        await db.putRawBlob(id, blob);
      }
      bytes.set(f.key, await blob.arrayBuffer());
      onStatus?.(`${f.path.split("/").pop()} ready`, 1);
    }

    // 2) start the worker and wait for ready
    this.statusFn = (msg) => onStatus?.(msg);
    const worker = new Worker(assetBase() + "tts/tts-worker.js");
    this.worker = worker;

    const ready = new Promise<TtsInfo>((resolve, reject) => {
      const to = setTimeout(
        () => reject(new Error("TTS engine did not start in time — see console for details")),
        180_000,
      );
      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === "status") {
          this.statusFn?.(m.status);
        } else if (m.type === "ready") {
          clearTimeout(to);
          this.info = { sampleRate: m.sampleRate, numSpeakers: m.numSpeakers };
          resolve(this.info);
        } else if (m.type === "error") {
          const err = new Error(m.message || "TTS worker error");
          if (m.seq != null) this.failOne(m.seq, err);
          else {
            clearTimeout(to);
            this.rejectAll(err);
            reject(err);
          }
        } else if (m.type === "audio") {
          const p = this.pending.get(m.seq);
          if (p) {
            this.pending.delete(m.seq);
            p.resolve({ samples: m.samples, sampleRate: m.sampleRate });
          }
        }
      };
      worker.onerror = (e) => {
        clearTimeout(to);
        const err = new Error(e.message || "TTS worker crashed");
        this.rejectAll(err);
        reject(err);
      };
    });

    worker.postMessage(
      { type: "hello", files: TTS_FILES.map((f) => [f.path, bytes.get(f.key), f.size]) },
      TTS_FILES.map((f) => bytes.get(f.key) as ArrayBuffer),
    );

    const info = await ready;
    this.statusFn = null;
    return info;
  }

  async generate(text: string, speed = 1): Promise<TtsAudio> {
    if (!this.info || !this.worker) throw new Error("TTS model not loaded yet");
    const seq = ++this.seq;
    const a = await new Promise<{ samples: Float32Array; sampleRate: number }>(
      (resolve, reject) => {
        const to = setTimeout(() => {
          this.pending.delete(seq);
          reject(new Error("speech generation timed out"));
        }, 300_000);
        this.pending.set(seq, {
          resolve: (x) => {
            clearTimeout(to);
            resolve(x);
          },
          reject: (e) => {
            clearTimeout(to);
            reject(e);
          },
        });
        this.worker!.postMessage({ type: "generate", seq, text, speed });
      },
    );
    return {
      samples: a.samples,
      sampleRate: a.sampleRate,
      duration: a.samples.length / a.sampleRate,
      wav: encodeWavMono(a.samples, a.sampleRate),
    };
  }

  private failOne(seq: number, e: Error) {
    const p = this.pending.get(seq);
    if (p) {
      this.pending.delete(seq);
      p.reject(e);
    }
  }

  private rejectAll(e: Error) {
    for (const [, p] of this.pending) p.reject(e);
    this.pending.clear();
    this.info = null;
  }

  /** Free the wasm memory (model stays in IndexedDB). */
  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.info = null;
    this.readyPromise = null;
    this.rejectAll(new Error("disposed"));
  }
}

export const tts = new TtsEngine();
