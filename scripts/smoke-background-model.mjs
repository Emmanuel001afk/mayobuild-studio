import assert from "node:assert/strict";
import * as ortModule from "onnxruntime-node";
const ort = ortModule.default?.default ?? ortModule.default ?? ortModule;
console.log("Native ONNX Runtime configured for CPU inference.");

const MODEL_REVISION = "1630fe9ce1a780c85c1f7ca1f919379ee1480e1a";
const MODEL_URL = `https://huggingface.co/Xenova/modnet/resolve/${MODEL_REVISION}/onnx/model.onnx`;

console.log("Downloading pinned MODNet ONNX model…");
const response = await fetch(MODEL_URL);
assert.ok(response.ok, `Model download failed: HTTP ${response.status}`);
const model = await response.arrayBuffer();
assert.ok(model.byteLength > 1_000_000, "MODNet ONNX model download is unexpectedly small");
console.log(`Model downloaded: ${(model.byteLength / 1024 / 1024).toFixed(1)} MB`);

const session = await ort.InferenceSession.create(model, {
  executionProviders: ["wasm"],
  graphOptimizationLevel: "all",
});
assert.equal(session.inputNames.length, 1, "Expected one MODNet input");
assert.equal(session.outputNames.length, 1, "Expected one MODNet output");
console.log("Model input:", session.inputNames[0], "output:", session.outputNames[0]);

const width = 512;
const height = 512;
const pixels = new Float32Array(1 * 3 * height * width);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const head = (x - 256) ** 2 + (y - 125) ** 2 < 52 ** 2;
    const torso = x > 170 && x < 342 && y > 180 && y < 460;
    const subject = head || torso;
    const r = (subject ? 205 : 42) / 255;
    const g = (subject ? 145 : 68) / 255;
    const b = (subject ? 112 : 94) / 255;
    const index = y * width + x;
    pixels[index] = (r - 0.5) / 0.5;
    pixels[width * height + index] = (g - 0.5) / 0.5;
    pixels[2 * width * height + index] = (b - 0.5) / 0.5;
  }
}
const input = new ort.Tensor("float32", pixels, [1, 3, height, width]);
console.log("Running MODNet ONNX inference…");
const output = await session.run({ [session.inputNames[0]]: input });
const matte = output[session.outputNames[0]];
assert.ok(matte, "MODNet did not return an output tensor");
assert.ok(matte.dims.length >= 2 && matte.dims.every((d) => d > 0), "MODNet output dimensions are invalid");
assert.ok(matte.data.length > 0, "MODNet returned an empty matte");
let min = Infinity;
let max = -Infinity;
for (const value of matte.data) {
  min = Math.min(min, value);
  max = Math.max(max, value);
}
assert.ok(max - min > 0.1, "MODNet matte has no useful foreground/background variation");
console.log(
  `MODNET SMOKE PASS — output [${matte.dims.join("×")}], ${matte.data.length} values, full range ${min.toFixed(3)}–${max.toFixed(3)}`,
);
await session.release();

