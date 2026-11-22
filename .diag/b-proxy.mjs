// src/mayocut/proxy.ts
function shouldProxyVideo(meta, opts = {}) {
  const enabled = opts.enabled ?? true;
  const targetHeight = opts.maxHeight ?? 720;
  const minSource = opts.minSourceHeight ?? targetHeight + 1;
  if (!enabled) return { wanted: false, targetHeight, reason: "proxies disabled" };
  if (meta.kind !== "video") return { wanted: false, targetHeight, reason: "not a video" };
  const h = meta.height ?? 0;
  if (!h) {
    const big = (meta.size ?? 0) > 80 * 1024 * 1024;
    return {
      wanted: big,
      targetHeight,
      reason: big ? "large file, dimensions unknown" : "small file, dimensions unknown"
    };
  }
  if (h <= minSource) {
    return { wanted: false, targetHeight, reason: `${h}p already decodes quickly` };
  }
  return { wanted: true, targetHeight, reason: `${h}p source \u2192 ${targetHeight}p proxy` };
}
function proxySize(width, height, targetHeight) {
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1280, height: targetHeight };
  }
  if (height <= targetHeight) return { width: even(width), height: even(height) };
  const k = targetHeight / height;
  return { width: even(width * k), height: even(targetHeight) };
}
function proxyBytes(durationSec, bitrateKbps) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.round(durationSec * Math.max(0, bitrateKbps) * 1e3 / 8);
}
function sourceFor(consumer, originalUrl, proxyUrl) {
  void consumer;
  void proxyUrl;
  return originalUrl;
}
export {
  proxyBytes,
  proxySize,
  shouldProxyVideo,
  sourceFor
};
