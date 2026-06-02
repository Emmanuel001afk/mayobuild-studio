import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, signOut } from "@/hooks/use-auth";
import { listProjects } from "@/lib/projects.functions";
import { PdfReader } from "@/components/PdfReader";
import {
  Sparkles, Plus, LogOut, Globe, Smartphone, Users, Eye, FileText,
  Cpu, Mic, Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mayobuild Studio — Website & Native App Builder" },
      { name: "description", content: "Multi-user platform that builds websites and native mobile apps using a smart router across 8 AI providers." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const list = useServerFn(listProjects);
  const [projects, setProjects] = useState<{ owned: any[]; shared: any[] }>({ owned: [], shared: [] });
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    list()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoadingProjects(false));
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
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
            <button className="mb-btn-ghost" onClick={() => signOut().then(() => navigate({ to: "/auth" }))}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* Hero */}
        <section className="mb-card p-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            Build <span className="mb-gradient-text">websites & native apps</span> from a prompt.
          </h1>
          <p className="text-muted-foreground mb-6 max-w-2xl">
            Routed across 8 AI providers. Voice-first. PDF-ready. Mobile output is a downloadable Expo project you build to a Play Store .aab with one EAS command.
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="mb-chip"><Cpu className="h-3 w-3" /> Smart router (8 providers)</span>
            <span className="mb-chip"><Mic className="h-3 w-3" /> Voice prompts</span>
            <span className="mb-chip"><FileText className="h-3 w-3" /> PDF reader</span>
            <span className="mb-chip"><Smartphone className="h-3 w-3" /> Native app generator</span>
            <span className="mb-chip"><Users className="h-3 w-3" /> Collaboration</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/projects/new" className="mb-btn"><Plus className="h-4 w-4" /> New project</Link>
          </div>
        </section>

        {/* Workspace */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Your workspace
            </h2>
            <Link to="/projects/new" className="mb-btn-ghost"><Plus className="h-4 w-4" /> New</Link>
          </div>
          {loadingProjects ? (
            <div className="text-muted-foreground">Loading projects…</div>
          ) : projects.owned.length === 0 && projects.shared.length === 0 ? (
            <div className="mb-card p-6 text-muted-foreground">
              No projects yet. Click <strong>New project</strong> to start.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.owned.map((p) => <ProjectCard key={p.id} p={p} />)}
              {projects.shared.map((p) => <ProjectCard key={p.id} p={p} shared />)}
            </div>
          )}
        </section>

        {/* PDF tool */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Instant PDF reader
          </h2>
          <PdfReader />
        </section>
      </main>
    </div>
  );
}

function ProjectCard({ p, shared = false }: { p: any; shared?: boolean }) {
  return (
    <Link to="/projects/$id" params={{ id: p.id }} className="mb-card p-4 hover:scale-[1.01] transition-transform block">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {p.kind === "website" ? <Globe className="h-4 w-4 text-primary" /> : <Smartphone className="h-4 w-4 text-accent" />}
          <h3 className="font-semibold">{p.name}</h3>
        </div>
        {shared && <span className="mb-chip">Shared</span>}
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{p.description || "—"}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> 1 viewer</span>
        <span className="capitalize">{p.kind}</span>
      </div>
    </Link>
  );
}
