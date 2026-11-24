// MayoCut — video scopes: histogram, waveform, vectorscope.
//
// Kdenlive has all three and treats them as a first-class dock. CapCut does not,
// which is why CapCut users grade by eye and wonder why their footage does not
// match between clips. This editor had sliders and no way to see what they were
// doing, so "the sky is clipped" was a guess.
//
// All three are computed from one pass over the pixels, because the expensive
// part is the readback, not the accumulation.
//
// The classic mistake is computing a histogram of the LUMINANCE and calling it a
// histogram — that tells you about brightness, not colour, and hides every
// channel clip. These are real per-channel counts, with the same 601 luma weights
// Kdenlive's waveform uses.

export interface Histogram {
  /** 256 bins per channel */
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  /** luma (Rec.601), the same weighting the waveform uses */
  y: Uint32Array;
  /** highest count in any bin of any channel — the plot's y scale */
  peak: number;
  /** pixels sampled */
  total: number;
  /** pixels at 255 in any channel: blown highlights */
  clipped: number;
  /** pixels at 0 in all channels: crushed blacks */
  crushed: number;
}

export interface Waveform {
  /** width in columns; row-major [x * 256 + y] counts */
  w: number;
  data: Uint32Array;
  /** highest count in a cell */
  peak: number;
}

export interface Vectorscope {
  /** square grid, N x N, row-major chroma density */
  n: number;
  data: Uint32Array;
  peak: number;
  /** mean saturation 0..1, the number people actually want to know */
  meanSaturation: number;
  /** whether any pixel sits near the broadcast-safe circle edge */
  atLimit: number;
}

/**
 * Rec.601 luma, which is what Kdenlive's waveform plots.
 *
 * Integer weights (77/150/29 over 256) rather than floats: this runs over every
 * sampled pixel and the rounding difference is invisible, while float multiply
 * per pixel is not free at 1080p.
 */
export function lumaOf(r: number, g: number, b: number): number {
  return (r * 77 + g * 150 + b * 29) >> 8;
}

export interface ScopeOptions {
  /** sample every Nth pixel — 1 = all, 4 = every fourth */
  step?: number;
  width?: number;
  height?: number;
}

/**
 * One pass, three scopes.
 *
 * `step` exists because a 4K readback is 33 MB and the scopes are a UI panel,
 * not the renderer: sampling every 3rd pixel in each axis is 9x less work and
 * statistically indistinguishable at these bin counts.
 */
export function buildScopes(
  data: Uint8ClampedArray | Uint8Array,
  opts: ScopeOptions = {},
): { histogram: Histogram; waveform: Waveform; vectorscope: Vectorscope } {
  const step = Math.max(1, Math.floor(opts.step ?? 2));
  const width = opts.width ?? 0;
  const colW = Math.max(1, Math.min(256, Math.round(width / Math.max(1, step)) || 256));

  const hist = {
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
    y: new Uint32Array(256),
  };
  const WAVE_H = 256;
  const wave = new Uint32Array(colW * WAVE_H);
  const VS = 64;
  const vec = new Uint32Array(VS * VS);

  let total = 0;
  let clipped = 0;
  let crushed = 0;
  let satSum = 0;
  let atLimit = 0;

  const px = Math.max(1, width);
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // the A channel can be missing in an RGB readback; that is fine, we skip it
    if (data.length % 4 !== 0 && i + 2 >= data.length) break;

    hist.r[r]++;
    hist.g[g]++;
    hist.b[b]++;
    const y = lumaOf(r, g, b);
    hist.y[y]++;
    total++;

    if (r === 255 || g === 255 || b === 255) clipped++;
    if (r === 0 && g === 0 && b === 0) crushed++;

    // waveform: x from the pixel's position, y from luma
    const pixelIndex = i / 4;
    const x = px > 0 ? pixelIndex % px : 0;
    const col = Math.min(colW - 1, Math.floor((x / px) * colW));
    wave[col * WAVE_H + y]++;

    // vectorscope: Cb/Cr on a 64x64 grid centred at 32
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b; // -128..127
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    const vx = Math.max(0, Math.min(63, Math.round(32 + cb / 4)));
    const vy = Math.max(0, Math.min(63, Math.round(32 + cr / 4)));
    vec[vy * VS + vx]++;

    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;
    satSum += sat;
    if (sat > 0.92) atLimit++;
  }

  let peak = 1;
  for (let i = 0; i < 256; i++) {
    if (hist.r[i] > peak) peak = hist.r[i];
    if (hist.g[i] > peak) peak = hist.g[i];
    if (hist.b[i] > peak) peak = hist.b[i];
    if (hist.y[i] > peak) peak = hist.y[i];
  }
  let wavePeak = 1;
  for (let i = 0; i < wave.length; i++) if (wave[i] > wavePeak) wavePeak = wave[i];
  let vecPeak = 1;
  for (let i = 0; i < vec.length; i++) if (vec[i] > vecPeak) vecPeak = vec[i];

  return {
    histogram: { ...hist, peak, total, clipped, crushed },
    waveform: { w: colW, data: wave, peak: wavePeak },
    vectorscope: {
      n: VS,
      data: vec,
      peak: vecPeak,
      meanSaturation: total > 0 ? satSum / total : 0,
      atLimit,
    },
  };
}

