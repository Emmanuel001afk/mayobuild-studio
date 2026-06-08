import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, signOut } from "@/hooks/use-auth";
import { listProjects, deleteProject, listEcosystem } from "@/lib/projects.functions";
import { PdfReader } from "@/components/PdfReader";
import { ProviderHealth } from "@/components/ProviderHealth";
import { AuthForm } from "@/components/AuthForm";
import { useProjectPresence } from "@/hooks/use-presence";
import { toast } from "sonner";
import {
  Sparkles, Plus, LogOut, Globe, Smartphone, Users, Eye, FileText,
  Cpu, Mic, Zap, Loader2, ShieldAlert, ExternalLink, Trash2, Layers,
} from "lucide-react";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mayobuild Studio — Website & Native App Builder" },
      { name: "description", content: "Multi-user platform that builds websites and native mobile apps using a smart router across 8 AI providers." },
    ],
  }),
  component: Home,
});

function Home() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  return user ? <Dashboard user={user} /> : <Landing />;
}

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg mb-gradient-text">Mayobuild Studio</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-2 gap-10 items-center">
        <section>
          <h1 className="text-4xl sm:text-5xl font-bold mb-3">
            Build <span className="mb-gradient-text">websites & native apps</span> from a prompt.
          </h1>
          <p className="text-muted-foreground max-w-xl mb-6">
            Routed across 8 AI providers with automatic failover. Voice-first. PDF-ready.
            Mobile output is a downloadable Expo project with native alarm permissions pre-wired.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="mb-chip"><Cpu className="h-3 w-3" /> Smart router (8 providers)</span>
            <span className="mb-chip"><Mic className="h-3 w-3" /> Voice prompts</span>
            <span className="mb-chip"><FileText className="h-3 w-3" /> PDF reader</span>
            <span className="mb-chip"><Smartphone className="h-3 w-3" /> Native app generator</span>
            <span className="mb-chip"><Users className="h-3 w-3" /> Live presence</span>
          </div>
        </section>
        <section className="mb-card p-8 w-full max-w-md justify-self-center">
          <AuthForm />
        </section>
      </main>
    </div>
  );
}

function Dashboard({ user }: { user: { id: string; email?: string } }) {
  const navigate = useNavigate();
  const list = useServerFn(listProjects);
  const del = useServerFn(deleteProject);
  const ecoFn = useServerFn(listEcosystem);
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<{ owned: any[]; shared: any[] }>({ owned: [], shared: [] });
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [ecosystem, setEcosystem] = useState<any[]>([]);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  function refresh() {
    list().then(setProjects).catch(console.error).finally(() => setLoadingProjects(false));
  }
  useEffect(() => {
    refresh();
    ecoFn().then(setEcosystem).catch(() => setEcosystem([]));
  }, []);

  async function confirmDelete() {
    if (!confirmDel) return;
    setDelBusy(true);
    try {
      await del({ data: { id: confirmDel.id } });
      toast.success(`Deleted "${confirmDel.name}"`);
      setConfirmDel(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg mb-gradient-text">Mayobuild Studio</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">{user.email}</span>
            {isAdmin && (
              <Link to="/admin" className="mb-btn-ghost"><ShieldAlert className="h-4 w-4" /> Admin</Link>
            )}
            <button className="mb-btn-ghost" onClick={() => signOut().then(() => navigate({ to: "/" }))}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Your workspace
            </h2>
            <Link to="/projects/new" className="mb-btn"><Plus className="h-4 w-4" /> New project</Link>
          </div>
          {loadingProjects ? (
            <div className="text-muted-foreground">Loading projects…</div>
          ) : projects.owned.length === 0 && projects.shared.length === 0 ? (
            <div className="mb-card p-6 text-muted-foreground">
              No projects yet. Click <strong>New project</strong> to start.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.owned.map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  me={user}
                  onDelete={() => setConfirmDel({ id: p.id, name: p.name })}
                />
              ))}
              {projects.shared.map((p) => <ProjectCard key={p.id} p={p} me={user} shared />)}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> My Ecosystem
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ecosystem.map((c) => (
              <div key={c.id} className="mb-card p-4 flex flex-col gap-2">
                <h3 className="font-semibold">{c.name}</h3>
                <p className="text-sm text-muted-foreground">{c.category}</p>
                {c.status === "here" ? (
                  <span className="mb-chip self-start mt-auto">You are here</span>
                ) : c.status === "live" && c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="mb-btn h-8 px-3 mt-auto self-start">
                    <ExternalLink className="h-4 w-4" /> Visit
                  </a>
                ) : (
                  <span className="mb-chip self-start mt-auto opacity-70">Coming Soon</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <ProviderHealth />
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Instant PDF reader
          </h2>
          <PdfReader />
        </section>
      </main>

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog">
          <div className="mb-card p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold">Delete "{confirmDel.name}"?</h3>
            <p className="text-sm text-muted-foreground">
              This permanently removes the project, its published files, and all generation history. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button className="mb-btn-ghost" onClick={() => setConfirmDel(null)} disabled={delBusy}>Cancel</button>
              <button className="mb-btn bg-destructive text-destructive-foreground" onClick={confirmDelete} disabled={delBusy}>
                {delBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, shared = false, me, onDelete }: { p: any; shared?: boolean; me: { id: string; email?: string }; onDelete?: () => void }) {
  const viewers = useProjectPresence(p.id, me);
  return (
    <div className="mb-card p-4 hover:scale-[1.01] transition-transform block relative">
      <Link to="/projects/$id" params={{ id: p.id }} className="block">
        <div className="flex items-start justify-between mb-2 pr-8">
          <div className="flex items-center gap-2">
            {p.kind === "website" ? <Globe className="h-4 w-4 text-primary" /> : <Smartphone className="h-4 w-4 text-accent" />}
            <h3 className="font-semibold">{p.name}</h3>
          </div>
          {shared && <span className="mb-chip">Shared</span>}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{p.description || "—"}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <Eye className="h-3 w-3" /> {viewers} {viewers === 1 ? "viewer" : "viewers"}
          </span>
          <span className="capitalize">{p.kind}</span>
        </div>
        {p.kind === "website" && p.liveSubdomain && (
          <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            <span>{p.liveSubdomain}</span>
          </div>
        )}
      </Link>
      {!shared && onDelete && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          aria-label="Delete project"
          title="Delete project"
          className="absolute top-3 right-3 h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

