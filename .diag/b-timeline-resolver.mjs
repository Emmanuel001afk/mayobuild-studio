// src/mayocut/fonts.ts
var FONT_CATALOGUE = [
  // ---- clean / captions -----------------------------------------------------
  {
    id: "system",
    name: "Modern (default)",
    css: '"Inter", "Segoe UI", system-ui, sans-serif',
    note: "Clean UI sans \u2014 the safe default",
    kind: "sans"
  },
  {
    id: "helvetica",
    name: "Helvetica / Nimbus",
    css: '"Helvetica Neue", Helvetica, "Nimbus Sans", Arial, sans-serif',
    note: "Neutral Swiss sans, slightly tighter than Modern",
    kind: "sans"
  },
  {
    id: "grotesk",
    name: "Grotesk",
    css: '"Arial", "Liberation Sans", "Helvetica Neue", sans-serif',
    note: "Plain, wide, extremely legible at small sizes",
    kind: "sans"
  },
  {
    id: "geometric",
    name: "Geometric",
    css: '"Futura", "Century Gothic", "Avenir Next", "Trebuchet MS", sans-serif',
    note: "Round geometry \u2014 good for titles, weak for body",
    kind: "sans"
  },
  {
    id: "humanist",
    name: "Humanist",
    css: '"Optima", "Candara", "Gill Sans", "Segoe UI", sans-serif',
    note: "Softer strokes, reads well over busy footage",
    kind: "sans"
  },
  {
    id: "book",
    name: "Book",
    css: '"Verdana", "DejaVu Sans", "Segoe UI", sans-serif',
    note: "Wide and heavy \u2014 the most readable over video",
    kind: "sans"
  },
  {
    id: "condensed",
    name: "Condensed",
    css: '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif',
    note: "Narrow \u2014 fits long lines and stacked captions",
    kind: "sans"
  },
  // ---- loud / display -------------------------------------------------------
  {
    id: "impact",
    name: "Impact (loud)",
    css: 'Impact, "Arial Black", "Haettenschweiler", sans-serif',
    note: "Meme/poster weight; pairs with a thick stroke",
    kind: "display"
  },
  {
    id: "black",
    name: "Black",
    css: '"Arial Black", "Segoe UI Black", "Impact", sans-serif',
    note: "Very heavy sans for hook text",
    kind: "display"
  },
  {
    id: "poster",
    name: "Poster",
    css: '"Trebuchet MS", "Tahoma", "DejaVu Sans", sans-serif',
    note: "Friendly and slightly condensed",
    kind: "display"
  },
  // ---- serif ---------------------------------------------------------------
  {
    id: "serif",
    name: "Classic serif",
    css: 'Georgia, "Times New Roman", "Liberation Serif", serif',
    note: "Editorial serif; the default for quotes",
    kind: "serif"
  },
  {
    id: "garamond",
    name: "Garamond",
    css: '"EB Garamond", Garamond, "Apple Garamond", "Georgia", serif',
    note: "Bookish and elegant \u2014 small caps look great",
    kind: "serif"
  },
  {
    id: "slab",
    name: "Slab",
    css: 'Rockwell, "Roboto Slab", "DejaVu Serif", serif',
    note: "Blocky serif; strong over footage",
    kind: "serif"
  },
  {
    id: "elegant",
    name: "Elegant",
    css: '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", serif',
    note: "Warm old-style; wedding and travel edits",
    kind: "serif"
  },
  {
    id: "didone",
    name: "Didone",
    css: '"Didot", "Bodoni MT", "Baskerville", "Playfair Display", serif',
    note: "High-contrast fashion type \u2014 large sizes only",
    kind: "serif"
  },
  // ---- mono / typewriter ----------------------------------------------------
  {
    id: "mono",
    name: "Typewriter mono",
    css: '"SF Mono", ui-monospace, "Roboto Mono", "DejaVu Sans Mono", monospace',
    note: "Code/terminal feel; good for data and jokes",
    kind: "mono"
  },
  {
    id: "courier",
    name: "Courier",
    css: '"Courier New", Courier, "Nimbus Mono PS", monospace',
    note: "Script/typewriter look with a thin weight",
    kind: "mono"
  },
  // ---- script / casual ------------------------------------------------------
  {
    id: "script",
    name: "Script (handwritten)",
    css: '"Brush Script MT", "Segoe Script", "Bradley Hand", cursive',
    note: "Handwritten \u2014 use sparingly and large",
    kind: "script"
  },
  {
    id: "rounded",
    name: "Rounded (casual)",
    css: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive',
    note: "Informal and warm",
    kind: "script"
  },
  {
    id: "marker",
    name: "Marker",
    css: '"Marker Felt", "Comic Sans MS", "Segoe Print", cursive',
    note: "Notebook/marker annotation style",
    kind: "script"
  },
  {
    id: "fancy",
    name: "Fancy (blackletter)",
    css: '"Old English Text MT", "UnifrakturMaguntia", "Cinzel Decorative", serif',
    note: "Blackletter; decorative only, never body text",
    kind: "display"
  }
];
var BY_ID = new Map(FONT_CATALOGUE.map((f) => [f.id, f]));

