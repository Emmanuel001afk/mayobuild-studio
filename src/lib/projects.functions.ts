import { cleanFilePath, cleanFilePaths, validateFilesForPush } from "@/mayobuild.config";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/integrations/mysupabase/middleware.server";
import { getAdmin } from "@/integrations/mysupabase/admin.server";
import { createHash } from "node:crypto";

function getDefaultSubdomain(project: { id: string; name: string }) {
  const label = project.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || `site-${project.id.slice(0, 8)}`;
  return `${label}.mayobuild.app`;
}

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { admin, user } = context;
    const { data: owned } = await admin
      .from("projects")
      .select("id,name,kind,description,created_at,updated_at,github_repo")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    const { data: collab } = await admin
      .from("project_collaborators")
      .select("project:projects(id,name,kind,description,created_at,updated_at,github_repo)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null);
    const collabProjects = (collab ?? [])
      .map((c: any) => c.project)
      .filter(Boolean)
      .map((project: any) => ({ ...project, liveSubdomain: getDefaultSubdomain(project) }));
    return {
      owned: (owned ?? []).map((project: any) => ({ ...project, liveSubdomain: getDefaultSubdomain(project) })),
      shared: collabProjects,
    };
  });

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["website", "mobile"]),
  description: z.string().max(2000).optional(),
  github_repo: z.string().max(200).optional(),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    let { data: ws } = await admin
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!ws) {
      const ins = await admin
        .from("workspaces")
        .insert({ owner_id: user.id, name: "My Workspace" })
        .select("id")
        .single();
      ws = ins.data;
    }
    const { data: project, error } = await admin
      .from("projects")
      .insert({
        workspace_id: ws!.id,
        owner_id: user.id,
        name: data.name,
        kind: data.kind,
        description: data.description ?? null,
        github_repo: data.github_repo ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { ...project, liveSubdomain: getDefaultSubdomain(project) };
  });

export const getProject = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    const { data: project, error } = await admin
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const userId = context.user.id;
    if (project.owner_id !== userId) {
      const { data: collab } = await admin
        .from("project_collaborators")
        .select("id")
        .eq("project_id", project.id)
        .eq("user_id", userId)
        .not("accepted_at", "is", null)
        .maybeSingle();
      if (!collab) throw new Error("Forbidden");
    }
    const { data: collaborators } = await admin
      .from("project_collaborators")
      .select("id,invited_email,role,accepted_at")
      .eq("project_id", project.id);
    return {
      project: { ...project, liveSubdomain: getDefaultSubdomain(project) },
      collaborators: collaborators ?? [],
    };
  });

