// src/mayocut/types.ts
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// src/mayocut/assist.ts
var probeCtx = null;
function getProbeCtx() {
  if (!probeCtx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    probeCtx = new Ctor();
  }
  return probeCtx;
}
async function analyzeAudioBlob(blob, hop = 0.05) {
  const ctx = getProbeCtx();
  const arr = await blob.arrayBuffer();
  let audio;
  try {
    audio = await ctx.decodeAudioData(arr);
  } catch {
    throw new Error("This file's audio could not be decoded");
  }
  const data = audio.getChannelData(0);
  const sr = audio.sampleRate;
  const hopN = Math.max(1, Math.round(hop * sr));
  const bins = Math.max(1, Math.ceil(data.length / hopN));
  const peaks = new Float32Array(bins);
  let sqSum = 0;
  let n = 0;
  for (let b = 0; b < bins; b++) {
    let peak = 0;
    const start = b * hopN;
    const end = Math.min(data.length, start + hopN);
    for (let i = start; i < end; i += 4) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      sqSum += data[i] * data[i];
      n++;
    }
    peaks[b] = peak;
  }
  const norm = Math.max(1e-3, ...Array.from(peaks));
  for (let b = 0; b < bins; b++) peaks[b] /= norm;
  return { peaks, duration: audio.duration, rms: Math.sqrt(sqSum / Math.max(1, n)) };
}
function detectBeats(peaks, duration, count, minGap = 0.35) {
  const hop = duration / Math.max(1, peaks.length);
  const mean = Array.from(peaks).reduce((a, b) => a + b, 0) / Math.max(1, peaks.length);
  const candidates = [];
  for (let i = 2; i < peaks.length - 2; i++) {
    const v = peaks[i];
    if (v >= mean * 1.05 && v >= peaks[i - 1] && v >= peaks[i + 1] && v > peaks[i - 2] + 0.01 && v > peaks[i + 2] + 0.01) {
      candidates.push({ at: i * hop, score: v });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (c.at < 0.2 || c.at > duration - 0.2) continue;
    if (chosen.some((t) => Math.abs(t - c.at) < minGap)) continue;
    chosen.push(c.at);
  }
  chosen.sort((a, b) => a - b);
  return chosen;
}
function silenceEdges(peaks, duration, threshold = 0.06) {
  const hop = duration / Math.max(1, peaks.length);
  let lead = 0;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] > threshold) break;
    lead = (i + 1) * hop;
  }
  let trail = 0;
  for (let i = peaks.length - 1; i >= 0; i--) {
    if (peaks[i] > threshold) break;
    trail += hop;
  }
  return { lead: Math.min(lead, duration / 2), trail: Math.min(trail, duration / 2) };
}
function smartColor(canvas) {
  const s = 32;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  ctx.drawImage(canvas, 0, 0, s, s);
  const d = ctx.getImageData(0, 0, s, s).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let satSum = 0;
  const n = s * s;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    const mx = Math.max(d[i], d[i + 1], d[i + 2]);
    const mn = Math.min(d[i], d[i + 1], d[i + 2]);
    satSum += mx === 0 ? 0 : (mx - mn) / mx;
  }
  r /= n;
  g /= n;
  b /= n;
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const sat = satSum / n;
  const adjust = {};
  const reasons = [];
  let filter = "none";
  if (luma < 0.22) {
    adjust.brightness = 125;
    reasons.push("brightens a dark frame");
  } else if (luma > 0.78) {
    adjust.brightness = 88;
    adjust.contrast = 108;
    reasons.push("tames an overexposed frame");
  }
  if (sat < 0.1) {
    filter = "vivid";
    reasons.push("adds life to a flat, gray image");
  } else if (sat > 0.55) {
    adjust.saturation = 82;
    reasons.push("calms oversaturated colors");
  }
  const warmish = r > g + 12 && r > b + 12;
  if (!reasons.length && warmish) {
    filter = "cinema";
    reasons.push("settles a warm cast into a filmic look");
  } else if (!reasons.length) {
    filter = "cinema";
    reasons.push("adds gentle contrast for a filmic look");
  }
  if (adjust.brightness == null) adjust.brightness = 100;
  if (adjust.contrast == null) adjust.contrast = 100;
  if (adjust.saturation == null) adjust.saturation = 100;
  if (adjust.hue == null) adjust.hue = 0;
  return { filter, adjust, reason: reasons.join(", ") || "balanced look" };
}
var BUNDLED_PACKS = [
  {
    file: "social-starter.json",
    name: "Social Starter",
    desc: "Hooks, quote cards and a clean outro \u2014 text layouts that work on any phone.",
    swatch: "linear-gradient(135deg,#06b6d4 0%,#3b82f6 60%,#8b5cf6 100%)"
  },
  {
    file: "cinematic-looks.json",
    name: "Cinematic Looks",
    desc: "Grade + title treatments that turn raw clips into short films.",
    swatch: "linear-gradient(135deg,#f59e0b 0%,#dc2626 55%,#1e293b 100%)"
  },
  {
    file: "creator-kit.json",
    name: "Creator Kit",
    desc: "Karaoke captions, punch-zoom motion effects and a film voice-over treatment.",
    swatch: "linear-gradient(135deg,#f43f5e 0%,#8b5cf6 55%,#06b6d4 100%)"
  }
];
function packFileCandidates(file) {
  return [`/packs/${file}`, `./packs/${file}`];
}
async function loadBundledPack(file) {
  let lastErr = null;
  for (const url of packFileCandidates(file)) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return validatePack(await res.json());
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("This pack is not available on this device yet. " + String(lastErr));
}
function validatePack(raw) {
  const p = raw;
  if (!p || p.format !== "mayocut-pack" || !Array.isArray(p.templates) || p.templates.length === 0) {
    throw new Error('Not a valid MayoCut template pack (.json with format "mayocut-pack")');
  }
  if (p.version !== 1) {
    throw new Error(`Unsupported pack version ${String(p.version)} \u2014 this build reads version 1`);
  }
  for (const t of p.templates) {
    if (!t.id || !t.name || t.kind !== "project" && t.kind !== "enhance") {
      throw new Error(`Pack template "${t?.name ?? "?"}" is malformed`);
    }
    if (t.kind === "project" && !t.project) throw new Error(`Pack template "${t.name}" has no project data`);
    if (t.kind === "enhance" && !Array.isArray(t.enhance)) throw new Error(`Pack template "${t.name}" has no ops`);
  }
  return p;
}
function packToTemplates(pack) {
  return pack.templates.map((t) => ({
    id: t.id,
    name: t.name,
    desc: t.desc,
    aspect: t.aspect ?? "9:16",
    createdAt: Date.now(),
    kind: t.kind,
    packName: pack.name,
    swatch: t.swatch,
    project: t.project ? JSON.parse(JSON.stringify(t.project)) : void 0,
    enhance: t.enhance ? t.enhance : void 0
  }));
}
function applyEnhanceOps(source, ops, label) {
  const p = JSON.parse(JSON.stringify(source));
  p.id = uid("prj");
  p.name = `${label} \xB7 ${source.name}`;
  p.createdAt = Date.now();
  p.updatedAt = Date.now();
  p.sourceTemplate = label;
  for (const op of ops) {
    switch (op.op) {
      case "aspect":
        p.aspect = op.value;
        break;
      case "filter":
        for (const c of p.main) c.filter = op.value;
        break;
      case "adjust":
        for (const c of p.main) c.adjust = { ...c.adjust, ...op.value };
        break;
      case "transition":
        p.main.forEach((c, i) => {
          if (i === 0) return;
          c.transitionIn = op.value;
          c.transitionDur = op.dur;
        });
        break;
      case "speed":
        for (const c of p.main) c.speed = op.value;
        break;
      case "add-text": {
        const tr = p.tracks.find((t) => t.id === op.track) ?? p.tracks[0];
        tr.clips.push({ ...op.clip, id: uid("tc") });
        break;
      }
    }
  }
  const dur = (() => {
    let t = 0;
    for (const c of p.main) t += Math.max(0, (c.out - c.in) / c.speed);
    return t;
  })();
  if (dur > 0)
    for (const tr of p.tracks)
      for (const c of tr.clips) c.duration = Math.min(c.duration, Math.max(0.5, dur - c.start));
  return p;
}
function templateToPackFile(tpl) {
  return {
    format: "mayocut-pack",
    version: 1,
    name: `${tpl.name} (MayoCut template)`,
    desc: tpl.desc || "Shared MayoCut template",
    templates: [
      {
        id: tpl.id,
        name: tpl.name,
        desc: tpl.desc || "Shared MayoCut template",
        aspect: tpl.aspect,
        swatch: tpl.swatch,
        kind: tpl.kind === "enhance" ? "enhance" : "project",
        project: tpl.project ? JSON.parse(JSON.stringify(tpl.project)) : void 0,
        enhance: tpl.enhance
      }
    ]
  };
}
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4e3);
}
function wllamaWasmUrl() {
  const proto = window.location.protocol;
  if (proto === "file:" || proto === "capacitor:" || proto === "http-capacitor:") {
    return new URL("wllama/wllama.wasm", window.location.href).href;
  }
  return `${window.location.origin}/wllama/wllama.wasm`;
}
var LocalLLM = class {
  wllama = null;
  name = "";
  get ready() {
    return this.wllama !== null;
  }
  async load(files, onStatus) {
    onStatus?.("Loading local model (first load can take a minute)\u2026");
    let mod;
    try {
      mod = await import("@wllama/wllama");
    } catch {
      throw new Error("The on-device AI runtime is not bundled in this build");
    }
    const w = new mod.Wllama({ default: wllamaWasmUrl() });
    await w.loadModel(files, { n_ctx: 2048 });
    this.wllama = w;
    this.name = files[0]?.name ?? "local model";
    onStatus?.("Model ready \u2014 fully local");
  }
  async ask(prompt, onStatus) {
    if (!this.wllama) throw new Error("No local model loaded");
    onStatus?.("Thinking (on this device)\u2026");
    const w = this.wllama;
    const completion = await w.createChatCompletion({
      messages: [
        {
          role: "system",
          content: "You are the writing assistant inside MayoCut, an offline video editor. Be concise and practical. For lists, use one idea per line, no numbering, max 80 words total."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 320
    });
    return completion.choices?.[0]?.message?.content?.trim() || "(the model returned an empty answer)";
  }
  dispose() {
    this.wllama = null;
    this.name = "";
  }
};
function startMicRecording(onElapsed, onDone) {
  let stream = null;
  let rec = null;
  let timer = 0;
  let stopped = false;
  const chunks = [];
  const startTs = performance.now();
  function finish(err) {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try {
      rec?.stop();
    } catch {
    }
    stream?.getTracks().forEach((t) => t.stop());
    if (err) {
      onDone(null, err);
      return;
    }
    if (chunks.length === 0) {
      onDone(null, "No audio captured");
      return;
    }
    const file = new File(chunks, `recording-${Date.now().toString(36)}.webm`, {
      type: rec?.mimeType || "audio/webm"
    });
    onDone(file);
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
    if (stopped) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = s;
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    rec = new MediaRecorder(s, mime ? { mimeType: mime } : void 0);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.start(250);
    timer = window.setInterval(() => onElapsed(Math.floor((performance.now() - startTs) / 1e3)), 500);
  }).catch((e) => finish(e instanceof Error ? e.message : "Microphone unavailable"));
  if (!navigator.mediaDevices?.getUserMedia) finish("Microphone not available in this browser");
  return { stop: () => finish() };
}
function displayAnim(clip, base, localT) {
  if (!clip.keyframes || clip.keyframes.length === 0) return base;
  if (localT < clip.keyframes[0].at) return base;
  const last = clip.keyframes[clip.keyframes.length - 1];
  if (localT >= last.at) return last.v;
  for (let i = 0; i < clip.keyframes.length - 1; i++) {
    const a = clip.keyframes[i];
    const b = clip.keyframes[i + 1];
    if (localT >= a.at && localT < b.at) {
      const k = b.at > a.at ? (localT - a.at) / (b.at - a.at) : 1;
      return {
        x: a.v.x + (b.v.x - a.v.x) * k,
        y: a.v.y + (b.v.y - a.v.y) * k,
        scale: a.v.scale + (b.v.scale - a.v.scale) * k,
        rotation: a.v.rotation + (b.v.rotation - a.v.rotation) * k,
        opacity: a.v.opacity + (b.v.opacity - a.v.opacity) * k
      };
    }
  }
  return last.v;
}
function beatSegments(beats, duration) {
  const pts = [0, ...beats, duration].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i + 1] - pts[i] >= 0.3) segs.push({ in: pts[i], out: pts[i + 1] });
  }
  return segs.slice(0, 16);
}
function mediaLabel(m) {
  return m.name;
}
export {
  BUNDLED_PACKS,
  LocalLLM,
  analyzeAudioBlob,
  applyEnhanceOps,
  beatSegments,
  detectBeats,
  displayAnim,
  downloadJson,
  loadBundledPack,
  mediaLabel,
  packFileCandidates,
  packToTemplates,
  silenceEdges,
  smartColor,
  startMicRecording,
  templateToPackFile,
  validatePack
};
