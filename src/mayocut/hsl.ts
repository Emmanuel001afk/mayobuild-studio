// MayoCut — HSL (hue / saturation / luminance) per colour range.
//
// This is the panel CapCut calls "HSL": eight colour bands, and for each one a
// hue, a saturation and a luminance offset. It is how you fix skin that reads
// too orange, pull the green out of a plant, or push a sky bluer — without
// touching anything else in the frame.
//
// Pure colour maths, no canvas, so it can be tested exactly. The same function
// grades the preview, the frame-stepped exports and stills.

/** The eight bands, matching CapCut's list. */
export type HslBand =
  "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "magenta";

export const HSL_BANDS: { id: HslBand; name: string; center: number; swatch: string }[] = [
  { id: "red", name: "Red", center: 0, swatch: "#ef4444" },
  { id: "orange", name: "Orange", center: 30, swatch: "#f97316" },
  { id: "yellow", name: "Yellow", center: 60, swatch: "#eab308" },
  { id: "green", name: "Green", center: 120, swatch: "#22c55e" },
  { id: "cyan", name: "Cyan", center: 180, swatch: "#06b6d4" },
  { id: "blue", name: "Blue", center: 240, swatch: "#3b82f6" },
  { id: "purple", name: "Purple", center: 280, swatch: "#8b5cf6" },
  { id: "magenta", name: "Magenta", center: 320, swatch: "#d946ef" },
];

export const HSL_CENTERS: Record<HslBand, number> = Object.fromEntries(
  HSL_BANDS.map((b) => [b.id, b.center]),
) as Record<HslBand, number>;

/** One band's adjustment: -100..100 for each channel. */
export interface HslAdjust {
  h?: number;
  s?: number;
  l?: number;
}

export type HslSet = Partial<Record<HslBand, HslAdjust>>;

/** Per-pixel HSL transform: RGB order, 0..255 in, 0..255 out. */
export interface HslPixel {
  r: number;
  g: number;
  b: number;
}

/** Is any band actually adjusted? Identity sets must cost nothing. */
export function hslActive(set?: HslSet): boolean {
  if (!set) return false;
  return Object.values(set).some(
    (a) => a && ((a.h ?? 0) !== 0 || (a.s ?? 0) !== 0 || (a.l ?? 0) !== 0),
  );
}

/** Clamp an adjustment to the range the UI allows. */
export function clampHsl(a: HslAdjust): HslAdjust {
  // `Math.min(100, NaN)` is NaN, not 100 — a non-numeric slider value (which a
  // stale DOM read can produce) would have been written into the project and
  // then into every frame. Fall back to neutral instead.
  const c = (v?: number) => {
    if (!Number.isFinite(v)) return 0;
    return Math.max(-100, Math.min(100, Math.round(v as number)));
  };
  return { h: c(a.h), s: c(a.s), l: c(a.l) };
}

/**
 * Weight of a band for a given hue, 0..1.
 *
 * Triangular falloff to the midpoints between neighbouring centres, so a pixel
 * exactly between red and orange gets half of each and there is no hard seam
 * where the colour of a gradient jumps.
 */
export function bandWeight(hueDeg: number, band: HslBand): number {
  const h = ((hueDeg % 360) + 360) % 360;
  const centre = HSL_CENTERS[band];
  let d = Math.abs(h - centre);
  if (d > 180) d = 360 - d;
  // 30 degrees is the half-width: bands are 30–60 apart, so this overlaps just
  // enough to blend.
  const w = 1 - d / 30;
  return w > 0 ? w : 0;
}

/** rgb → h (0..360), s (0..1), l (0..1). */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/** h (0..360), s (0..1), l (0..1) → rgb 0..255. */
export function hslToRgb(h: number, s: number, l: number): HslPixel {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s <= 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, hh + 1 / 3) * 255,
    g: hue2rgb(p, q, hh) * 255,
    b: hue2rgb(p, q, hh - 1 / 3) * 255,
  };
}

/**
 * Apply an HSL band set to ONE pixel.
 *
 * Order matters and is deliberate: hue rotates first, then saturation scales,
 * then luminance moves. Rotating hue after scaling saturation would make the
 * result depend on how saturated the pixel already was, which is not what the
 * sliders promise.
 */
export function applyHslPixel(r: number, g: number, b: number, set: HslSet): HslPixel {
  if (!hslActive(set)) return { r, g, b };
  const { h, s, l } = rgbToHsl(r, g, b);
  // Fully desaturated pixels have no meaningful hue: leave them alone.
  if (s < 0.02) return { r, g, b };

  let dH = 0;
  let sMul = 0;
  let dL = 0;
  let total = 0;
  for (const band of HSL_BANDS) {
    const adj = set[band.id];
    if (!adj) continue;
    const ah = adj.h ?? 0;
    const as = adj.s ?? 0;
    const al = adj.l ?? 0;
    if (ah === 0 && as === 0 && al === 0) continue;
    const w = bandWeight(h, band.id);
    if (w <= 0) continue;
    dH += (ah / 100) * 30 * w; // ±100 → ±30°, so a band cannot swallow its neighbour
    sMul += (as / 100) * w;
    dL += (al / 100) * 0.35 * w; // ±100 → ±0.35 luminance
    total += w;
  }
  if (total === 0) return { r, g, b };

  const out = hslToRgb(
    h + dH,
    Math.max(0, Math.min(1, s * (1 + sMul))),
    Math.max(0, Math.min(1, l + dL)),
  );
  return {
    r: Math.max(0, Math.min(255, out.r)),
    g: Math.max(0, Math.min(255, out.g)),
    b: Math.max(0, Math.min(255, out.b)),
  };
}

