/**
 * Multi-point property curves.
 *
 * The keyframe model stores a full `AnimValues` snapshot per keyframe, so one
 * graph can only ever describe ONE mixed value — x, y, scale, rotation and
 * opacity all move together or not at all. CapCut's graph editor is per
 * property: five independent curves you can shape separately. That needed a
 * different container, not a better editor.
 *
 * A property track is a list of points in *clip-local time*, and its value axis
 * is normalised to 0..1 so the graph looks the same for a volume swing and a
 * rotation spin. `PROPERTIES` carries the mapping to real units and the value to
 * fall back to when a property has no points at all.
 *
 * Interpolation reuses `curves.ts` (monotone cubic), which is already the
 * tone-curve path and already tested: a property curve is literally a curve
 * whose x axis is time instead of luminance.
 */
import { curveLut, type CurvePoint } from "./curves";
import type { MainClip, OverlayClip } from "./types";

/** Normalised value axis. Every property graph spans exactly 0..1. */
export type PropPoints = CurvePoint[];

/** Normalised values, keyed by property id. */
export type PropTracks = Record<string, PropPoints>;

export interface PropSpec {
  id: string;
  label: string;
  /** Real-value range that 0..1 maps onto. */
  min: number;
  max: number;
  unit?: string;
  /** Value used when a clip has no curve for this property. */
  fallback: (clip: MainClip | OverlayClip) => number;
  /** Which clip kinds can hold this property. */
  kinds: ("main" | "overlay")[];
}

const n = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);

/**
 * The properties that can be curved.
 *
 * Deliberately includes things `AnimValues` already carries (scale, rotation,
 * opacity): the point of a property graph is that these become *independent*, so
 * fading out no longer drags the position with it.
 */
export const PROPERTIES: PropSpec[] = [
  {
    id: "opacity",
    label: "Opacity",
    min: 0,
    max: 1,
    unit: "",
    kinds: ["main", "overlay"],
    fallback: () => 1,
  },
  {
    id: "scale",
    label: "Scale",
    min: 0,
    max: 3,
    unit: "x",
    kinds: ["main", "overlay"],
    fallback: (c) => n((c as OverlayClip).scale, 1),
  },
  {
    id: "rotation",
    label: "Rotation",
    min: -180,
    max: 180,
    unit: "°",
    kinds: ["main", "overlay"],
    fallback: (c) => n((c as OverlayClip).rot, 0),
  },
  {
    id: "x",
    label: "Position X",
    min: -1,
    max: 1,
    unit: "",
    kinds: ["main", "overlay"],
    fallback: (c) => n((c as OverlayClip).x, 0),
  },
  {
    id: "y",
    label: "Position Y",
    min: -1,
    max: 1,
    unit: "",
    kinds: ["main", "overlay"],
    fallback: (c) => n((c as OverlayClip).y, 0),
  },
  {
    id: "volume",
    label: "Volume",
    min: 0,
    max: 2,
    unit: "x",
    kinds: ["main", "overlay"],
    // volume may exceed 1 for loudness normalisation, so the graph's ceiling is
    // 2x rather than unity
    fallback: (c) => n(c.volume, 1),
  },
  {
    id: "brightness",
    label: "Brightness",
    min: 0,
    max: 200,
    unit: "%",
    kinds: ["main", "overlay"],
    fallback: (c) => n(c.adjust?.brightness, 100),
  },
  {
    id: "contrast",
    label: "Contrast",
    min: 0,
    max: 200,
    unit: "%",
    kinds: ["main", "overlay"],
    fallback: (c) => n(c.adjust?.contrast, 100),
  },
  {
    id: "saturation",
    label: "Saturation",
    min: 0,
    max: 200,
    unit: "%",
    kinds: ["main", "overlay"],
    fallback: (c) => n(c.adjust?.saturation, 100),
  },
];

export const PROPERTY_BY_ID = new Map(PROPERTIES.map((p) => [p.id, p]));

