# MayoCut vs CapCut — full-picture audit

_Scope: not just the reported bugs, but the whole product surface — what CapCut
implements (mobile + desktop, from its public feature docs, store listings and
the creator community), how it implements it, what MayoCut already does, and a
honest gap list with the fixes that shipped in v0.6.1 vs the roadmap._

Sources: CapCut Google Play / desktop listings, the CapCut feature cheat sheet
(sheetly.org), CapCut Pro feature pages, and creator-community posts on
dual-audio/caption workflows (see session notes for the exact URLs).

---

## 1. How CapCut is actually built (the "and how" part)

**Layout & orientation**
- Mobile: editing happens in one layout — preview dominant on top, timeline
  below, a bottom tab bar (Media / Text / Audio / Effects / …) that opens
  tool sheets. The app is usable in portrait *and* landscape; portrait is the
  browsing surface (templates, home), landscape is the working surface.
- Desktop: three zones — media/assets panel left, preview top-right, timeline
  full-width bottom, clip properties right.
- Device differences are small on purpose: the *same* feature set, only the
  arrangement changes. CapCut does not gate core editing on device class.

**Editing core**
- Non-destructive, multi-track timeline: 1 main video lane + N overlay lanes
  (PIP, stickers, text) + audio lanes. Clips: trim, split, merge, reorder,
  duplicate, speed 0.1×–100× with *speed curves* (drawn graph), reverse,
  freeze frame, frame-step.
- Transitions between clips; per-clip "motion" via **keyframes on every
  property** (position, scale, rotation, opacity) — this is the backbone of
  CapCut's "wow" factor, not the filters.
- Text: free placement by **dragging on the preview**, font picker (hundreds
  of fonts + local font import), per-word animations (karaoke), entrance/exit
  animations, bubble templates, typewriter.
- Captions: Auto Captions (ASR) → **each caption is a normal clip on the Text
  track** — draggable on the preview, trimmable on the timeline, editable
  word-by-word. That "captions are just clips" model is the key UX decision.
- Media: a library you can browse, add from, and **delete from**; deleting
  handles timeline references explicitly.

**Color & looks**: filter presets + adjust sliders (brightness/contrast/
saturation/temperature/tint/fade/sharpen/vignette) + LUTs + color match.

**Audio**: layered audio (music + SFX + voiceover + original), fades, beat
sync (beat markers from the music track), voice recorder, noise reduction,
voice enhancer, voice *changers* (presets), audio extract/detach (video →
independent audio clip, original muted).

**AI** (the part users notice): Auto Captions, background removal, retouch,
TTS, text-to-video, script generation. Notably, CapCut's AI runs through
*their* cloud with a free tier + Pro gating — it is **not** local.

**Export**: resolution/fps/format choice, 4K/60, GIF.

---

## 2. What MayoCut already had (parity we shouldn't lose)

Already at or above CapCut parity for an *offline* editor:

- Multi-track timeline: main lane + Text/Overlay/Audio tracks; trim, split,
  reorder, duplicate, undo (60 steps), autosave.
- Speed 0.25×–4× **with a speed ramp** (linear ramp = our curve), reverse,
  9 built-in motion effects, **keyframes on x/y/scale/rotation/opacity for
  every clip**, transitions (crossfade, dip-to-black).
- Filters + 4-way adjust + **LUTs (built-in + .cube import)** — the LUT import
  is rarer than CapCut's.
- Text: 9 animations incl. karaoke & typewriter, emoji stickers, GIF stickers
  (imported), chroma key, blend modes, shape masks.
