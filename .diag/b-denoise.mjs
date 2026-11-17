// src/mayocut/denoise.ts
import { Rnnoise } from "@shiguredo/rnnoise-wasm";
var TARGET_RATE = 48e3;
var rnPromise = null;
function loadRnnoise() {
  if (!rnPromise) rnPromise = Rnnoise.load();
  return rnPromise;
}
async function resample(x, fromHz, toHz) {
  if (Math.abs(fromHz - toHz) < 1) return x;
  const outLen = Math.max(1, Math.round(x.length * toHz / fromHz));
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
function encodeWavMono(samples, sampleRate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const tag = (o2, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o2 + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
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
function analyzeMono(samples) {
  const bins = 128;
  const per = Math.max(1, Math.floor(samples.length / bins));
  const wave = [];
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
var tick = () => new Promise((r) => setTimeout(r, 0));
async function denoiseAudio(blob, onProgress) {
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) throw new Error("WebAudio is not available");
  const ctx = new Ctor();
  let mono;
  let rate;
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
  const work = await resample(mono, rate, TARGET_RATE);
  onProgress?.(0, work.length);
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
      let vad;
      if (left >= fs) {
        vad = st.processFrame(work.subarray(start, start + fs));
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
  const back = await resample(work, TARGET_RATE, rate);
  const out = new Float32Array(mono.length);
  out.set(back.subarray(0, Math.min(back.length, out.length)));
  onProgress?.(work.length, work.length);
  return {
    wav: encodeWavMono(out, rate),
    sampleRate: rate,
    duration: out.length / rate,
    speechProb: vadN ? vadSum / vadN : 0,
    samples: out
  };
}
export {
  analyzeMono,
  denoiseAudio,
  encodeWavMono
};
