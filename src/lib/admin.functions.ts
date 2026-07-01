import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/integrations/mysupabase/middleware.server";

function getAllowedAdminEmail(): string | null {
  const v = process.env.ADMIN_EMAIL;
  return v ? v.toLowerCase() : null;
}

function assertAdmin(email: string | undefined | null) {
  const allowed = getAllowedAdminEmail();
  if (!allowed || !email || email.toLowerCase() !== allowed) {
    throw new Error("Forbidden: admin only");
  }
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const allowed = getAllowedAdminEmail();
    const email = context.user.email?.toLowerCase() ?? null;
    return { isAdmin: !!allowed && !!email && email === allowed };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { admin, user } = context;
    assertAdmin(user.email);

    const [{ data: projects }, { data: gens }, { data: profiles }, { data: builds }] =
      await Promise.all([
        admin.from("projects")
          .select("id,name,kind,owner_id,created_at,updated_at")
          .order("updated_at", { ascending: false }).limit(200),
        admin.from("generations")
          .select("id,task,provider,model,tokens,latency,created_at,user_id")
          .order("created_at", { ascending: false }).limit(200),
        admin.from("profiles").select("id,email,created_at")
          .order("created_at", { ascending: false }).limit(500),
        admin.from("mobile_builds")
          .select("id,project_id,zip_url,created_at")
          .order("created_at", { ascending: false }).limit(100),
      ]);

    // Simple ad/revenue projection: $0.0008 per token across all generations.
    const totalTokens = (gens ?? []).reduce((s, g: any) => s + (g.tokens || 0), 0);
    const estRevenue = +(totalTokens * 0.0008).toFixed(2);

    return {
      counts: {
        users: profiles?.length ?? 0,
        projects: projects?.length ?? 0,
        generations: gens?.length ?? 0,
        mobileBuilds: builds?.length ?? 0,
      },
      revenue: { totalTokens, estRevenueUsd: estRevenue },
      projects: projects ?? [],
      generations: gens ?? [],
      profiles: profiles ?? [],
      builds: builds ?? [],
    };
  });
