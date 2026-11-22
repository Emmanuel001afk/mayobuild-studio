import type { FilterAdjust, HslBand } from "./types";

export const HSL_BANDS: { id: HslBand; label: string; hue: number }[] = [
  { id: "red", label: "Red", hue: 0 },
  { id: "yellow", label: "Yellow", hue: 60 },
  { id: "green", label: "Green", hue: 120 },
  { id: "cyan", label: "Cyan", hue: 180 },
  { id: "blue", label: "Blue", hue: 240 },
  { id: "magenta", label: "Magenta", hue: 300 },
];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const finite = (n: unknown, fallback = 0) =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;

export function advancedGradeActive(a: FilterAdjust): boolean {
  if (Math.abs(finite(a.curveMid, 0.5) - 0.5) > 0.0001) return true;
  if (
    (["red", "green", "blue"] as const).some(
      (channel) => Math.abs(finite(a.curveChannels?.[channel], 0.5) - 0.5) > 0.0001,
    )
  )
    return true;
  return HSL_BANDS.some(({ id }) => {
    const x = a.hsl?.[id];
    return !!x && (finite(x.hue) !== 0 || finite(x.saturation) !== 0 || finite(x.luminance) !== 0);
  });
}

/** In-place RGB master curve + smooth, overlapping per-color HSL bands. */
export function applyAdvancedGrade(data: Uint8ClampedArray, adjust: FilterAdjust): void {
  if (!advancedGradeActive(adjust)) return;
  const bands = HSL_BANDS.map((band) => ({ ...band, adjustment: adjust.hsl?.[band.id] })).filter(
    (band) =>
      band.adjustment &&
      (finite(band.adjustment.hue) ||
        finite(band.adjustment.saturation) ||
        finite(band.adjustment.luminance)),
  );
  const makeLut = (value: unknown) => {
    const midpoint = clamp(finite(value, 0.5), 0.05, 0.95);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      lut[i] = Math.round(
        255 * (x <= 0.5 ? x * midpoint * 2 : midpoint + (x - 0.5) * (1 - midpoint) * 2),
      );
    }
    return lut;
  };
  const master = makeLut(adjust.curveMid);
  const red = makeLut(adjust.curveChannels?.red);
  const green = makeLut(adjust.curveChannels?.green);
  const blue = makeLut(adjust.curveChannels?.blue);
  for (let i = 0; i + 3 < data.length; i += 4) {
    let r = data[i] / 255,
      g = data[i + 1] / 255,
      b = data[i + 2] / 255;
    if (bands.length) {
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min;
      let l = (max + min) / 2;
      let sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
      let h = 0;
      if (delta > 0) {
        if (max === r) h = 60 * (((g - b) / delta) % 6);
        else if (max === g) h = 60 * ((b - r) / delta + 2);
        else h = 60 * ((r - g) / delta + 4);
        h = (h + 360) % 360;
        let hueShift = 0,
          satShift = 0,
          lightShift = 0;
        for (const band of bands) {
          const distance = Math.abs(((h - band.hue + 540) % 360) - 180);
          const weight = Math.max(0, 1 - distance / 60) * Math.min(1, sat * 4);
          hueShift += clamp(finite(band.adjustment!.hue), -100, 100) * 0.6 * weight;
          satShift += (clamp(finite(band.adjustment!.saturation), -100, 100) / 100) * weight;
          lightShift += (clamp(finite(band.adjustment!.luminance), -100, 100) / 100) * weight;
        }
        h = (((h + hueShift) % 360) + 360) % 360;
        sat = clamp(sat * (1 + satShift), 0, 1);
        l = clamp(l + lightShift * 0.5, 0, 1);
        const chroma = (1 - Math.abs(2 * l - 1)) * sat;
        const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - chroma / 2;
        if (h < 60) [r, g, b] = [chroma, x, 0];
        else if (h < 120) [r, g, b] = [x, chroma, 0];
        else if (h < 180) [r, g, b] = [0, chroma, x];
        else if (h < 240) [r, g, b] = [0, x, chroma];
        else if (h < 300) [r, g, b] = [x, 0, chroma];
        else [r, g, b] = [chroma, 0, x];
        r += m;
        g += m;
        b += m;
      }
    }
    data[i] = red[master[clamp(Math.round(r * 255), 0, 255)]];
    data[i + 1] = green[master[clamp(Math.round(g * 255), 0, 255)]];
    data[i + 2] = blue[master[clamp(Math.round(b * 255), 0, 255)]];
  }
}
