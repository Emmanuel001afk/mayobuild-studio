import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/integrations/mysupabase/middleware.server";

const PROVIDERS = [
  { name: "openai", env: "OPENAI_API_KEY" },
  { name: "deepseek", env: "DEEPSEEK_API_KEY" },
  { name: "groq", env: "GROQ_API_KEY" },
  { name: "gemini", env: "GEMINI_API_KEY" },
  { name: "openrouter", env: "OPENROUTER_API_KEY" },
  { name: "mistral", env: "MISTRAL_API_KEY" },
  { name: "cerebras", env: "CEREBRAS_API_KEY" },
  { name: "huggingface", env: "HUGGINGFACE_API_KEY" },
] as const;

/** Reports which provider keys are configured + per-provider success/fail counts from generation logs. */
export const getProviderHealth = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { admin } = context;
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: rows } = await admin
      .from("generations")
      .select("provider,ok,latency_ms")
      .gte("created_at", since)
      .limit(2000);
    const stats = new Map<string, { ok: number; fail: number; lat: number; n: number }>();
    for (const r of rows ?? []) {
      const s = stats.get(r.provider) ?? { ok: 0, fail: 0, lat: 0, n: 0 };
      r.ok ? s.ok++ : s.fail++;
      if (r.latency_ms) { s.lat += r.latency_ms; s.n++; }
      stats.set(r.provider, s);
    }
    return {
      providers: PROVIDERS.map((p) => {
        const s = stats.get(p.name);
        const configured = Boolean(process.env[p.env]);
        const total = (s?.ok ?? 0) + (s?.fail ?? 0);
        return {
          name: p.name,
          configured,
          ok: s?.ok ?? 0,
          fail: s?.fail ?? 0,
          successRate: total ? Math.round((100 * (s?.ok ?? 0)) / total) : null,
          avgLatencyMs: s && s.n ? Math.round(s.lat / s.n) : null,
        };
      }),
    };
  });

/** Recent failover logs for the dashboard panel. */
export const getRecentLogs = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { admin, user } = context;
    const { data } = await admin
      .from("generations")
      .select("id,task,provider,model,ok,latency_ms,error,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    return { logs: data ?? [] };
  });
