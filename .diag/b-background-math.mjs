// src/mayocut/background-math.ts
function applyAlphaMask(rgba, mask, width, height, maskChannels = 1) {
  const pixels = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Image dimensions must be positive integers");
  }
  if (!Number.isInteger(maskChannels) || maskChannels < 1 || maskChannels > 4) {
    throw new Error("Mask channels must be between 1 and 4");
  }
  if (rgba.length !== pixels * 4 || mask.length !== pixels * maskChannels) {
    throw new Error("Image and matte dimensions do not match");
  }
  const output = new Uint8ClampedArray(rgba);
  for (let i = 0; i < pixels; i++) {
    const alpha = mask[i * maskChannels];
    output[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * alpha / 255);
  }
  return output;
}
export {
  applyAlphaMask
};