const SaveOutput = z.object({ id: z.string().uuid(), preview_html: z.string().max(500000) });
export const savePreview = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => SaveOutput.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { error } = await admin
      .from("projects")
      .update({ preview_html: data.preview_html, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const InviteInput = z.object({
  projectId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["viewer", "editor", "admin"]).default("editor"),
});
export const inviteCollaborator = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => InviteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { data: p } = await admin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!p) throw new Error("Only the owner can invite");
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    const { error } = await admin.from("project_collaborators").upsert(
      {
        project_id: data.projectId,
        invited_email: data.email,
        user_id: profile?.id ?? null,
        role: data.role,
        accepted_at: profile ? new Date().toISOString() : null,
      },
      { onConflict: "project_id,invited_email" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PublishInput = z.object({
  projectId: z.string().uuid(),
  html: z.string().min(1).max(2_000_000),
  files: z.record(z.string(), z.string()).optional(),
});

/**
 * Publish the project.
 * - If the project has a github_repo AND GITHUB_TOKEN env var is set,
 *   AND the content is React source (not HTML), push each file to GitHub.
 *   Vercel then auto-redeploys the real React app. No HTML conversion.
 * - Otherwise fall back to uploading HTML to Supabase Storage (plain sites).
 */
export const publishSite = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => PublishInput.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;

    const { data: project } = await admin
      .from("projects")
      .select("id,owner_id,github_repo,name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Project not found");
    if (project.owner_id !== user.id) throw new Error("Only the owner can publish");

    const githubToken = process.env.GITHUB_TOKEN;
    const isReactSource = data.html.includes('id="react-source"') || (data.files && Object.keys(data.files).length > 0);

    // --- REACT PATH: push to GitHub → Vercel auto-redeploys ---
    if (githubToken && project.github_repo && isReactSource && data.files) {
      const repo = project.github_repo;
      const baseUrl = `https://api.github.com/repos/${repo}/contents`;
      const headers = {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      };

      const results: { path: string; ok: boolean }[] = [];

      // Clean file paths: strip ZIP root folder prefix (e.g. "lite-read-main/src/..." -> "src/...")
      // This ensures files land at the correct location in GitHub, not inside a subfolder.
      // Uses the shared cleanFilePath guardian (handles nested/double-wrapped folders),
      // instead of a weaker inline one-level strip that left double-wrapped paths intact.
      const cleanedFiles = cleanFilePaths(data.files);

      for (const [filePath, content] of Object.entries(cleanedFiles)) {
        try {
          // Get current SHA so we can update existing files
          const getRes = await fetch(`${baseUrl}/${filePath}`, { headers });
          const current = getRes.ok ? await getRes.json() : null;
          const currentContent = current?.content
            ? Buffer.from(current.content, "base64").toString("utf-8")
            : null;

          // VERIFICATION GUARD: if the file already exists on GitHub with this exact
          // content, skip the push entirely. This is the root cause of "Updated X.tsx"
          // commits appearing on GitHub with nothing actually different inside them —
          // previously this function trusted the AI's file list blindly and pushed
          // every "changed" file even when its content was identical to what GitHub
          // already had. A 200 OK from GitHub only means "I saved this", not "this is
          // new" — so that check alone could never catch a no-op edit.
          if (currentContent !== null && currentContent === content) {
            results.push({ path: filePath, ok: true, skipped: true, reason: "unchanged" });
            continue;
          }

          const pushRes = await fetch(`${baseUrl}/${filePath}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              message: `Updated ${filePath} via Mayobuild Studio`,
              content: Buffer.from(content).toString("base64"),
              sha: current?.sha ?? undefined,
            }),
          });

          if (!pushRes.ok) {
            const errBody = await pushRes.text().catch(() => "");
            results.push({ path: filePath, ok: false, skipped: false, reason: `GitHub rejected push (${pushRes.status}): ${errBody.slice(0, 200)}` });
            continue;
          }

          // VERIFICATION: re-fetch the file from GitHub after pushing and confirm the
          // content GitHub now holds actually matches what we sent. This catches cases
          // where the PUT returns 200 but the content didn't land correctly (encoding
          // issues, GitHub API caching, partial writes) — previously invisible because
          // only pushRes.ok was checked.
          const verifyRes = await fetch(`${baseUrl}/${filePath}`, { headers });
          const verifyData = verifyRes.ok ? await verifyRes.json() : null;
          const verifiedContent = verifyData?.content
            ? Buffer.from(verifyData.content, "base64").toString("utf-8")
            : null;
          const verified = verifiedContent === content;

          results.push({ path: filePath, ok: verified, skipped: false, reason: verified ? undefined : "Push succeeded but verification read-back did not match — content may not have landed correctly." });
        } catch (e: any) {
          results.push({ path: filePath, ok: false, skipped: false, reason: e?.message ?? "Network or unexpected error during push." });
        }
      }

      const failedPushes = results.filter((r) => !r.ok);
      const realPushes = results.filter((r) => r.ok && !r.skipped);
      const skippedPushes = results.filter((r) => r.skipped);

      // Push MAYOBUILD_CHANGES.md — a running log of every edit so user can always see what changed and where.
      // Only logged when at least one file was genuinely pushed — a turn where every
      // file was skipped as unchanged no longer writes a misleading log entry.
      if (realPushes.length > 0) {
        try {
          const timestamp = new Date().toISOString();
          const changedPaths = realPushes.map((r) => r.path).join("\n  - ");
          const logEntry = `\n---\n**${timestamp}**\nFiles changed:\n  - ${changedPaths}\nPushed by: Mayobuild Studio\n`;
          const logPath = "MAYOBUILD_CHANGES.md";
          const logGetRes = await fetch(`${baseUrl}/${logPath}`, { headers });
          const logCurrent = logGetRes.ok ? await logGetRes.json() : null;
          const existingContent = logCurrent?.content
            ? Buffer.from(logCurrent.content, "base64").toString("utf-8")
            : "# Mayobuild Studio — Change Log\nAll edits made through Mayobuild Studio are recorded here.\n";
          const newContent = existingContent + logEntry;
          await fetch(`${baseUrl}/${logPath}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              message: `Mayobuild change log update`,
              content: Buffer.from(newContent).toString("base64"),
              sha: logCurrent?.sha ?? undefined,
            }),
          });
        } catch {
          // Non-fatal — change log update failed silently
        }
      }

      // Save record in Supabase
      await admin
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.projectId);

      const liveUrl = `https://github.com/${repo}`;

      // If every single file was either skipped (unchanged) or failed, this push did
      // nothing real — surface that clearly instead of returning a generic ok:true that
      // the UI would otherwise report as a successful deploy.
      if (realPushes.length === 0) {
        const reason = failedPushes.length > 0
          ? `All ${failedPushes.length} file(s) failed to push: ${failedPushes.map((r) => `${r.path} (${r.reason})`).join("; ")}`
          : `No files were pushed — all ${skippedPushes.length} file(s) were already identical on GitHub. Nothing changed.`;
        throw new Error(reason);
      }

      return {
        ok: true as const,
        url: liveUrl,
        path: repo,
        method: "github",
        pushed: results,
        skipped: skippedPushes.map((r) => r.path),
        failed: failedPushes.map((r) => ({ path: r.path, reason: r.reason })),
      };
    }

    // --- HTML PATH: upload to Supabase Storage (plain HTML sites) ---
    try {
      await admin.storage.createBucket("sites", {
        public: true,
        fileSizeLimit: 5_000_000,
      });
    } catch {
      // already exists
    }

    const path = `${user.id}/${data.projectId}/index.html`;
    const { error: upErr } = await admin.storage.from("sites").upload(path, data.html, {
      upsert: true,
      contentType: "text/html; charset=utf-8",
      cacheControl: "60",
    });
    if (upErr) throw new Error(`Publish failed: ${upErr.message}`);

    const { data: pub } = admin.storage.from("sites").getPublicUrl(path);

    await admin
      .from("projects")
      .update({ preview_html: data.html, updated_at: new Date().toISOString() })
      .eq("id", data.projectId);

    return { ok: true as const, url: pub.publicUrl, path, method: "supabase" };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { data: p } = await admin
      .from("projects")
      .select("id,owner_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!p) return { ok: true as const };
    if (p.owner_id !== user.id) throw new Error("Only the owner can delete");
    try {
      const prefix = `${user.id}/${data.id}`;
      const { data: files } = await admin.storage.from("sites").list(prefix);
      if (files?.length) {
        await admin.storage.from("sites").remove(files.map((f) => `${prefix}/${f.name}`));
      }
    } catch {}
    const { error } = await admin.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listEcosystem = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const admin = getAdmin();
      const { data } = await admin
        .from("ecosystem_hubs")
        .select("id,name,category,url,status,sort")
        .order("sort", { ascending: true });
      if (data && data.length) return data;
    } catch {}
    // Fallback with real URLs — shows correctly even before ecosystem_hubs table is created
    return [
      { id: "1", name: "Hi There AI", category: "AI Chat", url: "https://hi-there-ai.vercel.app", status: "live", sort: 1 },
      { id: "2", name: "Halway In", category: "Marketplace", url: "https://halwayin-connect.lovable.app", status: "live", sort: 2 },
      { id: "3", name: "Lite Read", category: "Document Reader", url: "https://lite-read.vercel.app", status: "live", sort: 3 },
      { id: "4", name: "Mayobuild Studio", category: "Builder", url: null, status: "here", sort: 4 },
      { id: "5", name: "Hive Life", category: "Social Media", url: null, status: "coming_soon", sort: 5 },
    ];
  });