/**
 * Bands worth evaluating, with their deltas pre-divided.
 *
 * The pixel loop used to walk all eight bands for every pixel and recompute each
 * band's centre from a lookup. Hoisting the active bands and their scaled deltas
 * out of the loop removes that work entirely, and a band that is at zero simply
 * never appears.
 */
interface ActiveBand {
  center: number;
  hue: number;
  sat: number;
  lum: number;
}

function activeBands(set: HslSet): ActiveBand[] {
  const out: ActiveBand[] = [];
  for (const band of HSL_BANDS) {
    const adj = set[band.id];
    if (!adj) continue;
    const h = adj.h ?? 0;
    const s = adj.s ?? 0;
    const l = adj.l ?? 0;
    if (h === 0 && s === 0 && l === 0) continue;
    out.push({
      center: band.center,
      hue: (h / 100) * 30, // ±100 → ±30°, so a band cannot swallow its neighbour
      sat: s / 100,
      lum: (l / 100) * 0.35, // ±100 → ±0.35 luminance
    });
  }
  return out;
}

/**
 * Apply an HSL set to RGBA pixels in place.
 *
 * Fast path first, and it matters: this runs inside the per-frame grade, so a
 * slow implementation is not "a bit laggy", it is a preview that cannot play.
 * Measured on a 1280×720 buffer, the original per-pixel implementation took
 * ~280 ms for one band and ~460 ms for two — about four frames a second before
 * anything else ran. This version allocates nothing per pixel, indexes a
 * pre-baked weight table by the quantised hue, and inlines the HSL conversion.
 */
export function applyHsl(d: Uint8ClampedArray, set: HslSet) {
  const bands = activeBands(set);
  if (bands.length === 0) return;

  const nb = bands.length;
  const centers = new Float32Array(nb);
  const hues = new Float32Array(nb);
  const sats = new Float32Array(nb);
  const lums = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    centers[b] = bands[b].center;
    hues[b] = bands[b].hue;
    sats[b] = bands[b].sat;
    lums[b] = bands[b].lum;
  }

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b2 = d[i + 2];

    const rn = r / 255;
    const gn = g / 255;
    const bn = b2 / 255;
    const max = rn > gn ? (rn > bn ? rn : bn) : gn > bn ? gn : bn;
    const min = rn < gn ? (rn < bn ? rn : bn) : gn < bn ? gn : bn;
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta < 1e-9) continue; // grey: no hue to target

    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (s < 0.02) continue; // nearly grey: leave it alone

    let h: number;
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
    else h = ((rn - gn) / delta + 4) * 60;

    // Exact triangular weights, inlined. A baked 1°-step table was tried first
    // and rejected: at a band edge the weight is ~0.005, so quantising the hue
    // to a whole degree turned it into ~0.033 — a 6x error that a ±100% hue
    // rotation then amplified into a visible 5/255 shift on real pixels.
    // One pass over the bands, with the cheap rejection folded in.
    //
    // The previous shape computed each distance twice: once to decide whether
    // the pixel was anywhere near a band, then again to weight it. Most pixels
    // in a real frame sit between the bands a user adjusted, and for those the
    // HSL→RGB round trip below is pure waste — so the reject happens here, after
    // a couple of subtractions instead of a full colour conversion.
    let dH = 0;
    let sMul = 0;
    let dL = 0;
    let total = 0;
    for (let bi = 0; bi < nb; bi++) {
      let dd = h - centers[bi];
      if (dd < 0) dd = -dd;
      if (dd > 180) dd = 360 - dd;
      if (dd >= 30) continue; // outside this band entirely
      const w = 1 - dd / 30;
      dH += hues[bi] * w;
      sMul += sats[bi] * w;
      dL += lums[bi] * w;
      total += w;
    }
    if (total === 0) continue;

    const sOut = s * (1 + sMul);
    const lOut = l + dL;
    const ss = sOut < 0 ? 0 : sOut > 1 ? 1 : sOut;
    const ll = lOut < 0 ? 0 : lOut > 1 ? 1 : lOut;

    // Inline hsl→rgb: the three hue offsets share one interpolation routine.
    const hh = ((((h + dH) % 360) + 360) % 360) / 360;
    if (ss <= 0) {
      const v = ll * 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      continue;
    }
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    // hue2rgb inlined three times, unrolled by construction
    let t = hh + 1 / 3;
    if (t < 0) t += 1;
    else if (t > 1) t -= 1;
    d[i] =
      (t < 1 / 6
        ? p + (q - p) * 6 * t
        : t < 1 / 2
          ? q
          : t < 2 / 3
            ? p + (q - p) * (2 / 3 - t) * 6
            : p) * 255;
    t = hh;
    d[i + 1] =
      (t < 1 / 6
        ? p + (q - p) * 6 * t
        : t < 1 / 2
          ? q
          : t < 2 / 3
            ? p + (q - p) * (2 / 3 - t) * 6
            : p) * 255;
    t = hh - 1 / 3;
    if (t < 0) t += 1;
    else if (t > 1) t -= 1;
    d[i + 2] =
      (t < 1 / 6
        ? p + (q - p) * 6 * t
        : t < 1 / 2
          ? q
          : t < 2 / 3
            ? p + (q - p) * (2 / 3 - t) * 6
            : p) * 255;
  }
}
