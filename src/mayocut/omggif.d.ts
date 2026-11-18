// Minimal typings for omggif (Google's public GIF decoder, untyped package).
declare module "omggif" {
  export interface GifFrameInfo {
    width: number;
    height: number;
    top: number;
    left: number;
    delay: number;
    palette: boolean;
    transparent: boolean;
    interlace: boolean;
  }
  export interface GifWriterOptions {
    loop?: number;
    palette?: number[]; // global palette (hex rgb, power-of-two length)
    background?: number;
  }
  export interface GifFrameOptions {
    delay?: number; // centiseconds
    disposal?: number;
    transparent?: number | null;
    palette?: number[] | null;
  }
  export class GifWriter {
    constructor(buf: Uint8Array, width: number, height: number, opts?: GifWriterOptions);
    addFrame(
      x: number,
      y: number,
      w: number,
      h: number,
      indices: number[] | Uint8Array,
      opts?: GifFrameOptions,
    ): number;
    end(): number;
  }
  export class GifReader {
    constructor(data: Uint8Array);
    width: number;
    height: number;
    numFrames(): number;
    frameInfo(n: number): GifFrameInfo | null;
    decodeAndBlitFrameRGBA(n: number, output: Uint8ClampedArray): void;
    getPalette(n: number, out: Uint8Array): number;
    decodeAndIndexPixels(n: number, out: Uint8Array): void;
  }
}
