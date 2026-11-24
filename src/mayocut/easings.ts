/**
 * Keyframe easing.
 *
 * Every keyframe used to interpolate linearly. That is the one interpolation
 * CapCut and Kdenlive both treat as the *baseline* rather than the feature:
 * CapCut has a curve editor with draggable Bezier handles, Kdenlive has
 * per-keyframe interpolation modes (linear / discrete / smooth / cubic).
 *
 * A keyframe carries the ease that governs the segment *after* it, which is
 * how both of those editors model it — the curve belongs to the outgoing side
 * of the keyframe, not to the pair.
 *
 * Everything here is pure and deterministic: the preview and the export both
 * call `animAt`, so an easing curve cannot disagree with itself between the
 * two. There is no time-based smoothing anywhere.
 */

/** Named easing curves. `custom` reads its control points from `Keyframe.bez`. */
export type EaseId =
  "linear" | "easeIn" | "easeOut" | "easeInOut" | "smooth" | "snap" | "hold" | "custom";

/** CSS-style cubic-bezier control points: P0=(0,0) and P3=(1,1) are implied. */
export interface Bezier4 {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const DEFAULT_BEZIER: Bezier4 = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };

/**
 * The presets, with the control points they resolve to.
 *
 * `hold` is deliberately not a curve: it is the discrete/stepped mode, where
 * the outgoing value is held until the next keyframe and then jumps. It is its
 * own thing rather than a bezier with a hard step because a step function is
 * not expressible as a smooth cubic, and pretending otherwise would make the
 * editor's graph lie about what it draws.
 */
export const EASE_PRESETS: { id: EaseId; name: string; bez?: Bezier4 }[] = [
  { id: "linear", name: "Linear", bez: { x1: 0, y1: 0, x2: 1, y2: 1 } },
  { id: "easeIn", name: "Ease in", bez: { x1: 0.42, y1: 0, x2: 1, y2: 1 } },
  { id: "easeOut", name: "Ease out", bez: { x1: 0, y1: 0, x2: 0.58, y2: 1 } },
  { id: "easeInOut", name: "Ease in-out", bez: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
  // a slow start that settles rather than stopping dead — the "cinematic" default
  { id: "smooth", name: "Smooth", bez: { x1: 0.4, y1: 0, x2: 0.2, y2: 1 } },
  // reaches the value almost immediately then holds — a snap/impact
  { id: "snap", name: "Snap", bez: { x1: 0.15, y1: 0, x2: 0.05, y2: 1 } },
  { id: "hold", name: "Hold (step)" },
  { id: "custom", name: "Custom…" },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The bezier for an ease id, falling back to the linear identity. */
export function bezierFor(id: EaseId | undefined, custom?: Bezier4 | null): Bezier4 {
  const preset = EASE_PRESETS.find((p) => p.id === id);
  if (id === "custom") return custom ?? DEFAULT_BEZIER;
  return preset?.bez ?? { x1: 0, y1: 0, x2: 1, y2: 1 };
}

// --- cubic bezier, solved the way CSS solves it -----------------------------

function bezAxis(t: number, p1: number, p2: number): number {
  // B(t) on one axis with P0=0 and P3=1
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

function bezSlope(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Solve a cubic bezier easing curve at progress `x` (both axes 0..1).
 *
 * x(t) is monotonic for control points with x in 0..1, so the parameter is
 * found by Newton-Raphson with a bisection fallback — the same approach the
 * browser uses for `cubic-bezier()`. Newton alone can be thrown off a flat
 * slope (x1 = x2 = 0 gives a zero derivative at t=0), which is exactly the
 * shape a "snap" preset has, so the fallback is not decorative.
 *
 * Returns `y(t)`, which is the eased value. y is intentionally allowed outside
 * 0..1: an overshoot curve is a legitimate thing to author.
 */
export function solveBezier(b: Bezier4, x: number): number {
  const px = clamp01(x);
  if (px === 0) return 0;
  if (px === 1) return 1;
  // a straight line needs no solving
  if (b.x1 === b.y1 && b.x2 === b.y2) return px;

  let t = px;
  for (let i = 0; i < 8; i++) {
    const err = bezAxis(t, b.x1, b.x2) - px;
    if (Math.abs(err) < 1e-6) return bezAxis(t, b.y1, b.y2);
    const d = bezSlope(t, b.x1, b.x2);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  // bisection: robust where Newton stalls
  let lo = 0;
  let hi = 1;
  t = px;
  for (let i = 0; i < 24; i++) {
    const v = bezAxis(t, b.x1, b.x2);
    if (Math.abs(v - px) < 1e-6) break;
    if (v < px) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return bezAxis(t, b.y1, b.y2);
}

/**
 * Eased progress for a segment.
 *
 * `k` is the linear progress through the segment (0 at the outgoing keyframe,
 * 1 at the next one). Returning `k` unchanged for an unknown or absent ease
 * keeps every project saved before easing existed pixel-identical.
 */
export function easeValue(id: EaseId | undefined, k: number, custom?: Bezier4 | null): number {
  if (!id || id === "linear") return k;
  const kk = clamp01(k);
  if (id === "hold") return kk >= 1 ? 1 : 0;
  return solveBezier(bezierFor(id, custom), kk);
}

/**
 * Sample the curve for the editor's graph, as `[u, v]` pairs across the
 * segment. Used for drawing only — the renderer calls `easeValue` directly.
 */
export function sampleEase(
  id: EaseId | undefined,
  custom?: Bezier4 | null,
  steps = 32,
): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.max(2, steps);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push([u, easeValue(id, u, custom)]);
  }
  return out;
}

/** Human-readable name for an ease id, for toasts and labels. */
export function easeName(id: EaseId | undefined): string {
  return EASE_PRESETS.find((p) => p.id === (id ?? "linear"))?.name ?? "Linear";
}
