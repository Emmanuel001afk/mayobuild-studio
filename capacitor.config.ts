import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Android build of Mayobuild Studio.
 * webDir is the full-app static shell produced by `npm run build:shell` —
 * the entire platform (home, MayoCut editor, builder, console, downloads),
 * not just one section.
 */
const config: CapacitorConfig = {
  appId: "com.mayobuild.studio",
  appName: "Mayobuild Studio",
  webDir: "app-shell-dist",
  backgroundColor: "#0d1220",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
