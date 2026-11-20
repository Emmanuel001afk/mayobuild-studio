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
  unplayable?: boolean; // source media cannot be decoded on this device
  codecHint?: string; // best-effort codec identifier read from the container header
}

export interface FilterAdjust {
  brightness: number; // 100 = neutral
  contrast: number; // 100
  saturation: number; // 100
  hue: number; // 0 degrees
  /** warmth: -100 (cold/blue) .. 100 (warm/amber) — CapCut's "temperature" */
  temperature?: number;
  /** green↔magenta axis: -100 (green) .. 100 (magenta) — CapCut's "tint" */
  tint?: number;
  /** 0..100 — lifts the black point, film-style matte fade */
  fade?: number;
  /** 0..100 — unsharp-mask amount */
  sharpen?: number;
  /** 0..100 — corner darkening */
  vignette?: number;
  /** 0..100 — split-tone teal shadows / orange highlights */
  splitTone?: number;
}

export const DEFAULT_ADJUST: FilterAdjust = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  temperature: 0,
  tint: 0,
  fade: 0,
  sharpen: 0,
  vignette: 0,
  splitTone: 0,
};

export type TransitionKind =
  | "none"
  | "crossfade"
  | "fadeblack"
  | "fadewhite"
  | "slideleft"
  | "slideright"
  | "slideup"
  | "slidedown"
  | "wipeleft"
  | "wiperight"
  | "wipeup"
  | "wipedown"
  | "zoom"
  | "blur"
  // --- additional families -------------------------------------------------
  | "wipeleftsoft"
  | "wiperightsoft"
  | "wipeupsoft"
  | "wipedownsoft"
  /** diagonal push: B enters from bottom-right, A exits top-left */
  | "slide";

/** Transition families used to group the picker into tabs. */
export type TransitionFamily = "basic" | "slide" | "wipe" | "zoom";

export const TRANSITION_FAMILY: Record<TransitionKind, TransitionFamily> = {
  none: "basic",
  crossfade: "basic",
  fadeblack: "basic",
  fadewhite: "basic",
  slideleft: "slide",
  slideright: "slide",
  slideup: "slide",
  slidedown: "slide",
  slide: "slide",
  wipeleft: "wipe",
  wiperight: "wipe",
  wipeup: "wipe",
  wipedown: "wipe",
  wipeleftsoft: "wipe",
  wiperightsoft: "wipe",
  wipeupsoft: "wipe",
  wipedownsoft: "wipe",
  zoom: "zoom",
  blur: "zoom",
};

/** Hard-edged or feathered wipe direction, or null when not a wipe. */
export function wipeDir(
  kind: TransitionKind,
): { dir: "left" | "right" | "up" | "down"; soft: boolean } | null {
  switch (kind) {
    case "wipeleft":
      return { dir: "left", soft: false };
    case "wiperight":
      return { dir: "right", soft: false };
    case "wipeup":
      return { dir: "up", soft: false };
    case "wipedown":
      return { dir: "down", soft: false };
    case "wipeleftsoft":
      return { dir: "left", soft: true };
    case "wiperightsoft":
      return { dir: "right", soft: true };
    case "wipeupsoft":
      return { dir: "up", soft: true };
    case "wipedownsoft":
      return { dir: "down", soft: true };
    default:
      return null;
  }
}

export const TRANSITIONS: { id: TransitionKind; name: string }[] = [
  { id: "none", name: "None" },
  { id: "crossfade", name: "Crossfade" },
  { id: "fadeblack", name: "Dip to black" },
  { id: "fadewhite", name: "Dip to white" },
  { id: "slideleft", name: "Push left" },
  { id: "slideright", name: "Push right" },
  { id: "slideup", name: "Push up" },
  { id: "slidedown", name: "Push down" },
  { id: "slide", name: "Diagonal push" },
  { id: "wipeleft", name: "Wipe left" },
  { id: "wiperight", name: "Wipe right" },
  { id: "wipeup", name: "Wipe up" },
  { id: "wipedown", name: "Wipe down" },
  { id: "wipeleftsoft", name: "Soft wipe left" },
  { id: "wiperightsoft", name: "Soft wipe right" },
  { id: "wipeupsoft", name: "Soft wipe up" },
  { id: "wipedownsoft", name: "Soft wipe down" },
  { id: "zoom", name: "Zoom punch" },
  { id: "blur", name: "Blur dissolve" },
];

