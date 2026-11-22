// MayoCut — built-in stock assets.
//
// The library has to offer *pictures you can actually use* as well as your own
// imports: a green screen to key, a soft blurred backdrop for an overlay, a
// white blank to fade through, an animated light leak. Downloading those would
// break the offline promise and raise licensing questions, so they are
// generated on the device, deterministically, the first time they are used.
//
// Everything here is pure maths over a canvas: no network, no bundled binary,
// no licence. A generated asset behaves exactly like an imported file — it is
// stored in IndexedDB and picked up by the same media pipeline.

export type StockKind = "image" | "video";

export interface StockAsset {
  id: string;
  name: string;
  /** searchable tags, lower-case */
  tags: string[];
  kind: StockKind;
  /** canvas size to generate at */
  width: number;
  height: number;
  /** video assets only: how many frames to synthesise */
  frames?: number;
  fps?: number;
  /** what the asset is for, shown on the tile */
  hint: string;
  /** draw frame `t` (0..1) of the asset into the context */
  draw: (
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
  ) => void;
}

type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Deterministic 0..1 noise, so the same asset looks the same on every device. */
function hash(x: number, y: number, seed = 1): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function fill(ctx: Ctx2D, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function linearGradient(
  ctx: Ctx2D,
  w: number,
  h: number,
  stops: [number, string][],
  angle = 0,
): CanvasGradient {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  const g = ctx.createLinearGradient(
    w / 2 - (cx * w) / 2,
    h / 2 - (cy * h) / 2,
    w / 2 + (cx * w) / 2,
    h / 2 + (cy * h) / 2,
  );
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

export const STOCK_ASSETS: StockAsset[] = [
  {
    id: "green-screen",
    name: "Green screen",
    tags: ["green", "screen", "chroma", "key", "backdrop"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Flat chroma green — key it out under a video overlay",
    draw: (ctx, w, h) => fill(ctx, w, h, "#00b140"),
  },
  {
    id: "blue-screen",
    name: "Blue screen",
    tags: ["blue", "screen", "chroma", "key", "backdrop"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Flat chroma blue — the other keying colour",
    draw: (ctx, w, h) => fill(ctx, w, h, "#0047bb"),
  },
  {
    id: "white-blank",
    name: "White blank",
    tags: ["white", "blank", "flash", "transition", "fade"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Pure white — flash frames and fade-throughs",
    draw: (ctx, w, h) => fill(ctx, w, h, "#ffffff"),
  },
  {
    id: "black-blank",
    name: "Black blank",
    tags: ["black", "blank", "bars", "fade", "transition"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Pure black — dips, bars and spacing",
    draw: (ctx, w, h) => fill(ctx, w, h, "#000000"),
  },
  {
    id: "soft-blur",
    name: "Soft blur backdrop",
    tags: ["blur", "bokeh", "backdrop", "soft", "overlay"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Out-of-focus colour wash — a backdrop for text",
    draw: (ctx, w, h) => {
      ctx.fillStyle = linearGradient(
        ctx,
        w,
        h,
        [
          [0, "#1b1035"],
          [0.55, "#3a1e57"],
          [1, "#0d1b3a"],
        ],
        Math.PI / 3,
      );
      ctx.fillRect(0, 0, w, h);
      const blobs: [number, number, number, string][] = [
        [0.28, 0.22, 0.34, "rgba(129,192,190,0.55)"],
        [0.74, 0.35, 0.28, "rgba(249,168,65,0.42)"],
        [0.5, 0.72, 0.4, "rgba(124,58,237,0.45)"],
        [0.15, 0.85, 0.22, "rgba(14,165,233,0.4)"],
      ];
      for (const [bx, by, br, color] of blobs) {
        const g = ctx.createRadialGradient(bx * w, by * h, 0, bx * w, by * h, br * w);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    },
  },
  {
    id: "studio-gradient",
    name: "Studio gradient",
    tags: ["gradient", "studio", "backdrop", "clean", "overlay"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Clean dark gradient — product and talking-head backdrops",
    draw: (ctx, w, h) => {
      ctx.fillStyle = linearGradient(
        ctx,
        w,
        h,
        [
          [0, "#202020"],
          [1, "#010101"],
        ],
        Math.PI / 2,
      );
      ctx.fillRect(0, 0, w, h);
    },
  },
  {
    id: "paper",
    name: "Paper texture",
    tags: ["paper", "texture", "grain", "beige", "overlay"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Warm paper grain — overlaid at low opacity it ages footage",
    draw: (ctx, w, h) => {
      fill(ctx, w, h, "#efe7d8");
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const n = hash(x, y);
          if (n > 0.72) {
            ctx.fillStyle = `rgba(120,100,70,${(n - 0.72) * 0.5})`;
            ctx.fillRect(x, y, 3, 3);
          }
        }
      }
    },
  },
  {
    id: "light-leak",
    name: "Light leak",
    tags: ["light", "leak", "film", "flare", "overlay", "video"],
    kind: "video",
    width: 1080,
    height: 1920,
    frames: 90,
    fps: 30,
    hint: "Drifting warm flare — overlay at Screen blend for a film feel",
    draw: (ctx, w, h, t) => {
      fill(ctx, w, h, "#000000");
      const sweep = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
      const cx = w * (0.2 + sweep * 0.6);
      const cy = h * (0.3 + 0.25 * Math.sin(t * Math.PI * 4));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.85);
      g.addColorStop(0, "rgba(255,214,140,0.85)");
      g.addColorStop(0.35, "rgba(255,138,61,0.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },
  {
    id: "bokeh",
    name: "Bokeh drift",
    tags: ["bokeh", "lights", "drift", "overlay", "video", "sparkle"],
    kind: "video",
    width: 1080,
    height: 1920,
    frames: 90,
    fps: 30,
    hint: "Slow floating lights — Screen-blend it over a dark shot",
    draw: (ctx, w, h, t) => {
      fill(ctx, w, h, "#050505");
      for (let i = 0; i < 26; i++) {
        const phase = (t + hash(i, 1, 3)) % 1;
        const x = (hash(i, 2, 5) + Math.sin(t * 6 + i) * 0.03) * w;
        const y = (1 - phase) * h * 1.1 - h * 0.05;
        const r = (8 + hash(i, 3, 7) * 42) * (w / 1080);
        const a = 0.16 + hash(i, 4, 9) * 0.3;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,236,190,${a})`);
        g.addColorStop(1, "rgba(255,236,190,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
  },
  {
    id: "snow-drift",
    name: "Dust drift",
    tags: ["dust", "particles", "grain", "overlay", "video", "snow"],
    kind: "video",
    width: 1080,
    height: 1920,
    frames: 60,
    fps: 30,
    hint: "Floating specks — adds life to a still or a slow shot",
    draw: (ctx, w, h, t) => {
      fill(ctx, w, h, "#000000");
      for (let i = 0; i < 90; i++) {
        const sp = 0.4 + hash(i, 5, 2) * 0.8;
        const x = (hash(i, 6, 4) + Math.sin(t * 4 + i) * 0.02) * w;
        const y = ((hash(i, 7, 6) + t * sp) % 1) * h;
        const r = 0.8 + hash(i, 8, 8) * 2.4;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + hash(i, 9, 3) * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    id: "countdown",
    name: "Countdown",
    tags: ["countdown", "numbers", "intro", "leader", "video"],
    kind: "video",
    width: 1080,
    height: 1920,
    frames: 150,
    fps: 30,
    hint: "5-4-3-2-1 leader — a cut-in for intros",
    draw: (ctx, w, h, t) => {
      fill(ctx, w, h, "#0b0b0d");
      const n = Math.max(1, 5 - Math.floor(t * 5));
      const frac = (t * 5) % 1;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      const scaleFor = 1 - frac * 0.06;
      ctx.scale(scaleFor, scaleFor);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round(w * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    },
  },
];

export function stockById(id: string): StockAsset | undefined {
  return STOCK_ASSETS.find((a) => a.id === id);
}

/** Search stock assets by name or tag — used by the library's search box. */
export function searchStock(query: string): StockAsset[] {
  const q = query.trim().toLowerCase();
  if (!q) return STOCK_ASSETS;
  return STOCK_ASSETS.filter(
    (a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)),
  );
}

/** A small preview of the asset, as a data URL, for the library tile. */
export function stockThumb(asset: StockAsset, size = 96): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  const ratio = asset.height / asset.width;
  c.width = size;
  c.height = Math.max(8, Math.round(size * Math.min(1.6, ratio)));
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  try {
    asset.draw(ctx, c.width, c.height, 0.35);
    return c.toDataURL("image/png");
  } catch {
    // A thumbnail is decoration. If this device cannot rasterise one, the tile
    // shows its name instead — it must never take the editor down.
    return "";
  }
}

/** Render an image asset to a PNG blob, ready to store as media. */
export async function stockImageBlob(asset: StockAsset): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = asset.width;
  c.height = asset.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  asset.draw(ctx, asset.width, asset.height, 0.4);
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}

/**
 * Render a video asset to a WebM blob.
 *
 * Uses `MediaRecorder` on a canvas stream — the platform's encoder, the same
 * one the proxy builder uses. If the platform cannot record, this returns null
 * and the caller offers the image assets instead rather than pretending.
 */
export async function stockVideoBlob(
  asset: StockAsset,
  onProgress?: (p: number) => void,
): Promise<Blob | null> {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") return null;
  const frames = Math.max(1, asset.frames ?? 60);
  const fps = asset.fps ?? 30;
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  if (!mime) return null;
  const c = document.createElement("canvas");
  c.width = asset.width;
  c.height = asset.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  asset.draw(ctx, c.width, c.height, 0);
  const stream = c.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });
  rec.start(250);
  try {
    for (let f = 0; f < frames; f++) {
      asset.draw(ctx, c.width, c.height, f / frames);
      onProgress?.((f + 1) / frames);
      await new Promise((r) => setTimeout(r, Math.max(1, Math.round(1000 / fps))));
    }
  } finally {
    if (rec.state !== "inactive") rec.stop();
    stream.getTracks().forEach((t) => t.stop());
  }
  const blob = await done;
  return blob.size > 512 ? blob : null;
}

// ---------------------------------------------------------------------------
// Emoji tags
//
// The emoji sticker set is ordered by category, but the panel is a flat grid —
// so a search for "fire" could not find 🔥. Tagging them is what makes search
// actually useful, and it costs nothing: no emoji font, no download.
// ---------------------------------------------------------------------------

export const EMOJI_TAGS: Record<string, string> = {
  "🔥": "fire hot flame lit",
  "❤️": "heart love red",
  "😂": "laugh cry funny lol",
  "😮": "wow surprised shock",
  "👀": "eyes look watch",
  "👏": "clap applause hands",
  "💯": "hundred perfect points",
  "✨": "sparkle stars magic shine",
  "⚡": "lightning bolt energy fast",
  "🎉": "party confetti celebrate",
  "🚀": "rocket launch fast space",
  "💰": "money bag cash",
  "📈": "chart up growth graph",
  "🏆": "trophy win award",
  "🎯": "target goal bullseye",
  "🍿": "popcorn movie snack",
  "🥶": "cold freeze frozen ice",
  "😍": "love eyes hearts",
  "🤯": "mind blown explode",
  "👉": "point right hand",
  "👆": "point up hand",
  "✅": "check tick done yes",
  "❌": "cross no wrong x",
  "⭐": "star favourite",
  "🌊": "wave water ocean",
  "🌙": "moon night",
  "☀️": "sun day bright",
  "🎵": "music note sound",
  "🎬": "clapper film movie",
  "📱": "phone mobile app",
  "💬": "speech bubble chat",
  "🙌": "raise hands praise",
  "💪": "strong flex muscle",
  "🧠": "brain smart think",
  "👑": "crown king queen",
  "🍕": "pizza food eat",
  "🏖️": "beach holiday sand",
  "🎮": "game controller play",
  "🛹": "skateboard board",
  "📸": "camera photo shoot",
};

/** Emoji whose tags contain the query (case-insensitive). */
export function searchEmoji(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.keys(EMOJI_TAGS).filter((e) => EMOJI_TAGS[e].includes(q));
}
