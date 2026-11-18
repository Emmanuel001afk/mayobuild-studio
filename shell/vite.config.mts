import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Static, relative-base build of the FULL Mayobuild platform (router + all
// routes, MayoCut included). This bundle is wrapped by Electron (Windows .exe)
// and Capacitor (Android .apk).
//
// The web build is a TanStack *Start* app: its Vite plugin injects virtual
// modules and keeps `.server.` files out of the client bundle. The shell build
// is plain Vite, so we reproduce the parts the SPA actually needs:
//
//   1. "#tanstack-start-entry" / "#tanstack-router-entry" — plugin-injected
//      virtual modules used only by Start's hydrateStart(); the shell SPA
//      creates its own router, so they get inert stubs.
//   2. "tanstack-start-manifest:v" — server route-manifest virtual module;
//      stubbed with an empty manifest.
//   3. Any import of a `*.server.*` module (Supabase middleware, AI
//      providers, …) — server-only code. The client graph imports named
//      helpers from them (e.g. `requireUser`); each is stubbed as a function
//      that throws, because server functions cannot run offline in the shell.
// ---------------------------------------------------------------------------

function shellStartStubs(): Plugin {
  const V_START_ENTRY = "\0shell:tanstack-start-entry";
  const V_ROUTER_ENTRY = "\0shell:tanstack-router-entry";
  const V_MANIFEST = "\0shell:tanstack-start-manifest";
  const V_STORAGE_CTX = "\0shell:start-storage-context";
  return {
    name: "shell-start-stubs",
    enforce: "pre",
    resolveId(id) {
      if (id === "#tanstack-start-entry") return V_START_ENTRY;
      if (id === "#tanstack-router-entry") return V_ROUTER_ENTRY;
      if (id === "tanstack-start-manifest:v") return V_MANIFEST;
      // start-storage-context's real module does `new AsyncLocalStorage()`
      // (node:async_hooks) at TOP LEVEL — that throws in the browser bundle
      // (externalized node builtin = undefined) and blanks the whole app.
      // Its only exports are used inside server-only closures, so a browser
      // stub with identical throwing semantics is safe.
      if (id === "@tanstack/start-storage-context") return V_STORAGE_CTX;
      return null;
    },
    load(id) {
      if (id === V_START_ENTRY) return "export const startInstance = undefined;";
      if (id === V_ROUTER_ENTRY)
        return "export async function getRouter() { throw new Error('shell build: TanStack Start router entry is not used by the SPA shell'); }";
      if (id === V_MANIFEST)
        return "export function tsrStartManifest() { return { routes: { __root: {} } }; }";
      if (id === V_STORAGE_CTX)
        return `
function noContext(opts) {
  if (opts?.throwIfNotFound !== false) throw new Error("No Start context (offline shell build — server functions are unavailable)");
  return undefined;
}
export function getStartContext(opts) { return noContext(opts); }
export function runWithStartContext(_context, fn) { return fn(); }
`;
      return null;
    },
  };
}

function shellServerOnly(): Plugin {
  // One virtual module PER (importer, server-module) pair, carrying the
  // importer path in its id. Names are parsed at load() time from that single
  // importer, so there is no shared state and no cross-importer race when
  // Rolldown resolves in parallel.
  const VIRTUAL = "\0shell-server-only:";
  const SEP = "??";
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namedImportsFrom = (src: string, base: string): string[] => {
    const re = new RegExp(
      `import\\s*([^;'"]+?)\\s*from\\s*["'][^"']*${escape(base)}["']`,
      "g",
    );
    const names = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const brace = m[1].match(/\{([^}]*)\}/);
      if (!brace) continue;
      for (const part of brace[1].split(",")) {
        const p = part.trim();
        if (!p || /^\s*type\b/.test(p)) continue; // type-only imports are erased
        const orig = p.split(/\s+as\s+/)[0].trim();
        if (/^[\w$]+$/.test(orig)) names.add(orig);
      }
    }
    return [...names];
  };
  return {
    name: "shell-server-only",
    enforce: "pre",
    resolveId(id, importer) {
      if (!importer || importer.includes("node_modules")) return null;
      if (!/\.server(\.[cm]?[jt]s?)?$/.test(id)) return null;
      const cleanImporter = importer.split("?")[0];
      return VIRTUAL + cleanImporter + SEP + id;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL)) return null;
      const sep = id.indexOf(SEP);
      const importer = id.slice(VIRTUAL.length, sep);
      const modId = id.slice(sep + SEP.length);
      let names: string[] = [];
      try {
        // The import statement may use an alias/relative form, so match on the
        // module's basename (unique in this repo).
        const base = modId.split("/").pop() ?? modId;
        names = namedImportsFrom(readFileSync(importer, "utf8"), base);
      } catch {
        /* importer unreadable — default export only */
      }
      const stub =
        'const __serverOnly = () => { throw new Error("Server-only module: not available in the offline shell build"); };';
      const named = names.map((n) => `export const ${n} = __serverOnly;`).join("\n");
      return `${stub}\n${named}\nexport default __serverOnly;\n`;
    },
  };
}

export default defineConfig({
  base: "./",
  root: here,
  // copy icons / manifest alongside the bundle
  publicDir: path.resolve(here, "../public"),
  plugins: [react(), tailwindcss(), shellStartStubs(), shellServerOnly()],
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
