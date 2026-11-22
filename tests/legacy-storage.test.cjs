const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { findLegacyOrigins } = require("../desktop/legacy-storage.cjs");

test("finds only potential legacy loopback IndexedDB directories without modifying them", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mayo-legacy-test-"));
  try {
    assert.deepEqual(await findLegacyOrigins(root, 38491), []);
    const folder = path.join(root, "IndexedDB");
    await fs.mkdir(folder);
    for (const name of ["http_127.0.0.1_45001.indexeddb.leveldb", "http_127.0.0.1_38491.indexeddb.leveldb", "https_127.0.0.1_45002.indexeddb.leveldb", "http_example.com_45003.indexeddb.leveldb", "http_127.0.0.1_99999.indexeddb.leveldb"]) await fs.mkdir(path.join(folder, name));
    await fs.writeFile(path.join(folder, "http_127.0.0.1_45004.indexeddb.leveldb"), "not a directory");
    const before = (await fs.readdir(folder)).sort();
    assert.deepEqual(await findLegacyOrigins(root, 38491), [45001]);
    assert.deepEqual((await fs.readdir(folder)).sort(), before);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
