// src/mayocut/export-plan.ts
function pixelRatio(a, b) {
  const pa = Math.max(1, a.width * a.height);
  const pb = Math.max(1, b.width * b.height);
  return pa / pb;
}
function planSteppedExport(opts, throughput) {
  const durationSec = Math.max(0, opts.durationSec);
  const fps = Math.max(1, Math.round(opts.fps));
  const totalFrames = Math.max(1, Math.round(durationSec * fps));
  const base = {
    durationSec,
    fps,
    totalFrames,
    width: opts.width,
    height: opts.height
  };
  if (!throughput || throughput.framesPerSecond <= 0) {
    const assumed = 12;
    const ratio2 = pixelRatio({ width: 1920, height: 1080 }, opts);
    const fpsOut = assumed * Math.max(0.15, Math.min(4, ratio2));
    const estimatedSec2 = totalFrames / Math.max(0.1, fpsOut);
    const slowFactor2 = durationSec > 0 ? estimatedSec2 / durationSec : null;
    return {
      ...base,
      strategy: slowFactor2 !== null && slowFactor2 > REALTIME_CUTOFF ? "realtime" : "stepped",
      estimatedSec: estimatedSec2,
      slowFactor: slowFactor2,
      heuristic: true,
      summary: `Roughly ${fmtDuration(estimatedSec2)} to render ${totalFrames} frames (${durationSec > 0 ? (estimatedSec2 / durationSec).toFixed(1) : "?"}\xD7 real time).`
    };
  }
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
    summary: `About ${fmtDuration(estimatedSec)} to render ${totalFrames} frames (${durationSec > 0 ? (estimatedSec / durationSec).toFixed(1) : "?"}\xD7 real time, measured on this device).`
  };
}
var REALTIME_CUTOFF = 6;
function chooseStrategy(plan, caps) {
  if (!caps.steppedAvailable) return "realtime";
  if (!caps.realtimeAvailable) return "stepped";
  const factor = plan.slowFactor ?? 0;
  return factor > REALTIME_CUTOFF ? "realtime" : "stepped";
}
function recordThroughput(frames, elapsedMs, size) {
  if (!Number.isFinite(frames) || !Number.isFinite(elapsedMs)) return null;
  if (frames <= 0 || elapsedMs <= 0) return null;
  return {
    framesPerSecond: frames / (elapsedMs / 1e3),
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
    sampleMs: elapsedMs
  };
}
function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "0 s";
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}
export {
  REALTIME_CUTOFF,
  chooseStrategy,
  fmtDuration,
  planSteppedExport,
  recordThroughput
};
