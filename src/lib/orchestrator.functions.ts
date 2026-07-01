import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/integrations/mysupabase/middleware.server";
import type { Provider } from "./router/providers/types";

/**
 * ORCHESTRATOR BRAIN
 * ------------------
 * A lightweight self-learning ranker. It reads recent rows from `generations`
 * and computes a per-provider, per-task score based on real success rate and
 * latency. The router uses this score to reorder its provider chain on every
 * call, so the platform learns which AI is best for what — without hard-coded
 * instructions. Failed providers naturally sink; fast/reliable ones rise.
 *
 * This is intentionally simple: no external ML deps, no background jobs, and
 * safe under RLS (we read via the admin client inside a server function that
 * only exposes an aggregated ranking).
 */

type Stat = { ok: number; fail: number; latencySum: number; latencyN: number };

const LOOKBACK = 200; // recent generations per task

async function loadStats(admin: any, task: string): Promise<Map<string, Stat>> {
  const { data } = await admin
    .from("generations")
    .select("provider,ok,latency_ms")
    .eq("task", task)
    .order("created_at", { ascending: false })
    .limit(LOOKBACK);
  const stats = new Map<string, Stat>();
  for (const r of (data ?? []) as Array<{ provider: string; ok: boolean; latency_ms: number | null }>) {
    if (!r.provider || r.provider === "none") continue;
    const s = stats.get(r.provider) ?? { ok: 0, fail: 0, latencySum: 0, latencyN: 0 };
    if (r.ok) s.ok += 1; else s.fail += 1;
    if (typeof r.latency_ms === "number") { s.latencySum += r.latency_ms; s.latencyN += 1; }
    stats.set(r.provider, s);
  }
  return stats;
}

function scoreOf(s: Stat | undefined): number {
  if (!s) return 0.5; // unknown → neutral, keep static order
  const total = s.ok + s.fail;
  if (total === 0) return 0.5;
  const successRate = s.ok / total;
  const avgLatency = s.latencyN ? s.latencySum / s.latencyN : 8000;
  // Latency bonus: <2s => +0.2, >20s => -0.2
  const latencyScore = Math.max(-0.2, Math.min(0.2, (10000 - avgLatency) / 40000));
  return successRate + latencyScore;
}

/** Build a ranker function that reorders a provider chain by learned score. */
export async function buildRanker(admin: any, task: string): Promise<(chain: Provider[]) => Provider[]> {
  const stats = await loadStats(admin, task);
  return (chain: Provider[]) => {
    const scored = chain.map((p, i) => ({ p, i, s: scoreOf(stats.get(p.name)) }));
    // Stable-ish sort: higher score first, break ties by original chain order.
    scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));
    return scored.map((x) => x.p);
  };
}

/** Public read: the Orchestrator's current ranking + confidence per task. */
export const getOrchestratorInsights = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { admin } = context;
    const tasks = ["complex_app", "mobile_code", "website"] as const;
    const out: Record<string, { provider: string; score: number; samples: number; avgLatencyMs: number; successRate: number }[]> = {};
    for (const task of tasks) {
      const stats = await loadStats(admin, task);
      const rows = Array.from(stats.entries()).map(([provider, s]) => ({
        provider,
        score: +scoreOf(s).toFixed(3),
        samples: s.ok + s.fail,
        avgLatencyMs: s.latencyN ? Math.round(s.latencySum / s.latencyN) : 0,
        successRate: s.ok + s.fail ? +(s.ok / (s.ok + s.fail)).toFixed(3) : 0,
      }));
      rows.sort((a, b) => b.score - a.score);
      out[task] = rows;
    }
    return out;
  });