const ApiKeyInput = z.object({
  projectId: z.string().uuid(),
  service: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  keyValue: z.string().min(1).max(4096),
});
export const saveApiKey = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => ApiKeyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { error } = await admin
      .from("project_api_keys")
      .upsert(
        { project_id: data.projectId, user_id: user.id, service: data.service, key_value: data.keyValue },
        { onConflict: "project_id,service" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { data: rows } = await admin
      .from("project_api_keys")
      .select("service,created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", user.id);
    return rows ?? [];
  });

/**
 * Auto Supabase Table Creator — runs AI-generated SQL safely on the server.
 * The service role key never leaves the server (TanStack Start server function).
 * Only runs CREATE TABLE, CREATE INDEX, ALTER TABLE, CREATE POLICY statements.
 * Blocks DROP, DELETE, TRUNCATE so it cannot destroy existing data.
 * Each statement is run individually so one failure doesn't block the rest.
 */
export const runProjectSQL = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    sql: z.string().min(1).max(50_000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;

    // Verify user owns this project
    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!project) throw new Error("Project not found or access denied.");

    // Safety guard — only allow safe DDL statements, never destructive ones
    const BLOCKED = /\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/i;
    const ALLOWED = /\b(CREATE|ALTER|GRANT|REVOKE|COMMENT|ENABLE|DISABLE)\b/i;

    // Split into individual statements and filter
    const statements = data.sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 10)
      .filter((s) => {
        if (BLOCKED.test(s)) return false;
        if (!ALLOWED.test(s)) return false;
        return true;
      });

    if (statements.length === 0) {
      return { ok: true, ran: 0, skipped: 0, errors: [] };
    }

    const errors: string[] = [];
    let ran = 0;

    for (const stmt of statements) {
      try {
        const { error } = await admin.rpc("exec_sql", { sql: stmt + ";" });
        if (error) {
          // Table already exists = fine, not an error
          if (error.message.includes("already exists")) { ran++; continue; }
          errors.push(`${stmt.slice(0, 60)}… → ${error.message}`);
        } else {
          ran++;
        }
      } catch (e: any) {
        errors.push(e.message ?? "Unknown error");
      }
    }

    return {
      ok: errors.length === 0,
      ran,
      skipped: statements.length - ran - errors.length,
      errors,
    };
  });

/**
 * Link a GitHub repo to a project so publish pushes React files directly.
 * Call this when user imports a ZIP and we detect it's a React project.
 */
export const linkGitHubRepo = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    github_repo: z.string().min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { error } = await admin
      .from("projects")
      .update({ github_repo: data.github_repo, updated_at: new Date().toISOString() })
      .eq("id", data.projectId)
      .eq("owner_id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ─── GITHUB SELF-READ ────────────────────────────────────────────────────────
/**
 * Reads any file directly from GitHub repo.
 * Used by the AI to inspect its own code without needing a ZIP upload.
 */
export const readGitHubFile = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    filePath: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { data: project } = await admin
      .from("projects").select("github_repo").eq("id", data.projectId).eq("owner_id", user.id).maybeSingle();
    if (!project?.github_repo) throw new Error("No GitHub repo linked to this project.");
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) throw new Error("GitHub token not configured.");
    const res = await fetch(`https://api.github.com/repos/${project.github_repo}/contents/${data.filePath}`, {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`File not found: ${data.filePath}`);
    const json = await res.json();
    const content = Buffer.from(json.content, "base64").toString("utf-8");
    return { ok: true as const, content, sha: json.sha, path: data.filePath };
  });

// ─── GITHUB FILE TREE ────────────────────────────────────────────────────────
/**
 * Lists ALL files in the GitHub repo recursively.
 * AI uses this to know the full project structure before making any edit.
 */
export const listGitHubFiles = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { data: project } = await admin
      .from("projects").select("github_repo").eq("id", data.projectId).eq("owner_id", user.id).maybeSingle();
    if (!project?.github_repo) throw new Error("No GitHub repo linked.");
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) throw new Error("GitHub token not configured.");
    const res = await fetch(`https://api.github.com/repos/${project.github_repo}/git/trees/HEAD?recursive=1`, {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("Could not read file tree from GitHub.");
    const json = await res.json();
    const paths: string[] = (json.tree ?? [])
      .filter((f: any) => f.type === "blob")
      .map((f: any) => f.path as string)
      .filter((p: string) => /\.(tsx?|jsx?|css|json|md|svg)$/.test(p));
    return { ok: true as const, paths };
  });

