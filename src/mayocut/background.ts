import { db } from "./idb";
import { applyAlphaMask } from "./background-math";

const MODEL_REVISION = "1630fe9ce1a780c85c1f7ca1f919379ee1480e1a";
const MODEL_URL = `https://huggingface.co/Xenova/modnet/resolve/${MODEL_REVISION}/onnx/model.onnx`;
const MODEL_CACHE_ID = `ai_modnet_${MODEL_REVISION.slice(0, 7)}`;
const MODEL_SIZE = 512;

type Progress = (message: string, pct?: number) => void;
type RuntimeTensor = { data: Float32Array; dims: number[] };
type RuntimeSession = {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, RuntimeTensor>>;
};
type Runtime = {
  env: { wasm: { numThreads: number; proxy: boolean; wasmPaths: string } };
  InferenceSession: {
    create(
      model: ArrayBuffer,
      options: { executionProviders: string[]; graphOptimizationLevel: "all" },
    ): Promise<RuntimeSession>;
  };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
};

let modelBlobPromise: Promise<Blob> | null = null;
let sessionPromise: Promise<{ runtime: Runtime; session: RuntimeSession }> | null = null;

function assetBase(): string {
  const protocol = window.location.protocol;
  if (protocol === "file:" || protocol === "capacitor:" || protocol === "http-capacitor:") {
    return new URL("./", window.location.href).href;
  }
  return window.location.origin + "/";
}

async function loadModelBlob(onProgress?: Progress): Promise<Blob> {
  if (!modelBlobPromise) {
    modelBlobPromise = (async () => {
      const cached = await db.getBlob(MODEL_CACHE_ID);
      if (cached && cached.size > 1_000_000) {
        onProgress?.("Using the background model cached on this device");
        return cached;
      }
      onProgress?.("Downloading MODNet portrait model (about 25 MB)…");
      const response = await fetch(MODEL_URL);
      if (!response.ok) throw new Error(`Background model download failed (HTTP ${response.status})`);
      const blob = await response.blob();
      if (blob.size < 1_000_000) throw new Error("The downloaded background model is incomplete");
      await db.putRawBlob(MODEL_CACHE_ID, blob);
      onProgress?.("Model saved locally for offline use");
      return blob;
    })().catch((error) => {
      modelBlobPromise = null;
      throw error;
    });
  }
  return modelBlobPromise;
}

async function getSession(onProgress?: Progress): Promise<{
  runtime: Runtime;
  session: RuntimeSession;
}> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const [blob, module] = await Promise.all([
        loadModelBlob(onProgress),
        import("onnxruntime-web"),
      ]);
      const runtimeModule = module as unknown as { default?: Runtime };
      const runtime = runtimeModule.default ?? (module as unknown as Runtime);
      runtime.env.wasm.numThreads = 1;
      runtime.env.wasm.proxy = false;
      runtime.env.wasm.wasmPaths = assetBase() + "onnx/";
      onProgress?.("Starting local AI inference…");
      const session = await runtime.InferenceSession.create(await blob.arrayBuffer(), {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      if (session.inputNames.length !== 1 || session.outputNames.length !== 1) {
        throw new Error("The downloaded model has an unexpected input/output layout");
      }
      return { runtime, session };
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

/** Remove a still-image background locally and return a transparent PNG. */
export async function removeImageBackground(
  source: Blob,
  onProgress?: Progress,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!source.type.startsWith("image/")) {
    throw new Error("Background removal currently supports still images only");
  }
  const bitmap = await createImageBitmap(source);
  try {
    const { runtime, session } = await getSession(onProgress);
    const width = bitmap.width;
    const height = bitmap.height;
    const inputCanvas = document.createElement("canvas");
    inputCanvas.width = MODEL_SIZE;
    inputCanvas.height = MODEL_SIZE;
    const inputContext = inputCanvas.getContext("2d", { willReadFrequently: true });
    if (!inputContext) throw new Error("Could not prepare the image for AI processing");

    const scale = Math.min(MODEL_SIZE / width, MODEL_SIZE / height);
    const drawWidth = Math.max(1, Math.round(width * scale));
    const drawHeight = Math.max(1, Math.round(height * scale));
    const drawX = Math.floor((MODEL_SIZE - drawWidth) / 2);
    const drawY = Math.floor((MODEL_SIZE - drawHeight) / 2);
    inputContext.fillStyle = "#808080";
    inputContext.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
    inputContext.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);

    const pixels = inputContext.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
    const planeSize = MODEL_SIZE * MODEL_SIZE;
    const tensorData = new Float32Array(planeSize * 3);
    for (let i = 0; i < planeSize; i++) {
      tensorData[i] = (pixels[i * 4] / 255 - 0.5) / 0.5;
      tensorData[planeSize + i] = (pixels[i * 4 + 1] / 255 - 0.5) / 0.5;
      tensorData[planeSize * 2 + i] = (pixels[i * 4 + 2] / 255 - 0.5) / 0.5;
    }

    onProgress?.("Separating the subject from the background…");
    const input = new runtime.Tensor("float32", tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]);
    const outputs = await session.run({ [session.inputNames[0]]: input });
    const matte = outputs[session.outputNames[0]];
    if (
      !matte ||
      matte.dims.length !== 4 ||
      matte.dims[0] !== 1 ||
      matte.dims[1] !== 1 ||
      matte.dims[2] !== MODEL_SIZE ||
      matte.dims[3] !== MODEL_SIZE
    ) {
      throw new Error("The background model returned an unexpected matte size");
    }

    const matteCanvas = document.createElement("canvas");
    matteCanvas.width = MODEL_SIZE;
    matteCanvas.height = MODEL_SIZE;
    const matteContext = matteCanvas.getContext("2d");
    if (!matteContext) throw new Error("Could not prepare the subject mask");
    const mattePixels = matteContext.createImageData(MODEL_SIZE, MODEL_SIZE);
    for (let i = 0; i < planeSize; i++) {
      const value = Math.max(0, Math.min(1, matte.data[i]));
      const alpha = Math.round(value * 255);
      const offset = i * 4;
      mattePixels.data[offset] = alpha;
      mattePixels.data[offset + 1] = alpha;
      mattePixels.data[offset + 2] = alpha;
      mattePixels.data[offset + 3] = 255;
    }
    matteContext.putImageData(mattePixels, 0, 0);

    const fullMaskCanvas = document.createElement("canvas");
    fullMaskCanvas.width = width;
    fullMaskCanvas.height = height;
    const fullMaskContext = fullMaskCanvas.getContext("2d", { willReadFrequently: true });
    if (!fullMaskContext) throw new Error("Could not resize the subject mask");
    fullMaskContext.drawImage(
      matteCanvas,
      drawX,
      drawY,
      drawWidth,
      drawHeight,
      0,
      0,
      width,
      height,
    );
    const maskPixels = fullMaskContext.getImageData(0, 0, width, height).data;
    const alphaMask = new Uint8Array(width * height);
    for (let i = 0; i < alphaMask.length; i++) alphaMask[i] = maskPixels[i * 4];

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
    if (!outputContext) throw new Error("Could not create the transparent output image");
    outputContext.drawImage(bitmap, 0, 0);
    const originalPixels = outputContext.getImageData(0, 0, width, height);
    const rgba = applyAlphaMask(originalPixels.data, alphaMask, width, height);
    outputContext.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      outputCanvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("Could not encode the transparent PNG"));
      }, "image/png");
    });
    onProgress?.("Background removed — transparent cutout ready");
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
