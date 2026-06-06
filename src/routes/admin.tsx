import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, ADMIN_EMAIL } from "@/hooks/use-auth";
import { getAdminOverview } from "@/lib/admin.functions";
import { AdminFeatureToggles } from "@/components/AdminFeatureToggles";
import { AdminCustomDomain } from "@/components/AdminCustomDomain";

import { ArrowLeft, Loader2, ShieldAlert, Users, FolderKanban, Cpu, DollarSign, Smartphone } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Mayobuild Studio" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const fetcher = useServerFn(getAdminOverview);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/" }); return; }
    if (!isAdmin) return;
    fetcher().then(setData).catch((e) => setErr(e.message));
  }, [loading, user, isAdmin]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
    </div>;
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="mb-card p-8 max-w-md text-center">
          <ShieldAlert className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h1 className="text-xl font-bold mb-1">Restricted area</h1>
          <p className="text-sm text-muted-foreground mb-4">
            The overseer dashboard is locked to <span className="font-mono">{ADMIN_EMAIL}</span> only.
          </p>
          <Link to="/" className="mb-btn"><ArrowLeft className="h-4 w-4" /> Back to workspace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" /> Overseer dashboard
        </h1>
        <Link to="/" className="mb-btn-ghost"><ArrowLeft className="h-4 w-4" /> Workspace</Link>
      </div>

      {err && <div className="mb-card p-4 text-destructive mb-4">{err}</div>}
      {!data && !err && <div className="text-muted-foreground">Loading data…</div>}

      {data && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <Stat icon={<Users className="h-4 w-4" />} label="Users" value={data.counts.users} />
            <Stat icon={<FolderKanban className="h-4 w-4" />} label="Projects" value={data.counts.projects} />
            <Stat icon={<Cpu className="h-4 w-4" />} label="AI generations" value={data.counts.generations} />
            <Stat icon={<Smartphone className="h-4 w-4" />} label="Mobile builds" value={data.counts.mobileBuilds} />
          </div>

          <div className="mb-card p-4 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold">Ad / AI revenue (projection)</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">${data.revenue.estRevenueUsd}</div>
              <div className="text-xs text-muted-foreground">{data.revenue.totalTokens.toLocaleString()} tokens</div>
            </div>
          </div>

          <AdminCustomDomain />

          <AdminFeatureToggles />


          <Section title="All projects">
            <Table headers={["Name", "Kind", "Owner", "Updated"]} rows={data.projects.map((p: any) => [
              p.name, p.kind, p.owner_id.slice(0, 8) + "…", new Date(p.updated_at).toLocaleString(),
            ])} />
          </Section>

          <Section title="Recent generations (router log)">
            <Table headers={["Task", "Provider", "Model", "Tokens", "Latency"]} rows={data.generations.map((g: any) => [
              g.task, g.provider, g.model, g.tokens, `${g.latency}ms`,
            ])} />
          </Section>

          <Section title="Users">
            <Table headers={["Email", "Joined"]} rows={data.profiles.map((p: any) => [
              p.email ?? "—", new Date(p.created_at).toLocaleDateString(),
            ])} />
          </Section>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="mb-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <div className="mb-card overflow-x-auto">{children}</div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: any[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/30">
        <tr>{headers.map((h) => <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={headers.length} className="px-3 py-4 text-muted-foreground">No records.</td></tr>
        )}
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {r.map((c, j) => <td key={j} className="px-3 py-2">{String(c)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
