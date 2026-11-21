// MayoCut — export planning and honest time estimates.
//
// Frame-stepped export is accurate but slower than real time by construction:
// every frame waits for the decoder, and only then is it encoded. That trade is
// worth making, but only if the user is told the cost BEFORE they start. A
// progress bar that silently takes four minutes is worse than a warning that
// says "about four minutes".
//
// This module is pure: it turns measured throughput plus the project's properties
// into a plan and an estimate. The measuring happens in the Engine; the deciding
// happens here, so it can be tested without a browser or a real video.

export interface ExportThroughput {
  /** frames produced per second of wall-clock, measured on this device */
  framesPerSecond: number;
  /** output width in pixels the measurement was taken at */
  width: number;
  /** output height in pixels the measurement was taken at */
  height: number;
  /** how long the measurement itself took, ms — tiny samples are untrustworthy */
  sampleMs: number;
}

export type ExportStrategy = "stepped" | "realtime";

export interface ExportPlan {
  strategy: ExportStrategy;
  durationSec: number;
  fps: number;
  totalFrames: number;
  width: number;
  height: number;
  /** estimated wall-clock seconds, or null when we cannot estimate honestly */
  estimatedSec: number | null;
  /** multiplier vs real time: 1 = real time, 3 = three times as long */
  slowFactor: number | null;
  /** one-line sentence for the UI */
  summary: string;
  /** true when the estimate is a guess rather than a measurement */
  heuristic: boolean;
}

/** Pixel cost scales roughly linearly with width×height. */
function pixelRatio(a: { width: number; height: number }, b: { width: number; height: number }) {
  const pa = Math.max(1, a.width * a.height);
  const pb = Math.max(1, b.width * b.height);
  return pa / pb;
}

/**
 * Estimate a frame-stepped export.
 *
 * `throughput` is a real measurement from this device; without one we fall back
 * to a documented heuristic so the UI can still say something useful instead of
 * pretending to know. The fallback is flagged (`heuristic: true`) so callers can
 * word it as "roughly" rather than a number the user might hold us to.
 */
export function planSteppedExport(
  opts: {
    durationSec: number;
    fps: number;
    width: number;
    height: number;
  },
  throughput: ExportThroughput | null,
): ExportPlan {
  const durationSec = Math.max(0, opts.durationSec);
  const fps = Math.max(1, Math.round(opts.fps));
  const totalFrames = Math.max(1, Math.round(durationSec * fps));

  const base = {
    durationSec,
    fps,
    totalFrames,
    width: opts.width,
    height: opts.height,
  };

  if (!throughput || throughput.framesPerSecond <= 0) {
    // ~12 fps at 1080p is a deliberately conservative middle guess: fast enough
    // to not alarm a desktop, slow enough not to promise a phone something it
    // cannot do. It is labelled as a guess.
    const assumed = 12;
    const ratio = pixelRatio({ width: 1920, height: 1080 }, opts);
    const fpsOut = assumed * Math.max(0.15, Math.min(4, ratio));
    const estimatedSec = totalFrames / Math.max(0.1, fpsOut);
    const slowFactor = durationSec > 0 ? estimatedSec / durationSec : null;
    return {
      ...base,
      strategy: slowFactor !== null && slowFactor > REALTIME_CUTOFF ? "realtime" : "stepped",
      estimatedSec,
      slowFactor,
      heuristic: true,
      summary: `Roughly ${fmtDuration(estimatedSec)} to render ${totalFrames} frames (${
        durationSec > 0 ? (estimatedSec / durationSec).toFixed(1) : "?"
      }× real time).`,
    };
  }

  // Scale the measured throughput to the requested output size.
  const ratio = pixelRatio(throughput, opts);
  const measuredFps = throughput.framesPerSecond * Math.max(0.15, Math.min(4, ratio));
  const estimatedSec = totalFrames / Math.max(0.1, measuredFps);
  const slowFactor = durationSec > 0 ? estimatedSec / durationSec : null;
  return {
    ...base,
    strategy: slowFactor !== null && slowFactor > REALTIME_CUTOFF ? "realtime" : "stepped",
    estimatedSec,
    slowFactor,
    heuristic: throughput.sampleMs < 400,
    summary: `About ${fmtDuration(estimatedSec)} to render ${totalFrames} frames (${
      durationSec > 0 ? (estimatedSec / durationSec).toFixed(1) : "?"
    }× real time, measured on this device).`,
  };
}

/**
 * Choose a strategy from the estimate.
 *
 * Below ~2× real time the stepped path is simply better: slightly slower but
 * frame-exact. Past ~6× the wait becomes hostile on a phone, so we prefer the
 * real-time recorder and accept its dropped frames. Between the two we still
 * choose accuracy, because an export that is wrong is worth less than one that
 * is slow.
 */
/** Past this many times real time the wait becomes hostile on a phone. */
export const REALTIME_CUTOFF = 6;

export function chooseStrategy(
  plan: ExportPlan,
  caps: { steppedAvailable: boolean; realtimeAvailable: boolean },
): ExportStrategy {
  if (!caps.steppedAvailable) return "realtime";
  if (!caps.realtimeAvailable) return "stepped";
  const factor = plan.slowFactor ?? 0;
  return factor > REALTIME_CUTOFF ? "realtime" : "stepped";
}

/** Turn a measurement into a throughput record, clamping nonsense. */
export function recordThroughput(
  frames: number,
  elapsedMs: number,
  size: { width: number; height: number },
): ExportThroughput | null {
  if (!Number.isFinite(frames) || !Number.isFinite(elapsedMs)) return null;
  if (frames <= 0 || elapsedMs <= 0) return null;
  return {
    framesPerSecond: frames / (elapsedMs / 1000),
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
    sampleMs: elapsedMs,
  };
}

/** "4 min 12 s" / "38 s" — short enough for a button, precise enough to trust. */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0 s";
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}
