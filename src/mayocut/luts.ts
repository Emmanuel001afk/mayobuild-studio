// MayoCut LUTs — 3D color-lookup tables.
// Built-ins are generated from analytic transfer functions (the same math film
// LUTs encode); user LUTs are standard Adobe .cube files (public format,
// https://helpx.adobe.com/fusion/kb/using-cube-luts-after-effects.html),
// parsed locally and stored in IndexedDB. No network involved.

export interface LutTable {
  name: string;
  size: number; // N of N×N×N
  data: Float32Array; // N³ × 3, ordered B-major, G-middle, R-minor (matches .cube)
  builtin?: boolean;
}

export interface LutRecord {
  id: string; // name (key in IDB)
  name: string;
  size: number;
  data: ArrayBuffer; // Float32Array buffer
  createdAt: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Build an N³ table from a per-pixel function (inputs 0..1, outputs 0..1). */
function genTable(size: number, fn: (r: number, g: number, b: number) => [number, number, number]): Float32Array {
  const out = new Float32Array(size * size * size * 3);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const [rr, gg, bb] = fn(r / (size - 1), g / (size - 1), b / (size - 1));
        out[i++] = clamp01(rr);
        out[i++] = clamp01(gg);
        out[i++] = clamp01(bb);
      }
  return out;
}

const sCurve = (v: number, amt: number) => clamp01(v + amt * Math.sin(Math.PI * v) * (v < 0.5 ? 1 : -1) * 0.5);

function satMix(r: number, g: number, b: number, sat: number): [number, number, number] {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [y + (r - y) * sat, y + (g - y) * sat, y + (b - y) * sat];
}

/** Analytic built-in looks (17³ — small, generated in a few ms). */
export const BUILTIN_LUTS: { name: string; desc: string; build: () => { size: number; data: Float32Array } }[] = [
  {
    name: "teal-orange",
    desc: "Teal shadows, orange highlights, contrast S-curve",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // shadows toward teal (down r, up g/b), highlights toward orange (up r, down b)
        const sh = 1 - l;
        let rr = r + 0.10 * l * l - 0.10 * sh * sh;
        let gg = g + 0.05 * sh - 0.03 * l;
        let bb = b + 0.12 * sh * sh - 0.10 * l * l;
        [rr, gg, bb] = satMix(rr, gg, bb, 1.08);
        rr = sCurve(rr, 0.12);
        gg = sCurve(gg, 0.12);
        bb = sCurve(bb, 0.12);
        return [rr, gg, bb];
      }),
    }),
  },
  {
    name: "golden-hour",
    desc: "Warm lift, soft faded blacks",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        let rr = 0.04 + 0.98 * r + 0.08 * (1 - b);
        let gg = 0.02 + 0.99 * g + 0.02 * r;
        let bb = 0.10 + 0.88 * b;
        [rr, gg, bb] = satMix(rr, gg, bb, 1.15);
        return [rr, gg, bb];
      }),
    }),
  },
  {
    name: "noir",
    desc: "Desaturated film noir with punchy contrast",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        const [rr, gg, bb] = satMix(r, g, b, 0.12);
        return [sCurve(rr, 0.2), sCurve(gg, 0.2), sCurve(bb, 0.2)];
      }),
    }),
  },
  {
    name: "cool-film",
    desc: "Blue shadows, magenta highlights, low contrast",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let rr = r + 0.04 * l - 0.05 * (1 - l);
        let gg = g - 0.02;
        let bb = b + 0.08 * (1 - l) + 0.02 * l;
        [rr, gg, bb] = satMix(rr, gg, bb, 0.9);
        const c = 0.92;
        return [(rr - 0.5) * c + 0.5, (gg - 0.5) * c + 0.52, (bb - 0.5) * c + 0.52];
      }),
    }),
  },
  {
    name: "vivid-pop",
    desc: "High saturation, punchy contrast for social feeds",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        const [rr, gg, bb] = satMix(r, g, b, 1.35);
        return [sCurve(rr, 0.15), sCurve(gg, 0.15), sCurve(bb, 0.15)];
      }),
    }),
  },
];

let builtinCache = new Map<string, LutTable>();
export function builtinLut(name: string): LutTable | null {
  let t = builtinCache.get(name);
  if (!t) {
    const def = BUILTIN_LUTS.find((b) => b.name === name);
    if (def) {
      t = { name, size: def.build().size, data: def.build().data, builtin: true };
      builtinCache.set(name, t);
    }
  }
  return t ?? null;
}

