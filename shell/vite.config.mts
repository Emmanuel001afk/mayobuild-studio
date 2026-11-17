import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// Static, relative-base build of the MayoCut editor.
// This bundle is wrapped by Electron (Windows .exe) and Capacitor (Android .apk).
export default defineConfig({
  base: "./",
  root: here,
  // copy icons / manifest alongside the bundle
  publicDir: path.resolve(here, "../public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(here, "../src"),
    },
  },
  build: {
    outDir: path.resolve(here, "../app-shell-dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
