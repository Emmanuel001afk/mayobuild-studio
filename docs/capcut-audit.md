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

## 4. Honest gap list vs CapCut (what we do NOT have yet)

Ranked by (user-visible value / effort):

1. **Freeze frame** (CapCut core) — medium: engine already frame-steps for
   reverse; a "freeze at playhead" clip type is the work.
2. **Beat markers on the timeline** — we detect beats; drawing them as tick
   marks on the audio lane is small and makes "cut to beat" visual.
3. **Word-level caption re-timing** — word timing is already stored
   (`TextWord`); an editor to nudge word start/end = medium.
4. **Speed curves (drawn)** — we have a linear ramp; a drawable curve is the
   CapCut-grade version. Medium.
5. **Sticker/music library** — CapCut ships millions of CC-BY assets; we're
   offline-first so a bundled starter pack (a few dozen SFX + stickers,
   generated or CC0) is the offline-honest version. Medium + asset work.
6. **Font import (local .ttf/.otf)** — CapCut allows importing fonts; we can
   do the same via `FontFace` + IndexedDB. Small.
7. **Stabilization** — CapCut has a one-tap version; a proper one needs a
   feature-matching pass (e.g. a small ONNX flow estimator). Large.
8. **Auto reframe / smart crop** for aspect changes — we change aspect with
   letterbox/cover; subject-aware crop is ML. Large.
9. **Motion tracking** — ML (object tracker). Large.
10. **Background removal / retouch / video translation** — ML; would ride on
    the existing ONNX/wllama runtime pattern. Large.
11. **Color match** (match clip A to clip B) — compute a reference palette
    and map. Medium, no ML needed.
12. **GIF export, vertical/9:16 presets per platform** — small polish.

What we have that CapCut does **not** (offline positioning): on-device
Whisper captions, on-device TTS, on-device denoise, LUT import, template
packs that travel as files, no account, no watermark, and the whole editor
works with zero network after first load.

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
