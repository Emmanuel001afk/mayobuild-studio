// MayoCut — proxy media.
//
// A 4K phone clip decodes slowly. Scrubbing costs a full decode per seek, and a
// frame-stepped export pays that cost on every frame. A proxy is a smaller copy
// of the same footage used for PREVIEW only, so editing stays responsive while
// the original is still what gets exported.
//
// Rules that keep this honest:
//
//  1. The proxy never touches the export path. Exports always read the original
//     blob, so proxy quality can never leak into a delivered file.
//  2. The proxy is derived, and marked as such. If it is missing or fails to
//     build, preview falls back to the original and nothing else changes.
//  3. Proxy work happens off the interactive path (idle/queued), never blocking
//     an import.
//
// The pure policy lives here; the actual re-encode is done by the host (where a
// video encoder exists) so this file stays testable in node.

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
 * Preview gets the proxy when one exists; export ALWAYS gets the original. This
 * single function is the guarantee that proxy quality cannot reach a delivered
 * file — there is no other place that picks between them.
 */
export function sourceFor(
  consumer: "preview" | "export",
  originalUrl: string,
  proxyUrl?: string,
): string {
  if (consumer === "export") return originalUrl;
  return proxyUrl || originalUrl;
}
