#!/usr/bin/env node
/**
 * Pixel-level verification for the MayoCut renderer.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every stage so far has had to say "there is no rasteriser in this
 * environment, so the wiring is asserted but no pixel was looked at". That is an
 * honest limit, but it let a whole class of bug through: a curve that is read,
 * stored, plotted — and then never applied. Source regexes cannot catch that,
 * because the call is right there; only the output can.
 *
 * `@napi-rs/canvas` is a real Skia-backed canvas, so the engine can be driven
 * exactly as the browser drives it and the resulting pixels inspected. This
 * script renders solid-colour sources through the real `Engine.draw()` and
 * asserts the numbers that come out.
 *
 * It is deliberately a separate script from `audit.mjs`: that one bundle is pure
 * logic with no dependencies, and this one needs a native canvas. Keeping them
 * apart means a checkout without the native module still runs the audit.
 */
import { createCanvas, Image } from "@napi-rs/canvas";
import assert from "node:assert/strict";

// --- the minimum browser surface the engine touches --------------------------
const docCreate = (tag) => {
  if (tag === "canvas") return createCanvas(1, 1);
  return null;
};
globalThis.document = { createElement: docCreate, createElementNS: () => createCanvas(1, 1) };
globalThis.HTMLCanvasElement = createCanvas(1, 1).constructor;
globalThis.HTMLVideoElement = class {};
globalThis.HTMLImageElement = Image;
globalThis.Image = Image;
globalThis.ImageBitmap = class {};

const E = await import("../.diag/b-engine.mjs");
const T = await import("../.diag/b-types.mjs");
const PC = await import("../.diag/b-property-curves.mjs");

let passed = 0;
let failed = 0;
const results = [];
async function t(name, fn) {
  try {
    await fn();
    passed++;
    results.push(["PASS", name, ""]);
  } catch (e) {
    failed++;
    results.push(["FAIL", name, e.message]);
  }
}

// --- harness ----------------------------------------------------------------

/** A solid-colour PNG the engine can treat as an image clip. */
async function solid(r, g, b, w = 320, h = 180) {
  const c = createCanvas(w, h);
  const x = c.getContext("2d");
  x.fillStyle = `rgb(${r},${g},${b})`;
  x.fillRect(0, 0, w, h);
  const img = new Image();
  img.src = c.toBuffer("image/png");
  await new Promise((res) => {
    img.onload = res;
    img.onerror = res;
  });
  return img;
}

const W = 320;
const H = 180;

/** Build an engine around one image clip, at time `at`, and render a frame. */
async function render({ clip = {}, at = 0, overlay = null, tracks = null } = {}) {
  const p = T.newProject("px", "16:9");
  p.main.push({
    id: "m1",
    mediaId: "img1",
    in: 0,
    out: 4,
    speed: 1,
    reverse: false,
    filter: "none",
    fit: "cover",
    adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
    volume: 1,
    muted: false,
    transitionIn: "none",
    transitionDur: 0,
    ...clip,
  });
  if (overlay) p.tracks[0].clips.push(overlay);
  if (tracks) for (const tr of tracks) p.tracks.push(tr);

  const e = new E.Engine(p);
  e.setMedia([
    { id: "img1", name: "src.png", kind: "image", size: 10, createdAt: Date.now(), duration: 0, width: W, height: H },
    { id: "img2", name: "ov.png", kind: "image", size: 10, createdAt: Date.now(), duration: 0, width: W, height: H },
  ]);
  const src = await solid(128, 128, 128);
  const ov = await solid(255, 0, 0);
  e.els.set("img1", { el: src, url: "a" });
  e.els.set("img2", { el: ov, url: "b" });

  const cv = createCanvas(W, H);
  e.bind(cv);
  e.canvas = cv;
  e.ctx = cv.getContext("2d");
  e.t = at;
  e.draw();
  const ctx = cv.getContext("2d");
  const px = (x, y) => {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  const centre = () => px(Math.round(W / 2), Math.round(H / 2));
  /** mean luminance over a sparse grid — cheap, and colour-independent */
  const meanLuma = () => {
    let sum = 0;
    let n = 0;
    for (let y = 8; y < H; y += 16) {
      for (let x = 8; x < W; x += 16) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        sum += 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
        n++;
      }
    }
    return sum / n;
  };
  return { px, centre, meanLuma, canvas: cv, ctx, engine: e };
}

// --- the assertions ---------------------------------------------------------

await t("a plain clip renders its source colour", async () => {
  const r = await render();
  const c = r.centre();
  assert.ok(Math.abs(c[0] - 128) < 3, `expected ~128 grey, got ${c[0]}`);
  assert.ok(Math.abs(c[1] - 128) < 3);
  assert.ok(Math.abs(c[2] - 128) < 3);
  assert.equal(c[3], 255, "the frame must be opaque");
});

await t("an opacity curve FADES the rendered frame", async () => {
  // This is the assertion the whole harness exists for: the curve is applied,
  // or the pixels do not move. Wired-but-ignored cannot pass.
  const start = await render({
    clip: { propCurves: { opacity: [{ x: 0, y: 1 }, { x: 1, y: 0 }] } },
    at: 0.05,
  });
  const end = await render({
    clip: { propCurves: { opacity: [{ x: 0, y: 1 }, { x: 1, y: 0 }] } },
    at: 3.6,
  });
  // the background is black, so a faded clip is darker
  assert.ok(
    end.meanLuma() < start.meanLuma() - 20,
    `fade did not darken the frame: ${start.meanLuma().toFixed(1)} -> ${end.meanLuma().toFixed(1)}`,
  );
});

