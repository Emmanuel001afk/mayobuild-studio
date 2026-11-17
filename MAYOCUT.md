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

## Feature set (v0.1)

- **Multi-track timeline** — main video track + Text / Overlay / Audio tracks
- **Clips** — trim (drag edges), split at playhead (`S` / double-click), duplicate, delete, reorder, replace media
- **Speed** — 0.25×–4× per clip (slow motion / fast forward)
- **Filters** — 10 presets (Vivid, Warm, Cinema, Noir, …) + per-clip Brightness / Contrast / Saturation / Hue
- **Transitions** — crossfade & dip-to-black between clips, with duration control
- **Text** — size, color, background pill, bold, 9-position grid, fade/slide-up animation
- **Image overlays (stickers)** — scale, position, rotation
- **Audio** — music/SFX clips with volume, fade edges; per-clip mute for original sound
- **Canvas formats** — 9:16, 1:1, 4:5, 16:9
- **Projects** — auto-saved to IndexedDB, thumbnails, rename/duplicate/delete
- **Media library** — videos/photos/music stored as blobs on-device
- **Templates** — 4 built-in (Slideshow, Cinematic Intro, Beat Cut, Lyric Box) built from *your* media + “Save as template” for your own reusable templates (media slots re-match by file name)
- **Export** — real-time canvas+WebAudio render to WebM (VP9/Opus), saved to the device + kept in the on-device export library
- **Undo** — 60-step snapshot undo (`Ctrl+Z`)
- **Offline** — PWA manifest + service worker; the editor never calls a server

## Architecture

```
src/mayocut/
  types.ts            data model (Project / MainClip / OverlayClip / MediaItem)
  engine.ts           playback clock, canvas compositor (cover crop, filters,
                      transitions, text, overlays), WebAudio graph, MediaRecorder export
  idb.ts              IndexedDB layer (media, blobs, projects, templates, exports)
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

**Export.** `canvas.captureStream(30)` + WebAudio `MediaStreamDestination`
→ `MediaRecorder` (WebM). Runs 100% client-side, in the browser, Electron or
WebView. MP4 encoding (ffmpeg-based) is planned for the desktop/Android builds.

**The device as database.** All state lives in IndexedDB (`mayocut-db`):
`media` (items) + `blobs` (files), `projects`, `templates`, `exports`.
Closing the tab loses nothing; clearing site data is the only “delete all”.

## AI policy

By design the editor has **no dependency on AI or on the network**:
no feature is gated behind a model, a cloud call or an account. The
“AI Studio” (Stage 5 — automatic captions, background removal, smart edits)
will be an *assistive* module that is off by default and can be turned off
without losing any capability. The Mayobuild platform's own database (if any
is attached to the wider platform) is never used for editing state.

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
2. 🔜 Creative — more transitions (slide/wipe/zoom), keyframe animation, speed curves, stickers packs
3. 🔜 Template ecosystem — template packages export/import as a single file (zip), community exchange
4. 🔜 Advanced — chroma key / green screen, masking, stabilization, audio ducking, waveform view
5. 🔜 Local AI — on-device captions & background removal (optional, assistive, never blocking)
6. 🔜 MP4 export — ffmpeg.wasm (web) + native encoders (desktop/Android)