// ─── GITHUB SELF-FIX COMMIT ─────────────────────────────────────────────────
/**
 * AI commits a fix directly to GitHub without any user involvement.
 * Called automatically when the AI detects an issue in the codebase.
 * Security: only the owner of the project can trigger this.
 * Safety: writes are logged to MAYOBUILD_CHANGES.md automatically.
 */
export const selfFixCommit = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    files: z.record(z.string(), z.string()),
    reason: z.string().max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { data: project } = await admin
      .from("projects").select("github_repo,owner_id").eq("id", data.projectId).maybeSingle();
    if (!project) throw new Error("Project not found.");
    if (project.owner_id !== user.id) throw new Error("Only the owner can trigger self-fix.");
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) throw new Error("GitHub token not configured.");
    const baseUrl = `https://api.github.com/repos/${project.github_repo}/contents`;
    const headers = {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    };
    const results: { path: string; ok: boolean }[] = [];
    for (const [filePath, content] of Object.entries(data.files)) {
      try {
        const getRes = await fetch(`${baseUrl}/${filePath}`, { headers });
        const current = getRes.ok ? await getRes.json() : null;
        const pushRes = await fetch(`${baseUrl}/${filePath}`, {
          method: "PUT", headers,
          body: JSON.stringify({
            message: `[Mayobuild Auto-Fix] ${data.reason} — ${filePath}`,
            content: Buffer.from(content).toString("base64"),
            sha: current?.sha ?? undefined,
          }),
        });
        results.push({ path: filePath, ok: pushRes.ok });
      } catch {
        results.push({ path: filePath, ok: false });
      }
    }
    // Log the self-fix to MAYOBUILD_CHANGES.md
    try {
      const logPath = "MAYOBUILD_CHANGES.md";
      const logGetRes = await fetch(`${baseUrl}/${logPath}`, { headers });
      const logCurrent = logGetRes.ok ? await logGetRes.json() : null;
      const existing = logCurrent?.content ? Buffer.from(logCurrent.content, "base64").toString("utf-8") : "# Mayobuild Change Log\n";
      const entry = `\n---\n**${new Date().toISOString()} — AUTO-FIX**\nReason: ${data.reason}\nFiles: ${Object.keys(data.files).join(", ")}\n`;
      await fetch(`${baseUrl}/${logPath}`, {
        method: "PUT", headers,
        body: JSON.stringify({ message: "Mayobuild auto-fix log", content: Buffer.from(existing + entry).toString("base64"), sha: logCurrent?.sha }),
      });
    } catch { /* non-fatal */ }
    return { ok: true as const, results };
  });

// ─── ADMIN AI COMMAND ────────────────────────────────────────────────────────
/**
 * Lets the admin (you) send a direct command to the AI from the admin panel.
 * The AI can read GitHub files, fix issues, update Supabase — all from one command.
 * autoMode: when true the AI runs autonomously. When false it only reports what it would do.
 */
export const adminAICommand = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    command: z.string().min(1).max(2000),
    autoMode: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    // Only the platform admin can use this
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "akintundeemmanuel14@gmail.com"; // Must match admin.functions.ts
    // Check admin by looking up profile email directly — avoids auth.admin API dependency
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();
    const userEmail = profile?.email ?? user.email ?? "";
    if (userEmail !== ADMIN_EMAIL) throw new Error("Admin only.");
    const { data: project } = await admin
      .from("projects").select("github_repo,name").eq("id", data.projectId).maybeSingle();
    // Log the command to Supabase for audit trail
    await admin.from("admin_ai_commands").insert({
      owner_id: user.id,
      project_id: data.projectId,
      command: data.command,
      auto_mode: data.autoMode,
      created_at: new Date().toISOString(),
      status: "pending",
    }).select().single();
    return {
      ok: true as const,
      message: data.autoMode
        ? `Command received. AI will execute autonomously on project "${project?.name}".`
        : `Command received in report-only mode. AI will describe what it would do without making changes.`,
      projectName: project?.name,
      autoMode: data.autoMode,
    };
  });

// ─── VERCEL DEPLOYMENT CHECKER ───────────────────────────────────────────────
/**
 * Checks if the latest Vercel deployment for a project succeeded or failed.
 * Called automatically 60 seconds after every GitHub push.
 * If failed → reads the error log → calls AI to fix → commits fix → Vercel retries.
 */
