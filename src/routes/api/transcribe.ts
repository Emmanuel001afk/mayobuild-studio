import { createFileRoute } from "@tanstack/react-router";
import { getUserFromToken } from "@/integrations/mysupabase/admin.server";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // AuthN: require a valid Supabase user access token.
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7)
          : null;
        const user = await getUserFromToken(token).catch(() => null);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          console.error("[transcribe] GROQ_API_KEY missing");
          return new Response("Transcription unavailable", { status: 503 });
        }
        const fd = await request.formData();
        const file = fd.get("file");
        if (!(file instanceof File)) return new Response("file required", { status: 400 });

        // Size cap (25 MB) to prevent quota abuse via oversized uploads.
        if (file.size > 25 * 1024 * 1024) {
          return new Response("file too large", { status: 413 });
        }

        const upstream = new FormData();
        upstream.append("file", file);
        upstream.append("model", "whisper-large-v3-turbo");
        upstream.append("response_format", "json");

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error(`[transcribe] upstream ${res.status}`, t.slice(0, 400));
          return new Response("Transcription failed", { status: 502 });
        }
        const j = await res.json();
        return Response.json({ text: (j as any).text ?? "" });
      },
    },
  },
});
