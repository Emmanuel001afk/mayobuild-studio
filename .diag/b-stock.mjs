// src/mayocut/stock.ts
function hash(x, y, seed = 1) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function fill(ctx, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}
function linearGradient(ctx, w, h, stops, angle = 0) {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  const g = ctx.createLinearGradient(
    w / 2 - cx * w / 2,
    h / 2 - cy * h / 2,
    w / 2 + cx * w / 2,
    h / 2 + cy * h / 2
  );
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}
var STOCK_ASSETS = [
  {
    id: "green-screen",
    name: "Green screen",
    tags: ["green", "screen", "chroma", "key", "backdrop"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Flat chroma green \u2014 key it out under a video overlay",
    draw: (ctx, w, h) => fill(ctx, w, h, "#00b140")
  },
  {
    id: "blue-screen",
    name: "Blue screen",
    tags: ["blue", "screen", "chroma", "key", "backdrop"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Flat chroma blue \u2014 the other keying colour",
    draw: (ctx, w, h) => fill(ctx, w, h, "#0047bb")
  },
  {
    id: "white-blank",
    name: "White blank",
    tags: ["white", "blank", "flash", "transition", "fade"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Pure white \u2014 flash frames and fade-throughs",
    draw: (ctx, w, h) => fill(ctx, w, h, "#ffffff")
  },
  {
    id: "black-blank",
    name: "Black blank",
    tags: ["black", "blank", "bars", "fade", "transition"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Pure black \u2014 dips, bars and spacing",
    draw: (ctx, w, h) => fill(ctx, w, h, "#000000")
  },
  {
    id: "soft-blur",
    name: "Soft blur backdrop",
    tags: ["blur", "bokeh", "backdrop", "soft", "overlay"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Out-of-focus colour wash \u2014 a backdrop for text",
    draw: (ctx, w, h) => {
      ctx.fillStyle = linearGradient(
        ctx,
        w,
        h,
        [
          [0, "#1b1035"],
          [0.55, "#3a1e57"],
          [1, "#0d1b3a"]
        ],
        Math.PI / 3
      );
      ctx.fillRect(0, 0, w, h);
      const blobs = [
        [0.28, 0.22, 0.34, "rgba(129,192,190,0.55)"],
        [0.74, 0.35, 0.28, "rgba(249,168,65,0.42)"],
        [0.5, 0.72, 0.4, "rgba(124,58,237,0.45)"],
        [0.15, 0.85, 0.22, "rgba(14,165,233,0.4)"]
      ];
      for (const [bx, by, br, color] of blobs) {
        const g = ctx.createRadialGradient(bx * w, by * h, 0, bx * w, by * h, br * w);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    }
  },
  {
    id: "studio-gradient",
    name: "Studio gradient",
    tags: ["gradient", "studio", "backdrop", "clean", "overlay"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Clean dark gradient \u2014 product and talking-head backdrops",
    draw: (ctx, w, h) => {
      ctx.fillStyle = linearGradient(
        ctx,
        w,
        h,
        [
          [0, "#202020"],
          [1, "#010101"]
        ],
        Math.PI / 2
      );
      ctx.fillRect(0, 0, w, h);
    }
  },
  {
    id: "paper",
    name: "Paper texture",
    tags: ["paper", "texture", "grain", "beige", "overlay"],
    kind: "image",
    width: 1080,
    height: 1920,
    hint: "Warm paper grain \u2014 overlaid at low opacity it ages footage",
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
    }
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
    hint: "Drifting warm flare \u2014 overlay at Screen blend for a film feel",
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
    }
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
    hint: "Slow floating lights \u2014 Screen-blend it over a dark shot",
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
    }
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
    hint: "Floating specks \u2014 adds life to a still or a slow shot",
    draw: (ctx, w, h, t) => {
      fill(ctx, w, h, "#000000");
      for (let i = 0; i < 90; i++) {
        const sp = 0.4 + hash(i, 5, 2) * 0.8;
        const x = (hash(i, 6, 4) + Math.sin(t * 4 + i) * 0.02) * w;
        const y = (hash(i, 7, 6) + t * sp) % 1 * h;
        const r = 0.8 + hash(i, 8, 8) * 2.4;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + hash(i, 9, 3) * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
    hint: "5-4-3-2-1 leader \u2014 a cut-in for intros",
    draw: (ctx, w, h, t) => {
      fill(ctx, w, h, "#0b0b0d");
      const n = Math.max(1, 5 - Math.floor(t * 5));
      const frac = t * 5 % 1;
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
    }
  }
];
function stockById(id) {
  return STOCK_ASSETS.find((a) => a.id === id);
}
function searchStock(query) {
  const q = query.trim().toLowerCase();
  if (!q) return STOCK_ASSETS;
  return STOCK_ASSETS.filter(
    (a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q))
  );
}
function stockThumb(asset, size = 96) {
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
    return "";
  }
}
async function stockImageBlob(asset) {
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
async function stockVideoBlob(asset, onProgress) {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") return null;
  const frames = Math.max(1, asset.frames ?? 60);
  const fps = asset.fps ?? 30;
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
    (m) => MediaRecorder.isTypeSupported(m)
  );
  if (!mime) return null;
  const c = document.createElement("canvas");
  c.width = asset.width;
  c.height = asset.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  asset.draw(ctx, c.width, c.height, 0);
  const stream = c.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4e6 });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const done = new Promise((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });
  rec.start(250);
  try {
    for (let f = 0; f < frames; f++) {
      asset.draw(ctx, c.width, c.height, f / frames);
      onProgress?.((f + 1) / frames);
      await new Promise((r) => setTimeout(r, Math.max(1, Math.round(1e3 / fps))));
    }
  } finally {
    if (rec.state !== "inactive") rec.stop();
    stream.getTracks().forEach((t) => t.stop());
  }
  const blob = await done;
  return blob.size > 512 ? blob : null;
}
var EMOJI_TAGS = {
  "\u{1F525}": "fire hot flame lit",
  "\u2764\uFE0F": "heart love red",
  "\u{1F602}": "laugh cry funny lol",
  "\u{1F62E}": "wow surprised shock",
  "\u{1F440}": "eyes look watch",
  "\u{1F44F}": "clap applause hands",
  "\u{1F4AF}": "hundred perfect points",
  "\u2728": "sparkle stars magic shine",
  "\u26A1": "lightning bolt energy fast",
  "\u{1F389}": "party confetti celebrate",
  "\u{1F680}": "rocket launch fast space",
  "\u{1F4B0}": "money bag cash",
  "\u{1F4C8}": "chart up growth graph",
  "\u{1F3C6}": "trophy win award",
  "\u{1F3AF}": "target goal bullseye",
  "\u{1F37F}": "popcorn movie snack",
  "\u{1F976}": "cold freeze frozen ice",
  "\u{1F60D}": "love eyes hearts",
  "\u{1F92F}": "mind blown explode",
  "\u{1F449}": "point right hand",
  "\u{1F446}": "point up hand",
  "\u2705": "check tick done yes",
  "\u274C": "cross no wrong x",
  "\u2B50": "star favourite",
  "\u{1F30A}": "wave water ocean",
  "\u{1F319}": "moon night",
  "\u2600\uFE0F": "sun day bright",
  "\u{1F3B5}": "music note sound",
  "\u{1F3AC}": "clapper film movie",
  "\u{1F4F1}": "phone mobile app",
  "\u{1F4AC}": "speech bubble chat",
  "\u{1F64C}": "raise hands praise",
  "\u{1F4AA}": "strong flex muscle",
  "\u{1F9E0}": "brain smart think",
  "\u{1F451}": "crown king queen",
  "\u{1F355}": "pizza food eat",
  "\u{1F3D6}\uFE0F": "beach holiday sand",
  "\u{1F3AE}": "game controller play",
  "\u{1F6F9}": "skateboard board",
  "\u{1F4F8}": "camera photo shoot"
};
function searchEmoji(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.keys(EMOJI_TAGS).filter((e) => EMOJI_TAGS[e].includes(q));
}
export {
  EMOJI_TAGS,
  STOCK_ASSETS,
  searchEmoji,
  searchStock,
  stockById,
  stockImageBlob,
  stockThumb,
  stockVideoBlob
};
