import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Android (and future iOS) build of MayoCut.
 * webDir is the static shell produced by `npm run build:shell`.
 */
const config: CapacitorConfig = {
  appId: "com.mayobuild.mayocut",
  appName: "MayoCut",
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
