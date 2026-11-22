/** Small original, synthesized sound effects. No network or third-party assets. */
export type SoundId =
  | "whoosh"
  | "glitch"
  | "clock"
  | "impact"
  | "pop"
  | "riser"
  | "chime"
  | "click"
  | "bass"
  | "heartbeat";
export type SoundCategory = "Transitions" | "Digital" | "Impacts" | "Everyday";
export const SOUND_LIBRARY: {
  id: SoundId;
  name: string;
  description: string;
  duration: number;
  category: SoundCategory;
}[] = [
  {
    id: "whoosh",
    name: "Air whoosh",
    description: "A soft rising sweep",
    duration: 1.4,
    category: "Transitions",
  },
  {
    id: "riser",
    name: "Rising tension",
    description: "Electronic rising tone",
    duration: 2,
    category: "Transitions",
  },
  {
    id: "glitch",
    name: "Digital glitch",
    description: "Chopped electronic pulses",
    duration: 1.2,
    category: "Digital",
  },
  {
    id: "chime",
    name: "Bright chime",
    description: "A soft notification tone",
    duration: 1.1,
    category: "Digital",
  },
  {
    id: "click",
    name: "Button clicks",
    description: "A short electronic double click",
    duration: 1,
    category: "Digital",
  },
  {
    id: "impact",
    name: "Cinematic impact",
    description: "A low punch and noise burst",
    duration: 1.4,
    category: "Impacts",
  },
  {
    id: "bass",
    name: "Bass drop",
    description: "A descending low tone",
    duration: 1.5,
    category: "Impacts",
  },
  {
    id: "pop",
    name: "Bubble pop",
    description: "A short cartoon pop",
    duration: 1,
    category: "Impacts",
  },
  {
    id: "clock",
    name: "Clock ticks",
    description: "Four crisp ticks",
    duration: 2.2,
    category: "Everyday",
  },
  {
    id: "heartbeat",
    name: "Heartbeat",
    description: "Two soft double beats",
    duration: 2.3,
    category: "Everyday",
  },
];

/** Deterministic mono PCM: same sound after reopening or on another device. */
export function synthesizeSound(id: SoundId, sampleRate = 44100): Float32Array {
  const entry = SOUND_LIBRARY.find((sound) => sound.id === id);
  if (!entry || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
    throw new Error("Invalid sound or sample rate");
  const samples = new Float32Array(Math.round(entry.duration * sampleRate));
  let seed = 0x9e3779b9;
  let smooth = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    const t = i / sampleRate;
    let value = 0;
    if (id === "whoosh") {
      const phase = t / entry.duration;
      const envelope = Math.sin(Math.PI * phase) ** 1.6;
      const cutoff = 0.025 + 0.28 * phase;
      smooth += cutoff * (noise - smooth);
      value = smooth * envelope * 0.85;
    } else if (id === "glitch") {
      const pulse = Math.floor(t / 0.105);
      const local = (t % 0.105) / 0.105;
      const envelope = Math.sin(Math.PI * local) * (1 - t / entry.duration);
      const hz = [180, 460, 270, 760, 330, 590][pulse % 6];
      value = (Math.sign(Math.sin(2 * Math.PI * hz * t)) * 0.25 + noise * 0.12) * envelope;
    } else if (id === "riser") {
      const p = t / entry.duration;
      const phase = 2 * Math.PI * (150 * t + (600 * t * t) / entry.duration);
      value = (Math.sin(phase) * 0.24 + noise * 0.09) * Math.sin(Math.PI * p);
    } else if (id === "chime") {
      value =
        (Math.sin(2 * Math.PI * 880 * t) + 0.45 * Math.sin(2 * Math.PI * 1320 * t)) *
        Math.exp(-t * 4) *
        0.32;
    } else if (id === "click") {
      const local = t < 0.18 ? t : t - 0.18;
      if (local >= 0 && local < 0.035)
        value =
          (noise * 0.3 + Math.sin(2 * Math.PI * 1500 * local) * 0.25) * Math.exp(-local * 110);
    } else if (id === "impact") {
      value =
        (Math.sin(2 * Math.PI * (82 * t - 13 * t * t)) * 0.55 + noise * 0.28) * Math.exp(-t * 5);
    } else if (id === "bass") {
      value = Math.sin(2 * Math.PI * (145 * t - 38 * t * t)) * Math.exp(-t * 2.8) * 0.55;
    } else if (id === "pop") {
      value = Math.sin(2 * Math.PI * (720 * t - 2600 * t * t)) * Math.exp(-t * 22) * 0.5;
    } else if (id === "heartbeat") {
      const local = t % 1.05;
      const beat = local < 0.15 ? local : local - 0.23;
      if (beat >= 0 && beat < 0.15 && t < 2.1)
        value = Math.sin(2 * Math.PI * 62 * beat) * Math.exp(-beat * 23) * 0.55;
    } else {
      const local = t % 0.5;
      if (local < 0.08 && t < 2) {
        const envelope = Math.exp(-local * 60) * Math.min(1, local * 800);
        value = (Math.sin(2 * Math.PI * 1850 * local) * 0.48 + noise * 0.25) * envelope;
      }
    }
    // A short edge taper prevents clicks at the clip boundaries.
    const edge = Math.min(
      1,
      i / (sampleRate * 0.005),
      (samples.length - 1 - i) / (sampleRate * 0.005),
    );
    samples[i] = Math.max(-1, Math.min(1, value * Math.max(0, edge)));
  }
  return samples;
}
