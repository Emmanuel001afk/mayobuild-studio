import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
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
  executionProviders: ["cpu"],
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
let foregroundPixels = 0;
for (const value of matte.data) {
  min = Math.min(min, value);
  max = Math.max(max, value);
  if (value > 0.5) foregroundPixels++;
}
const foregroundRatio = foregroundPixels / matte.data.length;
assert.ok(max - min > 0.1, "MODNet matte has no useful foreground/background variation");
assert.ok(foregroundRatio > 0.03 && foregroundRatio < 0.9, `Unexpected foreground ratio: ${foregroundRatio}`);
console.log(
  `MODNET SMOKE PASS — output [${matte.dims.join("×")}], range ${min.toFixed(3)}–${max.toFixed(3)}, foreground ${(foregroundRatio * 100).toFixed(1)}%`,
);


let webInferencePassed = false;
process.on("exit", () => {
  // ORT Web 1.14's Node-only worker teardown can set exitCode=7 after a
  // successful run. Do not mask inference/assertion failures.
  if (webInferencePassed && process.exitCode === 7) process.exitCode = 0;
});
const webModule = await import("onnxruntime-web");
const webRuntime = webModule.default ?? webModule;
webRuntime.env.wasm.numThreads = 1;
webRuntime.env.wasm.proxy = false;
webRuntime.env.wasm.wasmPaths = fileURLToPath(new URL("../node_modules/onnxruntime-web/dist/", import.meta.url));
const webSession = await webRuntime.InferenceSession.create(model, {
  executionProviders: ["wasm"],
  graphOptimizationLevel: "all",
});
const webInput = new webRuntime.Tensor("float32", pixels, [1, 3, height, width]);
console.log("Running MODNet through ONNX Runtime Web/WASM…");
const webOutput = await webSession.run({ [webSession.inputNames[0]]: webInput });
const webMatte = webOutput[webSession.outputNames[0]];
assert.ok(webMatte, "ONNX Runtime Web returned no matte");
assert.deepEqual(webMatte.dims, [1, 1, height, width], "Unexpected ONNX Runtime Web matte dimensions");
let webMin = Infinity;
let webMax = -Infinity;
let webForeground = 0;
for (const value of webMatte.data) {
  webMin = Math.min(webMin, value);
  webMax = Math.max(webMax, value);
  if (value > 0.5) webForeground++;
}
const webForegroundRatio = webForeground / webMatte.data.length;
assert.ok(webMax - webMin > 0.1, "WASM matte has no foreground/background variation");
assert.ok(webForegroundRatio > 0.03 && webForegroundRatio < 0.9, `Unexpected WASM foreground ratio: ${webForegroundRatio}`);
webInferencePassed = true;
console.log(
  `WEB-WASM MODNET PASS — output [${webMatte.dims.join("×")}], foreground ${(webForegroundRatio * 100).toFixed(1)}%`,
);
