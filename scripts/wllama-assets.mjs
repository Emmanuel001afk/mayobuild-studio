// Copies the wllama (wasm llama.cpp) binary that ships inside the installed
// @wllama/wllama package into public/wllama/ so the local-model tab runs
// fully offline (also inside the Electron/Capacitor shells, no CDN).
//
// Why this script exists: the repo used to commit a hand-copied wllama.wasm.
// When @wllama/wllama was bumped (^3.6.0 -> 3.13.x), the committed wasm was
// from an older libllama build, and the runtime version check failed with
// "wasm file version (unknown) does not match the expected version
// (b12211-...)". Copying from the installed package at build time makes the
// wasm and the JS glue come from the same release, by construction.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "node_modules", "@wllama", "wllama", "esm", "wasm", "wllama.wasm");
const dstDir = path.join(root, "public", "wllama");

if (!existsSync(src)) {
  console.warn("[wllama-assets] @wllama/wllama wasm not found — skipping (local models will fail to load)");
  process.exit(0);
}

rmSync(dstDir, { recursive: true, force: true });
mkdirSync(dstDir, { recursive: true });
cpSync(src, path.join(dstDir, "wllama.wasm"));
console.log("[wllama-assets] copied wllama.wasm (matching installed @wllama/wllama version)");
