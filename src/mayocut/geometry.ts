// MayoCut — geometry: how a source fills the frame.
//
// Both CapCut and Kdenlive treat this as first-class. Kdenlive calls it Transform
// (position, scale, rotate, crop on any clip); CapCut calls it Crop and Frame,
// with aspect presets and a draggable crop box. This editor had a three-way
// `fit` toggle — cover / contain / blur — and nothing else, so a portrait clip
// shot for TikTok could only ever be cropped by CENTRE. That is exactly the crop
// that cuts a subject's head off when they sit off-centre.
//
// The maths lives here rather than in the renderer so it can be tested: one
// sign error here silently shifts every exported frame.
//
// Vocabulary, because getting it backwards is how crop features ship wrong:
//
//   anchor   where the crop WINDOW sits on the source, each axis 0..1.
//            0.5/0.5 is the old behaviour (centred). 0.2 says "show more of the
//            left", so the subject moves right in the frame.
//   crop     the window's shape, as an aspect ratio (null = follow the frame).
//   zoom     tightness. 1 shows as much as the crop allows; 2 is half as much.
//   rot      degrees about the frame centre, applied after the crop.
//
// A uniform zoom cannot change an aspect ratio — it shrinks both axes equally —
// so `crop` and `zoom` are deliberately separate. Folding them together is the
// classic bug where picking "9:16" quietly does nothing.

/** Everything needed to place a source inside the output frame. */
export interface FrameGeometry {
  /** crop-window centre on the source, 0..1 per axis (0.5 = centred) */
  ax: number;
  ay: number;
  /** window aspect (width/height); null = the frame's own aspect */
  crop?: number | null;
  /** tightness within the crop, 1 = whole window, up to MAX_ZOOM */
  zoom: number;
  /** rotation in degrees, applied about the frame centre */
  rot: number;
}

export const DEFAULT_GEOMETRY: FrameGeometry = { ax: 0.5, ay: 0.5, zoom: 1, rot: 0 };

/** Past 8x the source pixels are gone and the preview is just mush. */
export const MAX_ZOOM = 8;

export function clampGeometry(g: Partial<FrameGeometry> | undefined): FrameGeometry {
  const ax = Number.isFinite(g?.ax) ? (g!.ax as number) : 0.5;
  const ay = Number.isFinite(g?.ay) ? (g!.ay as number) : 0.5;
  const zoom = Number.isFinite(g?.zoom) ? (g!.zoom as number) : 1;
  const rot = Number.isFinite(g?.rot) ? (g!.rot as number) : 0;
  const crop = g?.crop;
  return {
    ax: Math.max(0, Math.min(1, ax)),
    ay: Math.max(0, Math.min(1, ay)),
    crop: typeof crop === "number" && Number.isFinite(crop) && crop > 0 ? crop : null,
    zoom: Math.max(1, Math.min(MAX_ZOOM, zoom)),
    // wrap rather than clamp: a person spinning a dial past 180 expects to keep
    // going, not to hit a wall
    rot: ((((rot + 180) % 360) + 360) % 360) - 180,
  };
}

export function isDefaultGeometry(g: Partial<FrameGeometry> | undefined): boolean {
  if (!g) return true;
  const c = clampGeometry(g);
  return c.ax === 0.5 && c.ay === 0.5 && c.zoom === 1 && c.rot === 0 && c.crop === null;
}

/**
 * The source rectangle to read, for a cover fit under this geometry.
 *
 * Returning a SOURCE rect (rather than a transform) keeps the renderer honest:
 * the destination is always the full frame, so no amount of cropping can draw
 * outside it.
 *
 * Three steps, in this order, and the order matters:
 *   1. the cover window — the largest source region with the frame's aspect
 *   2. shrink ONE axis to reach the requested crop aspect (never both)
 *   3. divide by zoom, then place the window by anchor and bound it to the source
 */