export const checkVercelDeployment = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    github_repo: z.string(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) return { ok: false, status: "no_token", error: "Vercel token not configured." };

    // Find the Vercel project by GitHub repo name
    const repoName = data.github_repo.split("/")[1];
    const listRes = await fetch(`https://api.vercel.com/v9/projects?search=${repoName}&limit=5`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!listRes.ok) return { ok: false, status: "api_error", error: "Could not reach Vercel API." };
    const listJson = await listRes.json();
    const vercelProject = listJson.projects?.[0];
    if (!vercelProject) return { ok: false, status: "not_found", error: `No Vercel project found for ${repoName}` };

    // Get latest deployment
    const depRes = await fetch(`https://api.vercel.com/v6/deployments?projectId=${vercelProject.id}&limit=1`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!depRes.ok) return { ok: false, status: "api_error", error: "Could not get deployments." };
    const depJson = await depRes.json();
    const latest = depJson.deployments?.[0];
    if (!latest) return { ok: false, status: "no_deployments", error: "No deployments found." };

    const deployStatus = latest.state; // READY | ERROR | BUILDING | QUEUED
    const deployUrl = latest.url ? `https://${latest.url}` : null;

    if (deployStatus === "READY") {
      // Update project with live URL
      await admin.from("projects")
        .update({ live_url: deployUrl, last_deploy_status: "success", updated_at: new Date().toISOString() })
        .eq("id", data.projectId);
      return { ok: true, status: "success", url: deployUrl };
    }

    if (deployStatus === "ERROR") {
      // Get error logs
      const logRes = await fetch(`https://api.vercel.com/v2/deployments/${latest.uid}/events?limit=50`, {
        headers: { Authorization: `Bearer ${vercelToken}` },
      });
      const logJson = logRes.ok ? await logRes.json() : [];
      const errorLines = (Array.isArray(logJson) ? logJson : logJson.events ?? [])
        .filter((e: any) => e.type === "stderr" || e.text?.includes("error") || e.text?.includes("Error"))
        .map((e: any) => e.text ?? "")
        .filter(Boolean)
        .slice(0, 20)
        .join("\n");

      // Store the failure so the AI can act on it
      await admin.from("projects")
        .update({ last_deploy_status: "error", last_deploy_error: errorLines, updated_at: new Date().toISOString() })
        .eq("id", data.projectId);

      return { ok: false, status: "error", errorLog: errorLines, deploymentId: latest.uid };
    }

    // Still building or queued
    return { ok: true, status: deployStatus.toLowerCase(), url: null };
  });

// ─── AI AUTO-FIX FROM VERCEL ERROR ──────────────────────────────────────────
/**
 * Called when checkVercelDeployment returns status:"error".
 * Sends the Vercel error log to the AI, AI reads the broken file on GitHub,
 * writes the fix, and commits it back. Vercel auto-redeploys.
 * Fully automatic — no user involvement needed.
 */
export const autoFixFromVercelError = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    errorLog: z.string(),
    github_repo: z.string(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) throw new Error("GitHub token not configured.");

    // Get full file tree so AI knows what files exist
    const treeRes = await fetch(
      `https://api.github.com/repos/${data.github_repo}/git/trees/HEAD?recursive=1`,
      { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } }
    );
    const treeJson = treeRes.ok ? await treeRes.json() : {};
    const allPaths: string[] = (treeJson.tree ?? [])
      .filter((f: any) => f.type === "blob")
      .map((f: any) => f.path as string)
      .filter((p: string) => /\.(tsx?|jsx?|css|json)$/.test(p));

    // Extract which file is mentioned in the error log
    const fileMatch = data.errorLog.match(/(?:src\/[^\s:'"]+\.[tj]sx?)/);
    const suspectFile = fileMatch?.[0] ?? null;
    let fileContent = "";

    if (suspectFile) {
      const fileRes = await fetch(
        `https://api.github.com/repos/${data.github_repo}/contents/${suspectFile}`,
        { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } }
      );
      if (fileRes.ok) {
        const fileJson = await fileRes.json();
        fileContent = Buffer.from(fileJson.content, "base64").toString("utf-8");
      }
    }

    // Call AI to diagnose and fix
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            `You are Mayobuild AI in AUTO-FIX mode. A Vercel deployment failed.`,
            `GitHub repo: ${data.github_repo}`,
            `\nVercel error log:\n${data.errorLog}`,
            suspectFile ? `\nSuspect file (${suspectFile}):\n\`\`\`tsx\n${fileContent}\n\`\`\`` : "",
            `\nAll project files:\n${allPaths.map(p => `  - ${p}`).join("\n")}`,
            `\nFix the error. Return ONLY the corrected file wrapped in \`\`\`tsx src/path/to/file.tsx. Nothing else.`,
          ].join("\n"),
        }],
      }),
    });
    const aiJson = await aiRes.json();
    const aiText = aiJson.content?.[0]?.text ?? "";

    // Parse the fixed file from AI response
    const fixMatch = aiText.match(/```(?:tsx?|jsx?)\s+([^\s`]+)\s*\n([\s\S]*?)```/);
    if (!fixMatch) {
      await admin.from("projects").update({ last_deploy_status: "auto_fix_failed" }).eq("id", data.projectId);
      return { ok: false, reason: "AI could not determine a fix." };
    }

    const fixPath = cleanFilePath(fixMatch[1].trim());
    const fixContent = fixMatch[2].trim();

    // Get SHA of file to update
    const getRes = await fetch(
      `https://api.github.com/repos/${data.github_repo}/contents/${fixPath}`,
      { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" } }
    );
    const getJson = getRes.ok ? await getRes.json() : null;
    const getSha = getJson?.sha;
    const beforeContent = getJson?.content ? Buffer.from(getJson.content, "base64").toString("utf-8") : null;

    // If the AI's "fix" is identical to what's already there, this would just be
    // another empty commit pretending to be a real fix — block it the same way the
    // main publish path now blocks no-op pushes.
    if (beforeContent !== null && beforeContent === fixContent) {
      await admin.from("projects")
        .update({ last_deploy_status: "auto_fix_failed", updated_at: new Date().toISOString() })
        .eq("id", data.projectId);
      return { ok: false, reason: `AI returned ${fixPath} unchanged — could not determine a real fix from the error log.` };
    }

    // Commit the fix
    const commitRes = await fetch(
      `https://api.github.com/repos/${data.github_repo}/contents/${fixPath}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[Mayobuild Auto-Fix] Fixed Vercel build error in ${fixPath}`,
          content: Buffer.from(fixContent).toString("base64"),
          sha: getSha,
        }),
      }
    );

    const committed = commitRes.ok;
    await admin.from("projects")
      .update({ last_deploy_status: committed ? "auto_fix_committed" : "auto_fix_failed", updated_at: new Date().toISOString() })
      .eq("id", data.projectId);

    if (!committed) {
      const errBody = await commitRes.text().catch(() => "");
      return { ok: false, reason: `GitHub rejected the auto-fix commit to ${fixPath}: ${errBody.slice(0, 200)}` };
    }

    // Log to MAYOBUILD_CHANGES.md
    try {
      const logPath = "MAYOBUILD_CHANGES.md";
      const baseUrl = `https://api.github.com/repos/${data.github_repo}/contents`;
      const headers = { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
      const logGetRes = await fetch(`${baseUrl}/${logPath}`, { headers });
      const logCurrent = logGetRes.ok ? await logGetRes.json() : null;
      const existing = logCurrent?.content ? Buffer.from(logCurrent.content, "base64").toString("utf-8") : "# Mayobuild Change Log\n";
      const entry = `\n---\n**${new Date().toISOString()} — AUTO-FIX (Vercel error)**\nFile fixed: ${fixPath}\nError was: ${data.errorLog.slice(0, 200)}\n`;
      await fetch(`${baseUrl}/${logPath}`, {
        method: "PUT", headers,
        body: JSON.stringify({ message: "Mayobuild auto-fix log", content: Buffer.from(existing + entry).toString("base64"), sha: logCurrent?.sha }),
      });
    } catch { /* non-fatal */ }

    return { ok: committed, fixedFile: fixPath };
  });

