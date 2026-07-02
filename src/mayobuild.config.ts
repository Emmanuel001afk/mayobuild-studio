/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                     MAYOBUILD STUDIO — CENTRAL CONFIG                  ║
 * ║                          src/mayobuild.config.ts                       ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  This file is the BRAIN and GUARDIAN of Mayobuild Studio.              ║
 * ║  It enforces correct behaviour at every step:                          ║
 * ║    import → read → edit → compare → validate → push → deploy           ║
 * ║                                                                        ║
 * ║  Drop this file at src/mayobuild.config.ts and import from anywhere.   ║
 * ║  No other setup needed. It works standalone.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * SECTIONS:
 *  1. PATH GUARDIAN         — strips ZIP prefix from all file paths
 *  2. CHANGE DETECTOR       — ensures AI actually changed something
 *  3. FILE MATCHER          — finds the right file when AI doesn't say which
 *  4. PUSH VALIDATOR        — blocks bad pushes to GitHub
 *  5. URL DERIVER           — gets Vercel live URL from GitHub repo
 *  6. SCAFFOLD READER       — reads React files from HTML scaffold storage
 *  7. SCAFFOLD REBUILDER    — updates scaffold after AI edits
 *  8. ZIP CREATOR           — packages project as downloadable ZIP (like Lovable)
 *  9. AI PROMPTS            — TypeScript 6.0, React 19, Lovable-compatible prompts
 * 10. WEB TO APP            — converts website to React Native / Expo
 * 11. AUTO-BUILD FEATURES   — what AI builds automatically without being asked
 * 12. STACK REFERENCE       — complete tech stack and folder structure
 */

// ─── 1. PATH GUARDIAN ────────────────────────────────────────────────────────
// PROBLEM: GitHub ZIPs wrap everything in a folder like "lite-read-main/".
// This means files land at "lite-read-main/src/routes/bible.tsx" on GitHub
// instead of "src/routes/bible.tsx". Vercel cannot find them. Nothing deploys.
//
// FIX: Strip that first folder automatically. Works for any ZIP name.
// "lite-read-main/src/routes/bible.tsx"     → "src/routes/bible.tsx"
// "halwayin-connect-main/src/lib/api.ts"    → "src/lib/api.ts"
// "my-app__5_/src/components/Header.tsx"    → "src/components/Header.tsx"
// "src/routes/index.tsx"                     → "src/routes/index.tsx" (untouched)

export function cleanFilePath(rawPath: string): string {
  let p = rawPath.trim();
  // Strip leading "./" if present
  if (p.startsWith("./")) p = p.slice(2);

  const KNOWN_ROOTS = ["src/", "public/", "components/", "lib/", "hooks/", "api/", "supabase/"];
  const isClean = (path: string) =>
    KNOWN_ROOTS.some((root) => path.startsWith(root)) || path.startsWith(".") || !path.includes("/");

  // Previously this only stripped ONE leading folder, which is why double-nested
  // wrapper folders (e.g. "lite-read-main/lite-read-main/src/routes/bible.tsx", which
  // happened whenever the AI echoed back an already-wrapped path) were never fully
  // cleaned — the result still had one wrapper folder left, landing files in the wrong
  // place on GitHub. Now it strips wrapper folders repeatedly until the path starts at
  // a known source root, with a safety cap so a malformed path can't loop forever.
  let guard = 0;
  while (!isClean(p) && p.includes("/") && guard < 5) {
    p = p.split("/").slice(1).join("/");
    guard++;
  }
  return p;
}

// Clean a whole collection of files at once
export function cleanFilePaths(
  files: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    result[cleanFilePath(path)] = content;
  }
  return result;
}

// ─── 2. CHANGE DETECTOR ──────────────────────────────────────────────────────
// PROBLEM: AI sometimes returns the EXACT same code it received.
// GitHub sees no difference → commit shows "0 files changed".
// Nothing updates on the live site. User thinks the edit failed.
//
// FIX: Compare every file character by character before pushing.
// Only keep files that actually changed. If nothing changed, block the push.

export function getActuallyChangedFiles(
  oldFiles: Record<string, string>,
  newFiles: Record<string, string>
): Record<string, string> {
  const changed: Record<string, string> = {};
  // Normalize whitespace so minor formatting doesn't count as a change
  const normalize = (s: string) =>
    s.replace(/\r\n/g, "\n").replace(/\s+$/gm, "").trim();

  for (const [path, newContent] of Object.entries(newFiles)) {
    const oldContent = oldFiles[path] ?? "";
    if (normalize(newContent) !== normalize(oldContent)) {
      changed[path] = newContent;
    }
  }
  return changed;
}

