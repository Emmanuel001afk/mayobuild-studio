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
- **MP4** — WebCodecs `VideoEncoder` (H.264) + `AudioEncoder` (Opus) muxed by
  `mp4-muxer`, with a ScriptProcessor bridge from the WebAudio graph.
- **WebM** — `canvas.captureStream()` + `MediaStreamAudioDestinationNode`
  → `MediaRecorder` (VP9/Opus). Works everywhere MediaRecorder exists.
- **GIF** — frame-stepped render into a 256-colour cube palette via `omggif`.
- **WAV / PNG** — `OfflineAudioContext` stereo mixdown / `canvas.toBlob`.

All four share the same compositor, so what you preview is what ships.

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

Only the first is frame-accurate. WebM has no frame-stepped path yet.

### Platform split

The resolver and the Project JSON are the contract between platforms:

- **web** — TypeScript, `Engine` renders to canvas, WebAudio for sound.
- **Android / desktop (Electron)** — can run the same JSON through a native
  renderer; they are *not* limited to what the browser exposes.

A native engine is a separate stage. Anything bundled for it needs its licences
reviewed (decoders are usually LGPL/GPL or patent-encumbered, unlike the
current stack, which uses only the platform's own decoders).

### What is NOT done yet

- Proxy media / thumbnail caching for large files on weak devices.
- Frame-stepping export for MP4/WebM (GIF only so far).
- Real-video integration fixtures: the audit runs against synthetic Project
  fixtures, not actual sample files.

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
node .diag/audit.mjs                  # 114 pure-logic assertions

npm run build:shell
node scripts/smoke-shell.mjs /        # bundle boots + renders the landing page
node scripts/smoke-shell.mjs /mayocut # …and the MayoCut home
node scripts/smoke-editor.mjs         # the EDITOR mounts with a seeded project
```

`audit.mjs` covers the maths that is easy to get quietly wrong: speed-ramp and
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
