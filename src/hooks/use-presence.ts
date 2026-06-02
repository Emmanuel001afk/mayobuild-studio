import { useEffect, useState } from "react";
import { getSupabase } from "@/integrations/mysupabase/client";

/** Tracks the number of unique viewers currently on a given project via Supabase Realtime presence. */
export function useProjectPresence(projectId: string | null, me: { id: string; email?: string } | null) {
  const [viewers, setViewers] = useState(1);

  useEffect(() => {
    if (!projectId || !me) return;
    let channel: any;
    let cancelled = false;
    (async () => {
      const sb = await getSupabase();
      if (cancelled) return;
      channel = sb.channel(`project:${projectId}`, {
        config: { presence: { key: me.id } },
      });
      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          setViewers(Math.max(1, Object.keys(state).length));
        })
        .subscribe(async (status: string) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ email: me.email ?? "anon", at: Date.now() });
          }
        });
    })();
    return () => {
      cancelled = true;
      if (channel) channel.unsubscribe();
    };
  }, [projectId, me?.id]);

  return viewers;
}
