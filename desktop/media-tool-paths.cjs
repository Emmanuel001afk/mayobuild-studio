const path = require("node:path");

/** Windows builds use only bundled tools, never a PATH executable of unknown origin. */
function mediaToolPaths({ platform, isPackaged, resourcesPath, baseDir }) {
  if (platform !== "win32") return { ffmpeg: "ffmpeg", ffprobe: "ffprobe", bundled: false };
  const directory = isPackaged
    ? path.join(resourcesPath, "media-tools")
    : path.join(baseDir, "media-tools", "win-x64");
  return {
    ffmpeg: path.join(directory, "ffmpeg.exe"),
    ffprobe: path.join(directory, "ffprobe.exe"),
    bundled: true,
  };
}
module.exports = { mediaToolPaths };