- Audio: volume/fades, **reverb/echo/pitch FX**, RNNoise denoise (local!),
  mic recording, **TTS (sherpa-onnx VITS, local)**, beat detection +
  "cut to beats", silence trim, loudness normalize, **Extract audio**
  (added in v0.6.1, same model as CapCut's).
- Captions: **local Whisper** (tiny/base, 16 languages, word-level timing) —
  a capability CapCut only offers through their cloud.
- Export: 24/30/60 fps, 1080/4K, MP4 (WebCodecs) or WebM, on-device caps for
  weak devices.
- Templates + shareable packs (JSON, media re-matched by file name) —
  CapCut's "templates" are cloud-only; ours work offline.

---

## 3. The gaps that made it feel "inconvenient / one-way" — and the fix

| # | Complaint / gap | Root cause found in code | Fix (v0.6.1) |
|---|-----------------|--------------------------|--------------|
| 1 | Auto-rotate: "only the editing area, no video" | `useIsMobile` keyed on width only; landscape phone crossed 768px → desktop 3-panel layout on a ~380px-tall screen → preview squeezed to a sliver | Mobile layout now keyed on `(max-width:767px) OR (max-height:500px)`; landscape gets a compact timeline (112px→h-28) + compact tab bar so the preview stays dominant |
| 2 | Captions "can't be moved around" | Text clips only had a 9-grid `pos`; no free x/y, no way to grab them | **Drag any text/sticker directly on the preview** (pointer hit-testing against the exact painted pixels); text now has base X/Y (offset from the pos anchor); karaoke captions moved too |
| 3 | Can't delete media | Library cards were add-only buttons | × on every library card (desktop + mobile sheet); warns how many timeline clips use it and removes them (undoable) |
| 4 | "Is Mayobuild's AI even called in MayoCut?" | Honest answer: **no** — the platform router is server-side (env keys); the offline shell has no server, so it was unreachable. MayoCut's AI was local-only (wllama/Whisper/TTS) | **Assist → Cloud AI**: user's own provider keys (Gemini/Groq/OpenRouter/OpenAI/DeepSeek/Cerebras/Mistral/HF) stored only on-device; the AI writer now fails over across them straight from the device. Local model still preferred when checked off |
| 5 | Text feels limited vs CapCut | One hardcoded font | 10 cross-platform font styles (no downloads → identical on every device), font picker in Tune |
| 6 | Voice features hidden | Pitch FX existed but was a raw slider | Named voice presets (Normal / Slightly higher / Chipmunk / Lower / Deep) |
| 7 | Cross-device inconsistency | Web app kept website chrome on phones | App-style mobile bottom nav (Home / Editor / Get app) in the shell; editor already app-style (preview + bottom tabs + sheets) |
| 8 | One-way areas | e.g. captions couldn't be repositioned after generation; media couldn't be removed | Addressed by 2 + 3; drag is fully undoable (one undo step per gesture) |

---

## 3b. v0.7 — closing the gap list (shipped)

Everything below was implemented in this pass, including the engine work that
made each item real rather than cosmetic.

| Area | What shipped | Where |
|---|---|---|
| **Bug** | Right-edge trim collapsed a clip to 0.1 s (clamp inverted). Fixed, with a shared `trimMain` used by both layouts. | `Editor.tsx` |
| **Transitions** | 2 → **12** (slide ×4, wipe ×4, dip-to-white, zoom punch, blur dissolve) through a real compositor (`composeTransition`), so preview and export stay identical. `Apply to every cut`. | `engine.ts`, `Inspector.tsx` |
| **Freeze frame** | Split-at-playhead + held-frame clip; frame pinned, audio silent, motion suppressed. `F` shortcut. | `engine.ts`, `types.ts` |
| **Speed** | 0.1×–8× ladder (was 0.25×–4×), plus the **drawable speed curve** — drag points on a log-scale graph, presets, curve drawn on the timeline clip, closed-form timing (verified against numeric integration) | `types.ts`, `Inspector.tsx`, `Timeline.tsx` |
| **Colour** | `temperature`, `tint`, `fade`, `sharpen`, `vignette`, `splitTone` as a real pixel pass (`gradePixels`), plus **colour match** across clips. | `engine.ts` |
| **Framing** | cover / contain / blur-fill per clip; project background colour behind letterboxing. | `engine.ts` |
| **Motion** | 15 effects (added zoom-out, pan ×2, tilt, Ken Burns, colour pulse, sway) | `engine.ts` |
| **Text** | Outline, shadow strength, letter spacing, line height, alignment, italic/underline/uppercase, opacity, pill radius, **imported .ttf/.otf**, **10 one-tap looks**, 4 new animations (zoom-in, rise, wipe-in, slide-from-left) | `engine.ts`, `Inspector.tsx`, `idb.ts` |
| **Audio** | **Auto-ducking** (music dips under a voiceover, per-clip amount + project strength), **mute/solo per track**, master gain, **voice shaping** (bass/mid/treble + "voice enhance") | `engine.ts` |
| **Timeline** | Drag a clip body to **re-order**, beat markers drawn on the ruler + "split at beats", per-lane hide, Ctrl+wheel zoom, adaptive ruler density | `Timeline.tsx` |
| **Stickers** | Sticker filter, fit modes, playback speed & loop for video stickers | `engine.ts`, `Inspector.tsx` |
| **Export** | **GIF**, **PNG still**, **WAV mix** added to MP4/WebM; remembered per project; inline preview in the export library | `engine.ts`, `ProjectsHome.tsx` |
| **Formats** | 4 → **8** canvases (3:4, 4:3, 2:3, 21:9) | `types.ts` |
| **Undo** | 60 → **80** steps, plus a full **redo** stack (`Ctrl+Shift+Z` / `Ctrl+Y`) that was missing entirely | `Editor.tsx` |
| **Device** | On-device **storage meter** + persistent-storage request so the browser can't silently evict a project | `ProjectsHome.tsx` |
| **Assist** | Beat detection now writes markers onto the timeline ruler (detect-only used to leave the ruler empty); "Cut to beats" writes both; a "clear markers" action | `Assist.tsx` |
| **Captions** | **Word-level re-timing** editor: nudge per word (order-safe), shift the whole caption, re-space evenly, tap a word to seek to it | `types.ts`, `Inspector.tsx` |
| **Quality gates** | 785 → **0** lint errors; logic audit 37 → **114** assertions; new `smoke-editor.mjs`; CI workflow `audit.yml` | `.diag/`, `scripts/`, `.github/` |

## 4. Honest gap list vs CapCut (what we do NOT have yet)

Ranked by (user-visible value / effort):

1. ~~Freeze frame~~ — **shipped (v0.7)**
2. ~~Beat markers on the timeline~~ — **shipped (v0.7)**
3. ~~Word-level caption re-timing~~ — **shipped (v0.7)**: nudge any word
   earlier/later between its neighbours, shift the whole caption, re-space
   evenly, click a word to jump the playhead to it.
4. ~~Speed curves (drawn)~~ — **shipped (v0.7)**
5. **Sticker/music library** — CapCut ships millions of CC-BY assets; we're
   offline-first so a bundled starter pack is the offline-honest version.
   Medium + asset work. **Still open.**
6. ~~Font import (local .ttf/.otf)~~ — **shipped (v0.7)**
7. **Stabilization** — needs a feature-matching pass (e.g. a small ONNX flow
   estimator). Large. **Still open.**
8. **Auto reframe / smart crop** — subject-aware crop is ML. Large.
   **Still open.**
9. **Motion tracking** — ML (object tracker). Large. **Still open.**
10. **Background removal / retouch / video translation** — **still-image background removal shipped**: pinned MODNet ONNX model, local ONNX Runtime Web/WASM inference, first-use model download cached in IndexedDB, transparent PNG added as a new overlay without modifying the source. Real native + WASM inference smoke tests pass. Video background removal, retouch and translation remain open.
11. ~~Color match~~ — **shipped (v0.7)**
12. ~~GIF export, platform aspect presets~~ — **shipped (v0.7)** (GIF + 8 aspects)

What we have that CapCut does **not** (offline positioning): on-device
Whisper captions, on-device TTS, on-device denoise, on-device still-image
background removal after its one-time ~25 MB model download, LUT import,
template packs that travel as files, no account, no watermark, and the whole
editor works with zero network after first load.

---

## 5. Why "inconvenience differs by device" (and what now makes it consistent)

Three causes, all addressed or planned:

1. **Layout breakpoints reacting to width only** (the rotate bug) — fixed:
   orientation-aware breakpoints, compact chrome in landscape.
2. **Capability gating** — `device.ts` caps exports (4K/fps) and preview
   buffer size on weak devices and says *why* (toast), so a phone degrades
   gracefully instead of failing. Kept.
3. **Feature reach** — everything one-touch on desktop (inspector panel) was
   one sheet away on phones (Tune sheet auto-opens on clip tap); with
   drag-on-preview, the most common mobile gesture (move the caption) no
   longer needs any panel at all.