export function coverSourceRect(
  sw: number,
  sh: number,
  frameW: number,
  frameH: number,
  g: Partial<FrameGeometry> | undefined,
): { sx: number; sy: number; swp: number; shp: number } {
  const c = clampGeometry(g);
  if (!sw || !sh || !frameW || !frameH) return { sx: 0, sy: 0, swp: sw, shp: sh };

  // 1. cover window in source pixels
  const cover = Math.max(frameW / sw, frameH / sh);
  let w = frameW / cover;
  let h = frameH / cover;

  // 2. crop to the requested aspect by shrinking exactly one axis
  if (c.crop) {
    const windowAspect = w / h;
    if (c.crop < windowAspect) {
      // want a narrower window: keep the height, cut the width
      w = h * c.crop;
    } else if (c.crop > windowAspect) {
      // want a wider window: keep the width, cut the height
      h = w / c.crop;
    }
  }

  // 3. tighten, never past the source
  w = Math.max(1, w / c.zoom);
  h = Math.max(1, h / c.zoom);
  w = Math.min(w, sw);
  h = Math.min(h, sh);

  // place the window by anchor, then clamp it inside the source
  const maxX = Math.max(0, sw - w);
  const maxY = Math.max(0, sh - h);
  const sx = Math.max(0, Math.min(maxX, c.ax * sw - w / 2));
  const sy = Math.max(0, Math.min(maxY, c.ay * sh - h / 2));
  return { sx, sy, swp: w, shp: h };
}

/**
 * Convert a drag in FRAME pixels into an anchor change.
 *
 * Dragging right on the preview should move the picture right, which means the
 * crop window moves LEFT across the source — the inverse. Sign errors here are
 * the classic crop bug ("it moves the wrong way"), so the inversion lives in one
 * tested place instead of being re-derived at every call site.
 */
export function anchorFromDrag(
  start: Partial<FrameGeometry>,
  dxPx: number,
  dyPx: number,
  frameW: number,
  frameH: number,
  sw: number,
  sh: number,
  g?: Partial<FrameGeometry>,
): { ax: number; ay: number } {
  const c = clampGeometry(g ?? start);
  const rect = coverSourceRect(sw, sh, frameW, frameH, c);
  // frame pixels → source pixels: the window maps onto the whole frame
  const perPxX = rect.swp / Math.max(1, frameW);
  const perPxY = rect.shp / Math.max(1, frameH);
  const nextAx = c.ax - (dxPx * perPxX) / Math.max(1, sw);
  const nextAy = c.ay - (dyPx * perPxY) / Math.max(1, sh);
  return {
    ax: Math.max(0, Math.min(1, nextAx)),
    ay: Math.max(0, Math.min(1, nextAy)),
  };
}

/**
 * The zoom that fills the frame with the crop aspect.
 *
 * When you pick 9:16 on a landscape clip, the window becomes a tall slice of it.
 * Drawn "contain" into the frame, that slice would letterbox — but a crop should
 * NOT letterbox, it should fill. So the caller needs the extra zoom that makes
 * the cropped window cover the frame again. This returns it, and 1 when the crop
 * aspect already matches the frame.
 */
export function fillZoomForCrop(cropAspect: number | null, frameAspect: number): number {
  if (!cropAspect || cropAspect <= 0 || frameAspect <= 0) return 1;
  const r = cropAspect / frameAspect;
  return r >= 1 ? r : 1 / r;
}

/** Aspect presets, the ones CapCut's crop panel shows. */
export interface CropPreset {
  id: string;
  name: string;
  /** null = follow the frame; 0 = the source's own aspect */
  aspect: number | null;
}

export const CROP_PRESETS: CropPreset[] = [
  { id: "free", name: "Free", aspect: null },
  { id: "original", name: "Original", aspect: 0 },
  { id: "1:1", name: "1:1", aspect: 1 },
  { id: "4:5", name: "4:5", aspect: 4 / 5 },
  { id: "9:16", name: "9:16", aspect: 9 / 16 },
  { id: "3:4", name: "3:4", aspect: 3 / 4 },
  { id: "16:9", name: "16:9", aspect: 16 / 9 },
  { id: "4:3", name: "4:3", aspect: 4 / 3 },
  { id: "21:9", name: "21:9", aspect: 21 / 9 },
];

/** Resolve a preset to a concrete aspect, given the source's own aspect. */
export function presetAspect(preset: CropPreset, sourceAspect: number): number | null {
  if (preset.aspect === null) return null;
  if (preset.aspect === 0) return sourceAspect > 0 ? sourceAspect : null;
  return preset.aspect;
}
