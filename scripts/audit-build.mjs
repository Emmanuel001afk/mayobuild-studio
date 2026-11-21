#!/usr/bin/env node
// Rebuild the pure-logic bundles the audit imports, then run it.
//
// The bundles are gitignored build artifacts, so a fresh checkout (or CI) has
// to regenerate them before .diag/audit.mjs can resolve its imports. Keeping
// this in one place means `node scripts/audit-build.mjs` is the only command
// anyone needs.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const MODULES = [
  "types",
  "engine",
  "assist",
  "captions",
  "device",
  "luts",
  "utils",
  "templates",
  "background-math",
  "timeline-resolver",
];

for (const name of MODULES) {
  const src = `src/mayocut/${name}.ts`;
  if (!existsSync(src)) {
    console.log(`skip ${name} (no such module)`);
    continue;
  }
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["esbuild", src, "--bundle", "--format=esm", `--outfile=.diag/b-${name}.mjs`, "--log-level=error"],
    { stdio: "inherit" },
  );
}

const run = process.argv.includes("--no-run") ? null : execFileSync;
if (run) {
  run(process.execPath, [".diag/audit.mjs"], { stdio: "inherit" });
}
