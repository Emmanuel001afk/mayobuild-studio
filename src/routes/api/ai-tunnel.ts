// Shared AI transport compatibility route.
// The actual AI tunnel backend is the standalone Supabase Edge Function.
// Keeping this route as a thin proxy preserves older callers while removing
// provider/local-model execution from the Central Hub web app.

import { createFileRoute } from "@tanstack/react-router";

const AI_TUNNEL_URL = "https://qnogfzwmdjggqtdrkzpv.supabase.co/functions/v1/ai-tunnel";

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/ai-tunnel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        if (!body) return jsonError("Invalid request", 400);

        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        const authorization = request.headers.get("authorization");
        if (authorization) headers.set("Authorization", authorization);

        try {
          const upstream = await fetch(AI_TUNNEL_URL, {
            method: "POST",
            headers,
            body,
          });

          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") ?? "application/json",
            },
          });
        } catch {
          return jsonError("AI tunnel backend is unavailable", 502);
        }
      },
    },
  },
});
