#!/usr/bin/env node
// Vendor the sherpa-onnx (k2-fsa, MIT) emscripten TTS runtime into public/tts/
// for browser use.
//
// The npm package `sherpa-onnx` ships a Node-oriented emscripten build whose
// runtime calls `require("path")` unconditionally. This script copies the
// runtime + wasm + TTS glue into public/tts/ and patches that one call with a
// small string-based path helper (the only Node builtin referenced outside a
// `ENVIRONMENT_IS_NODE` guard — verified against sherpa-onnx 2.0.1).
//
// The files are committed to the repo (like public/wllama/wllama.wasm) so
// dev + CI work without regeneration. Re-run after upgrading sherpa-onnx:
//   node scripts/tts-assets.mjs
//
// Model files are NOT vendored (≈70 MB): the app downloads them on first use
// into IndexedDB (see src/mayocut/tts.ts), from the k2-fsa Hugging Face repo
// `csukuangfj/vits-piper-en_US-amy-low` (pre-extracted, mirrors the official
// `tts-models` release tarball).

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "sherpa-onnx");
const out = join(root, "public", "tts");
mkdirSync(out, { recursive: true });

// 1) runtime: patch the unconditional require("path")
const glueWasm = readFileSync(join(src, "sherpa-onnx-wasm-nodejs.js"), "utf8");
const needle = `var nodePath=require("path")`;
if (!glueWasm.includes(needle)) {
  console.error("FATAL: expected `var nodePath=require(\"path\")` in sherpa-onnx-wasm-nodejs.js — package layout changed?");
  process.exit(1);
}
const polyfill = `var nodePath={isAbs:function(p){return String(p).charCodeAt(0)===47;},normalize:function(p){return String(p);},dirname:function(p){p=String(p);var i=p.lastIndexOf("/");return i>0?p.slice(0,i):"/";},basename:function(p){p=String(p);return p.slice(p.lastIndexOf("/")+1);},join:function(){var r="";for(var i=0;i<arguments.length;i++){var a=arguments[i];if(!a)continue;r+=r&&r[r.length-1]!=="/"?"/"+a:a;}return r||".";},join2:function(a,b){return a?a.endsWith("/")?a+b:a+"/"+b:String(b);}}`;
writeFileSync(join(out, "wasm.js"), glueWasm.replace(needle, polyfill));

// 2) wasm binary (unchanged). Keep the original file name: the emscripten
// runtime resolves it via locateFile("sherpa-onnx-wasm-nodejs.wasm"), which
// in a dedicated worker is relative to the worker script's own URL.
copyFileSync(join(src, "sherpa-onnx-wasm-nodejs.wasm"), join(out, "sherpa-onnx-wasm-nodejs.wasm"));

// 3) TTS glue (unchanged — its CJS export is guarded by a process check, which
//    is simply false in a classic worker, so top-level function declarations
//    become globals, exactly like k2-fsa's own sherpa-onnx-tts.worker.js)
copyFileSync(join(src, "sherpa-onnx-tts.js"), join(out, "glue.js"));

// 4) the worker itself is authored directly (public/tts/tts-worker.js).
console.log("public/tts/ vendored: wasm.js (patched), sherpa-onnx-wasm-nodejs.wasm, glue.js");