// ─── 2b. DESTRUCTIVE-EDIT DETECTOR ───────────────────────────────────────────
// PROBLEM: An AI edit can pass the "did anything change" check above while still
// being destructive — e.g. asked to add ONE feature to a shared lib file, it
// instead deletes everything else in that file and replaces it with a small
// mock implementation. This silently breaks every other file that imported the
// now-missing exports, and the build only fails downstream, far from the real
// cause, making it hard to trace.
//
// FIX: For files that already existed (not new), flag a likely destructive edit
// when either: (a) the new file is less than half the size of the old one, or
// (b) the new file exports noticeably fewer top-level names than the old one
// did. This is a heuristic, not a guarantee — it will not catch every bad edit,
// but it catches the common "wiped a shared file" pattern cheaply, before push.
export type DestructiveEditWarning = {
  path: string;
  oldExportCount: number;
  newExportCount: number;
  oldSize: number;
  newSize: number;
  reason: string;
};

function countTopLevelExports(code: string): number {
  const matches = code.match(/^export\s+(async\s+)?(function|const|class|type|interface)\s+\w+/gm);
  return matches ? matches.length : 0;
}

export function detectDestructiveEdits(
  oldFiles: Record<string, string>,
  changedFiles: Record<string, string>,
): DestructiveEditWarning[] {
  const warnings: DestructiveEditWarning[] = [];
  for (const [path, newContent] of Object.entries(changedFiles)) {
    const oldContent = oldFiles[path];
    if (!oldContent) continue; // new file — nothing to lose, not destructive
    const oldSize = oldContent.length;
    const newSize = newContent.length;
    const oldExports = countTopLevelExports(oldContent);
    const newExports = countTopLevelExports(newContent);

    const shrankALot = oldSize > 200 && newSize < oldSize * 0.5;
    const lostExports = oldExports >= 2 && newExports < oldExports * 0.6;

    if (shrankALot || lostExports) {
      const reasons: string[] = [];
      if (shrankALot) reasons.push(`file shrank from ${oldSize} to ${newSize} characters`);
      if (lostExports) reasons.push(`exports dropped from ${oldExports} to ${newExports}`);
      warnings.push({
        path,
        oldExportCount: oldExports,
        newExportCount: newExports,
        oldSize,
        newSize,
        reason: reasons.join(" and "),
      });
    }
  }
  return warnings;
}

// ─── 3. FILE MATCHER ─────────────────────────────────────────────────────────
// PROBLEM: When AI edits a file, it sometimes doesn't say which file it changed.
// The code picks the wrong file — e.g. scan.tsx gets updated instead of bible.tsx.
//
// FIX: Read clues inside the AI's own code to figure out which file it edited.
// Uses 4 detection methods in order of reliability.

