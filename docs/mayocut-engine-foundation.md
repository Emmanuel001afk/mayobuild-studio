# MayoCut rendering foundation

## Current state

`src/mayocut/timeline.ts` is a platform-neutral evaluator used by the current
browser-based engine for main-track rendering, media synchronization, buffering,
and overlay sampling. The Electron and Capacitor apps currently run that same
browser playback engine. Desktop also has an **experimental native MP4 export**
backend in `desktop/native-export.cjs`. Windows x64 installers stage FFmpeg
and FFprobe at build time and include them in the application resources; users
do not install them separately. Non-Windows development still uses PATH.
Android has no native backend yet. The versioned `RenderPlanV1` is a detached snapshot of the existing project
model, not an independent interchange standard.

A timeline clip's interval is `[start, end)`: at a hard cut the outgoing and
incoming clips cannot both own the playhead. Transition windows start before the
incoming clip's nominal start, and retain the current engine's semantics. Samples
include source position, speed, gain, and incoming transition progress. Overlay
samples include source offsets. `timeForFrame` computes times from frame indices
and a rational frame rate without cumulative additions.

`findSharedSourceConflicts` identifies an important limitation of the current
backend: it uses one HTML media element per media ID. If simultaneous instances
of that source need different seeks or volume, the element cannot represent both
correctly. The editor warns in the preview and export dialog. A separate import
of the source gets a separate media ID; removing the overlap is another workaround.
The warning is conservative and is not a replacement for per-instance decoders.

## Experimental desktop export

The Windows desktop export dialog offers the native path when its bundled
FFmpeg and FFprobe executables start successfully. It accepts up to 64 ordinary video clips (one hour and 512 MB of
unique source data), hard cuts, trimming, per-clip mute and volume, default
color and cover framing. It also supports up to 64 separate audio clips, their
source offsets, fades, volume and track mute/solo, plus master gain. Audio clips
must end within the main video. It writes H.264/AAC MP4 using FFmpeg with `libx264`
and `aac` encoders. No text, visual overlays, transitions, speed changes,
video/audio effects, ducking, color adjustments, transforms or keyframes are
supported yet. Validation
occurs in the Electron main process and rejects unsupported work instead of
silently dropping it; users can choose the standard exporter. The imported blobs
are copied to private temporary files and cleaned up. The save dialog determines
the output destination; renderer code cannot provide a command or filesystem
path. Native export saves to the chosen location, not the IndexedDB export library.
No cancellation or progress percentage is implemented yet.

For integration tests, set `MAYOCUT_TEST_FFMPEG` and `MAYOCUT_TEST_FFPROBE` to
local executable paths before `npm run test:native`. Tests without those variables
still check validation, but skip the real-media test. The integration test builds
real colored video fixtures with a tone, exports cuts, and probes video, audio,
duration, detached-audio synchronization, mute, solo, fade and mix levels. The Windows packaging hook downloads fixed, hash-verified executables from npm;
the generated binaries are ignored by Git. The application never downloads
them at runtime. Windows-only executables, GPL text and notices are included in
the installer resources. The selected FFmpeg executable is an older 2018 build;
a maintained replacement is needed. **Before distributing releases**, review the
specific builds' corresponding source, third-party dependencies, licenses,
patents and target ABIs; the included notice is not a legal compliance review.

## Next native milestones

1. Extend the native job protocol with version negotiation, cancellation and
   progress. Do not expose unrestricted shell commands or arbitrary filesystem
   paths through IPC.
2. Implement per-clip source instances and a shared native decode/composite/mix
   core for desktop and Android. Evaluate dependencies, target ABIs, packaging,
   licenses, codec patents and hardware/software fallback before distribution.
3. Extend deterministic export to more project features using a frozen plan;
   support features explicitly or report them as unsupported—never silently omit it.
4. Add device integration tests with known source files and independently inspect
   exported video frames, audio samples, duration and synchronization. Test
   device sleep, backgrounding, low storage, cancellation and long projects.
5. Integrate behind a capability check. Existing projects and the web backend must
   remain usable; native paths should not be claimed or enabled until tested.

All imported media remains local. IndexedDB stores blobs in the web layer;
native backends will need a bounded local transfer mechanism and lifecycle for
those bytes. A render plan contains media IDs, not filesystem paths or the media
itself.

## Verification

`npm run test:mayocut` exercises hard cuts, transitions, source offsets, mute,
snapshot isolation, shared-source conflicts, local storage and buffering state.
`node scripts/smoke-editor.mjs` (after the shell build and installing its documented
optional DOM dependencies) checks editor mounting and filter autosave. These tests
do not replace real codec/device playback or native-renderer tests.
