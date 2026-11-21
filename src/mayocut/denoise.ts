// MayoCut — RNNoise speech denoise (batch, fully offline, in-browser wasm).
//
// Grounding: xiph/rnnoise (BSD-3) as compiled by @shiguredo/rnnoise-wasm
// (Apache-2.0, upstream xiph/rnnoise @70f1d256). RNNoise is a single-frame
// recurrent-denoiser trained on speech: it operates on 48 kHz mono audio in
// 480-sample (10 ms) frames. `processFrame` writes the enhanced frame back
// into the input array and returns a voice-activity probability (0..1).
//
// We run it as "process once, cache the result": the clip's audio is decoded,
// denoised, and re-encoded to WAV, becoming a new media item the clip can
// reference. Playback and exports then use the clean audio everywhere.

import { Rnnoise } from "@shiguredo/rnnoise-wasm";

const TARGET_RATE = 48000;

export interface DenoiseResult {
  wav: Blob; // PCM16 mono WAV at the source sample rate
  sampleRate: number;
  duration: number; // seconds
  speechProb: number; // 0..1 mean voice activity over the clip
  samples: Float32Array; // denoised mono at the source rate (for wave/rms)
}

let rnPromise: Promise<Rnnoise> | null = null;

function loadRnnoise(): Promise<Rnnoise> {
  if (!rnPromise) rnPromise = Rnnoise.load();
  return rnPromise;
}

/** High-quality resample via OfflineAudioContext (platform resampler). */
async function resample(x: Float32Array, fromHz: number, toHz: number): Promise<Float32Array> {
  if (Math.abs(fromHz - toHz) < 1) return x;
  const outLen = Math.max(1, Math.round((x.length * toHz) / fromHz));
  const ctx = new OfflineAudioContext(1, outLen, toHz);
  const buf = ctx.createBuffer(1, Math.max(1, x.length), fromHz);
  buf.getChannelData(0).set(x.subarray(0, Math.min(x.length, buf.length)));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

/** Encode mono float samples as a PCM16 little-endian WAV blob. */
export function encodeWavMono(samples: Float32Array, sampleRate: number): Blob {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const tag = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, n * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    let s = samples[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    v.setInt16(o, s * 32767, true);
    o += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Encode interleaved PCM16 WAV while preserving source channels. */
export function encodeWavChannels(channels: Float32Array[], sampleRate: number): Blob {
  if (!channels.length) throw new Error("No audio channels");
  const frames = channels[0].length;
  if (channels.some((channel) => channel.length !== frames)) throw new Error("Unequal audio channels");
  const count = channels.length;
  const bytes = frames * count * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const tag = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  tag(0, "RIFF"); view.setUint32(4, 36 + bytes, true); tag(8, "WAVE");
  tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, count, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true); view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (const channel of channels) {
    const value = Math.max(-1, Math.min(1, channel[i]));
    view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** ~128 normalized peak bins + RMS, same shape as importFiles' audio analysis. */
export function analyzeMono(samples: Float32Array): { wave: number[]; rms: number } {
  const bins = 128;
  const per = Math.max(1, Math.floor(samples.length / bins));
  const wave: number[] = [];
  let sq = 0;
  let n = 0;
  let peak = 0;
  for (let b = 0; b < bins; b++) {
    let p = 0;
    const s0 = b * per;
    for (let i = s0; i < Math.min(samples.length, s0 + per); i += 8) {
      const v = Math.abs(samples[i]);
      if (v > p) p = v;
      sq += samples[i] * samples[i];
      n++;
    }
    wave.push(p);
    if (p > peak) peak = p;
  }
  const norm = peak > 0 ? 1 / peak : 1;
  return { wave: wave.map((v) => v * norm), rms: Math.sqrt(sq / Math.max(1, n)) };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Denoise an audio blob with RNNoise. Yields to the event loop while working
 * (progress callback). Returns a PCM16 WAV plus stats.
 */
export async function denoiseAudio(
  blob: Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<DenoiseResult> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("WebAudio is not available");

  // 1) decode + downmix to mono (native rate)
  const ctx = new Ctor();
  let mono: Float32Array;
  let rate: number;
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    rate = buf.sampleRate;
    if (buf.numberOfChannels === 1) {
      mono = new Float32Array(buf.getChannelData(0));
    } else {
      mono = new Float32Array(buf.length);
      const g = 1 / buf.numberOfChannels;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) mono[i] += d[i] * g;
      }
    }
  } finally {
    void ctx.close();
  }
  if (mono.length < 480) throw new Error("Clip is too short to denoise");

  // 2) resample to 48 kHz for RNNoise
  const work = await resample(mono, rate, TARGET_RATE);
  onProgress?.(0, work.length);

  // 3) frame loop (480 samples @ 48 kHz = 10 ms)
  const rn = await loadRnnoise();
  const st = rn.createDenoiseState();
  const fs = rn.frameSize;
  let vadSum = 0;
  let vadN = 0;
  try {
    const frames = Math.ceil(work.length / fs);
    for (let f = 0; f < frames; f++) {
      const start = f * fs;
      const left = work.length - start;
      let vad: number;
      if (left >= fs) {
        vad = st.processFrame(work.subarray(start, start + fs)); // in place
      } else {
        const pad = new Float32Array(fs);
        pad.set(work.subarray(start));
        vad = st.processFrame(pad);
        work.set(pad.subarray(0, left), start);
      }
      vadSum += vad;
      vadN++;
      if ((f & 511) === 511) {
        onProgress?.(Math.min(start + fs, work.length), work.length);
        await tick();
      }
    }
  } finally {
    st.destroy();
  }

  // 4) back to the source rate, trimmed/padded to the original length
  const back = await resample(work, TARGET_RATE, rate);
  const out = new Float32Array(mono.length);
  out.set(back.subarray(0, Math.min(back.length, out.length)));
  onProgress?.(work.length, work.length);

  return {
    wav: encodeWavMono(out, rate),
    sampleRate: rate,
    duration: out.length / rate,
    speechProb: vadN ? vadSum / vadN : 0,
    samples: out,
  };
}
