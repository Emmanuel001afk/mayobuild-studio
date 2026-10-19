import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getPlatformRecords } from "@/lib/platform-records.functions";
import { ArrowLeft, Activity, AlertTriangle, CheckCircle2, CircleHelp, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/platforms")({
  head: () => ({ meta: [{ title: "Platform Records — Mayobuild Studio" }, { name: "robots", content: "noindex" }] }),
  component: PlatformRecordsPage,
});

function PlatformRecordsPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const loadRecords = useServerFn(getPlatformRecords);
  const [data, setData] = useState<{ platforms: any[]; events: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      setData(await loadRecords());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load platform records.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    if (isAdmin) void refresh();
  }, [loading, user, isAdmin]);

  const events = useMemo(() => (data?.events ?? []).filter((event) =>
    (platformFilter === "all" || event.platform_id === platformFilter) &&
    (severityFilter === "all" || event.severity === severityFilter)
  ), [data, platformFilter, severityFilter]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;

  if (!user || !isAdmin) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="mb-card p-8 max-w-md text-center">
        <ShieldAlert className="h-10 w-10 text-destructive mx-auto mb-3" />
        <h1 className="text-xl font-bold mb-1">Restricted area</h1>
        <p className="text-sm text-muted-foreground mb-4">Platform records are available to administrators only.</p>
        <Link to="/" className="mb-btn"><ArrowLeft className="h-4 w-4" /> Back to workspace</Link>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen p-4 sm:p-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Central Hub · Records</p>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-primary" /> Platform diagnostics</h1>
          <p className="text-sm text-muted-foreground mt-1">Shared status and diagnostic records. Platforms remain independently operational.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="mb-btn-ghost" onClick={() => void refresh()} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh</button>
          <Link to="/admin" className="mb-btn-ghost"><ArrowLeft className="h-4 w-4" /> Admin</Link>
        </div>
      </header>

      {error && <div role="alert" className="mb-card p-4 border border-destructive/30 text-sm mb-5">{error}</div>}

      <section className="grid sm:grid-cols-3 gap-3 mb-6">
        <Stat icon={<Activity className="h-4 w-4" />} label="Registered platforms" value={data?.platforms.length ?? "—"} />
        <Stat icon={<AlertTriangle className="h-4 w-4" />} label="Errors / critical (latest 100)" value={(data?.events ?? []).filter((e) => e.severity === "error" || e.severity === "critical").length} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Active / registered" value={(data?.platforms ?? []).filter((p) => p.status === "active" || p.status === "registered").length} />
      </section>

      <section className="mb-card p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-lg">Registered platforms</h2>
          <span className="text-xs text-muted-foreground">Latest contact and advertised capabilities</span>
        </div>
        {!data?.platforms.length ? <Empty>No platforms registered yet, or the registry schema has not been applied.</Empty> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.platforms.map((platform) => (
              <article key={platform.platform_id} className="rounded-xl border border-border p-4 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{platform.name}</h3>
                    <p className="text-xs text-muted-foreground break-all">{platform.platform_id}</p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-1 border ${platform.status === "attention" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground"}`}>{platform.status}</span>
                </div>
                <div className="text-sm mt-3 space-y-1">
                  <p>Version: <span className="text-muted-foreground">{platform.version || "Not reported"}</span></p>
                  <p>Type: <span className="text-muted-foreground">{platform.platform_type}</span></p>
                  <p>Last contact: <span className="text-muted-foreground">{platform.last_seen_at ? new Date(platform.last_seen_at).toLocaleString() : "Never"}</span></p>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {(platform.capabilities ?? []).slice(0, 8).map((capability: string) => <span key={capability} className="text-[11px] rounded-md bg-muted px-2 py-1">{capability}</span>)}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-lg">Diagnostic history</h2>
            <p className="text-xs text-muted-foreground">Most recent 100 records, with secrets and message content intentionally excluded.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="border border-border rounded-lg bg-background px-3 py-2 text-sm" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} aria-label="Filter by platform">
              <option value="all">All platforms</option>
              {(data?.platforms ?? []).map((p) => <option key={p.platform_id} value={p.platform_id}>{p.name}</option>)}
            </select>
            <select className="border border-border rounded-lg bg-background px-3 py-2 text-sm" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} aria-label="Filter by severity">
              <option value="all">All severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        {!events.length ? <Empty><CircleHelp className="inline h-4 w-4 mr-1" /> No records match these filters yet.</Empty> : (
          <div className="space-y-3">
            {events.map((event) => (
              <article key={event.id} className="rounded-xl border border-border p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-xs rounded-full px-2 py-1 border ${event.severity === "critical" || event.severity === "error" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground"}`}>{event.severity}</span>
                  <span className="text-sm font-medium">{event.event_type}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(event.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm">{event.summary}</p>
                <p className="text-xs text-muted-foreground mt-1">{event.platform_id}{event.app_version ? ` · v${event.app_version}` : ""}{event.device_id ? ` · install ${event.device_id}` : ""}</p>
                {event.details && Object.keys(event.details).length > 0 && <details className="mt-3"><summary className="text-xs cursor-pointer text-muted-foreground">Record details</summary><pre className="text-xs overflow-auto mt-2 p-3 rounded-lg bg-muted">{JSON.stringify(event.details, null, 2)}</pre></details>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="mb-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div><div className="text-2xl font-bold mt-2">{value}</div></div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-6 text-center">{children}</div>;
}