export function isDipTo(kind: TransitionKind): "black" | "white" | null {
  if (kind === "fadeblack") return "black";
  if (kind === "fadewhite") return "white";
  return null;
}

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
  | "vhs"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "tilt-up"
  | "kenburns"
  | "pulse-color"
  | "sway"
  // --- second wave -------------------------------------------------------
  | "tilt-down"
  | "roll"
  | "float"
  | "breathe"
  | "jitter"
  | "whip-left"
  | "whip-right"
  | "dolly-in"
  | "dolly-out"
  | "tilt-shift"
  | "earthquake"
  | "orbit";

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
  { id: "zoom-out", name: "Zoom out" },
  { id: "pan-left", name: "Pan left" },
  { id: "pan-right", name: "Pan right" },
  { id: "tilt-up", name: "Tilt up" },
  { id: "kenburns", name: "Ken Burns (slow drift)" },
  { id: "pulse-color", name: "Color pulse" },
  { id: "sway", name: "Sway" },
  { id: "tilt-down", name: "Tilt down" },
  { id: "roll", name: "Roll" },
  { id: "float", name: "Float" },
  { id: "breathe", name: "Breathe" },
  { id: "jitter", name: "Jitter" },
  { id: "whip-left", name: "Whip pan left" },
  { id: "whip-right", name: "Whip pan right" },
  { id: "dolly-in", name: "Dolly in" },
  { id: "dolly-out", name: "Dolly out" },
  { id: "tilt-shift", name: "Tilt shift" },
  { id: "earthquake", name: "Earthquake" },
  { id: "orbit", name: "Orbit" },
];

/** Effect grouping for the Effects tab. */
export type EffectFamily = "camera" | "motion" | "impact" | "retro";

export const EFFECT_FAMILY: Record<EffectId, EffectFamily> = {
  none: "camera",
  "zoom-pulse": "motion",
  heartbeat: "motion",
  shake: "impact",
  spin: "camera",
  glitch: "retro",
  "flash-in": "impact",
  "blur-in": "camera",
  vhs: "retro",
  "zoom-out": "camera",
  "pan-left": "camera",
  "pan-right": "camera",
  "tilt-up": "camera",
  kenburns: "camera",
  "pulse-color": "retro",
  sway: "motion",
  "tilt-down": "camera",
  roll: "camera",
  float: "motion",
  breathe: "motion",
  jitter: "impact",
  "whip-left": "camera",
  "whip-right": "camera",
  "dolly-in": "camera",
  "dolly-out": "camera",
  "tilt-shift": "retro",
  earthquake: "impact",
  orbit: "camera",
};

/**
 * A drawable speed curve point. `at` is normalised position through the source
 * segment (0..1), `v` is the playback speed there. Points are sorted by `at`;
 * the curve is linearly interpolated between them.
 */
export interface SpeedPoint {
  at: number; // 0..1 through the clip's source range
  v: number; // speed multiplier at that point
}

