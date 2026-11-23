// src/mayocut/hsl.ts
var HSL_BANDS = [
  { id: "red", name: "Red", center: 0, swatch: "#ef4444" },
  { id: "orange", name: "Orange", center: 30, swatch: "#f97316" },
  { id: "yellow", name: "Yellow", center: 60, swatch: "#eab308" },
  { id: "green", name: "Green", center: 120, swatch: "#22c55e" },
  { id: "cyan", name: "Cyan", center: 180, swatch: "#06b6d4" },
  { id: "blue", name: "Blue", center: 240, swatch: "#3b82f6" },
  { id: "purple", name: "Purple", center: 280, swatch: "#8b5cf6" },
  { id: "magenta", name: "Magenta", center: 320, swatch: "#d946ef" }
];
var HSL_CENTERS = Object.fromEntries(
  HSL_BANDS.map((b) => [b.id, b.center])
);
function hslActive(set) {
  if (!set) return false;
  return Object.values(set).some(
    (a) => a && ((a.h ?? 0) !== 0 || (a.s ?? 0) !== 0 || (a.l ?? 0) !== 0)
  );
}
function clampHsl(a) {
  const c = (v) => {
    if (!Number.isFinite(v)) return 0;
    return Math.max(-100, Math.min(100, Math.round(v)));
  };
  return { h: c(a.h), s: c(a.s), l: c(a.l) };
}
function bandWeight(hueDeg, band) {
  const h = (hueDeg % 360 + 360) % 360;
  const centre = HSL_CENTERS[band];
  let d = Math.abs(h - centre);
  if (d > 180) d = 360 - d;
  const w = 1 - d / 30;
  return w > 0 ? w : 0;
}
function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}
function hue2rgb(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
function hslToRgb(h, s, l) {
  const hh = (h % 360 + 360) % 360 / 360;
  if (s <= 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, hh + 1 / 3) * 255,
    g: hue2rgb(p, q, hh) * 255,
    b: hue2rgb(p, q, hh - 1 / 3) * 255
  };
}
function applyHslPixel(r, g, b, set) {
  if (!hslActive(set)) return { r, g, b };
  const { h, s, l } = rgbToHsl(r, g, b);
  if (s < 0.02) return { r, g, b };
  let dH = 0;
  let sMul = 0;
  let dL = 0;
  let total = 0;
  for (const band of HSL_BANDS) {
    const adj = set[band.id];
    if (!adj) continue;
    const ah = adj.h ?? 0;
    const as = adj.s ?? 0;
    const al = adj.l ?? 0;
    if (ah === 0 && as === 0 && al === 0) continue;
    const w = bandWeight(h, band.id);
    if (w <= 0) continue;
    dH += ah / 100 * 30 * w;
    sMul += as / 100 * w;
    dL += al / 100 * 0.35 * w;
    total += w;
  }
  if (total === 0) return { r, g, b };
  const out = hslToRgb(
    h + dH,
    Math.max(0, Math.min(1, s * (1 + sMul))),
    Math.max(0, Math.min(1, l + dL))
  );
  return {
    r: Math.max(0, Math.min(255, out.r)),
    g: Math.max(0, Math.min(255, out.g)),
    b: Math.max(0, Math.min(255, out.b))
  };
}
function activeBands(set) {
  const out = [];
  for (const band of HSL_BANDS) {
    const adj = set[band.id];
    if (!adj) continue;
    const h = adj.h ?? 0;
    const s = adj.s ?? 0;
    const l = adj.l ?? 0;
    if (h === 0 && s === 0 && l === 0) continue;
    out.push({
      center: band.center,
      hue: h / 100 * 30,
      // ±100 → ±30°, so a band cannot swallow its neighbour
      sat: s / 100,
      lum: l / 100 * 0.35
      // ±100 → ±0.35 luminance
    });
  }
  return out;
}
function applyHsl(d, set) {
  const bands = activeBands(set);
  if (bands.length === 0) return;
  const nb = bands.length;
  const centers = new Float32Array(nb);
  const hues = new Float32Array(nb);
  const sats = new Float32Array(nb);
  const lums = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    centers[b] = bands[b].center;
    hues[b] = bands[b].hue;
    sats[b] = bands[b].sat;
    lums[b] = bands[b].lum;
  }
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b2 = d[i + 2];
    const rn = r / 255;
    const gn = g / 255;
    const bn = b2 / 255;
    const max = rn > gn ? rn > bn ? rn : bn : gn > bn ? gn : bn;
    const min = rn < gn ? rn < bn ? rn : bn : gn < bn ? gn : bn;
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta < 1e-9) continue;
    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (s < 0.02) continue;
    let h;
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
    else h = ((rn - gn) / delta + 4) * 60;
    let dH = 0;
    let sMul = 0;
    let dL = 0;
    let total = 0;
    for (let bi = 0; bi < nb; bi++) {
      let dd = h - centers[bi];
      if (dd < 0) dd = -dd;
      if (dd > 180) dd = 360 - dd;
      if (dd >= 30) continue;
      const w = 1 - dd / 30;
      dH += hues[bi] * w;
      sMul += sats[bi] * w;
      dL += lums[bi] * w;
      total += w;
    }
    if (total === 0) continue;
    const sOut = s * (1 + sMul);
    const lOut = l + dL;
    const ss = sOut < 0 ? 0 : sOut > 1 ? 1 : sOut;
    const ll = lOut < 0 ? 0 : lOut > 1 ? 1 : lOut;
    const hh = ((h + dH) % 360 + 360) % 360 / 360;
    if (ss <= 0) {
      const v = ll * 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      continue;
    }
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    let t = hh + 1 / 3;
    if (t < 0) t += 1;
    else if (t > 1) t -= 1;
    d[i] = (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p) * 255;
    t = hh;
    d[i + 1] = (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p) * 255;
    t = hh - 1 / 3;
    if (t < 0) t += 1;
    else if (t > 1) t -= 1;
    d[i + 2] = (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p) * 255;
  }
}
export {
  HSL_BANDS,
  HSL_CENTERS,
  applyHsl,
  applyHslPixel,
  bandWeight,
  clampHsl,
  hslActive,
  hslToRgb,
  rgbToHsl
};
