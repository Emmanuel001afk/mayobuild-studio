import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return new Response("GROQ_API_KEY missing", { status: 500 });
        const fd = await request.formData();
        const file = fd.get("file");
        if (!(file instanceof File)) return new Response("file required", { status: 400 });

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
          const t = await res.text();
          return new Response(t, { status: res.status });
        }
        const j = await res.json();
        return Response.json({ text: (j as any).text ?? "" });
      },
    },
  },
});
