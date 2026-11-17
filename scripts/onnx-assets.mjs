// Copies the onnxruntime-web wasm/js assets into public/onnx/ so the local
// Whisper captions run fully offline (also inside the Electron/Capacitor
// shells, where there is no CDN).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "node_modules", "onnxruntime-web", "dist");
const dst = path.join(root, "public", "onnx");

if (!existsSync(src)) {
  console.warn("[onnx-assets] onnxruntime-web not found — skipping (captions model loading will use defaults)");
  process.exit(0);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
// Only what transformers.js (onnxruntime-web 1.14) actually fetches:
// the single-threaded + threaded SIMD wasm blobs and the small worker glue.
// (Non-SIMD fallbacks for 2015-era browsers are deliberately skipped.)
const KEEP = [/^ort-wasm-simd\.wasm$/, /^ort-wasm-simd-threaded\.wasm$/, /^ort-wasm-threaded\.(js|worker\.js)$/];
let n = 0;
for (const f of readdirSync(src)) {
  if (KEEP.some((re) => re.test(f))) {
    cpSync(path.join(src, f), path.join(dst, f));
    n++;
  }
}
console.log(`[onnx-assets] copied ${n} files to public/onnx/`);
