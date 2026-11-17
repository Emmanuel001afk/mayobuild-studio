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
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={getRouter()} />,
);
