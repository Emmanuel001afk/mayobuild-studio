// Read-only discovery of Chromium's legacy IndexedDB origin folders. This
// never opens, changes, deletes or migrates the databases it finds.
const fs = require("node:fs/promises");
const path = require("node:path");

async function findLegacyOrigins(userDataPath, currentPort) {
  const directory = path.join(userDataPath, "IndexedDB");
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const ports = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Chromium's legacy origin identifier format. Ignore all other hosts,
    // malformed numbers, stable origin and non-LevelDB folders.
    const match = /^http_127\.0\.0\.1_(\d{1,5})\.indexeddb\.leveldb$/.exec(entry.name);
    if (!match) continue;
    const port = Number(match[1]);
    if (port > 0 && port <= 65535 && port !== currentPort) ports.add(port);
  }
  return [...ports].sort((a, b) => a - b);
}
module.exports = { findLegacyOrigins };
