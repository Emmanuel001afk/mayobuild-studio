import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import JSZip from "jszip";
import { requireUser } from "@/integrations/mysupabase/middleware.server";

/** Patterns that match third-party watermarks / branding badges. */
const WATERMARK_PATTERNS: RegExp[] = [
  // Inline badges
  /<a[^>]*(?:lovable|webflow\.com\/?\?utm|wix\.com|made-in-webflow|powered[- ]by|builtwith\.com|elementor\.com|squarespace|notion\.so\/?\?ref|carrd\.co|framer\.com\/?\?via)[^>]*>[\s\S]*?<\/a>/gi,
  /<div[^>]*(?:id|class)="[^"]*(?:badge|watermark|branding|made-with|lovable-badge|gpt-badge|powered-by)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
  /<script[^>]*(?:lovable\.dev|gpteng\.co|webflow\.com|wix\.com\/?_partials)[^>]*>[\s\S]*?<\/script>/gi,
  /<link[^>]+href="[^"]*(?:lovable\.dev|gpteng\.co)[^"]*"[^>]*\/?>/gi,
  // Common attribution comments
  /<!--\s*(?:built|made|powered)\s+(?:with|by)[\s\S]{0,200}?-->/gi,
  // data attributes that mark editor watermarks
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
  // base64 of the .zip
  zipBase64: z.string().min(1).max(40_000_000),
  upgrades: z.string().max(2000).optional(),
});

export const importZipProject = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;

    // Decode + load zip safely
    const buf = Buffer.from(data.zipBase64, "base64");
    const zip = await JSZip.loadAsync(buf);

    type Entry = { path: string; content: string; binary: boolean; removed: number };
    const entries: Entry[] = [];
    let totalRemoved = 0;
    let primaryHtml: string | null = null;

    const files = Object.values(zip.files).filter((f) => !f.dir);
    for (const f of files) {
      // Zip-slip / traversal guard
      if (f.name.includes("..") || f.name.startsWith("/")) continue;
      if (TEXT_EXT.test(f.name)) {
        const text = await f.async("string");
        const { out, removed } = cleanText(text);
        totalRemoved += removed;
        entries.push({ path: f.name, content: out, binary: false, removed });
        if (!primaryHtml && /index\.html?$/i.test(f.name)) primaryHtml = out;
      } else {
        // Skip binary contents in preview but keep a manifest entry
        entries.push({ path: f.name, content: "", binary: true, removed: 0 });
      }
    }
    if (!primaryHtml) {
      const firstHtml = entries.find((e) => /\.html?$/i.test(e.path) && !e.binary);
      primaryHtml = firstHtml?.content ?? null;
    }

    // If still no HTML found, build scaffold from React/TS source files
    if (!primaryHtml) {
      const srcFiles = entries
        .filter((e) => /\.(tsx|ts|jsx|js|css)$/i.test(e.path) && !e.binary && e.content.length > 0)
        .slice(0, 30)
        .map((e) => `\n/* ===== FILE: ${e.path} ===== */\n${e.content.slice(0, 5000)}`)
        .join("\n");
      primaryHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.name}</title>
</head>
<body>
<h1 style="font-family:sans-serif">${data.name}</h1>
<p style="font-family:sans-serif">Type: <b>"Rebuild this as a complete working HTML website with all pages, features and styles."</b></p>
<script type="text/plain" id="react-source">${srcFiles}</script>
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

    // Store cleaned manifest in generations table as an audit trail
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
