// src/mayocut/types.ts
var DEFAULT_ADJUST = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
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
  { id: "vhs", name: "VHS" }
];
var TEXT_ANIMS = [
  { id: "none", name: "None" },
  { id: "fade", name: "Fade" },
  { id: "slideup", name: "Slide up" },
  { id: "typewriter", name: "Typewriter" },
  { id: "karaoke", name: "Karaoke" },
  { id: "bounce", name: "Bounce in" },
  { id: "kenburns", name: "Ken Burns" },
  { id: "neon", name: "Neon pulse" }
];
var ASPECTS = {
  "9:16": { w: 1080, h: 1920, label: "9:16 \xB7 Reels/Shorts" },
  "1:1": { w: 1080, h: 1080, label: "1:1 \xB7 Square" },
  "4:5": { w: 1080, h: 1350, label: "4:5 \xB7 Feed" },
  "16:9": { w: 1920, h: 1080, label: "16:9 \xB7 YouTube" }
};
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
function mainClipDuration(c) {
  const L = Math.max(0, c.out - c.in);
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  if (Math.abs(v1 - v0) < 1e-6) return L / v0;
  return L / (v1 - v0) * Math.log(v1 / v0);
}
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mainSrcAt(c, localT) {
  const L = Math.max(1e-6, c.out - c.in);
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  const dur = mainClipDuration(c);
  const tau = clamp(localT, 0, dur);
  const k = (v1 - v0) / L;
  let x;
  if (Math.abs(k) < 1e-9) x = tau * v0;
  else x = v0 / k * (Math.exp(k * tau) - 1);
  x = clamp(x, 0, L);
  return c.reverse ? c.out - x : c.in + x;
}
function mainRateAt(c, localT) {
  const L = Math.max(1e-6, c.out - c.in);
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  const k = (v1 - v0) / L;
  const src = mainSrcAt(c, localT);
  const x = c.reverse ? c.out - src : src - c.in;
  return Math.max(0.05, v0 + k * x);
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
export {
  ASPECTS,
  DEFAULT_ADJUST,
  DEFAULT_ANIM,
  EFFECTS,
  TEXT_ANIMS,
  emptyTracks,
  mainClipDuration,
  mainRateAt,
  mainSpans,
  mainSrcAt,
  newProject,
  projectDuration,
  uid
};
