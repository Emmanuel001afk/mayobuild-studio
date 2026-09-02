// src/routes/api/hub.ts
// The central hub endpoint — this is what your OTHER websites call to reach
// AEM AI, the shared brain living in this project.
//
// Auth: Authorization: Bearer <AM_ key> — a key is required HERE only because
// the caller is an outside site. Talking to the model from inside this app
// (the /aem workspace) needs no key at all; it uses your login instead.

import { createFileRoute } from "@tanstack/react-router";
import { hashHubKey } from "@/lib/hub-keys.server";
import { getAdmin } from "@/integrations/mysupabase/admin.server";
import { answerWithAem } from "@/lib/aem-brain.server";

function unauthorized(msg = "Unauthorized") {
  return new Response(msg, { status: 401 });
}

export const Route = createFileRoute("/api/hub")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const providedKey = authHeader?.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7)
          : null;
        if (!providedKey) return unauthorized("Missing API key");

        const db = getAdmin();
        const providedHash = hashHubKey(providedKey);
        const { data: keyRow } = await db
          .from("hub_api_keys")
          .select("id, scope, rate_limit_per_hour, revoked")
          .eq("key_hash", providedHash)
          .maybeSingle();

        if (!keyRow || keyRow.revoked) return unauthorized("Invalid or revoked key");

        if (keyRow.scope === "restricted") {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { count } = await db
            .from("hub_api_usage")
            .select("id", { count: "exact", head: true })
            .eq("key_id", keyRow.id)
            .gte("called_at", oneHourAgo);

          if ((count ?? 0) >= keyRow.rate_limit_per_hour) {
            return new Response("Rate limit exceeded for this key", { status: 429 });
          }
        }

        db.from("hub_api_usage").insert({ key_id: keyRow.id }).then(() => {});
        db.from("hub_api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", keyRow.id)
          .then(() => {});

        const body = await request.json().catch(() => null);
        const prompt = body?.message as string | undefined;
        if (!prompt || typeof prompt !== "string") {
          return new Response("message is required", { status: 400 });
        }

        const result = await answerWithAem({
          prompt,
          deviceId: body?.deviceId as string | undefined,
          allowManagementTools: keyRow.scope === "owner",
        });

        if (result.error) {
          return Response.json({ category: result.category, error: result.error }, { status: 502 });
        }
        return Response.json(result);
      },
    },
  },
});
