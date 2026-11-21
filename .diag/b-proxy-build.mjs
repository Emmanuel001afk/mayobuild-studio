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

// src/mayocut/proxy-build.ts
function canBuildProxy() {
  if (typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  if (typeof HTMLVideoElement === "undefined") return false;
  const el = document.createElement("canvas");
  if (!el || typeof el.captureStream !== "function") return false;
  return MediaRecorder.isTypeSupported("video/webm;codecs=vp9") || MediaRecorder.isTypeSupported("video/webm;codecs=vp8");
}
function pickProxyMime() {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return void 0;
}
async function buildProxy(blob, meta, opts = {}) {
  const decision = shouldProxyVideo(meta, opts.maxHeight ? { maxHeight: opts.maxHeight } : {});
  if (!decision.wanted) return null;
  if (!canBuildProxy()) return null;
  const mime = pickProxyMime();
  if (!mime) return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const cleanup = () => URL.revokeObjectURL(url);
  try {
    await new Promise((resolve, reject) => {
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
    const bitrate = opts.bitrate ?? Math.round(Math.min(25e5, size.width * size.height * fps * 0.08));
    const stream = canvas.captureStream(fps);
    const capture = video.captureStream;
    if (typeof capture === "function") {
      try {
        const src = capture.call(video);
        for (const track of src.getAudioTracks()) stream.addTrack(track);
      } catch {
      }
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const done = new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });
    const drawFrame = () => {
      ctx.drawImage(video, 0, 0, size.width, size.height);
    };
    rec.start(1e3);
    video.currentTime = 0;
    await new Promise((resolve) => {
      video.onseeked = () => resolve();
      if (video.readyState >= 2) window.setTimeout(resolve, 0);
    });
    const total = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const step = 1 / fps;
    const frameDur = 1e3 / fps;
    let t = 0;
    while (total > 0 && t < total) {
      if (opts.signal?.aborted) break;
      await new Promise((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = Math.min(t, Math.max(0, total - 1e-3));
      });
      drawFrame();
      opts.onProgress?.(Math.min(1, t / total));
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
    }
    cleanup();
  }
}
export {
  buildProxy,
  canBuildProxy
};
