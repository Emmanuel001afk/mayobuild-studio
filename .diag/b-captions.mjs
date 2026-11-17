// src/mayocut/types.ts
function mainClipDuration(c) {
  const L = Math.max(0, c.out - c.in);
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  if (Math.abs(v1 - v0) < 1e-6) return L / v0;
  return L / (v1 - v0) * Math.log(v1 / v0);
}
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mainSrcAt(c, localT) {
  const L = Math.max(1e-6, c.out - c.in);
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  const dur = mainClipDuration(c);
  const tau = clamp(localT, 0, dur);
  const k = (v1 - v0) / L;
  let x;
  if (Math.abs(k) < 1e-9) x = tau * v0;
  else x = v0 / k * (Math.exp(k * tau) - 1);
  x = clamp(x, 0, L);
  return c.reverse ? c.out - x : c.in + x;
}

// src/mayocut/captions.ts
var WHISPER_MODELS = [
  { id: "Xenova/whisper-tiny", name: "Tiny \u2014 fast", size: "~40 MB" },
  { id: "Xenova/whisper-base", name: "Base \u2014 more accurate", size: "~75 MB" }
];
var CAPTION_LANGUAGES = [
  { id: "auto", name: "Auto detect" },
  { id: "en", name: "English" },
  { id: "fr", name: "Fran\xE7ais" },
  { id: "es", name: "Espa\xF1ol" },
  { id: "de", name: "Deutsch" },
  { id: "it", name: "Italiano" },
  { id: "pt", name: "Portugu\xEAs" },
  { id: "nl", name: "Nederlands" },
  { id: "pl", name: "Polski" },
  { id: "tr", name: "T\xFCrk\xE7e" },
  { id: "ru", name: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439" },
  { id: "hi", name: "\u0939\u093F\u0928\u094D\u0926\u0940" },
  { id: "ar", name: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629" },
  { id: "id", name: "Bahasa" },
  { id: "vi", name: "Ti\u1EBFng Vi\u1EC7t" },
  { id: "zh", name: "\u4E2D\u6587" },
  { id: "ja", name: "\u65E5\u672C\u8A9E" },
  { id: "ko", name: "\uD55C\uAD6D\uC5B4" }
];
function assetBase() {
  const proto = window.location.protocol;
  if (proto === "file:" || proto === "capacitor:" || proto === "http-capacitor:") {
    return new URL("./", window.location.href).href;
  }
  return window.location.origin + "/";
}
var WhisperEngine = class {
  pipe = null;
  model = null;
  get ready() {
    return this.pipe !== null;
  }
  async load(modelId, onProgress, localFiles) {
    onProgress?.("Loading Whisper\u2026");
    const { pipeline, env } = await import("@xenova/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.wasmPaths = assetBase() + "onnx/";
    if (localFiles && localFiles.length > 0) {
      this.pipe = await pipeline(
        "automatic-speech-recognition",
        localFiles
      );
      this.model = "local files";
    } else {
      this.pipe = await pipeline(
        "automatic-speech-recognition",
        modelId,
        {
          dtype: "q8",
          progress_callback: (p) => {
            if (p.status === "progress" && typeof p.progress === "number") {
              onProgress?.(`Downloading ${p.file ?? "model"}\u2026`, p.progress);
            } else if (p.status === "done") {
              onProgress?.("Model cached \u2014 offline from now on");
            }
          }
        }
      );
      this.model = modelId;
    }
    onProgress?.("Whisper ready");
  }
  unload() {
    this.pipe = null;
    this.model = null;
  }
  /** Transcribe 16 kHz mono float audio → segments with word timing. */
  async transcribe(audio, language, onStage) {
    if (!this.pipe) throw new Error("No Whisper model loaded");
    onStage?.("Transcribing\u2026 (local, first pass can take a while)");
    const opts = {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
      top_k: 0,
      do_sample: false
    };
    if (language && language !== "auto") {
      opts.language = language;
      opts.task = "transcribe";
    }
    let out;
    try {
      out = await this.pipe(audio, opts);
    } catch {
      out = await this.pipe(audio, { ...opts, return_timestamps: true });
    }
    const chunks = out.chunks ?? [];
    if (chunks.length === 0) return [];
    const segs = [];
    let cur = null;
    const flush = () => {
      if (cur && cur.text.trim()) {
        const c = cur;
        segs.push({
          start: c.start,
          end: Math.max(c.start + 0.5, c.end),
          text: c.text.trim().replace(/\s+/g, " "),
          words: c.words
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
};
var whisper = new WhisperEngine();
async function projectAudio16k(eng, onStage) {
  const spans = eng.mainSpansPublic();
  if (spans.length === 0) return null;
  const total = spans.reduce((a, s) => a + (s.end - s.start), 0);
  if (total < 0.5) return null;
  const RATE = 16e3;
  const out = new Float32Array(Math.round(total * RATE));
  let cursor = 0;
  const monoCache = /* @__PURE__ */ new Map();
  for (const s of spans) {
    const c = s.clip;
    const media = eng.getMedia(c.mediaId);
    if (!media || media.kind === "image") continue;
    onStage?.(`Reading audio: ${media.name}`);
    let mono = monoCache.get(media.id);
    if (mono === void 0) {
      const buf = await eng.audioBuffer(media.id);
      if (!buf) {
        mono = null;
      } else {
        let src;
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
        if (Math.abs(ratio - 1) > 1e-3) {
          const n2 = Math.max(1, Math.round(src.length * ratio));
          const r = new Float32Array(n2);
          const span = src.length / n2;
          for (let i = 0; i < n2; i++) {
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
      const srcT = mainSrcAt(c, i / RATE) * RATE;
      const i0 = Math.max(0, Math.min(mono.length - 1, srcT | 0));
      const i1 = Math.min(mono.length - 1, i0 + 1);
      const f = srcT - i0;
      out[cursor + i] = mono[i0] + (mono[i1] - mono[i0]) * f;
    }
    cursor += n;
  }
  return { samples: out.subarray(0, cursor), duration: cursor / RATE };
}
function captionsToTextClips(segs, opts) {
  return segs.map((seg) => {
    const words = opts.karaoke && seg.words?.length ? seg.words.map((w) => ({ t: w.t - seg.start, text: w.text })) : void 0;
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
      anim: opts.karaoke && words ? "karaoke" : "fade"
    };
  });
}
function captionSourceLabel(eng) {
  const spans = eng.mainSpansPublic();
  const dur = spans.reduce((a, s) => a + (s.end - s.start), 0);
  return dur > 0 ? `${spans.length} clip(s), ${Math.round(dur)} s of main-track audio` : "no audio on the main track";
}
export {
  CAPTION_LANGUAGES,
  WHISPER_MODELS,
  captionSourceLabel,
  captionsToTextClips,
  projectAudio16k,
  whisper
};
