#!/usr/bin/env node
// Headless render smoke test for the PRODUCTION shell bundle (app-shell-dist).
//
// Green builds are not proof the app renders — this loads the real built
// bundle in a real DOM (happy-dom, same engine class as a WebView) and
// asserts actual content appears. Usage:
//
//   npm install --no-save --ignore-scripts happy-dom fake-indexeddb
//   node scripts/smoke-shell.mjs              # home route (offline landing)
//   node scripts/smoke-shell.mjs /mayocut     # then navigate into the editor
//
// Exit code 0 = rendered, 1 = blank/crash.
import { readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "app-shell-dist");
const TARGET = process.argv[2] || "/";

process.on("unhandledrejection", (e) => {
  console.log("[harness] unhandledrejection (ignored):", String(e?.reason?.message ?? e).slice(0, 160));
});

const { Window } = await import("happy-dom");
await import("fake-indexeddb/auto");

const window = new Window({ url: "http://localhost/" });
try {
  window.indexedDB = globalThis.indexedDB;
} catch {
  /* ignore */
}
const document = window.document;

// The shell's index.html tags its document so routes take shell mode.
document.head.insertAdjacentHTML("beforeend", '<meta name="mayobuild-shell" content="1">');
document.body.innerHTML = '<div id="root"></div>';

// Expose browser globals to the ESM bundle (Node 22 has getter-only globals,
// so use defineProperty instead of plain assignment).
const g = globalThis;
const def = (k, v) =>
  Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
for (const k of Object.getOwnPropertyNames(window)) {
  if (k in g) continue;
  try {
    def(k, window[k]);
  } catch {
    /* not settable */
  }
}
for (const k of [
  "addEventListener", "removeEventListener", "dispatchEvent", "scrollTo", "scrollBy",
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback",
  "matchMedia", "focus", "blur", "getComputedStyle", "atob", "btoa", "reportError",
]) {
  // never clobber an existing Node global (e.g. structuredClone) with a
  // window property that happy-dom does not provide
  if (g[k] !== undefined || window[k] === undefined) continue;
  try {
    def(k, window[k]);
  } catch {
    /* ignore */
  }
}

// Offline: log and reject (the shell must render without a network).
const fetchLog = [];
g.fetch = (...args) => {
  const u = String(args[0]);
  fetchLog.push(u);
  console.log("fetch (offline reject):", u.slice(0, 140));
  return Promise.reject(new Error("offline"));
};
window.fetch = g.fetch;

const errors = [];
const origErr = console.error;
console.error = (...a) => {
  errors.push(a.map(String).join(" ").slice(0, 300));
  origErr(...a);
};

// ------------------------------------------------------------------ load app
const assets = readdirSync(path.join(DIST, "assets"));
const entry = assets.find((f) => /^index-.*\.js$/.test(f));
if (!entry) {
  console.error("SMOKE FAIL: no entry bundle in", DIST);
  process.exit(1);
}
console.log("importing", entry);
await import(path.join(DIST, "assets", entry));
console.log("IMPORT OK");

const root = document.getElementById("root");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const textOf = () => (document.body.textContent || "").replace(/\s+/g, " ").trim();

await wait(3000);

let ok = false;
let failReason = "";
if (TARGET === "/") {
  const t = textOf();
  ok = t.length > 300 && /Mayobuild/i.test(t);
  failReason = `home text: ${t.length} chars — "${t.slice(0, 120)}"`;
} else {
  // wait for home first, then follow the in-app link
  let t0 = textOf();
  if (t0.length < 300) {
    failReason = `home did not render before navigation — "${t0.slice(0, 120)}"`;
  } else {
    const link = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === TARGET);
    if (!link) failReason = `link ${TARGET} not found`;
    else {
      link.click();
      await wait(4000);
      const t1 = textOf();
      ok = t1.length > 300 && t1 !== t0;
      failReason = `after click ${TARGET}: ${t1.length} chars — "${t1.slice(0, 120)}"`;
    }
  }
}

console.log("BODY HTML length:", document.body.innerHTML.length);
console.log("BODY TEXT (first 400):", textOf().slice(0, 400));
console.log("captured console.errors:", errors.length ? errors.slice(0, 5) : "none");
console.log("fetches:", fetchLog.length ? fetchLog.slice(0, 5) : "none");

if (ok) {
  console.log(`SMOKE PASS — app boots and renders ${TARGET}`);
  process.exit(0);
} else {
  console.log("SMOKE FAIL —", failReason);
  process.exit(1);
}
