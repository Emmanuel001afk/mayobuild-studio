import "../src/styles.css";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";

/**
 * Mayobuild Studio — full app shell for the native builds
 * (Android APK via Capacitor, Windows EXE via Electron).
 *
 * This mounts the SAME router the web platform uses — the whole app
 * (home, MayoCut video editor, downloads, project builder, console, …) —
 * so the APK/EXE is the full Mayobuild app, not just one section.
 * Client-side only: no SSR, no server functions; cloud-backed pages
 * degrade gracefully to their offline states (see isShellApp()).
 */

// --- startup error overlay -------------------------------------------------
// The native shell has no devtools on a phone: any module-level crash would
// otherwise show as a blank screen. Surface the first error on-screen so
// problems are debuggable on-device (and in user screenshots).
function showStartupError(err: unknown) {
  try {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:#1a0505;color:#fecaca;font:13px/1.5 ui-monospace,monospace;padding:16px;overflow:auto;white-space:pre-wrap;word-break:break-word;";
    box.textContent =
      "⚠ Mayobuild Studio failed to start\n\n" + (err?.toString?.() ?? String(err)) +
      "\n\nIf you have a console attached, the full stack is logged there.";
    document.body?.appendChild(box);
  } catch {
    /* last resort — give up silently */
  }
}
window.addEventListener("error", (e) => showStartupError(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => showStartupError(e.reason));
// ---------------------------------------------------------------------------

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={getRouter()} />,
);
