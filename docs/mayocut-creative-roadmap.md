# MayoCut creative roadmap

The goal is a dependable editor on phones and laptops, not just a collection of
buttons. Keep the web editor and local-first media persistence working throughout.

## Requested capabilities and current status

1. **Audio library:** glitch, whoosh and clock effects plus phonk, vlog and other
   music. Ten original synthesized effects can be searched, previewed
   and added offline. Music and a broader, searchable catalogue are not yet built.
2. **Proxy media:** currently disabled because the old encoder could lose sound
   or timing. Rebuild with synchronized A/V, progress, cancellation, low-storage
   handling and verification; original files must always be used for export.
   `desktop/native-proxy.cjs` is an isolated FFmpeg prototype with metadata
   checks and a synthetic delayed-audio integration test. It is not integrated
   into the app, and does not yet prove synchronization on varied real media,
   Windows or Android. `proxy-validation.ts` contains a separate preliminary
   metadata gate. Neither enables proxy preview.
3. **Video and image library:** green-screen and transparent overlays, white
   backgrounds, fire, smoke and other assets. White, black, green and blue
   solid backgrounds are generated locally and saved as PNG media; stock video,
   fire, smoke and a searchable library are not yet included. External assets
   need explicit licensing, preview, download state and durable offline copies.
4. **Stickers:** a timeline timecode and an animated cat emoji are available on
   phone and desktop as editable text layers. They use the browser compositor;
   visual quality and export parity still require real-device checks. A broader
   visual/animated sticker catalogue remains to be built.
5. **Color:** basic correction, six HSL color ranges and an RGB master midtone
   curve and RGB channel midtone curves are available on main clips in the
   browser compositor. Multi-point curves and scopes remain to be built. Grading currently uses a
   reduced-resolution pixel pass; check performance and preview/export on devices.
   The restricted native desktop exporter rejects these adjustments.
6. **Format and layout:** make portrait/landscape format easy to find, preserve
   editable framing, and test both phone orientations and desktop. A format
   picker is now visible on the preview. Ask whether
   the user also wants a separate manual workspace orientation setting.

## Shared acceptance criteria

- Every asset has a real preview and adds at the playhead. User media and added
  assets persist locally; failure or insufficient storage must be visible.
- Verify commercial-use rights, attribution and redistribution terms for every
  sourced asset. Do not represent generated effects as licensed music.
- Preview, timing and sound must match the selected export path, or unsupported
  features must be called out before export. Native Android preview and export
  are not yet implemented; desktop native export supports a restricted subset.
- Test on real Android and Windows devices, including slow hardware and real
  video/audio fixtures. Unit and simulated-DOM tests do not establish device
  behavior. Test media reopening, transitions, extracted audio, cancellation,
  offline operation, low storage and vertical/landscape layouts.
- Windows FFmpeg/FFprobe bundling needs an actual Windows installer test and
  corresponding-source/license review before distribution.