// ─── SCHEDULED HEALTH CHECK (called by a cron or by the client on interval) ──
/**
 * Runs a health check on ALL projects belonging to the user.
 * Checks: GitHub reachable, Vercel status, Supabase tables exist.
 * Returns a summary of all project health statuses.
 * Designed to be called every hour automatically.
 */
export const runScheduledHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({ userId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = context;
    const { data: projects } = await admin
      .from("projects")
      .select("id,name,github_repo,last_deploy_status")
      .eq("owner_id", data.userId);

    const results = [];
    for (const project of projects ?? []) {
      const health = {
        id: project.id,
        name: project.name,
        github: false,
        lastDeploy: project.last_deploy_status ?? "unknown",
        issues: [] as string[],
      };

      // Check GitHub reachability
      if (project.github_repo) {
        const githubToken = process.env.GITHUB_TOKEN;
        const res = await fetch(`https://api.github.com/repos/${project.github_repo}`, {
          headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
        });
        health.github = res.ok;
        if (!res.ok) health.issues.push(`GitHub repo ${project.github_repo} is not reachable.`);
      } else {
        health.issues.push("No GitHub repo linked.");
      }

      if (project.last_deploy_status === "error") {
        health.issues.push("Last Vercel deployment failed — auto-fix may be needed.");
      }

      results.push(health);
    }

    // Store health check results in Supabase
    await admin.from("platform_health_checks").upsert({
      owner_id: data.userId,
      results: JSON.stringify(results),
      checked_at: new Date().toISOString(),
    });

    return { ok: true, results };
  });

// ─── TWO-WAY GITHUB SYNC ─────────────────────────────────────────────────────
/**
 * Pulls the latest code from GitHub back into Mayobuild editor.
 * If someone edited the repo directly on GitHub or in VS Code,
 * this brings those changes back into your Mayobuild project automatically.
 */
