import { createFileRoute } from "@tanstack/react-router";
import { authorizeHubOwner, authorizePlatform, readJsonBody } from "@/lib/platform-registry.server";

function jsonError(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

const severities = ["info", "warning", "error", "critical"];

export const Route = createFileRoute("/api/platform-diagnostics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorizeHubOwner(request);
        if (!auth.ok) return jsonError(auth.error, auth.status);
        const url = new URL(request.url);
        const platformId = url.searchParams.get("platformId");
        const requestedLimit = Number(url.searchParams.get("limit") || 50);
        const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.floor(requestedLimit))) : 50;
        let query = auth.db
          .from("platform_diagnostic_events")
          .select("id,platform_id,event_type,severity,summary,app_version,device_id,details,created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (platformId) query = query.eq("platform_id", platformId);
        const { data, error } = await query;
        if (error) return jsonError("Could not read diagnostic records", 503);
        return Response.json({ ok: true, events: data ?? [] });
      },
      POST: async ({ request }) => {
        const auth = await authorizePlatform(request);
        if (!auth.ok) return jsonError(auth.error, auth.status);
        let body: any;
        try {
          body = await readJsonBody(request, 32_768);
        } catch (error) {
          return jsonError(error instanceof Error ? error.message : "Invalid request", 400);
        }

        const eventType = typeof body?.eventType === "string" ? body.eventType.trim().slice(0, 80) : "";
        const summary = typeof body?.summary === "string" ? body.summary.trim().slice(0, 500) : "";
        const severity = severities.includes(body?.severity) ? body.severity : "info";
        if (!eventType || !summary) return jsonError("eventType and summary are required", 400);

        const details = body.details && typeof body.details === "object" && !Array.isArray(body.details) ? body.details : {};
        const appVersion = typeof body.appVersion === "string" ? body.appVersion.slice(0, 80) : null;
        const deviceId = typeof body.deviceId === "string" ? body.deviceId.slice(0, 128) : null;
        const now = new Date().toISOString();

        const { data: platform, error: platformError } = await auth.db
          .from("platform_registry")
          .select("platform_id")
          .eq("platform_id", auth.platformId)
          .maybeSingle();
        if (platformError) return jsonError("Could not verify registered platform", 503);
        if (!platform) return jsonError("Platform registration no longer exists", 404);

        const { data, error } = await auth.db.from("platform_diagnostic_events").insert({
          platform_id: auth.platformId,
          event_type: eventType,
          severity,
          summary,
          app_version: appVersion,
          device_id: deviceId,
          details,
        }).select("id,platform_id,event_type,severity,summary,app_version,device_id,details,created_at").single();
        if (error || !data) return jsonError("Could not save diagnostic record", 503);

        await auth.db.from("platform_registry").update({
          status: severity === "critical" || severity === "error" ? "attention" : "active",
          ...(appVersion ? { version: appVersion } : {}),
          last_seen_at: now,
          updated_at: now,
        }).eq("platform_id", auth.platformId);

        return Response.json({ ok: true, event: data }, { status: 201 });
      },
    },
  },
});