/**
 * The plain-language reading of a histogram.
 *
 * A scope without an interpretation is a pretty picture. This is the sentence a
 * beginner needs: whether the image is clipped, crushed, or flat.
 */
export interface ExposureReading {
  verdict: "clipped" | "crushed" | "flat" | "balanced";
  message: string;
  /** 0..1 share of pixels at either extreme */
  clippedShare: number;
  crushedShare: number;
}

export function readExposure(h: Histogram): ExposureReading {
  const t = Math.max(1, h.total);
  const clippedShare = h.clipped / t;
  const crushedShare = h.crushed / t;

  // Count how much of the range is actually used: a histogram whose bins are
  // bunched in the middle is a flat image even when nothing is clipped.
  let lo = 0;
  let hi = 255;
  while (lo < 255 && h.y[lo] < t * 0.001) lo++;
  while (hi > 0 && h.y[hi] < t * 0.001) hi--;
  const spread = (hi - lo) / 255;

  if (clippedShare > 0.02) {
    return {
      verdict: "clipped",
      message: `${(clippedShare * 100).toFixed(1)}% of pixels are blown out — pull Highlights or Exposure down.`,
      clippedShare,
      crushedShare,
    };
  }
  if (crushedShare > 0.05) {
    return {
      verdict: "crushed",
      message: `${(crushedShare * 100).toFixed(1)}% of pixels are pure black — lift Shadow or Exposure.`,
      clippedShare,
      crushedShare,
    };
  }
  if (spread < 0.5) {
    return {
      verdict: "flat",
      message: "The image uses less than half the tonal range — add contrast for more punch.",
      clippedShare,
      crushedShare,
    };
  }
  return {
    verdict: "balanced",
    message: "Exposure is using the full range without clipping.",
    clippedShare,
    crushedShare,
  };
}

/** White-balance hint from the per-channel means, for a one-tap neutral. */
export function channelBalance(h: Histogram): { r: number; g: number; b: number; cast: string } {
  const mean = (bins: Uint32Array) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * bins[i];
      n += bins[i];
    }
    return n > 0 ? sum / n : 0;
  };
  const r = mean(h.r);
  const g = mean(h.g);
  const b = mean(h.b);
  const mid = (r + g + b) / 3;
  let cast = "neutral";
  if (mid > 0) {
    if (r > mid * 1.06 && b < mid * 0.94) cast = "warm";
    else if (b > mid * 1.06 && r < mid * 0.94) cast = "cool";
    else if (g > mid * 1.06) cast = "green";
    else if (r > mid * 1.06) cast = "magenta";
  }
  return { r, g, b, cast };
}