export interface MainClip {
  id: string;
  mediaId: string;
  in: number; // source in-point (seconds)
  out: number; // source out-point (seconds)
  speed: number; // 0.25 .. 4
  rampTo?: number; // optional: linearly ramp speed → rampTo across the clip (speed ramp)
  /** drawable multi-point speed curve; overrides `speed` / `rampTo` when ≥2 points */
  curve?: SpeedPoint[];
  reverse: boolean; // play the source segment backwards (audio muted)
  /** frozen frame: the source position is fixed at `in` and the clip holds it */
  freeze?: boolean;
  filter: string; // preset id
  lut?: string; // LUT name (built-in or imported .cube)
  effect?: EffectId; // motion effect
  adjust: FilterAdjust;
  volume: number; // 0..1
  muted: boolean;
  transitionIn: TransitionKind;
  transitionDur: number; // seconds
  keyframes?: Keyframe[];
  /** how the source fills the canvas: cover (crop), contain (letterbox), blur-fill */
  fit?: FrameFit;
  flipX?: boolean;
  flipY?: boolean;
  /** equaliser-style voice shaping, dB-ish -1..1 offsets */
  voice?: VoiceShape;
}

export type FrameFit = "cover" | "contain" | "blur";

/** Cheap treble/bass/mid shaping applied per clip (biquad chain in WebAudio). */
export interface VoiceShape {
  low?: number; // -1..1 low shelf gain
  mid?: number; // -1..1 peaking gain
  high?: number; // -1..1 high shelf gain
}

export type OverlayKind = "text" | "image" | "video" | "audio";
export type TextPos = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
export type TextAnim =
  | "none"
  | "fade"
  | "slideup"
  | "slideleft"
  | "typewriter"
  | "karaoke"
  | "bounce"
  | "kenburns"
  | "neon"
  | "zoom-in"
  | "rise"
  | "wipe-in"
  // --- second wave -------------------------------------------------------
  | "pop"
  | "drop-in"
  | "swing"
  | "blur-in"
  | "tracking-in"
  | "flip"
  | "skew-in"
  | "wave";

export const TEXT_ANIMS: { id: TextAnim; name: string }[] = [
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
  { id: "wipe-in", name: "Wipe in" },
  { id: "pop", name: "Pop" },
  { id: "drop-in", name: "Drop in" },
  { id: "swing", name: "Swing" },
  { id: "blur-in", name: "Blur in" },
  { id: "tracking-in", name: "Tracking in" },
  { id: "flip", name: "Flip in" },
  { id: "skew-in", name: "Skew in" },
  { id: "wave", name: "Wave" },
];

/** Text animation grouping for the Animation picker. */
export type TextAnimFamily = "in" | "loop" | "kinetic" | "style";

export const TEXT_ANIM_FAMILY: Record<TextAnim, TextAnimFamily> = {
  none: "in",
  fade: "in",
  slideup: "in",
  slideleft: "in",
  bounce: "in",
  "zoom-in": "in",
  rise: "in",
  "wipe-in": "in",
  pop: "in",
  "drop-in": "in",
  "blur-in": "in",
  flip: "in",
  "skew-in": "in",
  swing: "in",
  kenburns: "loop",
  neon: "loop",
  wave: "loop",
  typewriter: "kinetic",
  karaoke: "kinetic",
  "tracking-in": "kinetic",
};

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
  {
    id: "fancy",
    name: "Fancy (blackletter)",
    css: '"Old English Text MT", "UnifrakturMaguntia", serif',
  },
];

/**
 * One-tap text looks (CapCut's "text styles"). Each is a pure patch on the
 * text clip, so applying another one never leaves stray settings behind.
 */