/** Parse a standard .cube file → table. Throws on malformed input. */
export function parseCube(text: string): { size: number; data: Float32Array } {
  const lines = text.split(/\r?\n/);
  let size = 0;
  let i = 0;
  let domMin = 0;
  let domMax = 1;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("TITLE")) continue;
    const m = t.match(/^LUT_3D_SIZE\s+(\d+)/i);
    if (m) {
      size = Math.max(2, Math.min(64, parseInt(m[1], 10)));
      i++;
      break;
    }
    if (t.startsWith("LUT_1D_SIZE")) throw new Error("1D LUTs are not supported");
  }
  if (!size) throw new Error("Not a 3D .cube LUT (missing LUT_3D_SIZE)");
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    const dm = t.match(/^DOMAIN_MIN\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/i);
    if (dm) {
      domMin = Math.min(parseFloat(dm[1]), parseFloat(dm[2]), parseFloat(dm[3]));
      continue;
    }
    const dM = t.match(/^DOMAIN_MAX\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/i);
    if (dM) {
      domMax = Math.max(parseFloat(dM[1]), parseFloat(dM[2]), parseFloat(dM[3]));
      continue;
    }
    if (t.length > 0) break;
  }
  const span = Math.max(1e-6, domMax - domMin);
  const vals: number[] = [];
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/\s+/).map(Number);
    for (const v of parts) if (isFinite(v)) vals.push((v - domMin) / span);
    if (vals.length >= size * size * size * 3) break;
  }
  const need = size * size * size * 3;
  if (vals.length < need) throw new Error("LUT data is truncated");
  const data = new Float32Array(need);
  for (let j = 0; j < need; j++) data[j] = clamp01(vals[j]);
  return { size, data };
}

/**
 * Trilinear 3D-LUT on RGBA pixel data, in place.
 * (Standard formulation — same as every LUT viewer / compositing suite.)
 */
export function applyLut(table: LutTable, px: Uint8ClampedArray): void {
  const n = table.size;
  const inv = 1 / (n - 1);
  const data = table.data;
  const step = n * n;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] * inv;
    let g = px[i + 1] * inv;
    let b = px[i + 2] * inv;
    const r0 = Math.min(n - 2, r | 0);
    const g0 = Math.min(n - 2, g | 0);
    const b0 = Math.min(n - 2, b | 0);
    const rf = r - r0;
    const gf = g - g0;
    const bf = b - b0;
    for (let c = 0; c < 3; c++) {
      const v000 = data[(b0 * n + g0 * n + r0) * 3 + c];
      const v100 = data[(b0 * n + g0 * n + r0 + 1) * 3 + c];
      const v010 = data[(b0 * n + (g0 + 1) * n + r0) * 3 + c];
      const v110 = data[(b0 * n + (g0 + 1) * n + r0 + 1) * 3 + c];
      const v001 = data[((b0 + 1) * n + g0 * n + r0) * 3 + c];
      const v101 = data[((b0 + 1) * n + g0 * n + r0 + 1) * 3 + c];
      const v011 = data[((b0 + 1) * n + (g0 + 1) * n + r0) * 3 + c];
      const v111 = data[((b0 + 1) * n + (g0 + 1) * n + r0 + 1) * 3 + c];
      const c00 = v000 + (v100 - v000) * rf;
      const c10 = v010 + (v110 - v010) * rf;
      const c01 = v001 + (v101 - v001) * rf;
      const c11 = v011 + (v111 - v011) * rf;
      const c0 = c00 + (c10 - c00) * gf;
      const c1 = c01 + (c11 - c01) * gf;
      const v = c0 + (c1 - c0) * bf;
      px[i + c] = v * 255;
    }
    void step;
  }
}

// --------------------------------------------------------------- persistence

/** All LUT names available to the UI (built-ins + imported). */
export async function listLutNames(): Promise<{ id: string; name: string; builtin: boolean }[]> {
  const out = BUILTIN_LUTS.map((b) => ({ id: b.name, name: b.name, builtin: true }));
  try {
    const imported = await import("./idb").then((m) => m.db.listLuts());
    for (const r of imported) out.push({ id: r.id, name: r.name, builtin: false });
  } catch {
    /* IDB unavailable — built-ins only */
  }
  return out;
}

export async function importLut(name: string, blob: Blob): Promise<LutTable> {
  const text = await blob.text();
  const { size, data } = parseCube(text);
  const { db } = await import("./idb");
  await db.saveLut({ id: name, name, size, data: data.buffer as ArrayBuffer, createdAt: Date.now() });
  return { name, size, data };
}

export async function loadLut(name: string): Promise<LutTable | null> {
  const b = builtinLut(name);
  if (b) return b;
  const { db } = await import("./idb");
  const rec = await db.listLuts().then((all) => all.find((r) => r.id === name));
  if (!rec) return null;
  return { name: rec.name, size: rec.size, data: new Float32Array(rec.data) };
}

/** Load every available LUT into a map (for the engine cache). */
export async function loadAllLuts(): Promise<Map<string, LutTable>> {
  const map = new Map<string, LutTable>();
  for (const b of BUILTIN_LUTS) {
    const t = builtinLut(b.name);
    if (t) map.set(t.name, t);
  }
  try {
    const { db } = await import("./idb");
    for (const rec of await db.listLuts())
      map.set(rec.name, { name: rec.name, size: rec.size, data: new Float32Array(rec.data) });
  } catch {
    /* ignore */
  }
  return map;
}