await t("a brightness curve CHANGES the rendered pixels over time", async () => {
  const dark = await render({
    clip: { propCurves: { brightness: [{ x: 0, y: 0.25 }, { x: 1, y: 0.75 }] } },
    at: 0.05,
  });
  const bright = await render({
    clip: { propCurves: { brightness: [{ x: 0, y: 0.25 }, { x: 1, y: 0.75 }] } },
    at: 3.6,
  });
  assert.ok(
    bright.meanLuma() > dark.meanLuma() + 15,
    `brightness curve did not change the image: ${dark.meanLuma().toFixed(1)} -> ${bright.meanLuma().toFixed(1)}`,
  );
});

await t("a brightness curve lands on the RIGHT value, not just somewhere brighter", async () => {
  // M1 lesson: the first version of this check only asked "is the end brighter
  // than the start", and a mutation that dropped the curve from the pixel path
  // still passed — because the CSS `ctx.filter` path applies brightness as well,
  // so the picture moved either way. The absolute value is what discriminates,
  // so it is asserted here against the curve's own arithmetic.
  //
  // Real skia note: ctx.filter is honoured here, so brightness is applied exactly
  // ONCE overall — once in the CSS pass and NOT again in gradePixels (which only
  // handles temperature/tint/split/sharpen/vignette). A double application would
  // show up as 255-clipped output, which this catches.
  const curve = { brightness: [{ x: 0, y: 0.5 }, { x: 1, y: 0.75 }] }; // 100% -> 150%
  const expected = (128 * 1.5) | 0; // ~192 for a 128 grey source
  const plain = await render({ clip: { propCurves: curve }, at: 3.9 });
  const graded = await render({
    clip: {
      propCurves: curve,
      adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0, vignette: 1 },
    },
    at: 3.9,
  });
  const pv = plain.centre()[0];
  const gv = graded.centre()[0];
  assert.ok(
    Math.abs(pv - expected) <= 4,
    `the CSS path should land on ${expected}, got ${pv}`,
  );
  // the centre of a vignette is unaffected, so the graded frame must match
  assert.ok(
    Math.abs(gv - expected) <= 6,
    `with a pixel grade present the result should still be ~${expected}, got ${gv} — ` +
      `255-clipping would mean brightness was applied twice`,
  );
  assert.ok(gv < 250, `the pixel path clipped to ${gv}, suggesting a double application`);
});

await t("a scale curve RESIZES the picture", async () => {
  const small = await render({
    clip: { propCurves: { scale: [{ x: 0, y: 0.1667 }, { x: 1, y: 0.5 }] } },
    at: 0.05,
  });
  // at 0.05 s the curve is near its first point (0.5x) so the frame is mostly
  // black bars; later it fills the frame
  const big = await render({
    clip: { propCurves: { scale: [{ x: 0, y: 0.1667 }, { x: 1, y: 0.5 }] } },
    at: 3.9,
  });
  const cornerEarly = small.px(6, 6);
  const cornerLate = big.px(6, 6);
  assert.ok(
    cornerLate[0] > cornerEarly[0] + 10 || cornerLate[0] < cornerEarly[0] - 10,
    `the corner did not change as the clip scaled: ${cornerEarly[0]} -> ${cornerLate[0]}`,
  );
});

await t("an OVERLAY opacity curve fades the overlay, not the main track", async () => {
  // Overlays were the gap fixed in Stage 9: the curve was plotted and never
  // applied. The overlay is red on grey, so a fade is visible as a colour shift.
  const mk = (t2) =>
    render({
      at: t2,
      overlay: {
        id: "o1",
        kind: "image",
        mediaId: "img2",
        start: 0,
        duration: 4,
        scale: 1,
        x: 0,
        y: 0,
        opacity: 1,
        propCurves: { opacity: [{ x: 0, y: 1 }, { x: 1, y: 0 }] },
      },
    });
  // Sample AFTER the built-in 0.4 s fade-in and before the 0.3 s fade-out, so
  // the overlay's own appearance animation is not mistaken for the curve.
  const early = await mk(1.0);
  const late = await mk(3.85);
  const e = early.centre();
  const l = late.centre();
  assert.ok(e[0] > 200 && e[1] < 60, `the overlay should be solid red mid-clip, got ${e.slice(0, 3)}`);
  assert.ok(l[1] > 90, `the overlay should have faded towards grey by the end, got ${l.slice(0, 3)}`);
  // and the fade must be a real gradient, not a jump at the sample points
  const mid = await mk(2.4);
  const m = mid.centre();
  assert.ok(m[1] > 20 && m[1] < 90, `mid-clip should be partially faded, got ${m.slice(0, 3)}`);
});

await t("a fresh engine with no curves is unchanged by all of this", async () => {
  // The regression guard: every feature above must be inert when unused.
  const a = await render({ at: 1 });
  const b = await render({ at: 3.5 });
  assert.ok(
    Math.abs(a.meanLuma() - b.meanLuma()) < 1.5,
    "a clip with no curves should render identically at any time",
  );
});

// --- report -----------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
for (const [status, name, msg] of results) {
  console.log(`  ${status} ${name}${msg ? ` — ${msg}` : ""}`);
}
console.log("");
if (failed) {
  console.log(`PIXEL-RENDER FAIL — ${failed} of ${passed + failed} checks failed`);
  process.exit(1);
}
console.log(`PIXEL-RENDER PASS — ${passed} checks rendered and verified pixel-by-pixel`);