export const TEXT_PRESETS: { name: string; patch: Partial<OverlayClip> }[] = [
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
      italic: false,
    },
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
      tracking: 0,
    },
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
      tracking: 2,
    },
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
      tracking: 3,
    },
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
      anim: "rise",
    },
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
      anim: "bounce",
    },
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
      size: 84,
    },
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
      shadow: 0.3,
    },
  },
  {
    name: "Underline key",
    patch: { color: "#ffffff", bg: "", bold: true, underline: true, stroke: 0, anim: "slideup" },
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
      size: 44,
    },
  },
  // --- second wave: social-native looks (CapCut sells these as "Styles") ---
  {
    name: "TikTok white",
    patch: {
      color: "#ffffff",
      bg: "",
      bold: true,
      stroke: 6,
      strokeColor: "#000000",
      shadow: 0.9,
      upper: false,
      anim: "pop",
    },
  },
  {
    name: "Yellow bar",
    patch: {
      color: "#111111",
      bg: "#ffe14d",
      bold: true,
      radius: 6,
      shadow: 0,
      upper: true,
      tracking: 1,
    },
  },
  {
    name: "Pink sticker",
    patch: {
      color: "#ffffff",
      bg: "#ff3d81",
      bold: true,
      radius: 60,
      shadow: 0.5,
      upper: true,
      anim: "bounce",
    },
  },
  {
    name: "Mint chip",
    patch: {
      color: "#04241c",
      bg: "#5eead4",
      bold: true,
      radius: 50,
      shadow: 0,
      upper: true,
    },
  },
  {
    name: "Gradient-ish glow",
    patch: {
      color: "#a78bfa",
      bg: "",
      bold: true,
      stroke: 0,
      shadow: 1,
      anim: "neon",
      upper: true,
    },
  },
  {
    name: "Subtitle line",
    patch: {
      color: "#ffffff",
      bg: "rgba(0,0,0,0.45)",
      bold: false,
      radius: 12,
      size: 34,
      pos: "bc",
      shadow: 0.4,
    },
  },
  {
    name: "Headline split",
    patch: {
      color: "#ffffff",
      bg: "",
      bold: true,
      upper: true,
      size: 96,
      tracking: 6,
      align: "left",
      pos: "ml",
      anim: "tracking-in",
      shadow: 0.7,
    },
  },
  {
    name: "Retro chrome",
    patch: {
      color: "#fde68a",
      bg: "",
      bold: true,
      stroke: 4,
      strokeColor: "#7c2d12",
      shadow: 0.8,
      italic: true,
      upper: true,
      anim: "swing",
    },
  },
  {
    name: "Notebook",
    patch: {
      color: "#1e293b",
      bg: "#fef9c3",
      bold: false,
      radius: 4,
      underline: true,
      shadow: 0,
      italic: true,
    },
  },
  {
    name: "News lower third",
    patch: {
      color: "#ffffff",
      bg: "#b91c1c",
      bold: true,
      radius: 0,
      upper: true,
      align: "left",
      pos: "bl",
      tracking: 1,
      anim: "slideleft",
    },
  },
];

export function fontCss(id?: string): string {
  return FONTS.find((f) => f.id === id)?.css ?? FONTS[0].css;
}

export type BlendMode =
  "normal" | "multiply" | "screen" | "overlay" | "lighten" | "darken" | "difference";

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
  italic?: boolean;
  underline?: boolean;
  /** text outline (px at 1080 reference height), 0 = none */
  stroke?: number;
  strokeColor?: string;
  /** drop shadow strength 0..1 (default 0.5 = the classic soft shadow) */
  shadow?: number;
  /** letter spacing in px (1080 reference height) */
  tracking?: number;
  /** line height multiplier (default 1.18) */
  leading?: number;
  /** force uppercase rendering */
  upper?: boolean;
  /** corner radius of the background pill, in px */
  radius?: number;
  align?: "left" | "center" | "right";
  opacity?: number; // 0..1 base opacity for text
  font?: string; // FONTS id
  pos?: TextPos;
  anim?: TextAnim;
  words?: TextWord[]; // per-word timing (karaoke)
  // image / video overlay
  scale?: number; // fraction of canvas width (0.05..1.2)
  x?: number; // -1..1 fraction of center
  y?: number;
  rot?: number; // degrees
  flipX?: boolean;
  flipY?: boolean;
  chroma?: boolean; // green-screen keying (video/image overlays)
  chromaTol?: number; // key tolerance 10..255 (default 90)
  blend?: BlendMode; // compositing mode for image/video overlays
  mask?: MaskShape; // shape mask (spotlight / bar / line)
  // video/image overlay framing
  fit?: FrameFit;
  /** video-overlay playback speed */
  speed?: number;
  /** loop the sticker's footage when the clip is longer than the source */
  loop?: boolean;
  /** duck other audio while this clip plays (music bed under a voiceover) */
  duck?: number; // 0..1 how much to duck, 0 = off
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
  /** audio tracks: mute / solo; any track: hidden (visibility toggle) */
  muted?: boolean;
  solo?: boolean;
  hidden?: boolean;
}

