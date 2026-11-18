import assert from "node:assert/strict";
import { pipeline, env, RawImage } from "@xenova/transformers";

const MODEL_ID = "Xenova/modnet";
const MODEL_REVISION = "1630fe9ce1a780c85c1f7ca1f919379ee1480e1a";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = false;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.numThreads = 1;

console.log("Loading pinned MODNet model for a real inference smoke test…");
const segmenter = await pipeline("image-segmentation", MODEL_ID, {
  revision: MODEL_REVISION,
  quantized: false,
  progress_callback: (event) => {
    if (event.status === "progress") {
      console.log(`Downloading ${event.file ?? "model"}: ${Math.round(event.progress ?? 0)}%`);
    }
  },
});

const width = 512;
const height = 512;
const pixels = new Uint8Array(width * height * 3);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    const head = (x - 256) ** 2 + (y - 125) ** 2 < 52 ** 2;
    const torso = x > 170 && x < 342 && y > 180 && y < 460;
    const subject = head || torso;
    pixels[i] = subject ? 205 : 42;
    pixels[i + 1] = subject ? 145 : 68;
    pixels[i + 2] = subject ? 112 : 94;
  }
}
const input = new RawImage(pixels, width, height, 3);
console.log("Running local inference…");
const segments = await segmenter(input);
assert.ok(Array.isArray(segments) && segments.length > 0, "MODNet returned no segmentation output");
const mask = segments.find((segment) => segment.mask)?.mask;
assert.ok(mask, "MODNet did not return a matte");
assert.ok(mask.width > 0 && mask.height > 0, "MODNet returned an empty matte");
assert.ok(mask.data.length >= mask.width * mask.height, "MODNet matte data is incomplete");
console.log(
  `MODNET SMOKE PASS — ${mask.width}×${mask.height} matte, ${mask.channels} channel(s), ${mask.data.length} values`,
);
