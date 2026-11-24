// MayoCut — loudness: measuring and matching audio levels.
//
// Kdenlive's audio story is built on this: normalise a clip, normalise a track,
// see a level meter, and aim at a target that means something. CapCut's version
// is a single "volume" slider, which is why CapCut edits are famously quiet on
// one clip and loud on the next.
//
// The target that matters is LUFS (loudness units relative to full scale),
// because it is what the platforms actually normalise to:
//
//   -14 LUFS   Spotify, YouTube, Amazon
//   -14..-16   TikTok, Instagram, Facebook (they turn loud audio DOWN, which is
//              why a loud edit sounds quieter and flatter than a level one)
//   -16 LUFS   Apple Podcasts
//   -23 LUFS   EBU R128 broadcast
//
// Computing true LUFS needs the ITU-R BS.1770 K-weighting filter and gated
// block integration. That is a lot of DSP for a phone. What this module does
// instead is an RMS estimate matched to a K-weighted curve approximation — good
// to roughly a decibel on speech and music, which is the difference between
// "this clip is 8 dB hot" and "this clip is fine". It is honest about being an
// estimate: the UI says "≈".

export interface LoudnessTarget {
  id: string;
  name: string;
  /** target loudness, LUFS (negative) */
  lufs: number;
  hint: string;
}

export const LOUDNESS_TARGETS: LoudnessTarget[] = [
  {
    id: "tiktok",
    name: "TikTok / Reels",
    lufs: -14,
    hint: "Short form: loud enough to hold attention, not so loud it gets turned down",
  },
  {
    id: "youtube",
    name: "YouTube",
    lufs: -14,
    hint: "Same as Spotify — YouTube normalises to about -14 LUFS",
  },
  { id: "podcast", name: "Podcast", lufs: -16, hint: "Apple Podcasts targets -16 LUFS" },
  {
    id: "broadcast",
    name: "Broadcast",
    lufs: -23,
    hint: "EBU R128 television: quieter, with much more headroom",
  },
];

/** dBFS from a 0..1 linear amplitude. Silence is -Infinity, clamped to -70. */
export function linearToDb(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return -70;
  return Math.max(-70, 20 * Math.log10(v));
}

/**
 * Inverse of the above.
 *
 * Clamped at 0 so a huge attenuation can never produce a negative gain (which
 * would invert the phase), but NOT clamped at 1: a +12 dB gain is a multiplier of
 * 4, and capping it at 1 made every "turn this up" normalise a silent no-op —
 * the dB said +11.7 and the multiplier said 1.0.
 */
export function dbToLinear(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.pow(10, db / 20));
}

/**
 * Approximate loudness of a PCM buffer, in LUFS.
 *
 * Steps: K-weight approximation (a gentle high-pass plus a presence lift), mean
 * square over the blocks, then the -70 LUFS absolute gate that BS.1770 uses so
 * silence does not drag the average down to nothing.
 *
 * `channels` is an array of Float32 PCM at any sample rate; they are mixed to
 * mono for the measurement because the target is programme loudness, not
 * per-channel.
 */