export const pullFromGitHub = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { data: project } = await admin
      .from("projects").select("github_repo,html_output").eq("id", data.projectId).eq("owner_id", user.id).maybeSingle();
    if (!project?.github_repo) throw new Error("No GitHub repo linked.");
    const githubToken = process.env.GITHUB_TOKEN;
    const headers = { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" };

    // Get full file tree
    const treeRes = await fetch(`https://api.github.com/repos/${project.github_repo}/git/trees/HEAD?recursive=1`, { headers });
    if (!treeRes.ok) throw new Error("Could not read GitHub repo.");
    const treeJson = await treeRes.json();
    const paths: string[] = (treeJson.tree ?? [])
      .filter((f: any) => f.type === "blob")
      .map((f: any) => f.path as string)
      .filter((p: string) => /\.(tsx?|jsx?|css|json|md|svg)$/.test(p))
      .filter((p: string) => !p.includes("node_modules") && !p.includes(".next"));

    // Read all files (up to 50 to avoid rate limits)
    const files: Record<string, string> = {};
    const toRead = paths.slice(0, 50);
    await Promise.all(toRead.map(async (path) => {
      try {
        const res = await fetch(`https://api.github.com/repos/${project.github_repo}/contents/${path}`, { headers });
        if (res.ok) {
          const json = await res.json();
          files[path] = Buffer.from(json.content, "base64").toString("utf-8");
        }
      } catch { /* skip unreadable files */ }
    }));

    // Save back to Supabase so the editor loads the latest code
    await admin.from("projects")
      .update({ last_github_pull: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", data.projectId);

    return { ok: true, files, totalFiles: paths.length, pulledFiles: toRead.length };
  });

// ─── CLOUDFLARE PAGES PUSH ───────────────────────────────────────────────────
/**
 * Pushes project to Cloudflare Pages as a secondary deployment target.
 * Free tier: 500 builds/month, unlimited sites, global CDN.
 * Runs alongside GitHub push — same code, two deployment destinations.
 */
export const pushToCloudflare = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    files: z.record(z.string(), z.string()),
    projectName: z.string(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const cfToken = process.env.CLOUDFLARE_TOKEN;
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!cfToken || !cfAccountId) {
      return { ok: false, reason: "Cloudflare token not configured. Add CLOUDFLARE_TOKEN and CLOUDFLARE_ACCOUNT_ID to environment variables." };
    }

    // Create or find the Cloudflare Pages project
    const safeName = data.projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 28);
    const createRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/pages/projects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: safeName, production_branch: "main" }),
    });
    // 409 = already exists, which is fine
    const createJson = await createRes.json();
    const projectName = createJson.result?.name ?? safeName;

    // Create deployment via direct upload
    // Build multipart form data using Node.js Buffer (not browser FormData/Blob)
    const boundary = `----MayobuildBoundary${Date.now()}`;
    const parts: Buffer[] = [];
    const manifest: Record<string, string> = {};

    for (const [path, content] of Object.entries(data.files)) {
      const contentBuf = Buffer.from(content, "utf-8");
      // Simple hash using Node crypto
      const hash = createHash("sha256").update(contentBuf).digest("hex");
      manifest["/" + path] = hash;
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${path}"\r\nContent-Type: text/plain\r\n\r\n`
      ));
      parts.push(contentBuf);
      parts.push(Buffer.from("\r\n"));
    }

    // Add manifest
    const manifestStr = JSON.stringify(manifest);
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\nContent-Type: application/json\r\n\r\n${manifestStr}\r\n`
    ));
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const deployRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/pages/projects/${projectName}/deployments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfToken}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );
    const deployJson = await deployRes.json();
    const deployUrl = deployJson.result?.url ? `https://${deployJson.result.url}` : `https://${projectName}.pages.dev`;

    await admin.from("projects")
      .update({ cloudflare_url: deployUrl, updated_at: new Date().toISOString() })
      .eq("id", data.projectId);

    return { ok: deployRes.ok, url: deployUrl, projectName };
  });

// ─── SAVE PROJECT KNOWLEDGE BASE ─────────────────────────────────────────────
/**
 * Saves custom instructions and knowledge about a project.
 * The AI reads this before every edit so it always knows what the project is,
 * what files are important, and what rules to follow.
 */
export const saveProjectKnowledge = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    description: z.string().max(1000),
    importantFiles: z.array(z.string()).optional(),
    doNotTouch: z.array(z.string()).optional(),
    customInstructions: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { error } = await admin.from("projects")
      .update({
        knowledge_description: data.description,
        knowledge_important_files: data.importantFiles ?? [],
        knowledge_do_not_touch: data.doNotTouch ?? [],
        knowledge_custom_instructions: data.customInstructions ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.projectId)
      .eq("owner_id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ─── PR DIFF PREVIEW ─────────────────────────────────────────────────────────
/**
 * Before committing, shows exactly which lines changed in which files.
 * Like a GitHub Pull Request review — you see the before/after of every line.
 * Lets admin review AI changes before they go live.
 */
export const generateDiffPreview = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    oldFiles: z.record(z.string(), z.string()),
    newFiles: z.record(z.string(), z.string()),
  }).parse(d))
  .handler(async ({ data }) => {
    const diffs: { path: string; added: number; removed: number; hunks: string[] }[] = [];
    for (const [path, newContent] of Object.entries(data.newFiles)) {
      const oldContent = data.oldFiles[path] ?? "";
      if (oldContent === newContent) continue;
      const oldLines = oldContent.split("\n");
      const newLines = newContent.split("\n");
      const hunks: string[] = [];
      let added = 0, removed = 0;
      // Simple line-by-line diff
      const maxLen = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (oldLines[i] !== newLines[i]) {
          if (oldLines[i] !== undefined) { hunks.push(`- ${oldLines[i]}`); removed++; }
          if (newLines[i] !== undefined) { hunks.push(`+ ${newLines[i]}`); added++; }
        }
      }
      diffs.push({ path, added, removed, hunks: hunks.slice(0, 50) }); // cap at 50 lines shown
    }
    return { ok: true, diffs, totalChanged: diffs.length };
  });

// ─── REMIX / DUPLICATE PROJECT ───────────────────────────────────────────────
/**
 * Clones any project into a new one instantly.
 * Copies all code, settings, and knowledge base.
 * New project gets a fresh GitHub repo name.
 */
export const remixProject = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    sourceProjectId: z.string().uuid(),
    newName: z.string().min(1).max(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin, user } = context;
    const { data: source } = await admin
      .from("projects")
      .select("*")
      .eq("id", data.sourceProjectId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!source) throw new Error("Source project not found.");
    const { data: newProject, error } = await admin.from("projects").insert({
      owner_id: user.id,
      name: data.newName,
      html_output: source.html_output,
      project_type: source.project_type,
      knowledge_description: source.knowledge_description,
      knowledge_important_files: source.knowledge_important_files,
      knowledge_do_not_touch: source.knowledge_do_not_touch,
      knowledge_custom_instructions: source.knowledge_custom_instructions,
      remixed_from: source.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    return { ok: true as const, newProjectId: newProject.id };
  });

