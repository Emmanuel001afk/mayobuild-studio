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
    // Owned
    const { data: owned } = await admin
      .from("projects")
      .select("id,name,kind,description,created_at,updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    // Collaborated
    const { data: collab } = await admin
      .from("project_collaborators")
      .select("project:projects(id,name,kind,description,created_at,updated_at)")
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
    // Access check
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
    // Verify ownership
    const { data: p } = await admin
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!p) throw new Error("Only the owner can invite");
    // Look up if user exists
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
