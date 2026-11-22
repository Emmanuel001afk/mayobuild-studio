// MayoCut — tone curves.
//
// CapCut's Adjust panel has RGB curves and a white point/black point graph. A
// curve is just a monotone interpolation through control points, baked into a
// 256-entry lookup table so grading a frame costs one array index per channel.
//
// Pure and dependency-free on purpose: the same LUT is used by the preview, by
// the frame-stepped exporters and by the WAV/PNG paths, so a curve cannot look
// different in the file than it does on screen.

/** A control point: x = input level 0..1, y = output level 0..1. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** The four curves CapCut exposes. Missing channels mean "identity". */
export interface CurveSet {
  /** master tone curve, applied to all channels */
  rgb?: CurvePoint[];
  r?: CurvePoint[];
  g?: CurvePoint[];
  b?: CurvePoint[];
}

export const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export function isIdentity(points?: CurvePoint[]): boolean {
  if (!points || points.length < 2) return true;
  return points.every((p, i) => {
    const want = i / (points.length - 1);
    return Math.abs(p.x - want) < 1e-6 && Math.abs(p.y - want) < 1e-6;
  });
}

export function curvesActive(c?: CurveSet): boolean {
  if (!c) return false;
  return !isIdentity(c.rgb) || !isIdentity(c.r) || !isIdentity(c.g) || !isIdentity(c.b);
}

/** Sort, clamp and de-duplicate control points so a drag can never break them. */
export function normalisePoints(points: CurvePoint[]): CurvePoint[] {
  const clean = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) }))
    .sort((a, b) => a.x - b.x);
  const out: CurvePoint[] = [];
  for (const p of clean) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 1e-4) continue;
    out.push(p);
  }
  if (!out.length || out[0].x > 1e-4) out.unshift({ x: 0, y: out[0]?.y ?? 0 });
  if (out[out.length - 1].x < 1 - 1e-4) out.push({ x: 1, y: out[out.length - 1].y });
  return out;
}

/**
 * Evaluate the curve at x using monotone cubic (Fritsch–Carlson) interpolation.
 *
 * Plain Catmull-Rom overshoots between close points, which shows up as a bright
 * halo on an S-curve — the exact artefact people use curves to remove. Monotone
 * interpolation cannot overshoot, so dragging a point up never pushes its
 * neighbours down.
 */
export function evalCurve(points: CurvePoint[], x: number): number {
  const pts = normalisePoints(points);
  const n = pts.length;
  if (n === 0) return x;
  if (n === 1) return pts[0].y;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[n - 1].x) return pts[n - 1].y;

  let i = 0;
  while (i < n - 2 && x > pts[i + 1].x) i++;
  const x0 = pts[i].x;
  const x1 = pts[i + 1].x;
  const y0 = pts[i].y;
  const y1 = pts[i + 1].y;
  const h = x1 - x0;
  if (h <= 1e-9) return y1;

  // secant slopes
  const d: number[] = [];
  for (let k = 0; k < n - 1; k++) d.push((pts[k + 1].y - pts[k].y) / (pts[k + 1].x - pts[k].x));
  // tangents, clamped so the segment stays monotone
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) m[k] = 0;
    else m[k] = (d[k - 1] + d[k]) / 2;
  }
  for (let k = 0; k < n - 1; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const h2 = a * a + b * b;
    if (h2 > 9) {
      const t = 3 / Math.sqrt(h2);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }

  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * h * m[i] +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * h * m[i + 1]
  );
}

/**
 * Bake a curve into a 256-entry lookup table.
 *
 * `Uint8ClampedArray` because that is what the pixel pass writes through, and
 * because it clamps for free — a curve that pushes a value past 255 is clamped
 * rather than wrapping to black.
 */
export function curveLut(points: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(evalCurve(points, i / 255) * 255);
  return lut;
}

/** Lookup tables for one curve set; nulls mean "leave this channel alone". */
export interface CurveLuts {
  rgb: Uint8ClampedArray | null;
  r: Uint8ClampedArray | null;
  g: Uint8ClampedArray | null;
  b: Uint8ClampedArray | null;
}

export function buildCurveLuts(c?: CurveSet): CurveLuts | null {
  if (!c || !curvesActive(c)) return null;
  return {
    rgb: isIdentity(c.rgb) ? null : curveLut(c.rgb!),
    r: isIdentity(c.r) ? null : curveLut(c.r!),
    g: isIdentity(c.g) ? null : curveLut(c.g!),
    b: isIdentity(c.b) ? null : curveLut(c.b!),
  };
}

/** Apply baked LUTs to RGBA pixels in place. */
export function applyCurveLuts(d: Uint8ClampedArray, luts: CurveLuts) {
  const { rgb, r, g, b } = luts;
  for (let i = 0; i < d.length; i += 4) {
    let R = d[i];
    let G = d[i + 1];
    let B = d[i + 2];
    if (rgb) {
      R = rgb[R];
      G = rgb[G];
      B = rgb[B];
    }
    if (r) R = r[R];
    if (g) G = g[G];
    if (b) B = b[B];
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
  }
}

/** Named starting points — the shapes people actually reach for. */
export const CURVE_PRESETS: { id: string; name: string; points: CurvePoint[] }[] = [
  { id: "linear", name: "Linear", points: IDENTITY_CURVE },
  {
    id: "soft-s",
    name: "Soft S",
    points: [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.2 },
      { x: 0.75, y: 0.8 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "strong-s",
    name: "Punchy",
    points: [
      { x: 0, y: 0 },
      { x: 0.2, y: 0.1 },
      { x: 0.8, y: 0.9 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "fade",
    name: "Faded",
    points: [
      { x: 0, y: 0.12 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0.92 },
    ],
  },
  {
    id: "lift",
    name: "Lifted blacks",
    points: [
      { x: 0, y: 0.18 },
      { x: 0.4, y: 0.48 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: "crush",
    name: "Crushed blacks",
    points: [
      { x: 0, y: 0 },
      { x: 0.18, y: 0.04 },
      { x: 1, y: 1 },
    ],
  },
];
