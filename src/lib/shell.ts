/**
 * True when running inside the native app shell (Android APK / Windows EXE).
 * The shell build tags its index.html with <meta name="mayobuild-shell">, so
 * routes can adapt: native chrome instead of web nav, and offline-friendly
 * behavior when no server is reachable (the app is local-first by design).
 */
export function isShellApp(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector('meta[name="mayobuild-shell"]') !== null;
}
