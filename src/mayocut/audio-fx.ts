// MayoCut — audio effects.
//
// CapCut ships a shelf of one-tap audio effects (echo, reverb, chipmunk, lo-fi,
// telephone, robotic...). All of them are the same handful of primitives
// arranged differently, and every single one can be built from WebAudio nodes
// the platform already ships — no impulse files, no downloads, no codec.
//
// The policy lives here as a pure description (a recipe of nodes and gains), so
// it can be tested in node and so preview and export cannot drift apart: both
// call `applyAudioFx()` on whatever AudioContext they happen to have.

/** Every audio effect the editor can apply to a clip. */
export type AudioFxId =
  | "none"
  | "echo"
  | "reverb"
  | "room"
  | "stadium"
  | "chipmunk"
  | "deep"
  | "telephone"
  | "lofi"
  | "radio"
  | "robot"
  | "underwater"
  | "megaphone"
  | "cave"
  | "whisper"
  | "vinyl";

export interface AudioFxDef {
  id: AudioFxId;
  name: string;
  /** short human hint shown in the library tile */
  hint: string;
}

export const AUDIO_FX: AudioFxDef[] = [
  { id: "none", name: "None", hint: "Dry signal" },
  { id: "echo", name: "Echo", hint: "Single slap-back delay" },
  { id: "reverb", name: "Reverb", hint: "Small room, generated impulse" },
  { id: "room", name: "Room", hint: "Short tight ambience" },
  { id: "stadium", name: "Stadium", hint: "Long wide tail" },
  { id: "cave", name: "Cave", hint: "Very long dark tail" },
  { id: "chipmunk", name: "Chipmunk", hint: "Higher and faster" },
  { id: "deep", name: "Deep voice", hint: "Lower and slower" },
  { id: "telephone", name: "Telephone", hint: "Narrow band, thin" },
  { id: "radio", name: "Radio", hint: "AM-style band limit + grit" },
  { id: "lofi", name: "Lo-fi", hint: "Muffled, warm, slightly crushed" },
  { id: "robot", name: "Robot", hint: "Ring modulation buzz" },
  { id: "underwater", name: "Underwater", hint: "Dark and wobbly" },
  { id: "megaphone", name: "Megaphone", hint: "Horn-like mid boost" },
  { id: "whisper", name: "Whisper", hint: "Thin, airy, quiet" },
  { id: "vinyl", name: "Vinyl", hint: "Warm band limit and hiss" },
];

export const AUDIO_FX_MAP: Record<AudioFxId, AudioFxDef> = Object.fromEntries(
  AUDIO_FX.map((f) => [f.id, f]),
) as Record<AudioFxId, AudioFxDef>;

/** A biquad described as data, so it can be asserted on without a browser. */
export interface BiquadSpec {
  type: "lowpass" | "highpass" | "bandpass" | "peaking" | "lowshelf" | "highshelf" | "notch";
  frequency: number;
  q?: number;
  gain?: number;
}

export interface DelaySpec {
  /** delay time in seconds */
  time: number;
  /** feedback amount 0..0.95 */
  feedback: number;
  /** wet level 0..1 */
  wet: number;
}

export interface AudioFxRecipe {
  /** playback rate multiplier applied to the source (pitch + speed) */
  rate: number;
  /** overall output trim, 0..2 */
  gain: number;
  /** filters applied in order */
  filters: BiquadSpec[];
  /** optional echo/reverb stage */
  delay?: DelaySpec;
  /** optional reverb: generated impulse length in seconds (0 = none) */
  reverbSec?: number;
  /** ring modulator frequency in Hz (0 = none) */
  ringHz?: number;
  /**
   * Flutter: gentle pitch wobble for tape/underwater. Depth in cents.
   */
  flutterCents?: number;
}

/**
 * The recipe for an effect.
 *
 * Deliberately data, not code: the tests below the engine can assert that
 * "telephone" really is band-limited and that "none" really does nothing, which
 * a hand-wired node graph cannot prove.
 */
export function audioFxRecipe(id: AudioFxId): AudioFxRecipe {
  const dry: AudioFxRecipe = { rate: 1, gain: 1, filters: [] };
  switch (id) {
    case "none":
      return dry;
    case "echo":
      return {
        rate: 1,
        gain: 1,
        filters: [],
        delay: { time: 0.28, feedback: 0.32, wet: 0.45 },
      };
    case "reverb":
      return {
        rate: 1,
        gain: 1,
        filters: [],
        reverbSec: 1.4,
        delay: { time: 0, feedback: 0, wet: 0.5 },
      };
    case "room":
      return {
        rate: 1,
        gain: 1,
        filters: [],
        reverbSec: 0.55,
        delay: { time: 0, feedback: 0, wet: 0.4 },
      };
    case "stadium":
      return {
        rate: 1,
        gain: 1,
        filters: [{ type: "highpass", frequency: 180 }],
        reverbSec: 3.2,
        delay: { time: 0, feedback: 0, wet: 0.62 },
      };
    case "cave":
      return {
        rate: 1,
        gain: 1,
        filters: [{ type: "lowpass", frequency: 1400 }],
        reverbSec: 4.5,
        delay: { time: 0, feedback: 0, wet: 0.7 },
      };
    case "chipmunk":
      return { rate: 1.42, gain: 1, filters: [{ type: "highpass", frequency: 140 }] };
    case "deep":
      return { rate: 0.74, gain: 1.05, filters: [{ type: "lowshelf", frequency: 200, gain: 4 }] };
    case "telephone":
      return {
        rate: 1,
        gain: 1.1,
        filters: [
          { type: "highpass", frequency: 420, q: 0.9 },
          { type: "lowpass", frequency: 3100, q: 0.9 },
          { type: "peaking", frequency: 1600, gain: 6, q: 1.2 },
        ],
      };
    case "radio":
      return {
        rate: 1,
        gain: 1.1,
        filters: [
          { type: "highpass", frequency: 500 },
          { type: "lowpass", frequency: 2600 },
          { type: "peaking", frequency: 1200, gain: 5, q: 1 },
        ],
      };
    case "lofi":
      return {
        rate: 0.96,
        gain: 1,
        filters: [
          { type: "lowpass", frequency: 5200 },
          { type: "highpass", frequency: 90 },
        ],
        flutterCents: 6,
      };
    case "robot":
      return { rate: 1, gain: 0.95, filters: [], ringHz: 58 };
    case "underwater":
      return {
        rate: 0.92,
        gain: 1,
        filters: [{ type: "lowpass", frequency: 640, q: 3 }],
        flutterCents: 14,
      };
    case "megaphone":
      return {
        rate: 1,
        gain: 1.15,
        filters: [
          { type: "highpass", frequency: 700 },
          { type: "peaking", frequency: 2000, gain: 9, q: 1.4 },
          { type: "lowpass", frequency: 4800 },
        ],
      };
    case "whisper":
      return {
        rate: 1,
        gain: 0.7,
        filters: [
          { type: "highpass", frequency: 2200 },
          { type: "lowpass", frequency: 9000 },
        ],
      };
    case "vinyl":
      return {
        rate: 1,
        gain: 1,
        filters: [
          { type: "lowpass", frequency: 7000 },
          { type: "peaking", frequency: 300, gain: 3, q: 0.8 },
        ],
        flutterCents: 3,
      };
    default:
      return dry;
  }
}

