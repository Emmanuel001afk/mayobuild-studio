// Shared AI transport for native apps.
// No user-facing API key is required. Each app installation registers once and
// receives an opaque session token; the Central Hub remains the only AI gateway.

import { createFileRoute } from "@tanstack/react-router";
import { randomBytes, createHash } from "node:crypto";
import { getAdmin } from "@/integrations/mysupabase/admin.server";
import { answerWithAem } from "@/lib/aem-brain.server";

const MAX_MESSAGE = 20000;
const MAX_REQUESTS_PER_HOUR = 120;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/ai-tunnel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return jsonError("Invalid request", 400);

        const action = typeof body.action === "string" ? body.action : "ask";
        const appId = typeof body.appId === "string" ? body.appId.trim() : "";
        const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";

        if (!appId || !deviceId) return jsonError("appId and deviceId are required", 400);
        if (appId.length > 160 || deviceId.length > 200) return jsonError("Invalid app or device identifier", 400);

        const db = getAdmin();

        if (action === "register") {
          const token = randomBytes(32).toString("base64url");
          const tokenHash = hashToken(token);
          const label = typeof body.deviceLabel === "string"
            ? body.deviceLabel.trim().slice(0, 120)
            : null;

          const { data: existing } = await db
            .from("ai_tunnel_devices")
            .select("id, revoked")
            .eq("app_id", appId)
            .eq("device_id", deviceId)
            .maybeSingle();

          if (existing?.revoked) return jsonError("AI tunnel device is revoked", 403);

          const { error } = existing
            ? await db.from("ai_tunnel_devices")
                .update({
                  token_hash: tokenHash,
                  device_label: label,
                  last_seen_at: new Date().toISOString(),
                })
                .eq("id", existing.id)
            : await db.from("ai_tunnel_devices").insert({
                app_id: appId,
                device_id: deviceId,
                device_label: label,
                token_hash: tokenHash,
              });

          if (error) return jsonError("Could not register AI tunnel device", 500);

          return Response.json({ ok: true, token });
        }

        if (action !== "ask") return jsonError("Unknown tunnel action", 400);

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ")
          ? auth.slice(7).trim()
          : "";
        if (!token) return jsonError("AI tunnel session is missing", 401);

        const { data: device } = await db
          .from("ai_tunnel_devices")
          .select("id, app_id, device_id, revoked, request_count, window_started_at, window_count")
          .eq("app_id", appId)
          .eq("device_id", deviceId)
          .eq("token_hash", hashToken(token))
          .maybeSingle();

        if (!device || device.revoked) return jsonError("AI tunnel session is invalid", 401);

        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) return jsonError("message is required", 400);
        if (message.length > MAX_MESSAGE) return jsonError("message is too large", 413);

        const nowDate = new Date();
        const windowStarted = new Date(device.window_started_at ?? nowDate.toISOString());
        const sameWindow = nowDate.getTime() - windowStarted.getTime() < 60 * 60 * 1000;
        const windowCount = sameWindow ? (device.window_count ?? 0) : 0;
        if (windowCount >= MAX_REQUESTS_PER_HOUR) {
          return jsonError("AI tunnel rate limit exceeded", 429);
        }

        const now = nowDate.toISOString();
        await db.from("ai_tunnel_devices").update({
          last_seen_at: now,
          request_count: (device.request_count ?? 0) + 1,
          window_started_at: sameWindow ? windowStarted.toISOString() : now,
          window_count: windowCount + 1,
        }).eq("id", device.id);

        const result = await answerWithAem({
          prompt: message,
          deviceId,
          allowManagementTools: false,
        });

        if (result.error) {
          return Response.json({
            ok: false,
            category: result.category,
            error: result.error,
          }, { status: 502 });
        }

        return Response.json({
          ok: true,
          category: result.category,
          answer: result.answer ?? "",
          source: result.source,
          ragApplied: result.ragApplied ?? false,
        });
      },
    },
  },
});