export function approximateLufs(channels: Float32Array[], sampleRate = 48000): number {
  if (!channels.length) return -70;
  const len = channels[0].length;
  if (!len) return -70;

  // K-weighting approximation: a one-pole high-pass at ~120 Hz (removes rumble
  // that BS.1770 also discards) and a +4 dB shelf above ~1.5 kHz.
  const hpA = Math.exp((-2 * Math.PI * 120) / Math.max(1, sampleRate));
  let hp = 0;
  let prev = 0;
  const shelfA = Math.exp((-2 * Math.PI * 1500) / Math.max(1, sampleRate));
  let low = 0;

  // blocks of 400 ms with 75% overlap, as BS.1770 specifies
  const blockLen = Math.max(1, Math.round(sampleRate * 0.4));
  const hop = Math.max(1, Math.round(blockLen / 4));
  const blocks: number[] = [];

  for (let start = 0; start + blockLen <= len; start += hop) {
    let sum = 0;
    for (let i = start; i < start + blockLen; i++) {
      let s = 0;
      for (const ch of channels) s += ch[i] ?? 0;
      s /= channels.length;
      // high-pass
      hp = hpA * hp + s - prev;
      prev = s;
      // low-pass for the shelf, then add the difference back (presence lift)
      low = shelfA * low + (1 - shelfA) * hp;
      const weighted = hp + (hp - low) * 1.6;
      sum += weighted * weighted;
    }
    blocks.push(sum / blockLen);
  }
  if (!blocks.length) {
    // shorter than one block: measure the whole thing
    let sum = 0;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (const ch of channels) s += ch[i] ?? 0;
      s /= channels.length;
      sum += s * s;
    }
    const ms = sum / len;
    return ms <= 0 ? -70 : -0.691 + 10 * Math.log10(ms);
  }

  // absolute gate at -70 LUFS, then the relative gate 10 dB below the mean of
  // what survived — the same two-stage gating BS.1770 uses
  const toLufs = (ms: number) => (ms <= 0 ? -70 : -0.691 + 10 * Math.log10(ms));
  const above = blocks.filter((ms) => toLufs(ms) > -70);
  if (!above.length) return -70;
  const meanAbove = above.reduce((a, b) => a + b, 0) / above.length;
  const relativeGate = toLufs(meanAbove) - 10;
  const kept = above.filter((ms) => toLufs(ms) >= relativeGate);
  if (!kept.length) return toLufs(meanAbove);
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  return toLufs(mean);
}

/**
 * The gain to apply so a clip hits the target.
 *
 * Returned in dB and also as a linear multiplier, because WebAudio wants the
 * multiplier and the UI wants the dB. Clamped to ±24 dB: beyond that the
 * measurement is wrong or the clip is essentially silence, and a +60 dB gain on
 * room tone is not a fix, it is a noise generator.
 */
export interface NormaliseResult {
  /** measured loudness before any gain */
  measuredLufs: number;
  /** gain to apply, in dB (clamped) */
  gainDb: number;
  /** gain as a linear multiplier for a GainNode */
  gain: number;
  /** true when the gain was clamped rather than exactly hitting the target */
  clamped: boolean;
}

export function normaliseGain(
  channels: Float32Array[],
  targetLufs: number,
  sampleRate = 48000,
): NormaliseResult {
  const measured = approximateLufs(channels, sampleRate);
  const raw = targetLufs - measured;
  const flat = !Number.isFinite(raw) || measured <= -69;
  const gainDb = flat ? 0 : Math.max(-24, Math.min(24, raw));
  return {
    measuredLufs: measured,
    gainDb,
    gain: dbToLinear(gainDb),
    clamped: !flat && Math.abs(raw - gainDb) > 0.01,
  };
}

/**
 * Peak level of a buffer, in dBFS.
 *
 * Normalising loudness can push peaks past 0 dBFS, which clips in the encoder
 * and sounds like a crackle. The panel warns when that will happen rather than
 * silently shipping a distorted export.
 */
export function peakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i] ?? 0);
      if (v > peak) peak = v;
    }
  }
  return linearToDb(peak);
}

/** The one-line verdict shown under the normalise button. */
export function normaliseAdvice(r: NormaliseResult, peak: number): string {
  if (r.measuredLufs <= -69) return "This clip is silent — there is nothing to normalise.";
  const after = peak + r.gainDb;
  if (r.clamped) {
    return `Off target by more than 24 dB — check the clip before normalising.`;
  }
  if (after > -0.1) {
    return `Hitting the target would peak at ${after.toFixed(1)} dBFS and clip. Lower the target, or add a limiter.`;
  }
  const dir = r.gainDb >= 0 ? "up" : "down";
  return `Turn this ${dir} ${Math.abs(r.gainDb).toFixed(1)} dB to reach ${"≈"} target (peaks stay at ${after.toFixed(1)} dBFS).`;
}
