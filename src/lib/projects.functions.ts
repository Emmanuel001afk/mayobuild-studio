import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/integrations/mysupabase/middleware.server";
import { getAdmin } from "@/integrations/mysupabase/admin.server";

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
      // This ensures files land at the correct location in GitHub, not inside a subfolder
      const cleanedFiles: Record<string, string> = {};
      for (const [rawPath, fileContent] of Object.entries(data.files)) {
        const cleanPath = (rawPath.includes("/") && !rawPath.startsWith("src/") && !rawPath.startsWith("public/") && !rawPath.startsWith("."))
          ? rawPath.split("/").slice(1).join("/")
          : rawPath;
        cleanedFiles[cleanPath] = fileContent;
      }

      for (const [filePath, content] of Object.entries(cleanedFiles)) {
        try {
          // Get current SHA so we can update existing files
          const getRes = await fetch(`${baseUrl}/${filePath}`, { headers });
          const current = getRes.ok ? await getRes.json() : null;

          const pushRes = await fetch(`${baseUrl}/${filePath}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              message: `Updated ${filePath} via Mayobuild Studio`,
              content: Buffer.from(content).toString("base64"),
              sha: current?.sha ?? undefined,
            }),
          });
          results.push({ path: filePath, ok: pushRes.ok });
        } catch {
          results.push({ path: filePath, ok: false });
        }
      }

      // Save record in Supabase
      await admin
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.projectId);

      const liveUrl = `https://github.com/${repo}`;
      return {
        ok: true as const,
        url: liveUrl,
        path: repo,
        method: "github",
        pushed: results,
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
    return [
      { id: "1", name: "Hi There AI", category: "AI Chat", url: null, status: "coming_soon", sort: 1 },
      { id: "2", name: "Halway In", category: "Marketplace", url: null, status: "coming_soon", sort: 2 },
      { id: "3", name: "Lite Read", category: "Document Reader", url: null, status: "coming_soon", sort: 3 },
      { id: "4", name: "Mayobuild Studio", category: "Builder", url: null, status: "here", sort: 4 },
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
