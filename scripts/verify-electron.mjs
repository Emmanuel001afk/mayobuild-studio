#!/usr/bin/env node
// Headless render verification for the packaged Electron app.
//
// The packaged app is launched with MAYOBUILD_CDP=<port> (see desktop/main.cjs),
// which exposes a Chrome DevTools Protocol endpoint. This script:
//   1. waits for the app's page target,
//   2. polls the rendered DOM until it has real content (a blank render = fail),
//   3. saves a PNG screenshot as evidence,
//   4. exits non-zero if the app did not render.
//
// No dependencies: Node >= 22 globals only (fetch, WebSocket).
import fs from "node:fs";

const PORT = process.env.MAYOBUILD_CDP_PORT || "9222";
const OUT = process.env.VERIFY_OUT || "verify-desktop.png";
const MIN_CHARS = Number(process.env.VERIFY_MIN_CHARS || 100);

async function cdpTargets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json`);
  return r.json();
}

let page = null;
for (let i = 0; i < 90; i++) {
  try {
    const targets = await cdpTargets();
    page = targets.find((t) => t.type === "page" && /^http:\/\/127\.0\.0\.1/.test(t.url));
    if (page) break;
  } catch {
    /* server not up yet */
  }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!page) {
  console.error("VERIFY-DESKTOP FAIL: no app page target on CDP port", PORT);
  process.exit(1);
}
console.log("page target:", page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params) =>
  new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.rej(new Error(m.error.message));
    else p.res(m.result);
  }
};
await new Promise((r) => (ws.onopen = r));

// Give the SPA time to hydrate, then check the rendered text content.
let chars = 0;
let head = "";
for (let i = 0; i < 45; i++) {
  const r = await send("Runtime.evaluate", {
    expression:
      "(function(){var b=document.body;return b?{len:b.innerText.replace(/\\s+/g,' ').trim().length,head:b.innerText.replace(/\\s+/g,' ').trim().slice(0,300)}:{len:0,head:''}})()",
    returnByValue: true,
  });
  chars = r.result?.value?.len ?? 0;
  head = r.result?.value?.head ?? "";
  if (chars > MIN_CHARS) break;
  await new Promise((res) => setTimeout(res, 1000));
}

await send("Page.enable").catch(() => undefined);
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
console.log("screenshot:", OUT);
console.log("rendered chars:", chars);
console.log("text head:", head);
if (chars <= MIN_CHARS) {
  console.error(`VERIFY-DESKTOP FAIL: rendered text is only ${chars} chars (blank screen?)`);
  process.exit(1);
}
console.log("VERIFY-DESKTOP PASS — the packaged app renders");
ws.close();
process.exit(0);
