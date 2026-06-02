import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProviderHealth, getRecentLogs } from "@/lib/health.functions";
import { Activity, CheckCircle2, XCircle, Circle, RefreshCw } from "lucide-react";

type Health = Awaited<ReturnType<typeof getProviderHealth>>;
type Logs = Awaited<ReturnType<typeof getRecentLogs>>;

export function ProviderHealth() {
  const health = useServerFn(getProviderHealth);
  const logs = useServerFn(getRecentLogs);
  const [h, setH] = useState<Health | null>(null);
  const [l, setL] = useState<Logs | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const [hr, lr] = await Promise.all([health(), logs()]);
      setH(hr); setL(lr);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="mb-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Provider health & failover
        </h3>
        <button className="mb-btn-ghost" onClick={refresh} disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        {(h?.providers ?? []).map((p) => {
          const Icon = !p.configured ? Circle : p.fail > p.ok ? XCircle : CheckCircle2;
          const tone = !p.configured ? "text-muted-foreground" : p.fail > p.ok ? "text-destructive" : "text-emerald-500";
          return (
            <div key={p.name} className="border border-border rounded-md p-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="capitalize font-medium">{p.name}</span>
                <Icon className={`h-4 w-4 ${tone}`} />
              </div>
              <div className="text-muted-foreground">
                {p.configured ? (
                  <>
                    {p.successRate ?? "—"}% ok · {p.ok}/{p.ok + p.fail} · {p.avgLatencyMs ?? "—"}ms
                  </>
                ) : (
                  "Key not set"
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs font-medium mb-1 text-muted-foreground">Recent routing log</div>
      <div className="space-y-1 max-h-48 overflow-auto">
        {(l?.logs ?? []).map((row) => (
          <div key={row.id} className="flex items-center gap-2 text-xs border-b border-border/50 py-1">
            {row.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-destructive" />}
            <span className="font-mono">{row.task}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium">{row.provider}</span>
            <span className="text-muted-foreground">{row.model ?? ""}</span>
            <span className="ml-auto text-muted-foreground">{row.latency_ms ?? "—"}ms</span>
          </div>
        ))}
        {l && l.logs.length === 0 && (
          <div className="text-xs text-muted-foreground">No router calls yet.</div>
        )}
      </div>
    </div>
  );
}
