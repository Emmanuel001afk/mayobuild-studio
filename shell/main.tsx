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
// The native shell has no devtools on a phone, so an uncaught error needs to be
// visible on-device (and in screenshots).
//
// It must not, however, cover a working app. This used to append a full-screen
// `inset:0; z-index:99999` panel on ANY window error, for the whole lifetime of
// the process — so a recoverable runtime error long after startup (a failed
// frame draw, a bad project field) buried the editor behind "failed to start"
// with no way back. It now:
//   • only takes over the screen while the app has not rendered yet;
//   • otherwise shows a dismissible bar, so the user keeps their app;
//   • keeps the first error rather than stacking panels.
// ---------------------------------------------------------------------------
let overlayShown = false;

function appHasRendered(): boolean {
  const root = document.getElementById("root");
  return !!root && root.childElementCount > 0;
}

function showStartupError(err: unknown) {
  if (overlayShown) return; // keep the first error, do not stack
  overlayShown = true;
  try {
    const detail = (err as { stack?: string })?.stack ?? err?.toString?.() ?? String(err);
    const started = appHasRendered();

    const box = document.createElement("div");
    box.setAttribute("role", "alert");
    if (started) {
      // Non-fatal: a slim bar in the corner, dismissible, app still usable.
      box.style.cssText =
        "position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;background:#3f1d1d;" +
        "color:#fecaca;font:12px/1.4 ui-monospace,monospace;padding:8px 34px 8px 10px;" +
        "border:1px solid #7f1d1d;border-radius:8px;max-height:30vh;overflow:auto;" +
        "white-space:pre-wrap;word-break:break-word;";
      box.textContent = "⚠ Something went wrong: " + String(err?.toString?.() ?? err);
      const close = document.createElement("button");
      close.textContent = "✕";
      close.setAttribute("aria-label", "Dismiss error");
      close.style.cssText =
        "position:absolute;top:6px;right:8px;background:none;border:0;color:#fecaca;" +
        "font-size:14px;cursor:pointer;";
      close.onclick = () => box.remove();
      box.appendChild(close);
    } else {
      // The app genuinely never started: take the screen, it is blank anyway.
      box.style.cssText =
        "position:fixed;inset:0;z-index:99999;background:#1a0505;color:#fecaca;" +
        "font:13px/1.5 ui-monospace,monospace;padding:16px;overflow:auto;" +
        "white-space:pre-wrap;word-break:break-word;";
      box.textContent =
        "⚠ Mayobuild Studio failed to start\n\n" + String(detail) +
        "\n\nIf you have a console attached, the full stack is logged there.";
    }
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
