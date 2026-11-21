var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/mayocut/idb.ts
var idb_exports = {};
__export(idb_exports, {
  db: () => db,
  requestPersistentStorage: () => requestPersistentStorage,
  storageUsage: () => storageUsage
});
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db2 = req.result;
      for (const s of STORES) {
        if (!db2.objectStoreNames.contains(s)) db2.createObjectStore(s, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db2 = req.result;
      db2.onversionchange = () => {
        db2.close();
        dbPromise = null;
      };
      resolve(db2);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Failed to open Mayocut local storage"));
    };
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}
async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
async function storageUsage() {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return null;
    return { used: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}
function tx(store, mode, fn) {
  return open().then(
    (db2) => new Promise((resolve, reject) => {
      const t = db2.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}
var DB_NAME, DB_VERSION, STORES, dbPromise, db;
var init_idb = __esm({
  "src/mayocut/idb.ts"() {
    "use strict";
    DB_NAME = "mayocut-db";
    DB_VERSION = 3;
    STORES = ["media", "blobs", "projects", "templates", "exports", "luts", "fonts"];
    dbPromise = null;
    db = {
      // --- media ---
      listMedia: () => tx("media", "readonly", (s) => s.getAll()),
      putMedia: (item, blob) => open().then(
        (db2) => new Promise((resolve, reject) => {
          const t = db2.transaction(["media", "blobs"], "readwrite");
          t.objectStore("media").put(item);
          t.objectStore("blobs").put({ id: item.id, blob });
          t.oncomplete = () => resolve(void 0);
          t.onerror = () => reject(t.error);
        })
      ),
      getBlob: (id) => tx("blobs", "readonly", (s) => s.get(id)).then(
        (r) => r?.blob
      ),
      // --- preview proxies (never used for export) ---
      getProxy: (mediaId) => tx(
        "blobs",
        "readonly",
        (s) => s.get(`proxy_${mediaId}`)
      ).then((r) => r?.blob),
      putProxy: (mediaId, blob) => tx("blobs", "readwrite", (s) => s.put({ id: `proxy_${mediaId}`, blob })),
      deleteProxy: (mediaId) => tx("blobs", "readwrite", (s) => s.delete(`proxy_${mediaId}`)),
      /** Store a blob with a custom id (TTS model files) without touching the media store. */
      putRawBlob: (id, blob) => tx("blobs", "readwrite", (s) => s.put({ id, blob })),
      deleteMedia: (id) => open().then(
        (db2) => new Promise((resolve, reject) => {
          const t = db2.transaction(["media", "blobs"], "readwrite");
          t.objectStore("media").delete(id);
          t.objectStore("blobs").delete(id);
          t.oncomplete = () => resolve(void 0);
          t.onerror = () => reject(t.error);
        })
      ),
      // --- projects ---
      listProjects: () => tx("projects", "readonly", (s) => s.getAll()),
      saveProject: (p) => tx("projects", "readwrite", (s) => s.put(p)),
      getProject: (id) => tx("projects", "readonly", (s) => s.get(id)),
      deleteProject: (id) => tx("projects", "readwrite", (s) => s.delete(id)),
      // --- user templates ---
      listTemplates: () => tx("templates", "readonly", (s) => s.getAll()),
      saveTemplate: (t) => tx("templates", "readwrite", (s) => s.put(t)),
      deleteTemplate: (id) => tx("templates", "readwrite", (s) => s.delete(id)),
      // --- imported LUTs (.cube) ---
      listLuts: () => tx("luts", "readonly", (s) => s.getAll()),
      saveLut: (r) => tx("luts", "readwrite", (s) => s.put(r)),
      deleteLut: (id) => tx("luts", "readwrite", (s) => s.delete(id)),
      // --- imported fonts (ttf/otf bytes, kept on-device) ---
      listFonts: () => tx("fonts", "readonly", (s) => s.getAll()),
      saveFont: (f) => tx("fonts", "readwrite", (s) => s.put(f)),
      deleteFont: (id) => tx("fonts", "readwrite", (s) => s.delete(id)),
      // --- exports ---
      listExports: () => tx("exports", "readonly", (s) => s.getAll()),
      saveExport: (item, blob) => open().then(
        (db2) => new Promise((resolve, reject) => {
          const t = db2.transaction(["exports", "blobs"], "readwrite");
          t.objectStore("exports").put(item);
          t.objectStore("blobs").put({ id: `exp_${item.id}`, blob });
          t.oncomplete = () => resolve(void 0);
          t.onerror = () => reject(t.error);
        })
      ),
      getExportBlob: (id) => tx("blobs", "readonly", (s) => s.get(`exp_${id}`)).then(
        (r) => r?.blob
      ),
      deleteExport: (id) => open().then(
        (db2) => new Promise((resolve, reject) => {
          const t = db2.transaction(["exports", "blobs"], "readwrite");
          t.objectStore("exports").delete(id);
          t.objectStore("blobs").delete(`exp_${id}`);
          t.oncomplete = () => resolve(void 0);
          t.onerror = () => reject(t.error);
        })
      )
    };
  }
});

// src/mayocut/luts.ts
var clamp01 = (v) => Math.max(0, Math.min(1, v));
function genTable(size, fn) {
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
var sCurve = (v, amt) => clamp01(v + amt * Math.sin(Math.PI * v) * (v < 0.5 ? 1 : -1) * 0.5);
function satMix(r, g, b, sat) {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [y + (r - y) * sat, y + (g - y) * sat, y + (b - y) * sat];
}
var BUILTIN_LUTS = [
  {
    name: "teal-orange",
    desc: "Teal shadows, orange highlights, contrast S-curve",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const sh = 1 - l;
        let rr = r + 0.1 * l * l - 0.1 * sh * sh;
        let gg = g + 0.05 * sh - 0.03 * l;
        let bb = b + 0.12 * sh * sh - 0.1 * l * l;
        [rr, gg, bb] = satMix(rr, gg, bb, 1.08);
        rr = sCurve(rr, 0.12);
        gg = sCurve(gg, 0.12);
        bb = sCurve(bb, 0.12);
        return [rr, gg, bb];
      })
    })
  },
  {
    name: "golden-hour",
    desc: "Warm lift, soft faded blacks",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        let rr = 0.04 + 0.98 * r + 0.08 * (1 - b);
        let gg = 0.02 + 0.99 * g + 0.02 * r;
        let bb = 0.1 + 0.88 * b;
        [rr, gg, bb] = satMix(rr, gg, bb, 1.15);
        return [rr, gg, bb];
      })
    })
  },
  {
    name: "noir",
    desc: "Desaturated film noir with punchy contrast",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        const [rr, gg, bb] = satMix(r, g, b, 0.12);
        return [sCurve(rr, 0.2), sCurve(gg, 0.2), sCurve(bb, 0.2)];
      })
    })
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
      })
    })
  },
  {
    name: "vivid-pop",
    desc: "High saturation, punchy contrast for social feeds",
    build: () => ({
      size: 17,
      data: genTable(17, (r, g, b) => {
        const [rr, gg, bb] = satMix(r, g, b, 1.35);
        return [sCurve(rr, 0.15), sCurve(gg, 0.15), sCurve(bb, 0.15)];
      })
    })
  }
];
var builtinCache = /* @__PURE__ */ new Map();
function builtinLut(name) {
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
function parseCube(text) {
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
  const vals = [];
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
function applyLut(table, px) {
  const n = table.size;
  const scale = (n - 1) / 255;
  const data = table.data;
  const step = n * n;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] * scale;
    const g = px[i + 1] * scale;
    const b = px[i + 2] * scale;
    const r0 = Math.min(n - 2, r | 0);
    const g0 = Math.min(n - 2, g | 0);
    const b0 = Math.min(n - 2, b | 0);
    const rf = r - r0;
    const gf = g - g0;
    const bf = b - b0;
    for (let c = 0; c < 3; c++) {
      const v000 = data[(b0 * step + g0 * n + r0) * 3 + c];
      const v100 = data[(b0 * step + g0 * n + r0 + 1) * 3 + c];
      const v010 = data[(b0 * step + (g0 + 1) * n + r0) * 3 + c];
      const v110 = data[(b0 * step + (g0 + 1) * n + r0 + 1) * 3 + c];
      const v001 = data[((b0 + 1) * step + g0 * n + r0) * 3 + c];
      const v101 = data[((b0 + 1) * step + g0 * n + r0 + 1) * 3 + c];
      const v011 = data[((b0 + 1) * step + (g0 + 1) * n + r0) * 3 + c];
      const v111 = data[((b0 + 1) * step + (g0 + 1) * n + r0 + 1) * 3 + c];
      const c00 = v000 + (v100 - v000) * rf;
      const c10 = v010 + (v110 - v010) * rf;
      const c01 = v001 + (v101 - v001) * rf;
      const c11 = v011 + (v111 - v011) * rf;
      const c0 = c00 + (c10 - c00) * gf;
      const c1 = c01 + (c11 - c01) * gf;
      const v = c0 + (c1 - c0) * bf;
      px[i + c] = v * 255;
    }
  }
}
async function listLutNames() {
  const out = BUILTIN_LUTS.map((b) => ({ id: b.name, name: b.name, builtin: true }));
  try {
    const imported = await Promise.resolve().then(() => (init_idb(), idb_exports)).then((m) => m.db.listLuts());
    for (const r of imported) out.push({ id: r.id, name: r.name, builtin: false });
  } catch {
  }
  return out;
}
async function importLut(name, blob) {
  const text = await blob.text();
  const { size, data } = parseCube(text);
  const { db: db2 } = await Promise.resolve().then(() => (init_idb(), idb_exports));
  await db2.saveLut({
    id: name,
    name,
    size,
    data: data.buffer,
    createdAt: Date.now()
  });
  return { name, size, data };
}
async function loadLut(name) {
  const b = builtinLut(name);
  if (b) return b;
  const { db: db2 } = await Promise.resolve().then(() => (init_idb(), idb_exports));
  const rec = await db2.listLuts().then((all) => all.find((r) => r.id === name));
  if (!rec) return null;
  return { name: rec.name, size: rec.size, data: new Float32Array(rec.data) };
}
async function loadAllLuts() {
  const map = /* @__PURE__ */ new Map();
  for (const b of BUILTIN_LUTS) {
    const t = builtinLut(b.name);
    if (t) map.set(t.name, t);
  }
  try {
    const { db: db2 } = await Promise.resolve().then(() => (init_idb(), idb_exports));
    for (const rec of await db2.listLuts())
      map.set(rec.name, { name: rec.name, size: rec.size, data: new Float32Array(rec.data) });
  } catch {
  }
  return map;
}
export {
  BUILTIN_LUTS,
  applyLut,
  builtinLut,
  importLut,
  listLutNames,
  loadAllLuts,
  loadLut,
  parseCube
};
