import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/integrations/mysupabase/middleware.server";

async function assertAdmin(admin: any, email: string | undefined | null) {
  if (!email) throw new Error("Forbidden: administrator only");
  const { data, error } = await admin
    .from("admin_users")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: administrator only");
}

export const getPlatformRecords = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await assertAdmin(context.admin, context.user.email);
    const [platformsResult, eventsResult] = await Promise.all([
      context.admin.from("platform_registry")
        .select("platform_id,name,platform_type,package_name,version,api_version,capabilities,status,metadata,created_at,updated_at,last_seen_at")
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(200),
      context.admin.from("platform_diagnostic_events")
        .select("id,platform_id,event_type,severity,summary,app_version,device_id,details,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (platformsResult.error || eventsResult.error) {
      throw new Error("Platform records are not available yet. Apply db/platform-registry.sql to the Central Hub database, then refresh.");
    }
    return { platforms: platformsResult.data ?? [], events: eventsResult.data ?? [] };
  });
