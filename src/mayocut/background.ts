import { applyAlphaMask } from "./background-math";

const MODEL_ID = "Xenova/modnet";
const MODEL_REVISION = "1630fe9ce1a780c85c1f7ca1f919379ee1480e1a";

type Progress = { status?: string; file?: string; progress?: number };
type RawImage = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
  resize(width: number, height: number): Promise<RawImage>;
};
type Segment = { mask?: RawImage };
type Segmenter = (image: RawImage) => Promise<Segment[]>;

let segmenterPromise: Promise<Segmenter> | null = null;

function assetBase(): string {
  const proto = window.location.protocol;
  if (proto === "file:" || proto === "capacitor:" || proto === "http-capacitor:") {
    return new URL("./", window.location.href).href;
  }
  return window.location.origin + "/";
}

async function getSegmenter(
  onProgress?: (message: string, pct?: number) => void,
): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.backends.onnx.wasm.proxy = false;
      env.backends.onnx.wasm.wasmPaths = assetBase() + "onnx/";
      const pipe = await pipeline("image-segmentation", MODEL_ID, {
        revision: MODEL_REVISION,
        quantized: false,
        progress_callback: (event: Progress) => {
          if (event.status === "progress" && typeof event.progress === "number") {
            onProgress?.(`Downloading ${event.file ?? "background model"}…`, event.progress);
          } else if (event.status === "done") {
            onProgress?.("Model cached on this device");
          }
        },
      } as unknown as Parameters<typeof pipeline>[2]);
      return pipe as unknown as Segmenter;
    })().catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

/** Remove the background from a still image locally and return a transparent PNG. */
export async function removeImageBackground(
  source: Blob,
  onProgress?: (message: string, pct?: number) => void,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!source.type.startsWith("image/")) {
    throw new Error("Background removal currently supports still images only");
  }
  onProgress?.("Loading the local portrait-matting model…");
  const [{ RawImage }, segmenter] = await Promise.all([
    import("@xenova/transformers"),
    getSegmenter(onProgress),
  ]);
  const input = (await RawImage.fromBlob(source)) as RawImage;
  const segments = await segmenter(input);
  const matte = segments.find((segment) => segment.mask)?.mask;
  if (!matte) throw new Error("The model did not return a usable subject mask");
  const mask =
    matte.width === input.width && matte.height === input.height
      ? matte
      : await matte.resize(input.width, input.height);
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create an image-processing canvas");
    ctx.drawImage(bitmap, 0, 0);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgba = applyAlphaMask(frame.data, mask.data, canvas.width, canvas.height, mask.channels);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("Could not encode the transparent PNG"));
      }, "image/png");
    });
    onProgress?.("Background removed");
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