export type AspectId = "9:16" | "1:1" | "4:5" | "16:9" | "4:3" | "3:4" | "21:9" | "2:3";

export interface AspectDef {
  w: number;
  h: number;
  label: string;
  /** short platform hint shown in pickers */
  hint?: string;
}

export const ASPECTS: Record<AspectId, AspectDef> = {
  "9:16": { w: 1080, h: 1920, label: "9:16 · Reels / Shorts", hint: "TikTok, Reels, Shorts" },
  "1:1": { w: 1080, h: 1080, label: "1:1 · Square", hint: "Feed posts, LinkedIn" },
  "4:5": { w: 1080, h: 1350, label: "4:5 · Portrait feed", hint: "Instagram feed" },
  "16:9": { w: 1920, h: 1080, label: "16:9 · Landscape", hint: "YouTube, desktop" },
  "4:3": { w: 1440, h: 1080, label: "4:3 · Classic", hint: "Older TV, presentations" },
  "3:4": { w: 1080, h: 1440, label: "3:4 · Vertical", hint: "Pinterest, tablets" },
  "21:9": { w: 2560, h: 1080, label: "21:9 · Cinematic", hint: "Film bars, widescreen" },
  "2:3": { w: 1080, h: 1620, label: "2:3 · Tall portrait", hint: "Prints, flyers" },
};

export const ASPECT_ORDER: AspectId[] = ["9:16", "4:5", "1:1", "16:9", "3:4", "4:3", "2:3", "21:9"];

/** Aspect ratio as a number (w/h). */
export function aspectRatio(a: AspectId): number {
  const d = ASPECTS[a] ?? ASPECTS["9:16"];
  return d.w / d.h;
}

export interface ExportPreset {
  fps: number;
  kbps: number;
  scale: 1 | 2;
}

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
  /** remembered export settings (CapCut remembers per draft) */
  exportPreset?: ExportPreset;
  /** canvas background behind letterboxed footage */
  background?: string; // css color, default "#000"
  /** beat markers (timeline seconds) drawn on the ruler */
  beats?: number[];
  /** master audio gain 0..2 (1 = neutral) */
  masterGain?: number;
  /** ducking amount applied to music under a voiceover 0..1 */
  duckAmount?: number;
  /** on-device imported fonts (ids stored in IndexedDB font store) */
  fonts?: { id: string; family: string; name: string }[];
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

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Speed curves are clamped to a sane range and sorted; bad data degrades safely. */
export function speedCurveOf(c: MainClip): SpeedPoint[] | null {
  const raw = c.curve;
  if (!raw || raw.length < 2) return null;
  const pts = raw
    .filter((p) => Number.isFinite(p.at) && Number.isFinite(p.v))
    .map((p) => ({ at: clamp(p.at, 0, 1), v: clamp(p.v, 0.05, 16) }))
    .sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;
  // force the curve to span the whole segment so the maths stays total
  if (pts[0].at > 0) pts.unshift({ at: 0, v: pts[0].v });
  if (pts[pts.length - 1].at < 1) pts.push({ at: 1, v: pts[pts.length - 1].v });
  return pts;
}