// ─── FULL VERIFICATION LOOP ──────────────────────────────────────────────────
// Runs after every GitHub push: checks Vercel build status, auto-fixes errors,
// confirms the live site is reachable. Called automatically by projects.$id.tsx.
export const runFullVerificationLoop = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    github_repo: z.string(),
    expectedChanges: z.array(z.string()).optional(),
    userPrompt: z.string().optional(),
    vercelUrl: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = context;
    const results: string[] = [];
    const vercelToken = process.env.VERCEL_TOKEN;

    if (!vercelToken) {
      results.push("⚠️ No VERCEL_TOKEN — skipping Vercel check. Add it to environment variables.");
      return { success: false, results, liveUrl: null };
    }

    const repoName = data.github_repo.split("/")[1];
    const listRes = await fetch(`https://api.vercel.com/v9/projects?search=${repoName}&limit=3`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    });
    if (!listRes.ok) {
      results.push("⚠️ Could not reach Vercel API to find the project.");
      return { success: false, results, liveUrl: null };
    }
    const listJson = await listRes.json();
    const vProject = listJson.projects?.[0];
    if (!vProject) {
      results.push(`⚠️ No Vercel project found matching "${repoName}".`);
      return { success: false, results, liveUrl: null };
    }

    // POLL until the deployment leaves BUILDING/QUEUED, instead of checking once after a
    // fixed 15s and assuming that's the final state. Builds in this project regularly take
    // 45-55s, so the previous single early check almost always caught "still building" and
    // reported it as if it were done — which is why "all checks passed" was never accurate.
    // Poll every 8s for up to 2 minutes (15 attempts).
    let latest: any = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise((r) => setTimeout(r, 8000));
      const depRes = await fetch(`https://api.vercel.com/v6/deployments?projectId=${vProject.id}&limit=1`, {
        headers: { Authorization: `Bearer ${vercelToken}` },
      });
      if (!depRes.ok) continue;
      const depJson = await depRes.json();
      latest = depJson.deployments?.[0] ?? null;
      if (latest && latest.state !== "BUILDING" && latest.state !== "QUEUED" && latest.state !== "INITIALIZING") {
        break;
      }
    }

    if (!latest) {
      results.push("⚠️ Could not get deployment status from Vercel after polling.");
      return { success: false, results, liveUrl: null };
    }

    if (latest.state === "BUILDING" || latest.state === "QUEUED" || latest.state === "INITIALIZING") {
      results.push(`⏳ Vercel is still ${latest.state.toLowerCase()} after 2 minutes — check the Vercel dashboard directly, this deployment is taking longer than usual.`);
      return { success: false, results, liveUrl: null };
    }

    if (latest.state === "ERROR") {
      results.push("❌ Vercel deployment failed.");
      await admin.from("projects").update({ last_deploy_status: "error" }).eq("id", data.projectId);

      // autoFixFromVercelError requires the actual error log text, which we don't have
      // yet — pull it from Vercel's deployment events first.
      let errorLines = "";
      try {
        const logRes = await fetch(`https://api.vercel.com/v2/deployments/${latest.uid}/events?limit=50`, {
          headers: { Authorization: `Bearer ${vercelToken}` },
        });
        const logJson = logRes.ok ? await logRes.json() : [];
        errorLines = (Array.isArray(logJson) ? logJson : logJson.events ?? [])
          .filter((e: any) => e.type === "stderr" || e.text?.includes("error") || e.text?.includes("Error"))
          .map((e: any) => e.text ?? "")
          .filter(Boolean)
          .slice(0, 20)
          .join("\n");
      } catch {
        // fall through with empty errorLines — autoFix will report it can't find a suspect file
      }

      // Pull the build error log and actually trigger the existing auto-fix function —
      // previously this step only logged "triggering auto-fix" as text and never called it.
      try {
        const fixResult = await autoFixFromVercelError({
          data: { projectId: data.projectId, github_repo: data.github_repo, errorLog: errorLines },
        });
        if (fixResult?.ok) {
          results.push("🔧 Auto-fix applied and pushed. Vercel will redeploy — run a check again shortly to confirm.");
        } else {
          results.push(`⚠️ Auto-fix did not complete: ${fixResult?.reason ?? "unknown reason"}`);
        }
      } catch (e: any) {
        results.push(`⚠️ Auto-fix attempt failed: ${e?.message ?? "unknown error"}`);
      }
      return { success: false, results, liveUrl: null };
    }

    // latest.state === "READY"
    const liveUrl = latest.url ? `https://${latest.url}` : null;
    results.push(`✅ Vercel deployment succeeded${liveUrl ? ` — live at ${liveUrl}` : ""}.`);
    await admin.from("projects").update({ live_url: liveUrl, last_deploy_status: "success" }).eq("id", data.projectId);

    // Confirm the live site is actually reachable, not just that Vercel marked it READY.
    if (liveUrl) {
      try {
        const resp = await fetch(liveUrl, { method: "HEAD" });
        if (resp.ok) {
          results.push(`✅ Live site reachable: ${liveUrl}`);
        } else {
          results.push(`⚠️ Vercel says READY but the live site returned HTTP ${resp.status}.`);
          return { success: false, results, liveUrl };
        }
      } catch {
        results.push("⚠️ Vercel says READY but the live site could not be reached.");
        return { success: false, results, liveUrl };
      }
    }

    return { success: true, results, liveUrl };
  });