// src/mayocut/types.ts
var FONTS = FONT_CATALOGUE.map(
  ({ id, name, css }) => ({ id, name, css })
);
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
function safeSpeed(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(0.05, Math.min(100, n));
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
  const v0 = safeSpeed(c.speed);
  const v1 = c.rampTo != null ? safeSpeed(c.rampTo) : v0;
  return v0 + (v1 - v0) * clamp(x, 0, 1);
}
function distanceAfter(c, L, tau) {
  if (tau <= 0) return 0;
  const curve = speedCurveOf(c);
  if (!curve) {
    const v0 = safeSpeed(c.speed);
    const v1 = c.rampTo != null ? safeSpeed(c.rampTo) : v0;
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
    const v0 = safeSpeed(c.speed);
    const v1 = c.rampTo != null ? safeSpeed(c.rampTo) : v0;
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
  const srcIn = Number.isFinite(c.in) ? c.in : 0;
  const srcOut = Number.isFinite(c.out) ? c.out : Math.max(srcIn + 0.1, srcIn + 5);
  if (c.freeze) return Math.max(0.1, srcOut - srcIn);
  const L = Math.max(0, srcOut - srcIn);
  if (L <= 0) return 0.1;
  const d = timeForDistance(c, L, L);
  return Number.isFinite(d) && d > 0 ? Math.max(0.1, d) : Math.max(0.1, L / safeSpeed(c.speed));
}
function mainSrcAt(c, localT) {
  if (c.freeze) return c.in + 1 / 60;
  const L = Math.max(1e-6, c.out - c.in);
  const dur = mainClipDuration(c);
  const tau = clamp(localT, 0, dur);
  const x = clamp(distanceAfter(c, L, tau), 0, L);
  return c.reverse ? c.out - x : c.in + x;
}
function mainPlaybackRate(c, localT) {
  if (c.freeze) return 1;
  const L = Math.max(1e-6, c.out - c.in);
  const src = mainSrcAt(c, localT);
  const x = c.reverse ? c.out - src : src - c.in;
  const r = speedAt(c, x / L);
  return Number.isFinite(r) && r > 0 ? Math.max(0.05, Math.min(16, r)) : safeSpeed(c.speed);
}
function mainClipGain(clip, span, next, t, hasPrevious = true) {
  if (clip.reverse || clip.freeze) return 0;
  const baseVolume = Number.isFinite(clip.volume) ? clip.volume : 1;
  let v = clip.muted ? 0 : Math.max(0, baseVolume);
  if (hasPrevious && clip.transitionIn !== "none" && t < span.start && clip.transitionDur > 0) {
    v *= Math.max(0, Math.min(1, (t - (span.start - clip.transitionDur)) / clip.transitionDur));
  }
  if (next && next.clip.transitionIn !== "none" && next.clip.transitionDur > 0) {
    const winStart = next.start - next.clip.transitionDur;
    if (t >= winStart) {
      v *= Math.max(0, Math.min(1, 1 - (t - winStart) / next.clip.transitionDur));
    }
  }
  return Math.max(0, v);
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
function overlayEnd(c) {
  const start = Number.isFinite(c.start) ? c.start : 0;
  const dur = Number.isFinite(c.duration) && c.duration > 0 ? c.duration : 0;
  return start + dur;
}
function projectDuration(project) {
  const spans = mainSpans(project);
  let end = spans.length ? spans[spans.length - 1].end : 0;
  for (const tr of project.tracks) {
    if (!tr || !Array.isArray(tr.clips)) continue;
    for (const c of tr.clips) end = Math.max(end, overlayEnd(c));
  }
  return Number.isFinite(end) && end > 0 ? end : 0;
}

// src/mayocut/timeline-resolver.ts
var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
var finite = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
function makeLayer(spans, index, t, alpha) {
  const s = spans[index];
  const c = s.clip;
  const local = t - s.start;
  const next = index + 1 < spans.length ? spans[index + 1] : null;
  return {
    clip: c,
    index,
    start: s.start,
    end: s.end,
    local,
    src: finite(mainSrcAt(c, local), finite(c.in, 0)),
    rate: finite(mainPlaybackRate(c, local), 1),
    alpha: clamp01(alpha),
    gain: clamp01(mainClipGain(c, s, next, t, index > 0))
  };
}
function mainLayersAt(project, t) {
  const spans = mainSpans(project);
  for (let i = 1; i < spans.length; i++) {
    const c = spans[i].clip;
    if (c.transitionIn === "none") continue;
    const dur = Math.max(0, finite(c.transitionDur, 0));
    if (dur <= 0) continue;
    const winStart = spans[i].start - dur;
    if (t < winStart || t >= spans[i].start) continue;
    const progress = clamp01((t - winStart) / dur);
    const from = makeLayer(spans, i - 1, t, 1 - progress);
    const to = makeLayer(spans, i, t, progress);
    return { layers: [from, to], transition: { kind: c.transitionIn, progress, from, to } };
  }
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (t < s.start || t >= s.end) continue;
    return { layers: [makeLayer(spans, i, t, 1)], transition: null };
  }
  if (spans.length) {
    return { layers: [makeLayer(spans, spans.length - 1, t, 1)], transition: null };
  }
  return { layers: [], transition: null };
}
function overlayLayersAt(project, t) {
  const out = [];
  for (const tr of project.tracks) {
    if (tr.hidden) continue;
    for (const c of tr.clips) {
      const start = finite(c.start, 0);
      const dur = Math.max(0, finite(c.duration, 0));
      if (t < start || t >= start + dur) continue;
      const local = t - start;
      const rampIn = Math.min(1, local / 0.4);
      const rampOut = Math.min(1, (start + dur - t) / 0.3);
      out.push({
        clip: c,
        trackId: tr.id,
        local,
        fadeAlpha: c.anim && c.anim !== "none" ? clamp01(rampIn * rampOut) : 1
      });
    }
  }
  return out;
}
function resolveComposition(project, t) {
  const duration = projectDuration(project);
  const safeT = Math.max(0, Math.min(duration, finite(t, 0)));
  const { layers, transition } = mainLayersAt(project, safeT);
  const overlays = overlayLayersAt(project, safeT);
  return {
    t: safeT,
    duration,
    main: layers,
    transition,
    overlays,
    audioOverlays: overlays.filter((o) => o.clip.kind === "audio" && !!o.clip.mediaId),
    empty: layers.length === 0 && overlays.length === 0
  };
}
function requiredMediaAt(project, t) {
  const comp = resolveComposition(project, t);
  const ids = [];
  const push = (id) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const l of comp.main) push(l.clip.mediaId);
  for (const o of comp.overlays) push(o.clip.mediaId);
  return ids;
}
function readinessFor(readyState, currentTime, src, paused, tolerance = 0.12) {
  if (readyState < 2) return "loading";
  if (paused) return "ready";
  return Math.abs(finite(currentTime, 0) - finite(src, 0)) <= tolerance ? "ready" : "seek-needed";
}
function shouldAdvanceClock(verdicts, stalledForMs, stallMs = 900) {
  if (stalledForMs >= stallMs) return true;
  return verdicts.every((v) => v !== "loading");
}
export {
  mainClipDuration,
  readinessFor,
  requiredMediaAt,
  resolveComposition,
  shouldAdvanceClock
};
