// MayoCut — core data model.
// Everything lives on the user's device (IndexedDB). No database, no backend.

export type MediaKind = "video" | "image" | "audio";

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  size: number; // bytes
  createdAt: number;
  duration?: number; // seconds (video/audio)
  width?: number;
  height?: number;
  thumb?: string; // dataURL, small
  wave?: number[]; // ~128 normalized amplitude bins (audio display)
  rms?: number; // overall root-mean-square level 0..1 (audio)
}

export interface FilterAdjust {
  brightness: number; // 100 = neutral
  contrast: number; // 100
  saturation: number; // 100
  hue: number; // 0 degrees
}

export const DEFAULT_ADJUST: FilterAdjust = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };

export type TransitionKind = "none" | "crossfade" | "fadeblack";

/**
 * Animation values that can be keyframed on a clip (all clips).
 * x / y are fractions of the canvas (-1..1), scale 0.2..2 (1 = neutral),
 * rotation in degrees, opacity 0..1.
 */
export interface AnimValues {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export const DEFAULT_ANIM: AnimValues = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

/** A keyframe: full animation snapshot at clip-local timeline seconds. */
export interface Keyframe {
  at: number; // seconds relative to the clip start
  v: AnimValues;
}

export interface MainClip {
  id: string;
  mediaId: string;
  in: number; // source in-point (seconds)
  out: number; // source out-point (seconds)
  speed: number; // 0.25 .. 4
  reverse: boolean; // play the source segment backwards (audio muted)
  filter: string; // preset id
  adjust: FilterAdjust;
  volume: number; // 0..1
  muted: boolean;
  transitionIn: TransitionKind;
  transitionDur: number; // seconds
  keyframes?: Keyframe[];
}

export type OverlayKind = "text" | "image" | "video" | "audio";
export type TextPos = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export type TextAnim = "none" | "fade" | "slideup";

export interface OverlayClip {
  id: string;
  kind: OverlayKind;
  mediaId?: string; // image / video / audio
  start: number; // timeline seconds
  duration: number;
  // text
  text?: string;
  size?: number; // px at 1080 reference height
  color?: string;
  bg?: string; // css color or "" for none
  bold?: boolean;
  pos?: TextPos;
  anim?: TextAnim;
  // image / video overlay
  scale?: number; // fraction of canvas width (0.05..1.2)
  x?: number; // -1..1 fraction of center
  y?: number;
  rot?: number; // degrees
  chroma?: boolean; // green-screen keying (video/image overlays)
  chromaTol?: number; // key tolerance 10..255 (default 90)
  // audio
  volume?: number; // 0..1
  fadeIn?: number; // seconds (default 0.15)
  fadeOut?: number; // seconds (default 0.15)
  filter?: string;
  keyframes?: Keyframe[];
}

export interface OverlayTrack {
  id: string;
  name: string;
  clips: OverlayClip[];
}

export type AspectId = "9:16" | "1:1" | "4:5" | "16:9";

export const ASPECTS: Record<AspectId, { w: number; h: number; label: string }> = {
  "9:16": { w: 1080, h: 1920, label: "9:16 · Reels/Shorts" },
  "1:1": { w: 1080, h: 1080, label: "1:1 · Square" },
  "4:5": { w: 1080, h: 1350, label: "4:5 · Feed" },
  "16:9": { w: 1920, h: 1080, label: "16:9 · YouTube" },
};

export interface Project {
  id: string;
  name: string;
  aspect: AspectId;
  main: MainClip[];
  tracks: OverlayTrack[]; // fixed 3: text, overlay, audio
  createdAt: number;
  updatedAt: number;
  thumb?: string; // dataURL
  sourceTemplate?: string; // template name when created from a template
  missingMedia?: string[]; // media ids still unmatched after template remap
}

export interface UserTemplate {
  id: string;
  name: string;
  desc: string;
  aspect: AspectId;
  createdAt: number;
  project?: Project; // serialized project (kind "project"); media remapped by file name on open
  thumb?: string; // dataURL
  // --- pack extension (v0.2) ---
  kind?: "project" | "enhance"; // default "project"
  packName?: string; // originating template pack
  swatch?: string; // css gradient for the gallery card
  enhance?: EnhanceOp[]; // declarative ops applied to a chosen project (kind "enhance")
}

// ---------------------------------------------------------------------------
// Template packs (v0.2) — shareable JSON, no media blobs, fully offline.
// ---------------------------------------------------------------------------

export type EnhanceOp =
  | { op: "aspect"; value: AspectId }
  | { op: "filter"; value: string } // apply preset to every main clip
  | { op: "adjust"; value: Partial<FilterAdjust> } // merge into every main clip
  | { op: "transition"; value: TransitionKind; dur: number } // every clip after the first
  | { op: "add-text"; track: "t_text"; clip: Omit<OverlayClip, "id"> }
  | { op: "speed"; value: number }; // every main clip

export interface PackTemplate {
  id: string;
  name: string;
  desc: string;
  aspect: AspectId;
  swatch?: string;
  kind: "project" | "enhance";
  project?: Project; // for kind "project" (media matched by file name on open)
  enhance?: EnhanceOp[]; // for kind "enhance"
}

export interface TemplatePack {
  format: "mayocut-pack";
  version: 1;
  name: string;
  desc: string;
  templates: PackTemplate[];
}

export interface ExportItem {
  id: string;
  name: string;
  size: number;
  createdAt: number;
  mime: string;
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyTracks(): OverlayTrack[] {
  return [
    { id: "t_text", name: "Text", clips: [] },
    { id: "t_overlay", name: "Overlay", clips: [] },
    { id: "t_audio", name: "Audio", clips: [] },
  ];
}

export function newProject(name: string, aspect: AspectId): Project {
  const now = Date.now();
  return {
    id: uid("prj"),
    name,
    aspect,
    main: [],
    tracks: emptyTracks(),
    createdAt: now,
    updatedAt: now,
  };
}

export function mainClipDuration(c: MainClip): number {
  return Math.max(0, (c.out - c.in) / c.speed);
}

/** Sequential spans of main-track clips in timeline seconds. */
export function mainSpans(project: Project): { clip: MainClip; start: number; end: number }[] {
  let t = 0;
  return project.main.map((clip) => {
    const dur = mainClipDuration(clip);
    const span = { clip, start: t, end: t + dur };
    t += dur;
    return span;
  });
}

export function projectDuration(project: Project): number {
  const spans = mainSpans(project);
  let end = spans.length ? spans[spans.length - 1].end : 0;
  for (const tr of project.tracks)
    for (const c of tr.clips) end = Math.max(end, c.start + c.duration);
  return end;
}