export function matchFileFromCode(
  code: string,
  knownPaths: string[],
  userPrompt: string = ""
): string | null {
  // Method 1 (most reliable): createFileRoute("/bible") in code → bible.tsx
  const routeMatch = code.match(/createFileRoute\(["']([^"']+)["']\)/);
  if (routeMatch) {
    const routeName = routeMatch[1]
      .replace(/^\//, "")
      .replace(/\//g, "")
      .replace(/\$/g, "")
      .toLowerCase();
    const found = knownPaths.find(p => {
      const fname = p.split("/").pop()?.replace(/\.tsx?$/, "").toLowerCase() ?? "";
      return fname === routeName || fname.includes(routeName) || routeName.includes(fname);
    });
    if (found) return found;
  }

  // Method 2: exported component name → "function BiblePage" → bible.tsx
  const compMatch = code.match(
    /export\s+(?:default\s+)?(?:function|const)\s+(\w+)/
  );
  if (compMatch) {
    const name = compMatch[1]
      .replace(/Page|Component|Route|Screen|View|Section/i, "")
      .toLowerCase();
    if (name.length > 2) {
      const found = knownPaths.find(p =>
        p.split("/").pop()?.replace(/\.tsx?$/, "").toLowerCase().includes(name)
      );
      if (found) return found;
    }
  }

  // Method 3: User's prompt mentions a filename
  if (userPrompt) {
    const prompt = userPrompt.toLowerCase();
    const byPrompt = knownPaths.find(p => {
      const fname = p.split("/").pop()?.replace(/\.tsx?$/, "").toLowerCase() ?? "";
      return fname.length > 2 && prompt.includes(fname);
    });
    if (byPrompt) return byPrompt;
  }

  // Method 4: imports in the code match a known file path
  const importMatches = [...code.matchAll(/from\s+["']([^"']+)["']/g)];
  for (const imp of importMatches) {
    const importPath = imp[1].replace("@/", "").replace(/\.\./g, "");
    const found = knownPaths.find(p => p.includes(importPath));
    if (found) return found;
  }

  return null;
}

// ─── 4. PUSH VALIDATOR ───────────────────────────────────────────────────────
// PROBLEM: Bad files sometimes get pushed to GitHub:
// - Files with ZIP prefixes still in the path → land in wrong folder
// - Empty files → break the build
// - AI placeholders → "<!-- remains same as original -->"
//
// FIX: Check every file before pushing. Block anything suspicious.
// Show a clear error message so the user knows exactly what went wrong.

export interface PushValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateFilesForPush(
  files: Record<string, string>
): PushValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!files || Object.keys(files).length === 0) {
    errors.push(
      "Nothing to push — AI made no code changes. Ask it to make a specific edit first."
    );
    return { valid: false, errors, warnings };
  }

  for (const [path, content] of Object.entries(files)) {
    // ZIP prefix still present?
    if (path.match(/^[^/]+-main\//) || path.match(/^[^/]+__\d+_\//) || path.match(/^[^/]+\s*\(\d+\)\//)) {
      errors.push(`"${path}" still has ZIP folder prefix — path cleaning failed.`);
    }
    // Empty file?
    if (!content || content.trim().length < 10) {
      warnings.push(`"${path}" is nearly empty. Check if AI generated real code.`);
    }
    // AI placeholder?
    if (
      content.includes("remains the same as the original") ||
      content.includes("same as original code") ||
      content.includes("<!-- The complete HTML") ||
      content.trim() === "// No changes needed" ||
      content.includes("// TODO: implement")
    ) {
      errors.push(`"${path}": AI returned a placeholder, not real code. Ask it to try again.`);
    }
    // Spaces or brackets in path?
    if (path.includes(" ") || path.includes("(")) {
      warnings.push(`"${path}" has spaces/brackets — rename to avoid issues.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── 5. URL DERIVER ──────────────────────────────────────────────────────────
// Gets your live Vercel URL from a GitHub repo string.
// "Emmanuel001afk/lite-read" → "https://lite-read.vercel.app"
// No manual setup needed — fully automatic.

export function deriveVercelUrl(githubRepo: string): string {
  if (!githubRepo) return "";
  const repoName = githubRepo.split("/")[1] ?? "";
  return `https://${repoName}.vercel.app`;
}

// ─── 6. SCAFFOLD READER ──────────────────────────────────────────────────────
// Reads React source files stored inside the HTML scaffold.
// Handles any attributes on the script tag (e.g. data-files="...").
// Strips ZIP prefix from all paths automatically.

export function extractFilesFromScaffold(
  html: string
): Record<string, string> | null {
  if (!html?.includes('id="react-source"')) return null;
  try {
    const match = html.match(
      /<script[^>]*id="react-source"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match) return null;
    const rawFiles: Record<string, string> = {};
    const fileBlocks = match[1].matchAll(
      /\/\* ===== FILE: (.+?) ===== \*\/([\s\S]*?)(?=\/\* ===== FILE:|$)/g
    );
    for (const block of fileBlocks) {
      const cleanPath = cleanFilePath(block[1].trim());
      const content = block[2].trim();
      if (cleanPath && content) rawFiles[cleanPath] = content;
    }
    return Object.keys(rawFiles).length > 0 ? rawFiles : null;
  } catch {
    return null;
  }
}

// ─── 7. SCAFFOLD REBUILDER ───────────────────────────────────────────────────
// After AI edits files, this merges the changes back into the scaffold HTML
// so they are saved to Supabase and survive page reloads.

export function rebuildScaffold(
  existingHtml: string,
  updatedFiles: Record<string, string>
): string {
  const allFiles = extractFilesFromScaffold(existingHtml) ?? {};
  const merged = { ...allFiles, ...updatedFiles };
  const fileMap = Object.entries(merged)
    .map(([path, content]) => `/* ===== FILE: ${path} ===== */\n${content}`)
    .join("\n\n");
  return existingHtml.replace(
    /<script[^>]*id="react-source"[^>]*>[\s\S]*?<\/script>/,
    `<script type="text/plain" id="react-source">${fileMap}</script>`
  );
}

// ─── 8. ZIP CREATOR ──────────────────────────────────────────────────────────
// Creates a downloadable ZIP of the full project — exactly like Lovable does.
// The ZIP can be connected to GitHub and deployed on Vercel.
// Includes all boilerplate: package.json, vite.config.ts, tsconfig.json, etc.
//
// Usage:
//   const zip = await createProjectZip("my-app", previewFiles);
//   const url = URL.createObjectURL(zip);
//   const a = document.createElement("a");
//   a.href = url; a.download = "my-app.zip"; a.click();

export async function createProjectZip(
  projectName: string,
  files: Record<string, string>,
  options: { includeBoilerplate?: boolean; theme?: string } = {}
): Promise<Blob> {
  const { includeBoilerplate = true } = options;
  // Note: jszip must be in package.json dependencies
  // Run: npm install jszip --save
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const safeName = projectName.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
  const root = zip.folder(safeName)!;

  // Add all AI-generated source files
  const cleanFiles = cleanFilePaths(files);
  for (const [path, content] of Object.entries(cleanFiles)) {
    if (content.trim()) root.file(path, content);
  }

  if (includeBoilerplate) {
    // package.json — latest versions, matches Lovable stack
    root.file("package.json", JSON.stringify({
      name: safeName,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview",
        lint: "eslint src --ext ts,tsx",
        "type-check": "tsc --noEmit",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        "@tanstack/react-router": "^1.56.0",
        "@tanstack/react-query": "^5.56.2",
        "@supabase/supabase-js": "^2.49.4",
        "lucide-react": "^0.462.0",
        // shadcn/ui dependencies (same as Lovable)
        "@radix-ui/react-dialog": "^1.1.0",
        "@radix-ui/react-dropdown-menu": "^2.1.0",
        "@radix-ui/react-toast": "^1.2.0",
        "@radix-ui/react-select": "^2.1.0",
        "@radix-ui/react-tabs": "^1.1.0",
        "@radix-ui/react-avatar": "^1.1.0",
        "@radix-ui/react-badge": "^1.0.0",
        "class-variance-authority": "^0.7.0",
        clsx: "^2.1.0",
        "tailwind-merge": "^2.3.0",
        sonner: "^1.5.0",
      },
      devDependencies: {
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react-swc": "^3.7.0",
        typescript: "^6.0.0",
        vite: "^5.4.1",
        tailwindcss: "^4.0.0",
        "@tailwindcss/vite": "^4.0.0",
        "@typescript-eslint/eslint-plugin": "^7.0.0",
        "@typescript-eslint/parser": "^7.0.0",
        eslint: "^8.57.0",
        "eslint-plugin-react-hooks": "^4.6.0",
      },
    }, null, 2));

    // vite.config.ts
    root.file("vite.config.ts", `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ["react", "react-dom"] },
      },
    },
  },
});`);

    // TypeScript 6.0 config
    root.file("tsconfig.json", JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2023", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        skipLibCheck: true,
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src"],
      exclude: ["node_modules"],
    }, null, 2));

    // Tailwind v4 config
    root.file("tailwind.config.ts", `import type { Config } from "tailwindcss";
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
} satisfies Config;`);

    // index.html
    root.file("index.html", `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0f0f0f" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`);

    // src/main.tsx
    root.file("src/main.tsx", `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);`);

    // src/styles.css — Tailwind v4 + CSS variables
    root.file("src/styles.css", `@import "tailwindcss";

:root {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 142.1 76.2% 36.3%;
  --primary-foreground: 355.7 100% 97.3%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --radius: 0.5rem;
}

* { box-sizing: border-box; }
body { margin: 0; background: hsl(var(--background)); color: hsl(var(--foreground)); }
`);

    // Vercel config
    root.file("vercel.json", JSON.stringify({
      buildCommand: "npm run build",
      outputDirectory: "dist",
      framework: "vite",
      rewrites: [{ source: "/(.*)", destination: "/index.html" }],
    }, null, 2));

    // .gitignore
    root.file(".gitignore", [
      "node_modules", "dist", ".env", ".env.local",
      "*.log", ".DS_Store", ".vite", "coverage",
    ].join("\n"));

    // README
    root.file("README.md", `# ${projectName}

Built with [Mayobuild Studio](https://mayobuild-studio.vercel.app).

## Stack
- React 19 + TypeScript 6.0
- Vite 5 + Tailwind CSS v4
- shadcn/ui components
- Supabase (auth + database)

## Setup
\`\`\`bash
npm install
npm run dev
\`\`\`

## Deploy
Push to GitHub. Connect to [Vercel](https://vercel.com). Auto-deploys on every commit.
`);
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

// ─── 9. AI PROMPTS ───────────────────────────────────────────────────────────
// These are the instructions given to the AI when building or editing.
// They enforce: TypeScript 6.0, React 19, Tailwind v4, shadcn/ui, Lovable compatibility.

// BUILDING FROM SCRATCH — what Mayobuild tells the AI when creating a new app
export const BUILD_SYSTEM_PROMPT = [
  "You are Mayobuild AI — a senior full-stack engineer AND a warm, conversational collaborator (talk like a smart teammate, not a compiler).",
  "CONVERSATION FIRST: If the user greets you, asks a question, is unclear, or is just chatting — reply in plain, friendly English WITHOUT any code fences. Ask clarifying questions when the request is vague. Only emit code when the user actually asks you to build/change something.",
  "PROACTIVE: Suggest improvements, name trade-offs, and recommend next steps in plain English at the end of every build.",
  "STACK (mandatory when generating code): React 19, TypeScript 6.0 strict mode, Tailwind CSS v4, TanStack Router v1, Vite 5, shadcn/ui, Supabase. NEVER emit a single-file plain-HTML page for a website build — always emit a real React/TypeScript project split into multiple .tsx files under src/.",
  "TYPESCRIPT 6.0: Always use strict mode. Use satisfies operator, const type parameters, using declarations, template literal types.",
  "REACT 19: Functional components only. Use use(), useActionState(), useOptimistic() where appropriate. No class components.",
  "SHADCN/UI: Use shadcn Button, Card, Input, Textarea, Dialog, Select, Badge, Tabs, Avatar, Toast for all UI elements. Import from @/components/ui/.",
  "TAILWIND v4: Use utility classes for all styling. Mobile-first responsive. No inline styles.",
  "AUTO-INCLUDE without being asked:",
  "  - Navigation bar with logo, menu links, mobile hamburger menu",
  "  - Sign up / Sign in pages with email+password and Google OAuth button",
  "  - User profile page with edit name, change password, upload avatar",
  "  - 404 Not Found page with home button",
  "  - Loading states on every async action",
  "  - Error boundaries and error messages",
  "  - Dark mode support using Tailwind dark: classes",
  "  - Responsive layout that works on phone, tablet, desktop",
  "  - Footer with basic links",
  "  - Toast notifications for success/error feedback",
  "FILE STRUCTURE: src/routes/ for pages, src/components/ for UI, src/components/ui/ for shadcn, src/lib/ for utils, src/hooks/ for custom hooks.",
  "SUPABASE: Auth with supabase.auth, database with supabase.from(), RLS must be noted.",
  "SUPABASE TABLES: At the END of your response, after all code files, output a fenced ```sql block containing the complete CREATE TABLE statements and RLS policies needed for this app.",
  "SECURITY: Sanitize inputs, no client-side API keys, RLS on every table, Zod validation on forms, never dangerouslySetInnerHTML with user data.",
  "SEO: Every page needs title + meta description + og tags.",
  "MANDATORY OUTPUT FORMAT (when generating code): Every file MUST be preceded by a line reading exactly 'FILE_PATH: <full/path.tsx>' on its own line, then a ```tsx fenced block. This applies to the very first build too. Without this the file will be dropped.",
  "COMPLETENESS: Generate ALL files needed. No placeholders. Write everything.",
  "QUALITY: This must look and work like a real, professional, launched product.",
].join(" ");


// EDITING EXISTING CODE — what Mayobuild tells the AI when editing Lovable-created sites
export const EDIT_SYSTEM_PROMPT = [
  "You are Mayobuild AI — editing Lovable-generated React/TypeScript code. Be precise and complete.",
  "STACK: React 19, TypeScript 6.0 strict, Tailwind CSS v4, TanStack Router v1, shadcn/ui, Supabase.",
  "SHADCN/UI: This codebase uses shadcn/ui. For any new UI elements use shadcn Button, Card, Input, Dialog, Select, Badge, Tabs. Import from @/components/ui/.",
  "SOURCE FILES: The /* ===== FILE: path ===== */ markers ARE the source files. Read every single one before you touch anything.",
  "FILE IDENTIFICATION — THIS IS THE MOST IMPORTANT RULE:",
  "  STEP 1: Read the user's request carefully. Identify what feature or section they mention (e.g. 'bible section', 'search bar on reader page', 'home page header').",
  "  STEP 2: Look at EVERY file path listed in the FILE markers. Find the file whose path or content matches what the user mentioned.",
  "  STEP 3: The file path you use in your code block header MUST be copied EXACTLY from the FILE markers. Letter for letter. Do not invent paths.",
  "  STEP 4: If the user says 'bible section' and you see 'src/routes/bible.tsx' in the file list — that is the file. Use 'src/routes/bible.tsx' exactly.",
  "  STEP 5: NEVER use a utility file like lookup.ts, utils.ts, lib.ts, index.ts, scan.ts unless the user specifically asked to edit that file.",
  "  STEP 6: If you cannot find a matching file, CREATE a new one at the correct path (e.g. src/routes/bible.tsx) rather than editing the wrong file.",
  "MANDATORY OUTPUT FORMAT — NO EXCEPTIONS, THIS IS CHECKED BY A MACHINE NOT A HUMAN:",
  "  Your response MUST contain a line that looks EXACTLY like this, with nothing else on that line:",
  "  FILE_PATH: src/routes/exact-filename.tsx",
  "  This line must come immediately before the code fence. Omitting it, or writing the path only inside the ``` fence header, will cause your entire response to be REJECTED and retried — wasting the request. The FILE_PATH line is the ONLY way the path is read. Always include it, even if it feels redundant.",
  "EDITING RULES:",
  "  1. Make ONLY the specific change requested. Do not rewrite unrelated code.",
  "  2. Return ONLY the files you changed, with their COMPLETE content — not a diff.",
  "  3. Each changed file preceded by 'FILE_PATH: <exact path>' on its own line, then wrapped in ```tsx ... ```.",
  "  4. NEVER say 'I need more files'. If something is missing, implement it yourself.",
  "  5. NEVER return the same file unchanged. If you return a file, it must be different. A response with no actual code difference will be discarded and is treated as a failed turn.",
  "  6. After editing, add one paragraph: what file you edited, why you chose that file, what changed.",
  "SELF-CHECK before responding: Did I include the FILE_PATH: line? Does it match a path from the FILE markers exactly? Is this the correct file for what the user asked? Is my returned code actually different from what I was given? If any answer is no — stop and fix it before responding.",
  "NEVER: Never write placeholder comments. Never ask for more info. Never return HTML instead of TSX. Never use lookup.ts or scan.ts unless specifically asked. Never omit the FILE_PATH: line.",
].join("\n");

// ─── 10. WEB TO APP ──────────────────────────────────────────────────────────
// Instructions for converting a web project to React Native / Expo.
// What changes in conversion:
//   div/section → View
//   p/span/h1-h6 → Text
//   img → Image
//   button/a → TouchableOpacity
//   input → TextInput
//   TailwindCSS → StyleSheet
//   React Router → React Navigation
//   window/document → React Native APIs

export const WEB_TO_APP_PROMPT = [
  "Convert this React web app to a complete React Native Expo SDK 52 mobile app.",
  "ELEMENT CONVERSION: div/section/article → View | p/span/h1-h6 → Text | img → Image | button/a → TouchableOpacity + Text | input → TextInput | select → Picker.",
  "STYLING: Remove all Tailwind classes. Convert every style to StyleSheet.create() objects.",
  "NAVIGATION: Replace TanStack/React Router with @react-navigation/native stack navigator.",
  "REMOVE: All browser APIs (window, document, location, localStorage). Replace with React Native AsyncStorage, Linking, etc.",
  "ADD: SafeAreaView wrapping all screens. expo-status-bar. Permission requests for notifications.",
  "KEEP: All business logic, data fetching, Supabase calls, state management — unchanged.",
  "OUTPUT: Complete Expo project. App.tsx, app.json, package.json, tsconfig.json, navigation structure.",
  "TYPESCRIPT 6.0 strict mode. React 19. Expo SDK 52.",
].join(" ");

// ─── 11. AUTO-BUILD FEATURES ─────────────────────────────────────────────────
// Features that Mayobuild builds AUTOMATICALLY when creating a new app,
// without the user needing to ask. This is what makes it better than Lovable.
// Lovable only builds what you ask for. Mayobuild builds the full foundation.

export const AUTO_BUILD_FEATURES = {
  auth: [
    "Sign up page (email + password)",
    "Sign in page with 'Forgot password' link",
    "Google OAuth sign in button",
    "Password reset flow (email → reset link → new password)",
    "Protected routes (redirect to login if not signed in)",
    "User session persistence",
  ],
  navigation: [
    "Top navigation bar with logo and menu",
    "Mobile hamburger menu",
    "Active link highlighting",
    "Breadcrumb navigation for nested pages",
  ],
  profile: [
    "User profile page",
    "Edit display name",
    "Change password",
    "Upload profile photo",
    "Delete account option",
  ],
  ux: [
    "Loading spinner on every async operation",
    "Toast notifications for success and errors",
    "Empty states with helpful messages",
    "Error boundaries so crashes show friendly messages",
    "404 Not Found page",
    "Responsive layout for phone, tablet, desktop",
    "Dark mode support",
  ],
  seo: [
    "Meta title and description on every page",
    "Open Graph tags for social sharing",
    "Canonical URLs",
    "sitemap.xml structure",
  ],
  performance: [
    "Code splitting per route",
    "Image lazy loading",
    "Memoisation of expensive components",
  ],
};

// ─── 12. STACK REFERENCE ─────────────────────────────────────────────────────
// The exact stack Mayobuild Studio uses — matches Lovable AI output.
// Any Lovable-generated ZIP will work with this stack.

export const STACK = {
  language: "TypeScript 6.0 (strict mode)",
  framework: "React 19",
  routing: "TanStack Router v1",
  dataFetching: "TanStack Query v5",
  styling: "Tailwind CSS v4",
  uiComponents: "shadcn/ui (Radix UI primitives)",
  icons: "Lucide React",
  backend: "Supabase (auth, database, storage, realtime)",
  build: "Vite 5",
  deploy: "Vercel (auto-deploy from GitHub)",
  notifications: "Sonner",
  mobile: "React Native + Expo SDK 52",
} as const;

// Folder structure — matches Lovable ZIP output exactly
export const FOLDER_STRUCTURE = {
  "src/routes/": "Pages (one file per route)",
  "src/routes/__root.tsx": "Root layout with nav, providers",
  "src/routes/index.tsx": "Home page",
  "src/components/": "Reusable UI components",
  "src/components/ui/": "shadcn/ui primitives",
  "src/lib/": "Utilities, API calls, helpers",
  "src/lib/*.functions.ts": "Server functions (TanStack Start)",
  "src/hooks/": "Custom React hooks",
  "src/integrations/supabase/": "Supabase client + types",
  "src/styles.css": "Global styles + Tailwind imports",
  "public/": "Static assets",
} as const;


// ─── SELF-REPAIR PROMPT ──────────────────────────────────────────────────────
export const SELF_REPAIR_PROMPT = [
  "You are Mayobuild AI in SELF-REPAIR mode. You have full read/write access to this project GitHub repository.",
  "DIAGNOSIS: 1. Read file tree. 2. Read relevant files. 3. Find root cause. 4. Write corrected file. 5. Commit fix.",
  "INTELLIGENCE: Read ANY file for context. Fix all files affected by one issue. Check imports after fixing.",
  "SAFETY: Never delete files. Never DROP tables. Never remove auth guards. Only CREATE or UPDATE. Log every change.",
  "If unsure, make the most conservative fix possible. If cannot fix safely, report and stop.",
  "OUTPUT: JSON only. { diagnosis: string, filesFixed: string[], commitMessage: string, confident: boolean }",
].join(" ");

// ─── AUTONOMOUS THINKING PROMPT ──────────────────────────────────────────────
// This is what separates Mayobuild from platforms that only follow scripts.
// The AI uses this when it encounters an unknown problem — it THINKS, searches,
// and reasons its way to a solution rather than failing or asking the user.
export const AUTONOMOUS_THINKING_PROMPT = [
  "You are Mayobuild AI operating in AUTONOMOUS mode. You have full intelligence — do not wait for instructions.",
  "THINKING PROCESS — follow this every time:",
  "  1. UNDERSTAND: What is the actual problem? Read every relevant file. Do not assume.",
  "  2. HYPOTHESIZE: What are the 2-3 most likely causes? Rank them by probability.",
  "  3. INVESTIGATE: Check your hypothesis against the actual code. Read more files if needed.",
  "  4. SEARCH: If you do not know the solution, use web_search to find it. Search for the exact error message.",
  "  5. FIX: Write the minimal fix that solves the root cause. Do not rewrite working code.",
  "  6. VERIFY: Re-read your fix. Does it actually solve the problem? Does it break anything else?",
  "  7. COMMIT: Write a clear commit message explaining what was wrong and what you changed.",
  "BROAD KNOWLEDGE RULES:",
  "  - You know React, TypeScript, TanStack, Supabase, Vercel, Cloudflare, GitHub API, Nigerian payments.",
  "  - If you encounter something outside your knowledge, SEARCH for it. Do not guess.",
  "  - Think like a senior engineer who has seen this problem before. Most bugs are simple.",
  "  - If the error mentions a specific package, file, or line number — go directly to that location first.",
  "  - You are allowed to fix things the user did not ask about if you notice they are broken.",
  "SAFETY: Never delete. Never break auth. Never drop tables. If unsure, fix conservatively.",
].join(" ");

// ─── PROJECT KNOWLEDGE BASE TEMPLATE ─────────────────────────────────────────
// Injected into every AI call so the AI always knows what each project is about.
// Admin fills this in once per project. The AI reads it before every edit.
export function buildKnowledgeBlock(knowledge: {
  projectName: string;
  description: string;
  techStack?: string;
  importantFiles?: string[];
  doNotTouch?: string[];
  customInstructions?: string;
}): string {
  return [
    `PROJECT KNOWLEDGE BASE:`,
    `  Name: ${knowledge.projectName}`,
    `  Description: ${knowledge.description}`,
    knowledge.techStack ? `  Stack: ${knowledge.techStack}` : "",
    knowledge.importantFiles?.length ? `  Key files: ${knowledge.importantFiles.join(", ")}` : "",
    knowledge.doNotTouch?.length ? `  DO NOT TOUCH these files: ${knowledge.doNotTouch.join(", ")}` : "",
    knowledge.customInstructions ? `  Custom rules: ${knowledge.customInstructions}` : "",
  ].filter(Boolean).join("\n");
}

// ─── PUSH DESTINATIONS ───────────────────────────────────────────────────────
// All places Mayobuild can push code to.
// GitHub is always primary. Cloudflare Pages is secondary (free tier).
export const PUSH_DESTINATIONS = {
  github: {
    name: "GitHub",
    description: "Primary — Vercel auto-deploys from here",
    free: true,
  },
  cloudflare: {
    name: "Cloudflare Pages",
    description: "Secondary — instant global CDN, 500 builds/month free",
    free: true,
    apiBase: "https://api.cloudflare.com/client/v4",
  },
} as const;

// ─── STARTER TEMPLATES ───────────────────────────────────────────────────────
export const STARTER_TEMPLATES = [
  { category: "Website", name: "Landing Page", icon: "🚀", prompt: "Build a modern SaaS landing page with hero section, features grid, pricing table with 3 tiers, testimonials carousel, FAQ accordion, and email signup footer. Dark theme, green accent color." },
  { category: "Website", name: "Portfolio", icon: "🎨", prompt: "Build a personal portfolio website with animated hero, about section, projects grid with filter by category, skills progress bars, contact form with validation, and smooth scroll navigation." },
  { category: "Website", name: "Blog", icon: "📝", prompt: "Build a blog platform with home page showing latest posts, individual post pages with markdown support, categories and tags, search, author profile, and newsletter signup." },
  { category: "Website", name: "Restaurant", icon: "🍽️", prompt: "Build a restaurant website with hero image, menu page organized by category, online table reservation form, gallery, location map embed, opening hours, and contact page." },
  { category: "App", name: "SaaS Dashboard", icon: "📊", prompt: "Build a SaaS admin dashboard with sidebar navigation, analytics overview with charts, user management table with search and filters, settings page, and dark/light mode toggle. Use Supabase for auth and data." },
  { category: "App", name: "E-Commerce Store", icon: "🛍️", prompt: "Build an e-commerce store with product listing grid, product detail page, shopping cart with quantity controls, checkout form, order history page, and admin product management. Use Supabase." },
  { category: "App", name: "Task Manager", icon: "✅", prompt: "Build a task management app like Trello with drag-and-drop kanban board, task creation modal, due dates, priority labels, project folders, and team member assignment. Use Supabase." },
  { category: "App", name: "Social Platform", icon: "💬", prompt: "Build a social platform with user profiles, post feed with likes and comments, follow/unfollow system, notifications page, direct messaging, and image upload support. Use Supabase auth and storage." },
  { category: "App", name: "Event Booking", icon: "🎟️", prompt: "Build an event booking platform with event listings, event detail page, seat/ticket selection, booking confirmation, user booking history, and organizer dashboard. Use Supabase." },
  { category: "App", name: "Finance Tracker", icon: "💰", prompt: "Build a personal finance tracker with income/expense logging, category breakdown charts, monthly budget goals, transaction history with filters, CSV export, and summary dashboard. Use Supabase." },
  { category: "Mobile", name: "Meditation App", icon: "🧘", prompt: "Build a meditation mobile app with daily session timer, breathing exercise guide, streak tracker, calming background sounds selector, progress calendar, and mood log." },
  { category: "Mobile", name: "Habit Tracker", icon: "📅", prompt: "Build a habit tracker mobile app with daily habit checklist, streak counter, weekly progress charts, reminder notifications, habit categories, and achievement badges." },
  { category: "Nigerian", name: "Marketplace", icon: "🛒", prompt: "Build a Nigerian online marketplace with product listings in Naira, seller profiles, buyer-seller chat, Flutterwave payment integration, Lagos/Abuja delivery zones, and order tracking." },
  { category: "Nigerian", name: "Fintech App", icon: "🏦", prompt: "Build a Nigerian fintech dashboard with wallet balance in Naira, send/receive money flow, transaction history, bank account linking, airtime purchase, and Paystack payment integration." },
] as const;

// ─── EXPORT SUMMARY ──────────────────────────────────────────────────────────
// Everything this file exports, for easy reference:
//
// FUNCTIONS:
//   cleanFilePath(path)                          — strip ZIP prefix from one path
//   cleanFilePaths(files)                        — strip prefix from all files
//   getActuallyChangedFiles(old, new)            — diff old vs new
//   matchFileFromCode(code, paths, prompt)       — find which file AI edited
//   validateFilesForPush(files)                  — check before GitHub push
//   deriveVercelUrl(githubRepo)                  — get live URL
//   extractFilesFromScaffold(html)               — read files from scaffold
//   rebuildScaffold(html, updatedFiles)          — update scaffold
//   createProjectZip(name, files, options)       — create downloadable ZIP
//
// STRINGS (AI prompts):
//   BUILD_SYSTEM_PROMPT                          — for building from scratch
//   EDIT_SYSTEM_PROMPT                           — for editing existing code
//   WEB_TO_APP_PROMPT                            — for web → mobile conversion
//
// OBJECTS:
//   AUTO_BUILD_FEATURES                          — what gets built automatically
//   STACK                                        — full tech stack reference
//   FOLDER_STRUCTURE                             — folder layout reference

// ─── SUGGESTIONS & IMPROVEMENTS APPLIED ─────────────────────────────────────
// The following improvements were researched and applied to Mayobuild Studio:
//
// DONE ✅:
//   - TypeScript 6.0 strict mode (latest stable, Jun 2026)
//   - React 19 with use(), useActionState(), useOptimistic()
//   - Tailwind CSS v4 with @tailwindcss/vite plugin
//   - shadcn/ui components — matches Lovable AI output exactly
//   - Supabase auth, database, storage, realtime
//   - AI memory — loads last 20 edits from Supabase on page load
//   - Smart file matching — finds correct file by reading code content
//   - Change detection — blocks empty GitHub commits
//   - Push validation — catches bad paths and placeholders before push
//   - ZIP export — creates downloadable project like Lovable
//   - Auto-build features — nav, auth, profile, 404, dark mode, responsive
//   - Web to App conversion — React Native / Expo SDK 52
//   - Free AI chain — DeepSeek, Gemini, Groq, Mistral, OpenRouter:free
//   - Claude removed from chain (requires payment — no free tier)
//   - OpenRouter uses deepseek-chat-v3-0324:free (genuinely free)
//   - No timeout on AI calls — provider waits as long as needed
//   - ZIP path stripping — removes "lite-read-main/" prefix automatically
//   - Proactive AI — explains changes, notices nearby issues
//   - Build from scratch page — 3-step wizard with templates
//
// COMPLAINTS FIXED ✅:
//   - "0 files changed" on GitHub — fixed by change detector
//   - Wrong file pushed (scan.tsx instead of bible.tsx) — fixed by file matcher
//   - AI says "I need more files" — fixed by system prompt instruction
//   - Files land in wrong GitHub folder — fixed by path guardian
//   - Preview shows error — replaced WebContainer with live Vercel iframe
//   - Messages lost on page reload — fixed by loading from Supabase generations
//   - AI switches provider constantly — fixed by removing 15s timeout
//
// FUTURE IMPROVEMENTS (not yet built):
//   - Real-time collaborative editing (multiple users editing same project)
//   - AI-generated unit tests for every component
//   - One-click custom domain setup via Vercel API
//   - AI code review before push — "are you sure? this might break X"
//   - Git branch management — create feature branches from UI
//   - Visual diff viewer — show exactly what changed before pushing
//   - Project analytics — page views, errors, performance from Vercel API
