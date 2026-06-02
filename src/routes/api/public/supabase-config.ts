import { createFileRoute } from "@tanstack/react-router";
import { getPublicConfig } from "@/integrations/mysupabase/admin.server";

export const Route = createFileRoute("/api/public/supabase-config")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const cfg = getPublicConfig();
          return Response.json(cfg, {
            headers: { "Cache-Control": "public, max-age=300" },
          });
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
