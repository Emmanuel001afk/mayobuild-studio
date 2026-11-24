# MayoCut — the offline video editor inside Mayobuild Studio

MayoCut is a CapCut-style video editing platform built **into** Mayobuild Studio.
Its defining rule: **the user's device is the database.** No Supabase, no backend,
no account and no internet connection are needed to edit. AI is *optional and
assistive* — when AI is unavailable the platform is still 100% usable.

## Where it lives

| Surface | What you get |
| --- | --- |
| Web — `/mayocut` | Full editor in the browser (Chrome/Edge/Android Chrome). Installable PWA (Add to Home screen) with offline shell. |
| Windows — `.exe` | Electron build (`desktop/`) of the exact same editor, wrapped by electron-builder as an NSIS installer. |
| Android — `.apk` | Capacitor build (`android/`) of the same static shell. Side-loadable APK. |
| Downloads page — `/downloads` | Central page hosting the EXE/APK links (GitHub Releases) + PWA install help. |

## Feature set (v0.8)

**Workspace organisation** (v0.8)

The layout follows CapCut desktop: library top-left, player centre, properties
right, full-width timeline along the bottom.

- **Tabbed asset library** (9 categories) — Media · Audio · Text · Stickers ·
  Effects · Transitions · Filters · Adjust · Captions, each a scrollable grid of
  *actionable* cards. Cards show a real miniature of the effect (a live CSS
  filter over a sample scene, a moving arrow for a movement, a gradient swatch
  that slides/wipes in the right axis for a transition) rather than a uniform
  placeholder.
- **Browse always, apply on selection** — every catalogue is scrollable with
  nothing selected; only applying needs a target clip. (Hiding the grid behind
  "select a clip first" made the default state a dead end.)
- **Tabbed inspector** — Video / Audio / Speed / Anim / Adjust jump to the
  matching group instead of one long scroll; the sections themselves are shared,
  so a control can never exist in one tab and be missing from another.
- **One library on every platform** — the mobile drawer renders the same
  component, so phone users see the same 19 transitions and 40 looks.

**Timeline & clips**
- **Multi-track timeline** — main video lane + Text / Overlay / Audio lanes, per-lane
  hide, and mute/solo on the audio lane
- **Clips** — trim by dragging either edge (fixed: the right handle used to collapse a
  clip to 0.1 s), split at playhead (`S` / double-click), duplicate (`Ctrl+D`), delete,
  **drag a clip body to re-order**, replace media
- **Speed** — 0.1×–8× ladder (slow motion → hyper-lapse), a linear **speed ramp**,
  and a **drawable multi-point speed curve** (add/remove/drag points, with
  "slow in/out" and "bullet time" presets). The timeline clip draws the curve
  and the engine integrates it in closed form, so timing is exact.
- **Freeze frame** — `F` or the ❄ button holds the exact frame at the playhead
- **Reverse** — frame-stepped playback (audio muted, as CapCut does)

**Look**
- **Filters** — **40 presets** grouped into Clean / Film / Warm-cool / Neon / Mono
  (Kodachrome, Portra 400, Bleach Bypass, Cyanotype, Cyberpunk, Mono High, …)
- **Adjust** — Brightness, Contrast, Saturation, Hue, **Temperature, Tint, Fade,
  Sharpen, Vignette and Split-tone** (the last five are a real pixel pass, so they
  also work on phones without CSS `filter` support for those effects)
- **LUTs** — 5 analytic built-in looks + `.cube` import
- **Framing** — cover / contain (letterbox) / blur-fill per clip, with a project
  background colour behind letterboxing
- **Color match** — copy one clip's grade to every other clip in one tap

**Transitions** (19) — crossfade, dip to black/white, push ←→↑↓, **diagonal
push**, hard wipe ←→↑↓, **soft (feathered) wipe ←→↑↓**, zoom punch, blur
dissolve. Duration control and “apply to every cut”. The feathered wipe is a
real gradient-masked composite, verified in tests for direction, monotonic
reveal and mirror symmetry — an inversion bug that made "wipe left" wipe the
wrong way was caught this way.

**Text** — 10 cross-platform font styles **+ imported .ttf/.otf fonts** (stored
on-device), size, colour, pill background with adjustable radius, **outline,
shadow strength, letter spacing, line height, alignment, italic/underline/
uppercase, opacity**, 9-position grid + free drag on the preview, **20 animations** grouped into
In / Loop / Kinetic (fade, slide, typewriter, karaoke, bounce, Ken Burns, neon,
zoom-in, rise, wipe-in, pop, drop-in, swing, blur-in, tracking-in, flip,
skew-in, per-letter wave) and **20 one-tap text looks** (TikTok white, Yellow
bar, Pink sticker, Mint chip, Headline split, News lower third, …).

**Motion** — **28 effects** in four families (Camera / Motion / Impact / Retro):
zoom pulse, heartbeat, shake, spin, glitch, flash-in, blur-in, VHS, zoom-out,
pan, tilt up/down, Ken Burns, colour pulse, sway, roll, float, breathe, jitter,
whip pan ←→, dolly in/out, tilt-shift, earthquake, orbit — plus **keyframes on
x/y/scale/rotation/opacity for every clip**.

**Audio**
- Layered music/SFX/voiceover with volume, fade in/out, per-clip mute
- **Reverb, echo and pitch** FX; named voice presets
- **Voice shaping** — bass / mid / treble EQ per clip + a one-tap "voice enhance"
- **Auto-ducking** — mark a clip (e.g. the voiceover) and every other audio clip
  dips under it, with a project-wide strength control
- **Mute / solo** per audio track, master gain
- RNNoise denoise, mic recording, local TTS, **extract audio** from video
- Beat detection → **beat markers drawn on the ruler** → split at every beat

**Export**
- **MP4 (H.264 + AAC via WebCodecs when the device exposes AAC encoding)**, **WebM (VP9/Opus)**, **animated GIF**,
  **PNG still**, **WAV (full stereo mix)**
- 24/30/60 fps, 1080p / 4K, quality ladder; per-device caps with an explanation
- Export settings are remembered per project
- Finished exports are kept in an on-device library with **inline preview**

**Editing workspace**
- Desktop tool shelf separates Media, Audio, Text, Stickers, Effects, Filters, Transitions, Captions and AI Studio while keeping the central preview, timeline and context-sensitive inspector in place
- Main clips and image/video overlays support horizontal and vertical mirroring; crop/framing, scale, position and rotation remain available in the inspector

