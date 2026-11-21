const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { mediaToolPaths } = require("../desktop/media-tool-paths.cjs");

test("packaged Windows uses only executables inside application resources", () => {
  const result = mediaToolPaths({
    platform: "win32",
    isPackaged: true,
    resourcesPath: "/app/resources",
    baseDir: "/code",
  });
  assert.deepEqual(result, {
    ffmpeg: path.join("/app/resources", "media-tools", "ffmpeg.exe"),
    ffprobe: path.join("/app/resources", "media-tools", "ffprobe.exe"),
    bundled: true,
  });
});

test("development Windows uses staged executables; other platforms retain their existing fallback", () => {
  const dev = mediaToolPaths({
    platform: "win32",
    isPackaged: false,
    resourcesPath: "/ignored",
    baseDir: "/code",
  });
  assert.equal(dev.ffmpeg, path.join("/code", "media-tools", "win-x64", "ffmpeg.exe"));
  assert.equal(dev.ffprobe, path.join("/code", "media-tools", "win-x64", "ffprobe.exe"));
  assert.deepEqual(mediaToolPaths({ platform: "linux" }), {
    ffmpeg: "ffmpeg",
    ffprobe: "ffprobe",
    bundled: false,
  });
});
