// MayoCut — proxy generation.
//
// The policy in proxy.ts decides IF a proxy is worth building. This file does
// the building, using only what the platform already ships: a detached <video>
// decodes the original, a canvas downscales each frame, and MediaRecorder
// re-encodes. No codec is written here and no library is bundled.
//
// Failure is always soft. A proxy that cannot be built (no MediaRecorder, no
// VP8/VP9, decoder chokes) leaves the original file as the only source, which
// is exactly the state the app was in before proxies existed.
import { shouldProxyVideo, proxySize, type ProxyDecision } from "./proxy";

export interface BuildOptions {
  /** hard cap on proxy height; defaults to the policy value */
  maxHeight?: number;
  /** frames per second to sample while transcoding */
  fps?: number;
  /** overall bitrate budget for the proxy, bits/second */
  bitrate?: number;
  signal?: { aborted: boolean };
  onProgress?: (fraction: number) => void;
}

/** Can this browser/device build a proxy at all? */
export function canBuildProxy(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  if (typeof HTMLVideoElement === "undefined") return false;
  const el = document.createElement("canvas");
  if (!el || typeof el.captureStream !== "function") return false;
  return (
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ||
    MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
  );
}

/** Pick a recorder mime type, preferring VP9 and falling back to VP8. */
function pickProxyMime(): string | undefined {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

/**
 * Build a downscaled preview copy of `blob`.
 *
 * Returns `null` — never throws — when a proxy is not wanted or cannot be made.
 * The caller then simply uses the original, so this function can be called
 * optimistically from an idle callback.
 */
export async function buildProxy(
  blob: Blob,
  meta: { width?: number; height?: number; duration?: number; size?: number; kind: string },
  opts: BuildOptions = {},
): Promise<{ blob: Blob; decision: ProxyDecision; width: number; height: number } | null> {
  const decision = shouldProxyVideo(meta, opts.maxHeight ? { maxHeight: opts.maxHeight } : {});
  if (!decision.wanted) return null;
  if (!canBuildProxy()) return null;
  const mime = pickProxyMime();
  if (!mime) return null;

  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true; // audio is re-attached separately, never through speakers
  video.playsInline = true;
  video.preload = "auto";

  const cleanup = () => URL.revokeObjectURL(url);

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("decoder rejected the source"));
      video.load();
    });
    const srcW = video.videoWidth || meta.width || 0;
    const srcH = video.videoHeight || meta.height || 0;
    if (!srcW || !srcH) return null;

    const size = proxySize(srcW, srcH, decision.targetHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const fps = Math.max(1, Math.min(60, opts.fps ?? 30));
    // Scale the budget with the frame area so a proxy stays small enough to
    // decode quickly on a phone.
    const bitrate =
      opts.bitrate ?? Math.round(Math.min(2_500_000, size.width * size.height * fps * 0.08));

    const stream = canvas.captureStream(fps);
    // Carry audio across when the browser exposes it; a silent proxy is still
    // useful for scrubbing but loses waveform-free playback.
    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream })
      .captureStream;
    if (typeof capture === "function") {
      try {
        const src = capture.call(video);
        for (const track of src.getAudioTracks()) stream.addTrack(track);
      } catch {
        /* audio capture is optional */
      }
    }

    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, size.width, size.height);
    };

    rec.start(1000);
    video.currentTime = 0;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      // some engines fire seeked before the listener lands
      if (video.readyState >= 2) window.setTimeout(resolve, 0);
    });

    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const step = 1 / fps;
    const frameDur = 1000 / fps;
    let t = 0;
    while (total > 0 && t < total) {
      if (opts.signal?.aborted) break;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = Math.min(t, Math.max(0, total - 0.001));
      });
      drawFrame();
      opts.onProgress?.(Math.min(1, t / total));
      // let the recorder pick up the frame before the next seek
      await new Promise((r) => window.setTimeout(r, frameDur));
      t += step;
    }
    if (rec.state !== "inactive") rec.stop();
    const out = await done;
    opts.onProgress?.(1);
    if (out.size < 1024) return null;
    return { blob: out, decision, width: size.width, height: size.height };
  } catch {
    return null;
  } finally {
    video.pause();
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      /* nothing to unload */
    }
    cleanup();
  }
}
