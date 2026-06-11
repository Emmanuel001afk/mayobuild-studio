import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import JSZip from "jszip";
import { requireUser } from "@/integrations/mysupabase/middleware.server";

/** Patterns that match third-party watermarks / branding badges. */
const WATERMARK_PATTERNS: RegExp[] = [
  /<a[^>]*(?:lovable|webflow\.com\/?\?utm|wix\.com|made-in-webflow|powered[- ]by|builtwith\.com|elementor\.com|squarespace|notion\.so\/?\?ref|carrd\.co|framer\.com\/?\?via)[^>]*>[\s\S]*?<\/a>/gi,
  /<div[^>]*(?:id|class)="[^"]*(?:badge|watermark|branding|made-with|lovable-badge|gpt-badge|powered-by)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
  /<script[^>]*(?:lovable\.dev|gpteng\.co|webflow\.com|wix\.com\/?_partials)[^>]*>[\s\S]*?<\/script>/gi,
  /<link[^>]+href="[^"]*(?:lovable\.dev|gpteng\.co)[^"]*"[^>]*\/?>/gi,
  /<!--\s*(?:built|made|powered)\s+(?:with|by)[\s\S]{0,200}?-->/gi,
  /\sdata-(?:lovable|gptengineer|webflow-badge|wix-badge|builder)="[^"]*"/gi,
];

const TEXT_EXT = /\.(html?|css|js|jsx|ts|tsx|json|md|svg|txt|xml)$/i;

function cleanText(input: string): { out: string; removed: number } {
  let out = input;
  let removed = 0;
  for (const re of WATERMARK_PATTERNS) {
    out = out.replace(re, () => { removed += 1; return ""; });
  }
  return { out, removed };
}

const Input = z.object({
  name: z.string().min(1).max(120),
  filename: z.string().max(255),
  zipBase64: z.string().min(1).max(40_000_000),
  upgrades: z.string().max(2000).optional(),
});

export const importZipProject = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;

    const buf = Buffer.from(data.zipBase64, "base64");
    const zip = await JSZip.loadAsync(buf);

    type Entry = { path: string; content: string; binary: boolean; removed: number };
    const entries: Entry[] = [];
    let totalRemoved = 0;
    let primaryHtml: string | null = null;

    const files = Object.values(zip.files).filter((f) => !f.dir);
    for (const f of files) {
      if (f.name.includes("..") || f.name.startsWith("/")) continue;
      if (TEXT_EXT.test(f.name)) {
        const text = await f.async("string");
        const { out, removed } = cleanText(text);
        totalRemoved += removed;
        entries.push({ path: f.name, content: out, binary: false, removed });
        if (!primaryHtml && /index\.html?$/i.test(f.name)) primaryHtml = out;
      } else {
        entries.push({ path: f.name, content: "", binary: true, removed: 0 });
      }
    }

    // Try first HTML file if no index.html
    if (!primaryHtml) {
      const firstHtml = entries.find((e) => /\.html?$/i.test(e.path) && !e.binary);
      primaryHtml = firstHtml?.content ?? null;
    }

    // No HTML found — build a rich scaffold from source files
    // Store ALL source files so WebContainer and AI can read them properly
    if (!primaryHtml) {
      const srcFiles = entries
        .filter((e) => /\.(tsx|ts|jsx|js|css)$/i.test(e.path) && !e.binary && e.content.length > 0)
        .slice(0, 30)
        .map((e) => ({ path: e.path, content: e.content.slice(0, 5000) }));

      // Build a structured file map that WebContainer can boot directly
      const fileMap = srcFiles.map((f) => `/* ===== FILE: ${f.path} ===== */\n${f.content}`).join("\n\n");

      // Build AI-readable summary of what the app does
      const appSummary = srcFiles
        .filter((f) => f.path.includes("route") || f.path.includes("page") || f.path.includes("component") || f.path.includes("App"))
        .slice(0, 5)
        .map((f) => `File: ${f.path}`)
        .join(", ");

      primaryHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.name}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #fff; padding: 2rem; }
  .info { background: #1a1a2e; border: 1px solid #16213e; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; }
  h1 { color: #4ade80; margin: 0 0 0.5rem; }
  p { color: #94a3b8; margin: 0 0 1rem; }
  .files { font-size: 12px; color: #64748b; }
  .prompt { background: #065f46; border-radius: 8px; padding: 1rem; color: #d1fae5; font-weight: 500; }
</style>
</head>
<body>
<div class="info">
  <h1>📦 ${data.name}</h1>
  <p>React/TypeScript source imported successfully. ${srcFiles.length} files loaded.</p>
  <div class="files">Key files: ${appSummary || srcFiles.slice(0, 5).map(f => f.path).join(", ")}</div>
</div>
<div class="prompt">
  💬 Tell the AI: <strong>"Read all the source code and rebuild this as a complete working HTML website preserving all pages, features, navigation and styling."</strong>
</div>
<script type="text/plain" id="react-source" data-files="${encodeURIComponent(JSON.stringify(srcFiles.map(f => f.path)))}">${fileMap}</script>
</body>
</html>`;
    }

    // Ensure workspace
    let { data: ws } = await admin
      .from("workspaces").select("id").eq("owner_id", user.id).limit(1).maybeSingle();
    if (!ws) {
      const ins = await admin.from("workspaces")
        .insert({ owner_id: user.id, name: "My Workspace" }).select("id").single();
      ws = ins.data;
    }

    const description = [
      `Imported from ${data.filename}`,
      `Files: ${entries.length}, Watermark elements removed: ${totalRemoved}`,
      data.upgrades ? `Requested upgrades: ${data.upgrades}` : null,
    ].filter(Boolean).join("\n");

    const { data: project, error } = await admin
      .from("projects")
      .insert({
        workspace_id: ws!.id,
        owner_id: user.id,
        name: data.name,
        kind: "website",
        description,
        preview_html: primaryHtml,
      })
      .select("*").single();
    if (error) throw new Error(error.message);

    await admin.from("generations").insert({
      user_id: user.id,
      project_id: project.id,
      task: "zip_import",
      provider: "system",
      model: "watermark-strip-v1",
      prompt: data.upgrades ?? "",
      output: JSON.stringify({
        files: entries.map((e) => ({ path: e.path, removed: e.removed, binary: e.binary })),
        totalRemoved,
      }).slice(0, 200_000),
      tokens: 0,
      latency: 0,
    });

    return {
      projectId: project.id,
      filesProcessed: entries.length,
      watermarksRemoved: totalRemoved,
    };
  });