export function propertiesFor(kind: "main" | "overlay"): PropSpec[] {
  return PROPERTIES.filter((p) => p.kinds.includes(kind));
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A curve needs a start, an end, and points in between — anything less is noise. */
export function tracksActive(tracks: PropTracks | undefined): boolean {
  if (!tracks) return false;
  return Object.values(tracks).some((pts) => Array.isArray(pts) && pts.length >= 2);
}

/** Sort, clamp and de-duplicate on the time axis. Returns null when degenerate. */
export function normalisePropPoints(pts: PropPoints | undefined): PropPoints | null {
  if (!pts || !Array.isArray(pts)) return null;
  const clean = pts
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);
  const out: PropPoints = [];
  for (const p of clean) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 0.004) out[out.length - 1] = p;
    else out.push(p);
  }
  if (out.length < 2) return null;
  return out;
}

/**
 * Value of one property at clip-local time `local`, in REAL units.
 *
 * `local` is in seconds; a project duration of 0 would make the fraction
 * undefined, so the curve is treated as holding its first point. A property with
 * no curve returns the clip's own value, which means adding a graph never
 * silently changes the edit.
 */
export function propValueAt(
  clip: MainClip | OverlayClip,
  prop: string,
  local: number,
  spanDur: number,
): number {
  const spec = PROPERTY_BY_ID.get(prop);
  if (!spec) return 0;
  const base = spec.fallback(clip);
  const pts = normalisePropPoints(clip.propCurves?.[prop]);
  if (!pts || !(spanDur > 0)) return base;
  const u = clamp01(local / spanDur);
  // same monotone interpolation the tone-curve editor uses
  const lut = curveLut(pts);
  const v01 = lut[Math.round(u * 255)] / 255;
  const real = spec.min + v01 * (spec.max - spec.min);
  // Never hand out a NaN: a bad point would otherwise reach the gain node or the
  // canvas transform.
  return Number.isFinite(real) ? real : base;
}

/** Inverse of propValueAt: where a real value sits on the normalised axis. */
export function propToUnit(spec: PropSpec, value: number): number {
  if (spec.max === spec.min) return 0;
  return clamp01((value - spec.min) / (spec.max - spec.min));
}

/** Forward: normalised axis back to real units. */
export function unitToProp(spec: PropSpec, unit: number): number {
  return spec.min + clamp01(unit) * (spec.max - spec.min);
}

/** A default two-point curve that starts flat at the clip's current value. */
export function seedCurve(spec: PropSpec, clip: MainClip | OverlayClip): PropPoints {
  const u = propToUnit(spec, spec.fallback(clip));
  return [
    { x: 0, y: u },
    { x: 1, y: u },
  ];
}

/**
 * Resolve an overlay's animation values through its property curves.
 *
 * Pulled out of the renderer so it can be asserted directly: the overlay path
 * is where curves were silently ignored, and a source-regex cannot show that the
 * numbers are right.
 *
 * Two rules that are easy to get wrong and are tested:
 *  · an overlay's `scale` is a FRACTION of the frame (a sticker is 0.5, not 1),
 *    so a scale curve is a multiplier on it — assigning the curve's absolute
 *    value would snap every sticker to the same size;
 *  · `x`/`y`/`rotation`/`opacity` map straight onto the anim fields.
 */
export function applyOverlayCurves(
  clip: MainClip | OverlayClip,
  anim: { x: number; y: number; scale: number; rotation: number; opacity: number },
  local: number,
): { x: number; y: number; scale: number; rotation: number; opacity: number } {
  const curves = clip.propCurves;
  if (!curves) return anim;
  const dur = (clip as OverlayClip).duration ?? 0;
  const out = { ...anim };
  if (curves.x) out.x = propValueAt(clip, "x", local, dur);
  if (curves.y) out.y = propValueAt(clip, "y", local, dur);
  if (curves.rotation) out.rotation = propValueAt(clip, "rotation", local, dur);
  if (curves.opacity) out.opacity = propValueAt(clip, "opacity", local, dur);
  if (curves.scale) {
    const own = Number.isFinite((clip as OverlayClip).scale)
      ? ((clip as OverlayClip).scale as number)
      : 1;
    const curved = propValueAt(clip, "scale", local, dur);
    out.scale = own > 0 ? anim.scale * (curved / own) : curved;
  }
  return out;
}

/** Format a real value for the graph's readout. */
export function fmtProp(spec: PropSpec, value: number): string {
  const decimals = spec.max - spec.min > 20 ? 0 : 2;
  return `${value.toFixed(decimals)}${spec.unit ?? ""}`;
}

/** Human label for a property, for toasts and tooltips. */
export function propLabel(id: string): string {
  return PROPERTY_BY_ID.get(id)?.label ?? id;
}
