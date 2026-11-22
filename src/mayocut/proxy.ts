// MayoCut — proxy media.
//
// A proxy is a smaller preview copy intended to improve scrubbing. The
// existing browser builder does not reliably preserve audio or timing, so
// both preview and export currently select the original, including when an
// older proxy exists. The policy helpers remain for a future tested encoder.

/** Why a source does or does not want a proxy. */
export interface ProxyDecision {
  wanted: boolean;
  /** output height cap for the proxy */
  targetHeight: number;
  reason: string;
}

/**
 * Should this media get a proxy?
 *
 * Proxies cost storage and CPU to build, so they are only worth it for large
 * footage. Below ~720p the original already decodes quickly and a proxy would be
 * pure overhead.
 */
export function shouldProxyVideo(
  meta: { width?: number; height?: number; duration?: number; size?: number; kind: string },
  opts: { enabled?: boolean; maxHeight?: number; minSourceHeight?: number } = {},
): ProxyDecision {
  const enabled = opts.enabled ?? true;
  const targetHeight = opts.maxHeight ?? 720;
  const minSource = opts.minSourceHeight ?? targetHeight + 1;
  if (!enabled) return { wanted: false, targetHeight, reason: "proxies disabled" };
  if (meta.kind !== "video") return { wanted: false, targetHeight, reason: "not a video" };
  const h = meta.height ?? 0;
  if (!h) {
    // Unknown dimensions: fall back to file size as the signal.
    const big = (meta.size ?? 0) > 80 * 1024 * 1024;
    return {
      wanted: big,
      targetHeight,
      reason: big ? "large file, dimensions unknown" : "small file, dimensions unknown",
    };
  }
  if (h <= minSource) {
    return { wanted: false, targetHeight, reason: `${h}p already decodes quickly` };
  }
  return { wanted: true, targetHeight, reason: `${h}p source → ${targetHeight}p proxy` };
}

/**
 * Output size for a proxy, preserving aspect and never upscaling.
 *
 * Even dimensions matter: H.264 encoders reject odd widths on some platforms.
 */
export function proxySize(
  width: number,
  height: number,
  targetHeight: number,
): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1280, height: targetHeight };
  }
  if (height <= targetHeight) return { width: even(width), height: even(height) };
  const k = targetHeight / height;
  return { width: even(width * k), height: even(targetHeight) };
}

/** Rough storage cost of a proxy at a given bitrate, for the UI. */
export function proxyBytes(durationSec: number, bitrateKbps: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.round((durationSec * Math.max(0, bitrateKbps) * 1000) / 8);
}

/**
 * Choose the media URL a given consumer should use.
 *
 * Both consumers use the original until the proxy encoder can preserve audio
 * and timing reliably. Old stored proxies must not silently replace the source.
 */
export function sourceFor(
  consumer: "preview" | "export",
  originalUrl: string,
  proxyUrl?: string,
): string {
  // Existing browser-generated proxies do not reliably preserve audio or
  // timing. Until those properties are verified, neither preview nor export
  // may use them, including proxies saved by earlier versions.
  void consumer;
  void proxyUrl;
  return originalUrl;
}
