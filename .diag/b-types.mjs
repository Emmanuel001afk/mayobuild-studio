// src/mayocut/types.ts
var DEFAULT_ADJUST = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  temperature: 0,
  tint: 0,
  fade: 0,
  sharpen: 0,
  vignette: 0,
  splitTone: 0
};
var TRANSITIONS = [
  { id: "none", name: "None" },
  { id: "crossfade", name: "Crossfade" },
  { id: "fadeblack", name: "Dip to black" },
  { id: "fadewhite", name: "Dip to white" },
  { id: "slideleft", name: "Slide left" },
  { id: "slideright", name: "Slide right" },
  { id: "slideup", name: "Slide up" },
  { id: "slidedown", name: "Slide down" },
  { id: "wipeleft", name: "Wipe left" },
  { id: "wiperight", name: "Wipe right" },
  { id: "wipeup", name: "Wipe up" },
  { id: "wipedown", name: "Wipe down" },
  { id: "zoom", name: "Zoom punch" },
  { id: "blur", name: "Blur dissolve" }
];
function isDipTo(kind) {
  if (kind === "fadeblack") return "black";
  if (kind === "fadewhite") return "white";
  return null;
}
var DEFAULT_ANIM = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
var EFFECTS = [
  { id: "none", name: "None" },
  { id: "zoom-pulse", name: "Zoom pulse" },
  { id: "heartbeat", name: "Heartbeat" },
  { id: "shake", name: "Shake" },
  { id: "spin", name: "Spin" },
  { id: "glitch", name: "Glitch" },
  { id: "flash-in", name: "Flash in" },
  { id: "blur-in", name: "Blur in" },
  { id: "vhs", name: "VHS" },
  { id: "zoom-out", name: "Zoom out" },
  { id: "pan-left", name: "Pan left" },
  { id: "pan-right", name: "Pan right" },
  { id: "tilt-up", name: "Tilt up" },
  { id: "kenburns", name: "Ken Burns (slow drift)" },
  { id: "pulse-color", name: "Color pulse" },
  { id: "sway", name: "Sway" }
];
var TEXT_ANIMS = [
  { id: "none", name: "None" },
  { id: "fade", name: "Fade" },
  { id: "slideup", name: "Slide up" },
  { id: "typewriter", name: "Typewriter" },
  { id: "karaoke", name: "Karaoke" },
  { id: "bounce", name: "Bounce in" },
  { id: "kenburns", name: "Ken Burns" },
  { id: "neon", name: "Neon pulse" },
  { id: "zoom-in", name: "Zoom in" },
  { id: "slideleft", name: "Slide from left" },
  { id: "rise", name: "Rise + fade" },
  { id: "wipe-in", name: "Wipe in" }
];
var FONTS = [
  { id: "system", name: "Modern (default)", css: '"Inter", "Segoe UI", system-ui, sans-serif' },
  { id: "serif", name: "Classic serif", css: 'Georgia, "Times New Roman", serif' },
  { id: "condensed", name: "Condensed", css: '"Arial Narrow", "Roboto Condensed", sans-serif' },
  { id: "slab", name: "Slab", css: 'Rockwell, "Roboto Slab", "Courier New", serif' },
  { id: "impact", name: "Impact (loud)", css: 'Impact, "Arial Black", sans-serif' },
  { id: "mono", name: "Typewriter mono", css: '"SF Mono", ui-monospace, "Roboto Mono", monospace' },
  { id: "script", name: "Script (handwritten)", css: '"Brush Script MT", "Segoe Script", cursive' },
  { id: "rounded", name: "Rounded (casual)", css: '"Comic Sans MS", "Comic Neue", cursive' },
  { id: "elegant", name: "Elegant", css: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  {
    id: "fancy",
    name: "Fancy (blackletter)",
    css: '"Old English Text MT", "UnifrakturMaguntia", serif'
  }
];
var TEXT_PRESETS = [
  {
    name: "Clean white",
    patch: {
      color: "#ffffff",
      bg: "",
      bold: true,
      stroke: 0,
      shadow: 0.6,
      upper: false,
      tracking: 0,
      underline: false,
      italic: false
    }
  },
  {
    name: "Caption box",
    patch: {
      color: "#ffffff",
      bg: "rgba(0,0,0,0.62)",
      bold: true,
      stroke: 0,
      shadow: 0.2,
      radius: 35,
      tracking: 0
    }
  },
  {
    name: "Bold outline",
    patch: {
      color: "#ffffff",
      bg: "",
      bold: true,
      stroke: 8,
      strokeColor: "#000000",
      shadow: 0.3,
      upper: true,
      tracking: 2
    }
  },
  {
    name: "Neon glow",
    patch: {
      color: "#22d3ee",
      bg: "",
      bold: true,
      stroke: 0,
      shadow: 0.9,
      anim: "neon",
      tracking: 3
    }
  },
  {
    name: "Title card",
    patch: {
      color: "#ffffff",
      bg: "",
      bold: true,
      upper: true,
      tracking: 12,
      shadow: 0.7,
      size: 110,
      anim: "rise"
    }
  },
  {
    name: "Yellow pop",
    patch: {
      color: "#facc15",
      bg: "#111827",
      bold: true,
      stroke: 0,
      radius: 12,
      upper: true,
      anim: "bounce"
    }
  },
  {
    name: "Editorial serif",
    patch: {
      color: "#f8fafc",
      font: "serif",
      bold: false,
      italic: true,
      bg: "",
      shadow: 0.4,
      size: 84
    }
  },
  {
    name: "Typewriter",
    patch: {
      color: "#ffffff",
      font: "mono",
      bg: "",
      bold: false,
      anim: "typewriter",
      stroke: 0,
      shadow: 0.3
    }
  },
  {
    name: "Underline key",
    patch: { color: "#ffffff", bg: "", bold: true, underline: true, stroke: 0, anim: "slideup" }
  },
  {
    name: "Label chip",
    patch: {
      color: "#ffffff",
      bg: "#0ea5e9",
      bold: true,
      radius: 100,
      upper: true,
      tracking: 6,
      size: 44
    }
  }
];
function fontCss(id) {
  return FONTS.find((f) => f.id === id)?.css ?? FONTS[0].css;
}
var ASPECTS = {
  "9:16": { w: 1080, h: 1920, label: "9:16 \xB7 Reels / Shorts", hint: "TikTok, Reels, Shorts" },
  "1:1": { w: 1080, h: 1080, label: "1:1 \xB7 Square", hint: "Feed posts, LinkedIn" },
  "4:5": { w: 1080, h: 1350, label: "4:5 \xB7 Portrait feed", hint: "Instagram feed" },
  "16:9": { w: 1920, h: 1080, label: "16:9 \xB7 Landscape", hint: "YouTube, desktop" },
  "4:3": { w: 1440, h: 1080, label: "4:3 \xB7 Classic", hint: "Older TV, presentations" },
  "3:4": { w: 1080, h: 1440, label: "3:4 \xB7 Vertical", hint: "Pinterest, tablets" },
  "21:9": { w: 2560, h: 1080, label: "21:9 \xB7 Cinematic", hint: "Film bars, widescreen" },
  "2:3": { w: 1080, h: 1620, label: "2:3 \xB7 Tall portrait", hint: "Prints, flyers" }
};
var ASPECT_ORDER = ["9:16", "4:5", "1:1", "16:9", "3:4", "4:3", "2:3", "21:9"];
function aspectRatio(a) {
  const d = ASPECTS[a] ?? ASPECTS["9:16"];
  return d.w / d.h;
}
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function emptyTracks() {
  return [
    { id: "t_text", name: "Text", clips: [] },
    { id: "t_overlay", name: "Overlay", clips: [] },
    { id: "t_audio", name: "Audio", clips: [] }
  ];
}
function newProject(name, aspect) {
  const now = Date.now();
  return {
    id: uid("prj"),
    name,
    aspect,
    main: [],
    tracks: emptyTracks(),
    createdAt: now,
    updatedAt: now
  };
}
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function speedCurveOf(c) {
  const raw = c.curve;
  if (!raw || raw.length < 2) return null;
  const pts = raw.filter((p) => Number.isFinite(p.at) && Number.isFinite(p.v)).map((p) => ({ at: clamp(p.at, 0, 1), v: clamp(p.v, 0.05, 16) })).sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;
  if (pts[0].at > 0) pts.unshift({ at: 0, v: pts[0].v });
  if (pts[pts.length - 1].at < 1) pts.push({ at: 1, v: pts[pts.length - 1].v });
  return pts;
}
function speedAt(c, x) {
  const curve = speedCurveOf(c);
  if (curve) {
    const u = clamp(x, 0, 1);
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1];
      const b = curve[i];
      if (u <= b.at) {
        const span = b.at - a.at;
        if (span < 1e-9) return b.v;
        return a.v + (b.v - a.v) * (u - a.at) / span;
      }
    }
    return curve[curve.length - 1].v;
  }
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  return v0 + (v1 - v0) * clamp(x, 0, 1);
}
function distanceAfter(c, L, tau) {
  if (tau <= 0) return 0;
  const curve = speedCurveOf(c);
  if (!curve) {
    const v0 = Math.max(0.05, c.speed);
    const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
    if (Math.abs(v1 - v0) < 1e-9) return Math.min(L, tau * v0);
    const k = (v1 - v0) / L;
    return clamp(v0 / k * (Math.exp(k * tau) - 1), 0, L);
  }
  const seg = (i) => ({
    a: curve[i].v,
    b: curve[i + 1].v,
    x0: curve[i].at,
    x1: curve[i + 1].at
  });
  const segTime = (g) => {
    const w = (g.x1 - g.x0) * L;
    if (w < 1e-9) return 0;
    if (Math.abs(g.b - g.a) < 1e-9) return w / g.a;
    return w / (g.b - g.a) * Math.log(g.b / g.a);
  };
  let left = tau;
  for (let i = 0; i < curve.length - 1; i++) {
    const g = seg(i);
    const dt = segTime(g);
    if (left <= dt || i === curve.length - 2) {
      const w = (g.x1 - g.x0) * L;
      const k = (g.b - g.a) / Math.max(1e-9, w);
      let x;
      if (Math.abs(k) < 1e-9) x = left * g.a;
      else x = g.a / k * (Math.exp(k * left) - 1);
      return clamp(g.x0 * L + Math.min(w, x), 0, L);
    }
    left -= dt;
  }
  return L;
}
function timeForDistance(c, L, x) {
  const curve = speedCurveOf(c);
  if (!curve) {
    const v0 = Math.max(0.05, c.speed);
    const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
    if (Math.abs(v1 - v0) < 1e-9) return x / v0;
    const k = (v1 - v0) / L;
    return Math.log(k * x / v0 + 1) / k;
  }
  let t = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const g = { a: curve[i].v, b: curve[i + 1].v, x0: curve[i].at, x1: curve[i + 1].at };
    const w = (g.x1 - g.x0) * L;
    const k = (g.b - g.a) / Math.max(1e-9, w);
    if (x <= g.x1 * L || i === curve.length - 2) {
      const dx = clamp(x - g.x0 * L, 0, w);
      if (Math.abs(k) < 1e-9) return t + dx / g.a;
      return t + Math.log(k * dx / g.a + 1) / k;
    }
    t += Math.abs(k) < 1e-9 ? w / g.a : w / (g.b - g.a) * Math.log(g.b / g.a);
  }
  return t;
}
function mainClipDuration(c) {
  if (c.freeze) return Math.max(0.1, c.out - c.in);
  const L = Math.max(0, c.out - c.in);
  if (L <= 0) return 0.1;
  return Math.max(0.1, timeForDistance(c, L, L));
}
function mainSrcAt(c, localT) {
  if (c.freeze) return c.in + 1 / 60;
  const L = Math.max(1e-6, c.out - c.in);
  const dur = mainClipDuration(c);
  const tau = clamp(localT, 0, dur);
  const x = clamp(distanceAfter(c, L, tau), 0, L);
  return c.reverse ? c.out - x : c.in + x;
}
function mainRateAt(c, localT) {
  if (c.freeze || c.reverse) return 1;
  const L = Math.max(1e-6, c.out - c.in);
  const src = mainSrcAt(c, localT);
  const x = c.reverse ? c.out - src : src - c.in;
  return Math.max(0.05, speedAt(c, x / L));
}
function mainPlaybackRate(c, localT) {
  if (c.freeze) return 1;
  const L = Math.max(1e-6, c.out - c.in);
  const src = mainSrcAt(c, localT);
  const x = c.reverse ? c.out - src : src - c.in;
  return Math.max(0.05, speedAt(c, x / L));
}
function nudgeWord(words, index, delta, duration, step = 0.05) {
  if (index < 0 || index >= words.length) return words;
  const next = words.map((w) => ({ ...w }));
  const lo = index === 0 ? 0 : next[index - 1].t + step;
  const hi = index === words.length - 1 ? Math.max(lo, duration) : Math.max(lo, next[index + 1].t - step);
  const t = Math.min(hi, Math.max(lo, next[index].t + delta));
  next[index].t = Math.round(t * 1e3) / 1e3;
  return next;
}
function respaceWords(words, duration) {
  const step = duration / Math.max(1, words.length);
  return words.map((w, i) => ({ ...w, t: Math.round(i * step * 1e3) / 1e3 }));
}
function shiftWords(words, delta, duration) {
  if (words.length === 0) return words;
  const first = words[0].t;
  const last = words[words.length - 1].t;
  const d = Math.max(-first, Math.min(Math.max(0, duration - last), delta));
  if (Math.abs(d) < 1e-9) return words;
  return words.map((w) => ({ ...w, t: Math.round((w.t + d) * 1e3) / 1e3 }));
}
function mainSpans(project) {
  let t = 0;
  return project.main.map((clip) => {
    const dur = mainClipDuration(clip);
    const span = { clip, start: t, end: t + dur };
    t += dur;
    return span;
  });
}
function projectDuration(project) {
  const spans = mainSpans(project);
  let end = spans.length ? spans[spans.length - 1].end : 0;
  for (const tr of project.tracks)
    for (const c of tr.clips) end = Math.max(end, c.start + c.duration);
  return end;
}
var SPEED_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8];
function freezeClipFrom(clip, srcTime, hold = 3) {
  return {
    ...clip,
    id: uid("mc"),
    in: Math.max(0, srcTime),
    out: Math.max(0, srcTime) + Math.max(0.2, hold),
    freeze: true,
    speed: 1,
    rampTo: void 0,
    reverse: false,
    muted: true,
    transitionIn: "none",
    transitionDur: 0,
    keyframes: clip.keyframes ? clip.keyframes.map((k) => ({ at: k.at, v: { ...k.v } })) : void 0
  };
}
function sourceSpan(c) {
  return Math.max(0, c.out - c.in);
}
export {
  ASPECTS,
  ASPECT_ORDER,
  DEFAULT_ADJUST,
  DEFAULT_ANIM,
  EFFECTS,
  FONTS,
  SPEED_PRESETS,
  TEXT_ANIMS,
  TEXT_PRESETS,
  TRANSITIONS,
  aspectRatio,
  emptyTracks,
  fontCss,
  freezeClipFrom,
  isDipTo,
  mainClipDuration,
  mainPlaybackRate,
  mainRateAt,
  mainSpans,
  mainSrcAt,
  newProject,
  nudgeWord,
  projectDuration,
  respaceWords,
  shiftWords,
  sourceSpan,
  speedAt,
  speedCurveOf,
  uid
};