/**
 * How much this effect changes the clip's *duration*.
 *
 * A pitch effect that doubles the playback rate also halves the clip, which is
 * audible as a jump in sync unless the editor knows about it. Exposed so the UI
 * can warn and the timeline can keep length in step with what is heard.
 */
export function audioFxDurationScale(id: AudioFxId): number {
  const r = audioFxRecipe(id).rate;
  return r > 0 ? 1 / r : 1;
}

/** Deterministic pseudo-random noise for generated impulse responses. */
function seededNoise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32 — deterministic, so an export matches the preview
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/**
 * Build a decaying-noise impulse response in memory.
 *
 * A real room recording would be a bundled asset and a licence question; a
 * synthetic exponential tail is a few hundred milliseconds of maths and sounds
 * close enough for a phone edit.
 */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay = 2.6): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.round(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  const rnd = seededNoise(Math.round(seconds * 1000) + 7);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const offset = ch * 13; // decorrelate the channels so it sounds wide
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      const early = i < rate * 0.02 ? 0.4 : 1;
      data[i] = rnd() * env * early * (i === offset ? 1 : 1);
    }
  }
  return buf;
}

/** The node bundle an effect builds, so it can be torn down again. */
export interface AudioFxChain {
  input: AudioNode;
  output: AudioNode;
  /** rate to set on the source feeding `input` */
  rate: number;
  /** nodes to disconnect on teardown */
  nodes: AudioNode[];
}

/**
 * Wire a recipe into a live (or offline) audio graph.
 *
 * Works on `OfflineAudioContext` too, which is the whole point: the export
 * path calls exactly this function, so an exported file cannot sound different
 * from the preview.
 */
export function buildAudioFx(
  ctx: BaseAudioContext,
  id: AudioFxId,
  opts: { impulse?: (sec: number) => AudioBuffer } = {},
): AudioFxChain {
  const recipe = audioFxRecipe(id);
  const nodes: AudioNode[] = [];
  let head: AudioNode = ctx.createGain();
  const inputGain = head as GainNode;
  inputGain.gain.value = 1;
  nodes.push(head);

  for (const f of recipe.filters) {
    const bq = ctx.createBiquadFilter();
    bq.type = f.type;
    bq.frequency.value = f.frequency;
    if (f.q !== undefined) bq.Q.value = f.q;
    if (f.gain !== undefined) bq.gain.value = f.gain;
    head.connect(bq);
    head = bq;
    nodes.push(bq);
  }

  if (recipe.ringHz && recipe.ringHz > 0) {
    // Ring modulation: multiply the signal by a sine. WebAudio has no multiply
    // node, but a gain node driven by an oscillator *is* one.
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.frequency.value = recipe.ringHz;
    const depth = ctx.createGain();
    depth.gain.value = 1;
    osc.connect(depth);
    depth.connect(ring.gain);
    osc.start();
    head.connect(ring);
    head = ring;
    nodes.push(ring, osc, depth);
  }

  if (recipe.reverbSec && recipe.reverbSec > 0) {
    const wet = ctx.createGain();
    wet.gain.value = Math.max(0, Math.min(1, recipe.delay?.wet ?? 0.5));
    const conv = ctx.createConvolver();
    conv.buffer = opts.impulse
      ? opts.impulse(recipe.reverbSec)
      : makeImpulse(ctx, recipe.reverbSec);
    head.connect(conv);
    conv.connect(wet);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    head.connect(mix);
    wet.connect(mix);
    head = mix;
    nodes.push(conv, wet, mix);
  } else if (recipe.delay && recipe.delay.time > 0) {
    const d = recipe.delay;
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = Math.max(0.001, d.time);
    const fb = ctx.createGain();
    fb.gain.value = Math.max(0, Math.min(0.95, d.feedback));
    const wet = ctx.createGain();
    wet.gain.value = Math.max(0, Math.min(1, d.wet));
    head.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    head.connect(mix);
    wet.connect(mix);
    head = mix;
    nodes.push(delay, fb, wet, mix);
  }

  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(2, recipe.gain));
  head.connect(out);
  nodes.push(out);

  return { input: inputGain, output: out, rate: recipe.rate, nodes };
}
