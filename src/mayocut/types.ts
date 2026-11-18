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
  isGif?: boolean; // animated sticker (frames decoded from the stored blob)
  gifFrames?: number;
  denoised?: boolean; // audio processed by the RNNoise denoise batch
  unplayable?: boolean; // video track can't be decoded on this device (codec)
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

/** Built-in motion effects applied to a main clip (deterministic, offline). */
export type EffectId =
  | "none"
  | "zoom-pulse"
  | "heartbeat"
  | "shake"
  | "spin"
  | "glitch"
  | "flash-in"
  | "blur-in"
  | "vhs";

export const EFFECTS: { id: EffectId; name: string }[] = [
  { id: "none", name: "None" },
  { id: "zoom-pulse", name: "Zoom pulse" },
  { id: "heartbeat", name: "Heartbeat" },
  { id: "shake", name: "Shake" },
  { id: "spin", name: "Spin" },
  { id: "glitch", name: "Glitch" },
  { id: "flash-in", name: "Flash in" },
  { id: "blur-in", name: "Blur in" },
  { id: "vhs", name: "VHS" },
];

export interface MainClip {
  id: string;
  mediaId: string;
  in: number; // source in-point (seconds)
  out: number; // source out-point (seconds)
  speed: number; // 0.25 .. 4
  rampTo?: number; // optional: linearly ramp speed → rampTo across the clip (speed ramp)
  reverse: boolean; // play the source segment backwards (audio muted)
  filter: string; // preset id
  lut?: string; // LUT name (built-in or imported .cube)
  effect?: EffectId; // motion effect
  adjust: FilterAdjust;
  volume: number; // 0..1
  muted: boolean;
  transitionIn: TransitionKind;
  transitionDur: number; // seconds
  keyframes?: Keyframe[];
}

export type OverlayKind = "text" | "image" | "video" | "audio";
export type TextPos = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export type TextAnim =
  | "none"
  | "fade"
  | "slideup"
  | "typewriter"
  | "karaoke"
  | "bounce"
  | "kenburns"
  | "neon";

export const TEXT_ANIMS: { id: TextAnim; name: string }[] = [
  { id: "none", name: "None" },
  { id: "fade", name: "Fade" },
  { id: "slideup", name: "Slide up" },
  { id: "typewriter", name: "Typewriter" },
  { id: "karaoke", name: "Karaoke" },
  { id: "bounce", name: "Bounce in" },
  { id: "kenburns", name: "Ken Burns" },
  { id: "neon", name: "Neon pulse" },
];

/** Text fonts — built from font stacks present on Android, iOS and desktop,
 *  so exports look the same on every device (no font downloads needed). */
export const FONTS: { id: string; name: string; css: string }[] = [
  { id: "system", name: "Modern (default)", css: '"Inter", "Segoe UI", system-ui, sans-serif' },
  { id: "serif", name: "Classic serif", css: 'Georgia, "Times New Roman", serif' },
  { id: "condensed", name: "Condensed", css: '"Arial Narrow", "Roboto Condensed", sans-serif' },
  { id: "slab", name: "Slab", css: 'Rockwell, "Roboto Slab", "Courier New", serif' },
  { id: "impact", name: "Impact (loud)", css: 'Impact, "Arial Black", sans-serif' },
  { id: "mono", name: "Typewriter mono", css: '"SF Mono", ui-monospace, "Roboto Mono", monospace' },
  { id: "script", name: "Script (handwritten)", css: '"Brush Script MT", "Segoe Script", cursive' },
  { id: "rounded", name: "Rounded (casual)", css: '"Comic Sans MS", "Comic Neue", cursive' },
  { id: "elegant", name: "Elegant", css: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  { id: "fancy", name: "Fancy (blackletter)", css: '"Old English Text MT", "UnifrakturMaguntia", serif' },
];

export function fontCss(id?: string): string {
  return FONTS.find((f) => f.id === id)?.css ?? FONTS[0].css;
}

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "lighten"
  | "darken"
  | "difference";

export type MaskShape = "none" | "spotlight" | "bar" | "line";

/** Word-level timing for karaoke text (clip-local seconds). */
export interface TextWord {
  t: number; // start of the word (clip-local)
  text: string;
}

/** Audio FX for an overlay audio clip (WebAudio, also applied in export). */
export interface AudioFx {
  reverb?: number; // 0..1 wet amount
  echo?: number; // 0..1 wet amount
  pitch?: number; // semitones, -12..+12 (clips ≤ 120 s)
}

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
  font?: string; // FONTS id
  pos?: TextPos;
  anim?: TextAnim;
  words?: TextWord[]; // per-word timing (karaoke)
  // image / video overlay
  scale?: number; // fraction of canvas width (0.05..1.2)
  x?: number; // -1..1 fraction of center
  y?: number;
  rot?: number; // degrees
  chroma?: boolean; // green-screen keying (video/image overlays)
  chromaTol?: number; // key tolerance 10..255 (default 90)
  blend?: BlendMode; // compositing mode for image/video overlays
  mask?: MaskShape; // shape mask (spotlight / bar / line)
  // audio
  volume?: number; // 0..1
  fadeIn?: number; // seconds (default 0.15)
  fadeOut?: number; // seconds (default 0.15)
  fx?: AudioFx; // reverb / echo / pitch
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
  const L = Math.max(0, c.out - c.in);
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  if (Math.abs(v1 - v0) < 1e-6) return L / v0;
  // ∫₀ᴸ ds / (v0 + k·s) with k = (v1−v0)/L  →  L·ln(v1/v0)/(v1−v0)
  return (L / (v1 - v0)) * Math.log(v1 / v0);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Source position for clip-local timeline time (handles reverse and speed
 * ramp). Inverse of the duration integral — closed form.
 */
export function mainSrcAt(c: MainClip, localT: number): number {
  const L = Math.max(1e-6, c.out - c.in);
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  const dur = mainClipDuration(c);
  const tau = clamp(localT, 0, dur);
  const k = (v1 - v0) / L;
  let x: number; // forward source offset from `in`
  if (Math.abs(k) < 1e-9) x = tau * v0;
  else x = (v0 / k) * (Math.exp(k * tau) - 1);
  x = clamp(x, 0, L);
  return c.reverse ? c.out - x : c.in + x;
}

/** Playback rate to apply to the media element at clip-local time. */
export function mainRateAt(c: MainClip, localT: number): number {
  const L = Math.max(1e-6, c.out - c.in);
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  const k = (v1 - v0) / L;
  const src = mainSrcAt(c, localT);
  const x = c.reverse ? c.out - src : src - c.in;
  return Math.max(0.05, v0 + k * x);
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