/** Speed at normalised source position `x` (0..1) for a clip. */
export function speedAt(c: MainClip, x: number): number {
  const curve = speedCurveOf(c);
  if (curve) {
    const u = clamp(x, 0, 1);
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1];
      const b = curve[i];
      if (u <= b.at) {
        const span = b.at - a.at;
        if (span < 1e-9) return b.v;
        return a.v + ((b.v - a.v) * (u - a.at)) / span;
      }
    }
    return curve[curve.length - 1].v;
  }
  const v0 = Math.max(0.05, c.speed);
  const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
  return v0 + (v1 - v0) * clamp(x, 0, 1);
}

/**
 * Exact source distance travelled after `tau` seconds of playback.
 *
 * For a piecewise-linear speed curve v(x) the travel time over one linear
 * segment is ∫ L·dx / (a + k·(x − xa)) = (L/k)·ln(vb/va) — the same closed form
 * the single-ramp case used, so a two-point curve is bit-identical to the old
 * `rampTo` maths.
 */
function distanceAfter(c: MainClip, L: number, tau: number): number {
  if (tau <= 0) return 0;
  const curve = speedCurveOf(c);
  if (!curve) {
    const v0 = Math.max(0.05, c.speed);
    const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
    if (Math.abs(v1 - v0) < 1e-9) return Math.min(L, tau * v0);
    const k = (v1 - v0) / L;
    return clamp((v0 / k) * (Math.exp(k * tau) - 1), 0, L);
  }
  const seg = (i: number) => ({
    a: curve[i].v,
    b: curve[i + 1].v,
    x0: curve[i].at,
    x1: curve[i + 1].at,
  });
  /** seconds needed to sweep one segment */
  const segTime = (g: { a: number; b: number; x0: number; x1: number }) => {
    const w = (g.x1 - g.x0) * L;
    if (w < 1e-9) return 0;
    if (Math.abs(g.b - g.a) < 1e-9) return w / g.a;
    return (w / (g.b - g.a)) * Math.log(g.b / g.a);
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
      else x = (g.a / k) * (Math.exp(k * left) - 1);
      return clamp(g.x0 * L + Math.min(w, x), 0, L);
    }
    left -= dt;
  }
  return L;
}

/** Inverse of `distanceAfter`: timeline seconds needed to travel `x` source units. */
function timeForDistance(c: MainClip, L: number, x: number): number {
  const curve = speedCurveOf(c);
  if (!curve) {
    const v0 = Math.max(0.05, c.speed);
    const v1 = c.rampTo != null ? Math.max(0.05, c.rampTo) : v0;
    if (Math.abs(v1 - v0) < 1e-9) return x / v0;
    const k = (v1 - v0) / L;
    return Math.log((k * x) / v0 + 1) / k;
  }
  let t = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const g = { a: curve[i].v, b: curve[i + 1].v, x0: curve[i].at, x1: curve[i + 1].at };
    const w = (g.x1 - g.x0) * L;
    const k = (g.b - g.a) / Math.max(1e-9, w);
    if (x <= g.x1 * L || i === curve.length - 2) {
      const dx = clamp(x - g.x0 * L, 0, w);
      if (Math.abs(k) < 1e-9) return t + dx / g.a;
      return t + Math.log((k * dx) / g.a + 1) / k;
    }
    // whole segment consumed
    t += Math.abs(k) < 1e-9 ? w / g.a : (w / (g.b - g.a)) * Math.log(g.b / g.a);
  }
  return t;
}

export function mainClipDuration(c: MainClip): number {
  if (c.freeze) return Math.max(0.1, c.out - c.in); // held frame length
  const L = Math.max(0, c.out - c.in);
  if (L <= 0) return 0.1;
  return Math.max(0.1, timeForDistance(c, L, L));
}

/**
 * Source position for clip-local timeline time (handles reverse, speed ramp and
 * a drawable speed curve). Inverse of the duration integral — closed form.
 */
