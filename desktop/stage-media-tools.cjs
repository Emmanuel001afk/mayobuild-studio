// Electron builder beforePack hook: stage pinned Windows executables at build
// time, never at app runtime. Binaries are generated artifacts, not Git files.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const tar = require("tar");

const DEST = path.join(__dirname, "media-tools", "win-x64");
const TOOLS = [
  {
    name: "ffmpeg.exe",
    url: "https://registry.npmjs.org/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz",
    integrity:
      "Drt5u2vzDnIONf4ZEkKtFlbvwj6rI3kxw1Ck9fpudmtgaZIHD4ucsWB2lCZBXRxJgXR+2IMSti+4rtM4C4rXgg==",
    sha256: "c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e",
  },
  {
    name: "ffprobe.exe",
    url: "https://registry.npmjs.org/@ffprobe-installer/win32-x64/-/win32-x64-5.1.0.tgz",
    integrity:
      "jMGYeAgkrdn4e2vvYt/qakgHRE3CPju4bn5TmdPfoAm1BlX1mY9cyMd8gf5vSzI8gH8Zq5WQAyAkmekX/8TSTg==",
    sha256: "f28c4751e7367205267025aaf0fcfc921e34d9b7edaa46bd9c8abaf367fc9051",
  },
];

const hash = (algorithm, data, encoding) =>
  crypto.createHash(algorithm).update(data).digest(encoding);
async function validTool(file, expected) {
  try {
    return hash("sha256", await fs.readFile(file), "hex") === expected;
  } catch {
    return false;
  }
}
async function stage() {
  await fs.mkdir(DEST, { recursive: true });
  for (const tool of TOOLS) {
    const target = path.join(DEST, tool.name);
    if (await validTool(target, tool.sha256)) {
      console.log(`Media tool verified: ${tool.name}`);
      continue;
    }
    console.log(`Downloading pinned ${tool.name} for the Windows installer…`);
    const response = await fetch(tool.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Could not download ${tool.name}: HTTP ${response.status}`);
    const size = Number(response.headers.get("content-length"));
    if (size > 100 * 1024 * 1024) throw new Error(`Unexpectedly large package for ${tool.name}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 100 * 1024 * 1024 || hash("sha512", data, "base64") !== tool.integrity)
      throw new Error(`Integrity check failed for ${tool.name}`);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "mayocut-stage-"));
    try {
      const archive = path.join(temp, "package.tgz");
      await fs.writeFile(archive, data);
      await tar.x({
        file: archive,
        cwd: temp,
        strip: 1,
        filter: (entry) => entry === `package/${tool.name}`,
      });
      const extracted = path.join(temp, tool.name);
      if (!(await validTool(extracted, tool.sha256)))
        throw new Error(`Executable hash mismatch for ${tool.name}`);
      await fs.copyFile(extracted, target);
      console.log(`Staged ${tool.name}`);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
}

module.exports = async function beforePack(context) {
  if (context.electronPlatformName !== "win32") return;
  // electron-builder Arch.x64 is 1. Do not ship an x64 tool on another arch.
  if (context.arch !== 1)
    throw new Error("Bundled Windows media tools currently require an x64 build");
  await stage();
};
module.exports.stage = stage;
module.exports.tools = TOOLS;
if (require.main === module)
  stage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
