// ------------------------------------------------------------- device profile
//
// Detects how much muscle this device has (CPU cores, RAM, GPU, platform) and
// turns it into:
//   1. a preview-resolution cap (stabilization — weak phones render 540p, not 1080p)
//   2. export limits (4K / 60 fps only where they are realistic)
//   3. feature gates for the heavy on-device engines (TTS, denoise, local AI,
//      captions). On a "low power" device those features STOP with a clear
//      reason instead of hanging the app; on capable devices everything runs.
//
// The scoring is a pure function (scoreDevice) so it is unit-tested in
// .diag/audit.mjs. Browser detection (detectDevice) only feeds it real numbers.

export type DeviceTier = "high" | "medium" | "low";

export interface FeatureGate {
  ok: boolean;
  reason?: string;
}

export type HeavyFeature = "tts" | "denoise" | "ai" | "captions";

export const HEAVY_FEATURES: { id: HeavyFeature; label: string }[] = [
  { id: "tts", label: "Text-to-speech voice" },
  { id: "denoise", label: "Audio denoise (RNNoise)" },
  { id: "ai", label: "Local AI writer (wllama)" },
  { id: "captions", label: "Auto captions (Whisper)" },
];

export interface DeviceLimits {
  /** Longest canvas buffer side allowed for the LIVE preview (0 = no cap). */
  previewMaxSide: number;
  /** 1 = 1080p-class export max, 2 = 4K allowed. */
  exportMaxScale: 1 | 2;
  maxExportFps: number;
  features: Record<HeavyFeature, FeatureGate>;
}

export interface DeviceProfile {
  tier: DeviceTier;
  score: number;
  cores: number;
  /** GB, or null when the browser does not expose it (Safari/Firefox). */
  memoryGB: number | null;
  /** Short GPU name, e.g. "Intel UHD 630", "SwiftShader (software)". */
  gpu: string;
  /** "android" | "ios" | "windows" | "macos" | "linux" | "web" */
  platform: string;
  /** true → multi-threaded WASM (AI) is available. */
  crossOriginIsolated: boolean;
  limits: DeviceLimits;
}

/** Everything scoreDevice needs — injected in tests, read from navigator live. */
export interface DeviceEnv {
  cores: number;
  memoryGB: number | null;
  /** 0 = none, 1 = WebGL1, 2 = WebGL2 */
  webgl: 0 | 1 | 2;
  crossOriginIsolated: boolean;
  platform: string;
  /** Raw GL_RENDERER string (already short) — informational only. */
  gpu: string;
}

// ------------------------------------------------------------------- scoring

const LOW = "This device is running the low-power profile — not enough CPU/RAM for this engine.";

function featureGates(tier: DeviceTier): Record<HeavyFeature, FeatureGate> {
  if (tier === "low") {
    return {
      tts: { ok: false, reason: LOW },
      denoise: { ok: false, reason: LOW },
      ai: { ok: false, reason: LOW },
      captions: { ok: false, reason: LOW },
    };
  }
  const note =
    tier === "medium"
      ? "ok (this device is on the balanced profile — first run may be a little slow)"
      : "ready";
  return {
    tts: { ok: true, reason: note },
    denoise: { ok: true, reason: note },
    ai: { ok: true, reason: note },
    captions: { ok: true, reason: note },
  };
}

/** Pure tier scoring — the heart of the capability gate (unit-tested). */
export function scoreDevice(env: DeviceEnv): DeviceProfile {
  let score = 0;
  const c = Math.max(0, env.cores | 0);
  score += c >= 8 ? 3 : c >= 6 ? 2.5 : c >= 4 ? 1.5 : c >= 2 ? 0.75 : 0.2;

  const m = env.memoryGB;
  score += m === null ? 1.5 : m >= 16 ? 3 : m >= 8 ? 2.5 : m >= 4 ? 1.5 : m >= 2 ? 0.75 : 0.3;

  score += env.webgl === 2 ? 1 : env.webgl === 1 ? 0.5 : 0;

  if (env.platform === "windows" || env.platform === "macos" || env.platform === "linux") score += 0.5;
  if (env.crossOriginIsolated) score += 0.5;

  const tier: DeviceTier = score >= 6 ? "high" : score >= 3.5 ? "medium" : "low";

  const limits: DeviceLimits =
    tier === "high"
      ? { previewMaxSide: 1920, exportMaxScale: 2, maxExportFps: 60, features: featureGates(tier) }
      : tier === "medium"
        ? { previewMaxSide: 1280, exportMaxScale: 2, maxExportFps: 30, features: featureGates(tier) }
        : { previewMaxSide: 960, exportMaxScale: 1, maxExportFps: 30, features: featureGates(tier) };

  return {
    tier,
    score: Math.round(score * 10) / 10,
    cores: c,
    memoryGB: m,
    gpu: env.gpu,
    platform: env.platform,
    crossOriginIsolated: env.crossOriginIsolated,
    limits,
  };
}

