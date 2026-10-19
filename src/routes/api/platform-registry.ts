import { createFileRoute } from "@tanstack/react-router";
import { authorizeHubOwner, createPlatformToken, readJsonBody } from "@/lib/platform-registry.server";

function jsonError(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,127}$/;

export const Route = createFileRoute("/api/platform-registry")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorizeHubOwner(request);
        if (!auth.ok) return jsonError(auth.error, auth.status);
        const { data, error } = await auth.db
          .from("platform_registry")
          .select("platform_id,name,platform_type,package_name,version,api_version,capabilities,status,metadata,created_at,updated_at,last_seen_at")
          .order("name", { ascending: true });
        if (error) return jsonError("Could not read platform registry", 503);
        return Response.json({ ok: true, platforms: data ?? [] });
      },
      POST: async ({ request }) => {
        const auth = await authorizeHubOwner(request);
        if (!auth.ok) return jsonError(auth.error, auth.status);
        let body: any;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          return jsonError(error instanceof Error ? error.message : "Invalid request", 400);
        }

        if (body?.action !== "register") return jsonError("action must be 'register'", 400);
        const platformId = typeof body.platformId === "string" ? body.platformId.trim() : "";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!idPattern.test(platformId)) return jsonError("platformId must be a stable ID (2–128 letters, digits, dots, underscores, colons or hyphens)", 400);
        if (!name || name.length > 120) return jsonError("name is required and must be at most 120 characters", 400);

        const version = typeof body.version === "string" ? body.version.slice(0, 80) : null;
        const packageName = typeof body.packageName === "string" ? body.packageName.slice(0, 180) : null;
        const apiVersion = typeof body.apiVersion === "string" ? body.apiVersion.slice(0, 40) : "1";
        const type = ["android", "web", "service", "desktop", "other"].includes(body.platformType) ? body.platformType : "other";
        const capabilities = Array.isArray(body.capabilities)
          ? body.capabilities.filter((v: unknown): v is string => typeof v === "string").map((v: string) => v.trim()).filter(Boolean).slice(0, 100).map((v: string) => v.slice(0, 120))
          : [];
        const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {};

        const { error } = await auth.db.from("platform_registry").upsert({
          platform_id: platformId,
          name,
          platform_type: type,
          package_name: packageName,
          version,
          api_version: apiVersion,
          capabilities,
          status: "registered",
          metadata,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "platform_id" });
        if (error) return jsonError("Could not save platform registration", 503);

        let platformToken: string | undefined;
        if (body.issueKey === true) {
          const generated = createPlatformToken();
          const { error: revokeError } = await auth.db
            .from("platform_registry_keys")
            .update({ revoked: true })
            .eq("platform_id", platformId)
            .eq("revoked", false);
          if (revokeError) return jsonError("Platform was registered, but existing keys could not be rotated", 503);
          const { error: keyError } = await auth.db.from("platform_registry_keys").insert({
            platform_id: platformId,
            token_hash: generated.hash,
            token_prefix: generated.prefix,
          });
          if (keyError) return jsonError("Platform was registered, but a new token could not be issued", 503);
          platformToken = generated.token;
        }

        return Response.json({
          ok: true,
          platformId,
          registered: true,
          ...(platformToken ? { platformToken, tokenNotice: "Copy this token now. It cannot be retrieved later." } : {}),
        });
      },
    },
  },
});