**Media compatibility**
- Imports common video containers (MP4, MOV, M4V, WebM, MKV, AVI, 3GP, FLV, MPEG/TS variants and others), then probes for a real decoded frame instead of trusting the filename extension
- Container support is not codec support: MP4/MOV files may contain HEVC/H.265, which some browsers/WebViews cannot decode. The importer checks for a decoded frame and best-effort identifies common codec markers (HEVC, H.264, AV1, VP9, VP8); unsupported media is clearly flagged instead of silently added as a blank clip. The portable interchange target is MP4 with H.264 video and AAC audio
- Preview loads active video sources on demand, not every source in the project at once; preview compositing is capped at 30 fps and timeline React updates at 15 fps to reduce playback overhead

**Platform**
- **8 canvas formats** — 9:16, 4:5, 1:1, 16:9, 3:4, 4:3, 2:3, 21:9
- **Projects** — auto-saved to IndexedDB, thumbnails, rename/duplicate/delete
- **Media library** — videos/photos/music stored as blobs on-device
- **Templates** — 4 built-in + "Save as template" + shareable `.json` packs
- **Storage insight** — on-device usage meter and a "protect my media" persistent-
  storage request, so the browser cannot silently evict a project
- **Undo/redo** — 80-step history (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`)
- **Keyboard** — `Space` play, `J/K/L` transport, `←/→` frame step (Shift = 1 s),
  `Home/End`, `S` split, `F` freeze, `Ctrl+D` duplicate, `Ctrl+wheel` timeline zoom
- **Offline** — PWA manifest + service worker; the editor never calls a server

## Architecture

```
src/mayocut/
  types.ts            data model (Project / MainClip / OverlayClip / MediaItem),
                      transitions, aspects, text looks, freeze & speed maths
  engine.ts           playback clock, canvas compositor (fit modes, CSS + pixel
                      grading, LUTs, 12 transitions, text engine, overlays,
                      chroma/mask/blend), WebAudio graph (voice EQ, ducking,
                      mute/solo), and four exporters (MP4/WebM/GIF/WAV/PNG)
  idb.ts              IndexedDB layer (media, blobs, projects, templates,
                      exports, LUTs, imported fonts)
  templates.ts        built-in template factories
  utils.ts            import pipeline, thumbnails, formatting
  components/
    ProjectsHome.tsx  home: projects / media library / template gallery / exports
    Editor.tsx        editor shell: layout, autosave, undo, export dialog
    Timeline.tsx      ruler, lanes, drag/trim/scrub interactions
    Inspector.tsx     right-hand property panel (context per clip type)

shell/                static SPA wrapper (home ⇄ editor) — the exact bundle
                      shipped inside the .exe and the .apk
desktop/              Electron main + preload + electron-builder config
android/              Capacitor Android project (committed; build artifacts ignored)
.github/workflows/distribute.yml   builds EXE + APK → GitHub Releases
```

**Playback engine.** A single timeline clock drives everything. Media elements
(`<video>`/`<audio>`) are glued to the clock each frame (drift-corrected seeks),
while the compositor draws the active frame(s) to a 1080p canvas — including
overlapping transition frames, per-clip `ctx.filter` chains, text and overlays.
Preview and export share the identical compositor, so WYSIWYG is exact.

**Export.** Four paths, all client-side:
- **MP4** — WebCodecs `VideoEncoder` (H.264) + `AudioEncoder` (AAC) muxed by
  `mp4-muxer`, with a ScriptProcessor bridge from the WebAudio graph.
- **WebM** — `canvas.captureStream()` + `MediaStreamAudioDestinationNode`
  → `MediaRecorder` (VP9/Opus). Works everywhere MediaRecorder exists.
- **GIF** — frame-stepped render into a 256-colour cube palette via `omggif`.
- **WAV / PNG** — `OfflineAudioContext` stereo mixdown / `canvas.toBlob`.

The browser video and GIF paths share the preview compositor, but encoding and
realtime playback limitations can still cause differences. Desktop also offers
an experimental native MP4 exporter with FFmpeg and FFprobe bundled in the
Windows x64 installer; see `docs/mayocut-engine-foundation.md`.

**The device as database.** All state lives in IndexedDB (`mayocut-db`):
`media` (items) + `blobs` (files), `projects`, `templates`, `exports`.
Closing the tab loses nothing; clearing site data is the only “delete all”.

## Editing engine (v0.9 foundation)

The goal is a reliable engine, not a hand-written video codec: decoding is done
by the platform (browser / Android / desktop), and MayoCut owns everything
around it.

### One timeline model

`src/mayocut/timeline-resolver.ts` is the single source of truth for "what is
on screen and in the speakers at time t". It is **pure** — no DOM, no
AudioContext, no React — so it can be tested in node against real project
fixtures, and so preview, export and the native ports cannot drift apart.

`resolveComposition(project, t)` returns:

| field | meaning |
|---|---|
| `main` | 1 layer, or 2 while a transition runs, each with `src`, `rate`, `alpha`, `gain` |
| `transition` | kind, 0..1 progress, and both layers |
| `overlays` | live text / sticker / video / audio overlays with their local time |
| `audioOverlays` | the audible subset (used by the mixer) |
| `empty` | nothing visible or audible — an explicit black gap |

`requiredMediaAt(project, t)` lists the media that must be loaded for that
instant; the transport pre-warms it.

### A playback engine that waits for frames

The transport no longer advances its clock blindly:

- `play()` calls `awaitFrameFor()` first, so the opening frame is decoded
  before time starts moving (bounded at 700 ms so a bad source cannot hang it).
- The render loop calls `visibleLayerReady()` each frame. If a visible clip has
  no decoded frame — typically right after a cut, split or effect forced a seek
  — the clock **holds** for up to 900 ms and keeps drawing the last good frame.
  Past that it gives up and plays on.
- `readinessFor()` / `shouldAdvanceClock()` encode those rules as pure
  functions with their own tests.

### An export engine on the same model

Export uses the same resolver, and captures only frames it has confirmed:

- `frameReadyAt(t)` seeks and waits for `seeked`/`loadeddata` before drawing.
- `renderFrameAt(t)` is the primitive for frame-stepped encoding.
- The GIF path now goes through `frameReadyAt` instead of racing the clock.

**Frame-stepped MP4 is now the default path** (Stage 2). `exportMP4Stepped`
walks the timeline one output frame at a time:

```
for f in 0..totalFrames:
  t = f / fps
  await frameReadyAt(t)   # seeks + waits for the decoder
  draw()
  encode(canvas, timestamp = f * frameDurationUs)
```

Wall-clock is irrelevant, so a slow phone produces the *same file* as a fast
laptop — just later. No dropped frames, no half-seeked blanks, no audio drift.

Audio is rendered **offline and up front** (`renderOfflineAudioTrack` →
`scheduleOfflineAudio`), using `mainClipGain` from the resolver. That is why a
muted clip, a transition crossfade or an extracted-and-muted source sounds in
the file exactly as it does in the preview. The old real-time recorder sampled a
live audio graph and had no such guarantee.

Fallbacks, in order:
1. `exportMP4Stepped` — frame-accurate H.264 + AAC (needs WebCodecs).
2. `exportMP4` — real-time WebCodecs, still muxes audio.
3. `exportMedia` — real-time `MediaRecorder` (WebM).

Only the first is frame-accurate — but see below: WebM now has its own
frame-stepped path, for the browsers that cannot encode H.264.

### Frame-stepped WebM (Stage 3b)

Safari and Firefox have no H.264 *encoder*, so they used to fall all the way to
the real-time recorder and inherit its dropped frames. `exportWebmStepped` closes
that gap with the same loop shape as the MP4 path:

```
for f in 0..totalFrames:
  await frameReadyAt(f / fps)
  encode(canvas, timestamp = f * frameDurationUs)
```

- Video: WebCodecs `VideoEncoder` with VP9, falling back to VP8, then AV1.
  `pickVpCodec()` asks the platform via `isConfigSupported` and returns both the
  WebCodecs codec string and the Matroska `CodecID` the muxer needs — they are
  not the same string.
- Audio: Opus, fed from the **same** `renderOfflineAudioTrack()` PCM the MP4 path
  uses. Muting, crossfades and extracted-and-muted sources therefore sound
  identical in both containers.
- Opus is defined at 48 kHz, so if the offline render ever returns another rate
  the samples are resampled rather than mislabelled (a mislabelled rate plays
  back at the wrong speed).
- Same proxy rule: `useOriginalSources()` before capturing,
  `usePreviewSources()` in `finally`.

This added **one** dependency, `webm-muxer` (MIT, no runtime dependencies —
only `@types/*`). It is a container writer, not a codec: encoding is still done
by the platform. The audit asserts both facts so a future bump cannot quietly
drag in a GPL encoder.

**Choice order is MP4 first, WebM second.** A browser that can do both gets
H.264, because MP4 plays everywhere; a browser that cannot gets the same
frame-exactness in WebM rather than a degraded real-time capture.

### Measuring before promising (Stage 3)

Frame-stepping is *correct*, but correct is not the same as fast, and a phone is
not a laptop. Rather than guess, the export dialog measures:

- `measureThroughput(sampleFrames = 12)` renders a handful of real frames
  through the same encode path and times them. It runs against the live
  preview and restores the playhead afterwards.
- `recordThroughput()` turns that into frames/second; `planSteppedExport()`
  scales it by output pixel area to produce a time estimate.
- With no measurement the plan is still shown, but flagged `heuristic: true`
  and worded "roughly" — a documented 12 fps at 1080p guess, never presented
  as a measurement.
- `chooseStrategy()` keeps the accurate path until an export would take more
  than **6× real time**; only then does it prefer the real-time recorder. Below
  that, a slow-but-correct export beats a fast-but-wrong one.

The point is that "fast enough" is a claim about a specific device, so the app
makes the measurement instead of the README making the claim.

### Proxy media (Stage 3)

A 4K phone clip costs a full decode per seek. Proxies fix the scrubbing without
touching the output:

- `proxy.ts` (pure policy) decides *whether* a proxy is worth building: source
  taller than 720p, or — when the height is unknown — a file over 80 MB.
  `proxySize()` computes an even-dimension 720p-class size for the same aspect.
- `proxy-build.ts` builds it using only the platform: a detached `<video>`
  decodes, a canvas downscales, `MediaRecorder` re-encodes to VP9/VP8 WebM.
  No library, no bundled codec. Any failure returns `null` and the original is
  used unchanged.
- Proxies are stored beside the original (`proxy_<mediaId>` in the existing
  `blobs` store — no schema migration) and built **after** import finishes, so
  they never delay the moment footage appears.
- **The one rule:** `sourceFor("export", …)` always returns the original.
  `exportMP4Stepped`, `exportMP4` and `exportMedia` each call
  `useOriginalSources()` before capturing and `usePreviewSources()` in their
  `finally`, so a low-resolution proxy cannot reach a delivered file. A proxy
  that fails to decode on preview falls back to the original rather than
  declaring the media unplayable.

### Platform split

The resolver and the Project JSON are the contract between platforms:

- **web** — TypeScript, `Engine` renders to canvas, WebAudio for sound.
- **Android / desktop (Electron)** — can run the same JSON through a native
  renderer; they are *not* limited to what the browser exposes.

A native engine is a separate stage. Anything bundled for it needs its licences
reviewed (decoders are usually LGPL/GPL or patent-encumbered, unlike the
current stack, which uses only the platform's own decoders).

### What is NOT done yet

- A measurement on a real low-end phone. `measureThroughput` exists and the UI
  uses it, but no hardware run has been recorded — so no "fast enough" claim is
  made anywhere in this document.
- Safari/Firefox frame-stepped WebM is written but **untested on real Safari**;
  the audit checks the code path, not a device. Treat it as unproven until a
  Mac/iPad run confirms it.
- Proxy generation is best-effort and single-file; it does not yet run in a
  worker, so a large import queue can still warm the device.
- Real frames have never been decoded here. `fixtures/video/` (Stage 3f) gives
  the import and proxy POLICY real encoded files to chew on, but there is no
  headless browser in this environment: no frame decode, no MediaRecorder proxy,
  no encoded export has actually run. That is the next honest gap, and it needs
  a browser, not more node scripts.
- No native shell exists yet.
- The ducking curve is sampled at 60 Hz like the rest of the mix, which is
  finer than any audible fade but is not sample-accurate. A 250 ms ramp is
  smooth; a 5 ms one would not be.
- The per-pixel colour grade is still CPU JavaScript. It is 3–12× faster than it
  was (Stage 3g), but a stack of HSL + vignette + sharpen still costs ~37 ms for
  a 720p frame on this machine, which is over a 30 fps budget before drawing. A
  WebGL shader is the real answer and is not written.
- Interaction latency has not been measured on real hardware. The numbers in
  Stage 3g come from Node and happy-dom, which have no rasterisation and no real
  layout, so they are useful for finding and proving hot paths, not for
  predicting a device.
- The stock set is twelve generated assets, not a provider catalogue. It is
  deliberately small because it must work with no network; a real stock
  provider would be a licence and a download, not a code change.

### The notebook list (Stage 3c)

Six requests, six features, no new dependency. All of them are built from what
the platform already ships.

**1 + 2 — Audio effects, with proxies when absent.** `src/mayocut/audio-fx.ts`
holds sixteen one-tap effects (echo, reverb, room, stadium, cave, chipmunk,
deep, telephone, radio, lo-fi, robot, underwater, megaphone, whisper, vinyl) as
*pure recipes* — a rate, a gain, a list of biquads, an optional delay, an
optional convolver length, an optional ring-mod frequency. A recipe can be
asserted on in node, which a hand-wired node graph cannot: "telephone" really is
band-limited, and "none" really is dry.

- `buildAudioFx(ctx, id)` wires a recipe into any `BaseAudioContext`, including
  an `OfflineAudioContext`. That is the whole point: **preview and export call
  the same function**, so an effect cannot sound different in the file.
- Reverb impulses are generated, not bundled: seeded deterministic noise, so an
  export matches the preview *and* two exports of the same project match each
  other. (The old `makeImpulse` used `Math.random()`; it now delegates to this
  one.)
- Preview swaps effects only when the id actually changes — rebuilding every
  frame would click.
- Pitch effects change clip length, so `audioFxDurationScale()` exposes the
  factor and the offline scheduler uses the same rate for the source.

**3 — A library of stock pictures *and* video.** `src/mayocut/stock.ts`
generates eleven assets on the device: green screen, blue screen, white and
black blanks, soft-blur and studio backdrops, paper texture, plus *video*
assets (light leak, bokeh drift, dust, countdown leader). Every one is a `draw`
function — pure maths over a canvas — so there is nothing to download and
nothing to license. A generated asset is stored in IndexedDB and enters the
timeline through the same pipeline as an imported file.

**4 — Stickers, including video stickers.** The emoji set now has tags, so
"fire" finds 🔥 and "money" finds 💰. Searching also reaches the stock assets,
so a *video* sticker (a light leak, a dust drift) is one search away instead of a
hidden capability. A generated clip is placed full-frame with a Screen blend,
because a light leak sized like a photo is useless.

That was only half the job, and Stage 3e finishes it: see *Emoji are not
stickers* below.

**5 — Adjustment graphs and curves.** `src/mayocut/curves.ts` implements RGB and
per-channel tone curves with **monotone** cubic interpolation
(Fritsch–Carlson), baked into a 256-entry LUT. The interpolation is not a
detail: a plain Catmull-Rom overshoots between close control points, and that
overshoot is the bright halo people use a curve to remove. The audit pins this
down with a control-point shape (`0, 0, 0, 0.1, 0.9`) where an unclamped spline
dips below black and the monotone one does not. `CurveEditor.tsx` is a real
draggable graph whose drawn line *is* the LUT that gets applied.

**6 — Landscape ↔ portrait.** `rotateOrientation(dir)` turns the canvas *and*
carries the framing with it: every positioned overlay is rotated across the
diagonal (`x' = -s·y`, `y' = s·x`) rather than dumped at the centre. Rotating
only the canvas would silently re-frame everything the user had placed.

### HSL, and one audio mixer (Stage 3d)

**Per-range HSL.** `src/mayocut/hsl.ts` implements CapCut's HSL panel: eight
colour bands (red, orange, yellow, green, cyan, blue, purple, magenta), each
with a hue, saturation and luminance offset. Bands use **triangular falloff to
the neighbouring midpoints**, so a pixel halfway between red and orange gets
half of each. A hard cut at the band edge would put a visible seam through any
gradient — the audit pins this with a pixel 7° off green's centre and asserts it
is *partly*, not fully, desaturated.

Two deliberate limits: a band can rotate hue by at most **30°**, so red can
never be turned into blue; and fully desaturated pixels are skipped, because a
grey pixel has no meaningful hue to rotate. Hue runs before saturation and
luminance, so the result does not depend on how saturated the input already was.

**The audio mixer was duplicated, and it drifted.** `exportAudioWav` carried its
own copy of the mix logic — its own fades, its own solo rules, its own muted-clip
handling — while `scheduleOfflineAudio` served the MP4 and WebM exporters. Any
fix had to be made twice, and the second time was forgotten. Concretely: audio
effects, tone curves and **ducking** existed in the video exports and not in the
WAV.

Rather than patch the copy, the WAV export now renders through
`scheduleOfflineAudio`. There is one description of what the project sounds
like, and a change to the mix cannot land in one format only. Two things fell
out of that:

- Ducking is now applied offline (`this.duckFactor(...)` inside the shared
  scheduler), so music dips under a voiceover in the file exactly as it does on
  screen.
- `duckFactor` became public, because the offline scheduler is the second
  legitimate caller. It was already pure with respect to project state, so this
  exposes nothing that was not already deterministic.

A bug found by the new tests: `clampHsl` used `Math.min(100, NaN)`, which is
`NaN`, not `100`. A non-numeric slider read would have written `NaN` into the
project and then into every rendered frame. It now falls back to neutral.

### Emoji are not stickers (Stage 3e)

The sticker panel used to insert everything as a text overlay: emoji, shapes and
word stickers alike, all arriving with the same 150 px size and the same
`bounce` entrance. That looked fine in a screenshot and was wrong in three ways
at once. An emoji is a **Unicode character** — text, not art; it renders from the
device's emoji font, so it is razor-sharp at any size and carries no animation or
transparency of its own. A **sticker** is a drawn asset with its own entrance and
alpha. An **animated sticker** (CapCut's animated stickers, Telegram's WEBM
stickers) is a real clip with a duration and a loop. CapCut keeps all three apart
and so does `src/mayocut/sticker-kinds.ts`.

| kind | what it is | default entrance | default size |
| --- | --- | --- | --- |
| `emoji` | one Unicode character | `none` — characters do not wobble | 170 |
| `graphic` | drawn symbol / shape | `pop` — a sticker with no entrance looks like a bug | 200 |
| `video` | generated clip | `none` — its movement *is* the footage | 260 |

The panel now shows the five category chips CapCut exposes (Emoji, Graphics,
Shapes, Text, Animated) with a one-line explanation of each, and every category
has assets — a chip that opens an empty grid is a lie.

The subtle part is naming. `isEmojiOverlay` decides "is this an emoji?" with
`\p{Extended_Pictographic}`, but it first strips the *decorators* — ZWJ, the
variation selectors, skin-tone modifiers, regional indicators, enclosing keycap
— because `👍🏽` and `👨‍👩‍👧` are clusters, not single pictographs, and a bare
regex would reject them. Flags are checked before stripping, since the two
regional indicators that make `🇳🇬` are exactly what stripping removes.

Then comes the honest admission: **`⬅`, `✔`, `✳` and `〰` are
Extended_Pictographic.** A shape glyph and an emoji of the same code point are
indistinguishable from the character alone, so the inspector cannot guess what
the user meant. It does not guess: `OverlayClip.sticker` records the kind at the
moment of insertion, and `overlayLabel` reads it. A picked shape is named
"Sticker", a picked emoji "Emoji", and only text with no recorded kind falls back
to the glyph heuristic. The audit pins both sides of that — `patchFor` must stamp
the kind, and a `⬅` shape must label as "Sticker" even though the regex calls it
a pictograph.

### Real footage, at last (Stage 3f)

Everything above was verified against synthetic canvases and hand-built boxes.
That is fine for maths and useless for imports: it cannot tell you whether an
HEVC phone clip is recognised, whether a 4K file actually crosses the proxy
threshold, or whether a silent clip is mistaken for a broken one. So
`fixtures/video/` now holds seven genuine encoded files (2.8 MB total),
generated by `scripts/make-fixtures.sh` from an ffmpeg synthetic pattern — drawn,
never downloaded, so there is nothing to license and no network involved.

| fixture                  | what it exists to test                                    |
| ------------------------ | --------------------------------------------------------- |
| `h264-720p-2s.mp4`       | the baseline, with audio: must NOT want a proxy           |
| `hevc-1080p-2s.mp4`      | an iPhone-style `hvc1` clip: recognised, and proxied      |
| `h264-4k-1s.mp4`         | 3840×2160 → proxy at exactly 1280×720                     |
| `h264-vertical-2s.mp4`   | portrait: proxy sized by height (406×720), stays portrait |
| `silent-1080p-2s.mp4`    | a video track with no audio track must not read as broken |
| `vp9-720p-2s.webm`       | a non-MP4 container: sniffed correctly, never misparsed   |
| `fragmented-720p-2s.mp4` | timing lives in `moof`: must report "unreadable", not 0×0 |

`scripts/lib/mp4.mjs` walks the real box tree (`ftyp`/`moov`/`trak`/`stsd`,
32- and 64-bit sizes, largesize, `mvhd`/`tkhd`/`mdhd`) in plain node, so the
bench needs no browser. It then runs the **app's own** `detectVideoCodecHint`
and `shouldProxyVideo`/`proxySize`/`sourceFor` over those real bytes:
**27 assertions, all passing.**

Two things this found that synthetic tests never would:

- The "odd dimensions" fixture I first wrote was **not odd**. H.264 silently
  rounded 641×361 to 640×360, so the test guarding even-dimension proxy scaling
  was checking nothing. It has been replaced by the WebM and fragmented fixtures,
  which test real failure modes instead.
- The proxy threshold has no test at its boundary: mutating `h <= minSource` to
  `h < minSource` used to change nothing anywhere. The boundary is now pinned at
  720/721/722 px, and the rule is stated where it lives: a source must be more
  than one line taller than the proxy to be worth re-encoding at all.

What this still does **not** prove, and nothing here pretends otherwise: there is
no headless browser in this environment, so no real frame has been decoded, no
MediaRecorder proxy has been built, and no export has been encoded. The bench
checks container parsing and policy against real files; decoding remains the
browser's job and remains unverified here.

### Fonts, and making the preview actually play (Stage 3g)

**The font list was a dropdown of ten names you could not see.** A `<select>` can
list a font but cannot *show* it, which is the only thing that matters when
choosing a face — "Condensed" means nothing until you see the letters. The
picker now renders every row in its own family, so the list is the preview.

The catalogue in `src/mayocut/fonts.ts` is 21 stacks, each ending in a generic
family so text is never rendered as a surprise serif. They are deliberately not
web fonts: downloading a face on first use would fail offline, flash the
fallback, and make an export differ from the preview. Every entry names a real
font on at least one platform and degrades to something legible on the rest.

**A bug fell out of this.** `fontCss()` only searched the ten built-in stacks, so
choosing an *imported* font silently rendered the default family on the canvas
while the label said otherwise. The canvas now resolves through the project's
imported fonts, and the audit pins it: resolving an imported family must return
that family, not the default stack.

**And then the measurement changed the priority.** `scripts/perf-bench.mjs` times
the work a single edit event does — `JSON.stringify` for undo, the patch,
`commitState`, an autosave schedule — over projects of 3, 12 and 40 clips. It
came out at 0.1–0.6 ms, i.e. **not the problem**, which killed the optimisation I
had assumed was needed. What the bench found instead was the per-frame grade:

| pass, 1280×720 | before | after |
| --- | --- | --- |
| HSL, 1 band | 279 ms | 20 ms |
| HSL, 4 bands | 459 ms | 49 ms |
| vignette | 70 ms | 8 ms |
| sharpen | 20 ms | 15 ms |
| full stack | 115 ms | 37 ms |

At 279 ms per frame the HSL panel — which I shipped in the previous stage — was
a preview that could not play. The fixes are all "stop recomputing what is
constant": band deltas hoisted out of the pixel loop, the per-pixel object
allocation removed, the vignette's `Math.hypot` replaced by a separable distance
and a lookup table, the sharpen's buffer reused across frames, and the second
weight loop folded into the first.

**Guards, because a fast wrong answer is worse than a slow right one:**

- The audit compares `applyHsl` against a plain reference implementation written
  straight from the maths and requires **≤1/255** difference on one-, four- and
  eight-band sets. The optimised code reproduces the old output exactly.
- The vignette and full grade were diffed against the previous build the same
  way: max 1/255.
- A timing assertion fails if HSL regresses past 120 ms for a 720p frame. Putting
  the old implementation back turns it red at 410 ms, so this guard is real.

Honest limits: these are Node on this machine, not a phone, and there is no
rasterisation. The remaining "everything at once" cost of ~37 ms is per-pixel JS
arithmetic — the real fix is a WebGL shader, which is not written yet and is
therefore not claimed. On a low tier device the preview buffer is 960px rather
than 1280px, which cuts all of these by roughly 44%.

### Stalls, and work that survives a close (Stage 3h)

Two reports, and neither was what it looked like.

**"Video hangs and glitches when there is an effect or an overlay on top."** The
play loop asked, every frame, whether any active video was "not ready", and
stopped the clock while it waited. It counted two normal states as not-ready:
re-buffering mid-clip (`readyState < 2`, which a healthy clip does constantly)
and a seek in flight. The loop also *issues* seeks, to correct drift — so under
load it would ask for a seek, see the seek, and pause everything, which on some
browsers cancels the pending seek. The condition then never cleared: a freeze at
the start, a resumed second, another freeze, and the clip dying near the end.

The rule now tells three genuinely different situations apart, in `playback.ts`:

| what is happening | before | now |
| --- | --- | --- |
| the clip has never produced a frame | hold | hold — nothing can be shown |
| a seek we asked for is in flight | hold | hold, bounded by a 600 ms timer |
| a warm clip dips to `readyState < 2` | hold **everything** | keep playing: a stale frame for a few ms beats a freeze |
| the only clip cannot decode at all | hold | never hold; its audio still plays |

The transport only hard-stops when *every* element on screen is cold, and the
playing drift tolerance went from 0.2 s to 0.3 s so ordinary jitter stops
triggering a corrective seek on every frame. Broken and cold are both tested.

**"Everything I imported disappears when I close the platform."** Not one bug —
three, all producing an empty library:

1. *Writes were never checked.* `await db.putMedia(...)` rejecting meant the item
   was not stored, but the failure was logged and a success toast shown anyway.
   An import now waits for each write, counts what actually landed, and names the
   files that did not.
2. *The last edits were never written.* Autosave debounced 1200 ms from the last
   edit, and the only flush was a React effect cleanup — which does not run when
   a phone kills a backgrounded tab. There is now a 6 s ceiling (so a long drag
   still reaches the disk), and `pagehide` / `visibilitychange` flush for the case
   React never gets to run. A failed save raises a banner with a retry and an
   export button, instead of vanishing into a console.
3. *Nothing told the user the store was at risk.* A refused `persist()` grant and
   a quota exhausted mid-import both looked like success. Large imports are now
   checked against free space *before* the copy starts, and the reason a write
   failed is translated into something actionable (`persistence.ts`).

Worth stating plainly: **these fixes make loss unlikely and visible, not
impossible.** Browser storage is still best-effort and Safari in particular can
evict it. The honest answer for important work remains "export the pack".

**The player itself.** Sampling the timeline costs 0.014 ms, so the player was
not short of speed — it was short of control. It gained a frame grid (24/25/30/
50/60) with one-frame step buttons and arrow-key stepping on that grid, a
transport rate (0.25×/0.5×/1×/2×, also on J/K/L) because 0.25× is how you hear
whether a cut lands on the beat, and an in/out loop region (I/O) so a single
second can be watched until it is right.

**How this was verified, and one near miss.** Six mutations were introduced into
the new rules and the audit caught all six. The close-path test needed three
attempts: the first waited seven seconds and read the store (that tests the
debounce, not closing), the second clicked a control that did not exist and was
rescued by a mount-time autosave. Both **passed with the fix deleted**. The
version that shipped asserts the control exists, asserts that *no timer had
saved yet* when the page closed, and reads back before the debounce could fire —
it fails when the `pagehide` listener is removed, which is the only property
worth having in such a test.

### Bigger libraries, and previews that tell the truth (Stage 3i)

The brief was "increase the stickers, make the filters a visible preview, more
emoji, and the same for effects and transitions — look up what people actually
use, not something plain".

**The filters were blank.** Not plain — blank. `FilterPreview` applied the CSS
filter to an empty absolutely-positioned div layered *over* the artwork, so every
tile in the grid rendered as an unmodified grey square. The one thing the request
asked for was the one thing that was broken. The filter now wraps the picture,
and the picture shows skin tones and foliage, because those are what a colour
look actually changes.

**Filters: 42 → 54 looks, organised by what people search for.** The catalogue
moved to `looks.ts` and grew the looks that dominate the picks: Matcha, Dune
Light, the 2016 throwback, Dreamy Glow, Velocity, Green × Noise, Neon Photo,
Clean Girl, K-Drama, and film stocks by name — Portra 400, Fuji 400H, Cinestill
800T, Kodachrome, Bleach Bypass, Teal & Orange, Super 8, VHS 1998. There is a
search box that matches tags as well as names ("teal", "kdrama", "vhs").

Crucially a look is now more than a CSS filter. The ones that read as *finished*
carry a finish layer: a blend-mode tint a filter stack cannot reach, monochrome
grain (generated once, tiled, deterministic so preview and export agree), a
vignette, and for the tape/instant looks a burnt-in caption. The preview tile
renders that same data, and a test asserts tile and canvas agree — so the card
cannot show something the clip will not get.

**Renaming ids would have deleted people's grades.** Some ids changed
(`mono-high` → `monohigh`, `neon-night` → `neonphoto`, `golden` → `goldenhour`).
A saved project keeps its `filter` string; if no look answers to it, the clip
silently renders as Original. That is data loss dressed as a cosmetic rename, so
`LEGACY_LOOK_IDS` + `resolveLookId` map every old id onto the look that replaced
it, and both `presetCss` and `finishFor` resolve through it.

**Stickers: 93 → 267, and there was a whole second catalogue.** The editor's own
sticker panel already read `stickers.ts`; the Library panel rendered a local
40-emoji array with no graphics and no words. Two lists, one a third the size,
disagreeing about what a sticker is. Both read one catalogue now.

| | before | after |
| --- | --- | --- |
| emoji | 43 | 147 |
| graphics | 24 | 68 |
| word stickers | 14 | 40 |
| shapes | 12 | 12 |
| **total** | **93** | **267** |

All drawn from Unicode and primitives — no bundled art, no licence, no CDN, and
razor-sharp at any size because they are text layers.

**Transitions: 19 → 27, with a trending family that has its own renderers.** The
research says the most-copied transitions are flash cuts, glitch, spin, light
leaks, smooth/luma reveals and whip pans. Eight were added, and each is a
dedicated branch in `composeTransition` rather than falling through to the wipe —
because a card that promises a glitch and exports a rectangle reveal is worse
than not offering it. Each also got its own preview animation instead of the
shared fade.

**Effects: 27 → 36.** Added the ones creators ask for by name: Motion blur (a
smear along travel, not a soft-focus blur), Glow, Chromatic, Light rays, Speed
push, Beat zoom, Focus in, Drift up/down.

**What this cost.** Entry bundle 6,357,679 → 6,378,879 bytes (+0.3%) for 12 new
looks, 8 transitions, 9 effects and 174 stickers. Full-grade render time is
unchanged within noise (26.7 ms), because the finish layer only runs for looks
that declare one and the grain pattern is cached per context.

**Verification, and the two tests that were lying.** Audit 328 assertions, 0
failures; smoke-editor 71 checks; fixture-bench 27/0. Twelve mutations were
introduced and caught — but only after two gaps were closed:

- Deleting the `paintFinish` call from `drawMainItem` left every test green. The
  unit test proved `paintFinish` draws; nothing proved anyone *called* it. There
  is now a wiring assertion. "The feature exists" and "the feature is on" are
  different claims.
- The smoke test found filter cards by exact title, so when the card title became
  "Apply the <name> look" it silently matched nothing and I nearly "fixed" it by
  loosening a threshold. It also drove the first `input[aria-label="Search
  filters"]` it found, which was in a detached, never-rendered panel — a test of
  nothing. Both now target the connected element.

Honest limits: there is no browser in this environment, so nothing was verified
by looking at it. The tiles are asserted structurally (the artwork is inside the
filtered element, the data URI parses, the preview animations differ per card),
not pixel by pixel. Thresholds that were exact counts are now floors, so the
catalogue can keep growing without the suite crying wolf.

### Parity: the five gaps CapCut and Kdenlive had (Stage 4)

The brief was to close the feature gaps against CapCut and Kdenlive, so the list
was built from what those editors actually ship rather than from guesswork.

**Crop, zoom and rotate are geometry, not a filter.** `geometry.ts` holds a
`FrameGeometry` — an anchor (`ax`, `ay`), an optional crop, a zoom and a
rotation — and `coverSourceRect` turns it into the source rectangle to draw.
The order matters and is the whole maths: cover the frame first, shrink *one*
axis to the crop, divide by the zoom, then offset by the anchor and clamp. A
uniform zoom cannot change an aspect ratio, which is why crop is a separate
field and `fillZoomForCrop` supplies the extra zoom to fill the frame again.
The crop is applied at *every* `paintFit` call site — three of them — because
before that it survived until the moment a clip was graded and then vanished.
`anchorFromDrag` inverts the drag so the picture follows the mouse rather than
running away from it, and a test walks the whole anchor/zoom space to prove the
source rectangle never escapes the image.

**Ripple edit, because deleting should not leave a hole.** `ripple.ts` is pure
and generic over the track type. Removing a clip closes the gap on the main
track and moves every later overlay back by the removed span — music that
started at 0:15 and covered the clip comes back to 0:10. Shift+Delete lifts
instead: the hole stays, and clips that straddle the cut are split, with
`sourceOffset` moved so the surviving piece keeps playing the same frames. A
clip trimmed under 50 ms (`MIN_KEEP`) is dropped rather than left as a sliver
nobody can grab.

**Scopes, so exposure is a measurement and not a guess.** `scopes.ts` builds a
histogram, an RGB waveform and a vectorscope from one readback, and
`readExposure` turns them into a sentence — clipped, crushed, flat or balanced.
The luma weights are Rec.601 (77/150/29) and the histogram records per-channel
counts, so a pure red that clips only on R is caught; a luma-only histogram
would call it fine.

**Adjustment layers grade what is underneath them.** A band is an
`OverlayClip` of kind `"adjustment"` on its own "Adjustment" track, carrying a
grade (the same `FilterAdjust` every clip uses) and optionally a look. The
important part is *where* it is drawn: after the main track, before the overlay
loop, and skipped by that loop. A band has no picture of its own, so drawing it
as an overlay would put the grade on top of the text it is supposed to be
grading. It ramps in and out over 250 ms so it can be eased across a scene
change, and it is not capped at 1280 px during an export — capping there would
ship a soft band in a 1080p render.

**Normalisation measures, then tells you the number.** `loudness.ts` estimates
LUFS with a K-weighting approximation, 400 ms blocks at 75 % overlap and the
two-stage −70 dB / relative gate, so a quiet passage cannot drag the measurement
down. It offers TikTok/YouTube (−14), podcast (−16) and EBU R128 broadcast
(−23), clamps the gain to ±24 dB, and warns when the corrected peak would land
above −0.1 dBFS. The gain is a linear multiplier that is deliberately allowed to
exceed 1: clamping it at 1 turned every "turn this up" into a silent no-op that
still reported +11.7 dB. That bug was found by a test asserting the audio
actually got louder, not by the code looking wrong.

Honest limits: there is no browser and no canvas backend in this environment, so
the band's *pixels* are not verified. What is verified is the arithmetic
(geometry, ripple spans, LUFS, scope counts), the wiring (the band is drawn
outside the overlay loop, the crop reaches all three call sites), and that a
crop and a band survive a project round trip. The per-frame cost of a heavy
grade is unchanged at ~39 ms for a 1280×720 buffer — that is pre-existing
`gradePixels` cost, measured, not something these features introduced, and it
remains the thing to fix before calling grading smooth on a phone.

### Making the grade pass faster without changing a pixel (Stage 5)

Stage 4 shipped with one measured number left on the table: a heavy grade cost
~39 ms per 1280×720 frame, which is more than a 30 fps budget. This is what
carried that cost, and what happened when it was attacked.

Measuring first paid off twice. The vignette ramp was rebuilt inside
`gradePixels` on every frame — 1025 entries of a `**` power. Caching it looked
like the obvious win and bought **nothing**, because 1025 iterations is noise
against 921,600 pixels. The real cost was the `Math.sqrt` per pixel, which the
cache did not touch. The lesson is the usual one: the loop you can see is
rarely the loop that costs.

Three changes survived:

1. **The vignette no longer takes a square root per pixel.** `dx²` is constant
   per column and `dy²` constant per row, so `r²` is an addition, and the only
   sqrt left is the ramp lookup. The clear centre is `r < 0.55`, i.e.
   `r² < 0.3025`, which covers a rectangle — so whole rows and columns are
   dismissed with a comparison instead of a root. **36 % faster.**
2. **temp/tint has its own loop.** Split-tone was `if (split > 0)` *inside* the
   per-pixel loop, so every frame paid that branch 921,600 times for a setting
   that never changes mid-frame. Hoisting it out: **36 % faster** for
   temperature and tint, **12 %** for split-tone.
3. **One branch instead of two `Math.max`** in the split-tone weight, since at
   most one of the two can be non-zero.

Everything else was measured and left alone. Sharpen (~11 ms) is untouched:
the unsharp mask needs the four neighbours of every pixel, so the same
technique does not apply, and it was already optimised in an earlier stage.
The whole pass went **34 ms → 29 ms** for the every-effect-at-once case.

**The constraint was bit-identical output, not "close enough".** A colour
regression that nobody can see in a diff is exactly the kind that ships, so the
optimised code was diffed against the original across eleven grade
combinations, and the audit now pins **golden pixel values captured from the
pre-optimisation implementation**. One real bug came out of that: caching `dx²`
in a `Float32Array` rounded the values enough to shift the ramp index and move
six pixels by one level. It is `Float64Array` now, and a test fails if it
changes back.

Honest limit: the case with *every* effect on is still ~29 ms, which is under
30 fps but not comfortably. Sharpen is the remaining cost and it needs a
different approach (a separable two-pass blur); it has not been done.

### A note on the error messages

Several messages used to tell the user to switch to Chrome/Edge or to convert
their file with another app. That is not a fix, so they were rewritten to state
what is *not possible on this device* and what still is — for example an
undecodable HEVC clip now says its audio and captions still work and the export
can still carry the sound, instead of recommending a converter. The audit fails
if "Chrome/Edge" or "convert it to" reappears in user-facing strings.

## AI policy

By design the editor has **no dependency on AI or on the network**:
no feature is gated behind a model, a cloud call or an account. The
“AI Studio” (Stage 5 — automatic captions, background removal, smart edits)
will be an *assistive* module that is off by default and can be turned off
without losing any capability. The Mayobuild platform's own database (if any
is attached to the wider platform) is never used for editing state.

## Testing & verification

Green builds are not proof the app works, so the editor is verified three ways
(all wired into `.github/workflows/audit.yml`):

```bash
npx tsc --noEmit -p tsconfig.json     # types
npx eslint src/mayocut                # lint (0 errors)
node .diag/audit.mjs                  # 283 pure-logic assertions

npm run build:shell
node scripts/smoke-shell.mjs /        # bundle boots + renders the landing page
node scripts/smoke-shell.mjs /mayocut # …and the MayoCut home
node scripts/smoke-editor.mjs         # the EDITOR mounts with a seeded project
node scripts/fixture-bench.mjs        # real encoded clips: container + proxy policy
node scripts/perf-bench.mjs           # interaction + per-frame grade cost
node scripts/perf-editor.mjs          # interaction latency in the real bundle
```

`audit.mjs` covers the maths that is easy to get quietly wrong — and, since
Stage 3e, the naming that is easy to get quietly wrong too: emoji clusters
(ZWJ, skin tone, flags, keycaps) must be recognised as emoji while words are
not, a picked shape must be stamped with its kind so the inspector can call it a
Sticker, and every sticker category must contain at least one asset. Each of
those cases was mutation-tested by breaking the code and watching it fail: an
emoji made to animate, a removed flag branch, a dropped `sticker` field and a
relabelled shape category each turn at least one case red.

Beyond the maths: speed-ramp and
speed-curve integration (closed form vs brute-force numeric integration), its
inverse, freeze-frame semantics, split/keyframe rebasing, transition windows,
keyframe interpolation, colour-grade CSS composition, aspect ratios, template
packs, caption word re-timing, device gating and the GIF encoder round-trip.

`smoke-editor.mjs` seeds a project containing a video clip, a freeze frame, a
wipe transition, styled text, a keyed sticker and a ducked music bed, then loads
the **production** bundle in a real DOM and asserts every surface mounted — zero
console errors allowed.

## Building the binaries

One codebase, three outputs:

```bash
npm install
npm run build:shell        # static editor bundle → app-shell-dist/

npm run dist:win           # → desktop/release/mayocut-setup-0.1.0.exe
npm run dist:android       # → android/app/build/outputs/apk/debug/app-debug.apk
```

`dist:android` needs JDK 17 + Android SDK. `dist:win` works on any OS
(electron-builder cross-builds NSIS).

**GitHub Actions** — the `distribute` workflow (Actions tab → *distribute* →
Run workflow, enter a release tag) builds both binaries and attaches them to
the matching GitHub Release, which the `/downloads` page links to:

- `mayocut-setup-<version>.exe`
- `mayocut-android-<version>.apk`

Bump the `version` in `package.json` (and `desktop/package.json`) before a new
release; the `/downloads` page links follow that version.

## Roadmap (stages)

1. ✅ Core editor — import, tracks, trim/split, audio, text, transitions, export
2. ✅ Creative — 12 transitions, 15 motion effects, keyframes, speed ramp,
   freeze frame, 10 text looks, GIF export, sticker packs
3. ✅ Template ecosystem — packs as a single `.json` file, media re-matched by file
   name, "enhance" packs that restyle an existing project
4. ✅ Advanced — chroma key, masks, blend modes, audio ducking, per-track mute/solo,
   voice shaping, beat markers, colour match, letterbox framing, storage insight,
   word-level caption re-timing, drawable speed curves
5. 🔜 Local AI — on-device captions & background removal (optional, assistive,
   never blocking). Captions/TTS/denoise already ship; background removal is next.
6. 🔶 MP4 export — WebCodecs H.264 ships today (Chrome/Edge/desktop/Android
   WebView). ffmpeg.wasm fallback for older browsers is the remaining piece.
7. ✅ Speed curves — drawable multi-point curve with closed-form timing
8. 🔜 Motion tracking / auto-reframe — needs an on-device model; large