export function mainSrcAt(c: MainClip, localT: number): number {
  if (c.freeze) return c.in + 1 / 60; // a single held frame
  const L = Math.max(1e-6, c.out - c.in);
  const dur = mainClipDuration(c);
  const tau = clamp(localT, 0, dur);
  const x = clamp(distanceAfter(c, L, tau), 0, L);
  return c.reverse ? c.out - x : c.in + x;
}

/** Playback rate to apply to the media element at clip-local time. */
export function mainRateAt(c: MainClip, localT: number): number {
  if (c.freeze || c.reverse) return 1;
  const L = Math.max(1e-6, c.out - c.in);
  const src = mainSrcAt(c, localT);
  const x = c.reverse ? c.out - src : src - c.in;
  return Math.max(0.05, speedAt(c, x / L));
}

/** Rate of change of the timeline clock — the media element plays at this
 *  multiple of real time. Identical to `mainRateAt` except it accounts for
 *  reverse (where the element still runs forward). */
export function mainPlaybackRate(c: MainClip, localT: number): number {
  if (c.freeze) return 1;
  const L = Math.max(1e-6, c.out - c.in);
  const src = mainSrcAt(c, localT);
  const x = c.reverse ? c.out - src : src - c.in;
  return Math.max(0.05, speedAt(c, x / L));
}

/** Sequential spans of main-track clips in timeline seconds. */
/**
 * Move one caption word in time without letting it overtake its neighbours
 * (which would make the karaoke highlight run backwards).
 */
export function nudgeWord(
  words: TextWord[],
  index: number,
  delta: number,
  duration: number,
  step = 0.05,
): TextWord[] {
  if (index < 0 || index >= words.length) return words;
  const next = words.map((w) => ({ ...w }));
  const lo = index === 0 ? 0 : next[index - 1].t + step;
  const hi =
    index === words.length - 1 ? Math.max(lo, duration) : Math.max(lo, next[index + 1].t - step);
  const t = Math.min(hi, Math.max(lo, next[index].t + delta));
  next[index].t = Math.round(t * 1000) / 1000;
  return next;
}

/** Spread caption words evenly across the clip; used by "re-space". */
export function respaceWords(words: TextWord[], duration: number): TextWord[] {
  const step = duration / Math.max(1, words.length);
  return words.map((w, i) => ({ ...w, t: Math.round(i * step * 1000) / 1000 }));
}

/** Shift the whole caption, clamped so the first word stays ≥ 0 and the last
 * word stays inside the clip. */
export function shiftWords(words: TextWord[], delta: number, duration: number): TextWord[] {
  if (words.length === 0) return words;
  const first = words[0].t;
  const last = words[words.length - 1].t;
  const d = Math.max(-first, Math.min(Math.max(0, duration - last), delta));
  if (Math.abs(d) < 1e-9) return words;
  return words.map((w) => ({ ...w, t: Math.round((w.t + d) * 1000) / 1000 }));
}

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

// ---------------------------------------------------------------------------
// Freeze frame & speed helpers
// ---------------------------------------------------------------------------

/** Values offered by the speed control (CapCut's ladder, offline-safe). */
export const SPEED_PRESETS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8];

/**
 * Make a 3-second held-frame clip from `clip` at its source position
 * `srcTime`. The caller splices it into the main track.
 */
export function freezeClipFrom(clip: MainClip, srcTime: number, hold = 3): MainClip {
  return {
    ...clip,
    id: uid("mc"),
    in: Math.max(0, srcTime),
    out: Math.max(0, srcTime) + Math.max(0.2, hold),
    freeze: true,
    speed: 1,
    rampTo: undefined,
    reverse: false,
    muted: true,
    transitionIn: "none",
    transitionDur: 0,
    keyframes: clip.keyframes
      ? clip.keyframes.map((k) => ({ at: k.at, v: { ...k.v } }))
      : undefined,
  };
}

/** Convert a clip's source length to the duration shown on the timeline. */
export function sourceSpan(c: MainClip): number {
  return Math.max(0, c.out - c.in);
}
