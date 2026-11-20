// src/mayocut/device.ts
var HEAVY_FEATURES = [
  { id: "tts", label: "Text-to-speech voice" },
  { id: "denoise", label: "Audio denoise (RNNoise)" },
  { id: "ai", label: "Local AI writer (wllama)" },
  { id: "captions", label: "Auto captions (Whisper)" }
];
var LOW = "This device is running the low-power profile \u2014 not enough CPU/RAM for this engine.";
function featureGates(tier) {
  if (tier === "low") {
    return {
      tts: { ok: false, reason: LOW },
      denoise: { ok: false, reason: LOW },
      ai: { ok: false, reason: LOW },
      captions: { ok: false, reason: LOW }
    };
  }
  const note = tier === "medium" ? "ok (this device is on the balanced profile \u2014 first run may be a little slow)" : "ready";
  return {
    tts: { ok: true, reason: note },
    denoise: { ok: true, reason: note },
    ai: { ok: true, reason: note },
    captions: { ok: true, reason: note }
  };
}
function scoreDevice(env) {
  let score = 0;
  const c = Math.max(0, env.cores | 0);
  score += c >= 8 ? 3 : c >= 6 ? 2.5 : c >= 4 ? 1.5 : c >= 2 ? 0.75 : 0.2;
  const m = env.memoryGB;
  score += m === null ? 1.5 : m >= 16 ? 3 : m >= 8 ? 2.5 : m >= 4 ? 1.5 : m >= 2 ? 0.75 : 0.3;
  score += env.webgl === 2 ? 1 : env.webgl === 1 ? 0.5 : 0;
  if (env.platform === "windows" || env.platform === "macos" || env.platform === "linux")
    score += 0.5;
  if (env.crossOriginIsolated) score += 0.5;
  const tier = score >= 6 ? "high" : score >= 3.5 ? "medium" : "low";
  const limits = tier === "high" ? { previewMaxSide: 1920, exportMaxScale: 2, maxExportFps: 60, features: featureGates(tier) } : tier === "medium" ? {
    previewMaxSide: 1280,
    exportMaxScale: 2,
    maxExportFps: 30,
    features: featureGates(tier)
  } : {
    previewMaxSide: 960,
    exportMaxScale: 1,
    maxExportFps: 30,
    features: featureGates(tier)
  };
  return {
    tier,
    score: Math.round(score * 10) / 10,
    cores: c,
    memoryGB: m,
    gpu: env.gpu,
    platform: env.platform,
    crossOriginIsolated: env.crossOriginIsolated,
    limits
  };
}
function previewCapFor(p, aspectW, aspectH) {
  const maxSide = Math.max(aspectW, aspectH);
  if (maxSide <= 0) return 1;
  const cap = p.limits.previewMaxSide / maxSide;
  return Math.round(Math.min(1, cap) * 1e3) / 1e3;
}
var PREFS_KEY = "mayocut.deviceprefs.v1";
function readPrefs() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function getFeaturePrefs() {
  return readPrefs();
}
function setFeaturePref(f, on) {
  const prefs = readPrefs();
  if (on)
    delete prefs[f];
  else prefs[f] = false;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
  }
  return prefs;
}
function gateFor(p, f, prefs) {
  const deviceGate = p.limits.features[f];
  if (!deviceGate.ok) return deviceGate;
  if (prefs[f] === false)
    return { ok: false, reason: "You switched this off in Assist \u2192 Local tools." };
  return deviceGate;
}
var memo = null;
function shortGpu(raw) {
  let s = (raw || "").trim();
  if (!s) return "unknown";
  const m = s.match(/^ANGLE \(([^),]+)/);
  if (m) s = m[1];
  const comma = s.indexOf(",");
  if (comma > 0) s = s.slice(0, comma);
  s = s.replace(/\(TM\)|\(R\)|\(C\)/g, "").replace(/\s+/g, " ").trim();
  if (/swiftshader|software/i.test(s)) return "Software (SwiftShader)";
  if (!s) return "unknown";
  if (s.length > 40) s = s.slice(0, 37) + "\u2026";
  return s;
}
function probeWebGL() {
  try {
    if (typeof document === "undefined") return { webgl: 0, gpu: "no canvas" };
    const c = document.createElement("canvas");
    const gl2 = c.getContext("webgl2");
    const gl1 = gl2 ?? c.getContext("webgl");
    if (!gl1) return { webgl: 0, gpu: "WebGL unavailable" };
    let renderer = "";
    try {
      const gl = gl1;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      else renderer = String(gl.getParameter(gl.RENDERER));
    } catch {
      renderer = "";
    }
    return { webgl: gl2 ? 2 : 1, gpu: shortGpu(renderer) };
  } catch {
    return { webgl: 0, gpu: "WebGL probe failed" };
  }
}
function detectPlatform(ua) {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return "web";
}
function detectDevice() {
  if (memo) return memo;
  const nav = globalThis.navigator;
  const gl = probeWebGL();
  let memoryGB = null;
  try {
    const dm = nav?.deviceMemory;
    if (typeof dm === "number") memoryGB = dm;
  } catch {
    memoryGB = null;
  }
  memo = scoreDevice({
    cores: Math.max(1, nav?.hardwareConcurrency || 2),
    memoryGB,
    webgl: gl.webgl,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    platform: detectPlatform(nav?.userAgent ?? ""),
    gpu: gl.gpu
  });
  return memo;
}
function device() {
  if (memo) return memo;
  const hasBrowser = typeof navigator !== "undefined" && typeof document !== "undefined";
  if (!hasBrowser) {
    memo = scoreDevice({
      cores: 4,
      memoryGB: null,
      webgl: 0,
      crossOriginIsolated: false,
      platform: "web",
      gpu: "n/a"
    });
    return memo;
  }
  return detectDevice();
}
function can(f) {
  return gateFor(device(), f, readPrefs());
}
function resetDeviceProfile() {
  memo = null;
}
export {
  HEAVY_FEATURES,
  can,
  detectDevice,
  device,
  gateFor,
  getFeaturePrefs,
  previewCapFor,
  resetDeviceProfile,
  scoreDevice,
  setFeaturePref
};