/**
 * Preview buffer scale factor for a profile: 1 = native, <1 = capped.
 * e.g. 9:16 native 1080×1920 with previewMaxSide 1280 → 0.667 (720×1280).
 */
export function previewCapFor(p: DeviceProfile, aspectW: number, aspectH: number): number {
  const maxSide = Math.max(aspectW, aspectH);
  if (maxSide <= 0) return 1;
  const cap = p.limits.previewMaxSide / maxSide;
  return Math.round(Math.min(1, cap) * 1000) / 1000;
}

// ------------------------------------------------- manual off-switches (prefs)

/**
 * Explicit user choices, persisted per device (localStorage).
 * `false` = the user switched the feature off. Absent/`true` = follow the device.
 */
export type FeaturePrefs = Partial<Record<HeavyFeature, boolean>>;

const PREFS_KEY = "mayocut.deviceprefs.v1";

function readPrefs(): FeaturePrefs {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FeaturePrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getFeaturePrefs(): FeaturePrefs {
  return readPrefs();
}

export function setFeaturePref(f: HeavyFeature, on: boolean): FeaturePrefs {
  const prefs = readPrefs();
  if (on) delete prefs[f]; // back to "follow the device"
  else prefs[f] = false;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode — prefs just won't persist */
  }
  return prefs;
}

/**
 * Pure gate check: device profile × user prefs.
 * Low tier is a HARD stop (no forcing on) — that is the stabilization contract.
 */
export function gateFor(p: DeviceProfile, f: HeavyFeature, prefs: FeaturePrefs): FeatureGate {
  const deviceGate = p.limits.features[f];
  if (!deviceGate.ok) return deviceGate;
  if (prefs[f] === false) return { ok: false, reason: "You switched this off in Assist → Local tools." };
  return deviceGate;
}

// ------------------------------------------------------------ browser detect

let memo: DeviceProfile | null = null;

function shortGpu(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "unknown";
  // "ANGLE (Vendor GPU, Driver, …)" → "Vendor GPU"
  const m = s.match(/^ANGLE \(([^),]+)/);
  if (m) s = m[1];
  // trim trailing detail (driver version, "Direct3D11 …", "OpenGL ES …")
  const comma = s.indexOf(",");
  if (comma > 0) s = s.slice(0, comma);
  s = s
    .replace(/\(TM\)|\(R\)|\(C\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/swiftshader|software/i.test(s)) return "Software (SwiftShader)";
  if (!s) return "unknown";
  if (s.length > 40) s = s.slice(0, 37) + "…";
  return s;
}

function probeWebGL(): { webgl: 0 | 1 | 2; gpu: string } {
  try {
    if (typeof document === "undefined") return { webgl: 0, gpu: "no canvas" };
    const c = document.createElement("canvas");
    const gl2 = c.getContext("webgl2") as WebGL2RenderingContext | null;
    const gl1 = gl2 ?? (c.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl1) return { webgl: 0, gpu: "WebGL unavailable" };
    let renderer = "";
    try {
      const gl = gl1 as WebGL2RenderingContext & {
        getExtension: (n: string) => { UNMASKED_RENDERER_WEBGL: number } | null;
        getParameter: (p: number) => unknown;
        RENDERER: number;
      };
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

function detectPlatform(ua: string): DeviceEnv["platform"] {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return "web";
}

/** Live detection (browser only). Memoized — the profile does not change at runtime. */
export function detectDevice(): DeviceProfile {
  if (memo) return memo;
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  const gl = probeWebGL();
  let memoryGB: number | null = null;
  try {
    const dm = (nav as unknown as { deviceMemory?: number })?.deviceMemory;
    if (typeof dm === "number") memoryGB = dm;
  } catch {
    memoryGB = null;
  }
  memo = scoreDevice({
    cores: Math.max(1, nav?.hardwareConcurrency || 2),
    memoryGB,
    webgl: gl.webgl,
    crossOriginIsolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
    platform: detectPlatform(nav?.userAgent ?? ""),
    gpu: gl.gpu,
  });
  return memo;
}

/** Singleton accessor for UI code (falls back to a safe low profile outside a browser). */
export function device(): DeviceProfile {
  if (memo) return memo;
  const hasBrowser = typeof navigator !== "undefined" && typeof document !== "undefined";
  if (!hasBrowser) {
    memo = scoreDevice({
      cores: 4,
      memoryGB: null,
      webgl: 0,
      crossOriginIsolated: false,
      platform: "web",
      gpu: "n/a",
    });
    return memo;
  }
  return detectDevice();
}

/** Convenience used by components: gate for a feature, live. */
export function can(f: HeavyFeature): FeatureGate {
  return gateFor(device(), f, readPrefs());
}

/** Test/dev hook. */
export function resetDeviceProfile(): void {
  memo = null;
}
