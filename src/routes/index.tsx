import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, signOut } from "@/hooks/use-auth";
import { listProjects, deleteProject, listEcosystem } from "@/lib/projects.functions";
import { PdfReader } from "@/components/PdfReader";
import { ProviderHealth } from "@/components/ProviderHealth";
import { AuthForm } from "@/components/AuthForm";
import { useProjectPresence } from "@/hooks/use-presence";
import { isShellApp } from "@/lib/shell";
import { toast } from "sonner";
import {
  Sparkles, Plus, LogOut, Globe, Smartphone, Users, Eye, FileText,
  Cpu, Mic, Zap, Loader2, ShieldAlert, ExternalLink, Trash2, Layers, Bot, RefreshCw,
  Scissors, Download,
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
  const { user, loading, error } = useAuth();
  const shell = isShellApp();

  // Native app (APK/EXE): the app must open instantly and work offline —
  // never gate the whole app behind a server round-trip. Cloud sections
  // inside the landing page degrade to "needs a connection" instead.
  if (shell) return <Landing offline />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="mb-card p-8 max-w-md text-center">
          <h1 className="text-xl font-bold mb-1">Connection problem</h1>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="mb-btn">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  return user ? <Dashboard user={user} /> : <Landing />;
}

function Landing({ offline }: { offline?: boolean }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-background/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg mb-gradient-text">Mayobuild Studio</span>
          {offline && (
            <span className="mb-chip hidden sm:inline-flex" title="Running from the installed app — cloud features need a connection">
              <WifiOffIcon /> offline app
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Link to="/mayocut" className="mb-btn-ghost text-sm">
              <Scissors className="h-4 w-4" /> MayoCut
            </Link>
            <Link to="/downloads" className="mb-btn-ghost text-sm">
              <Download className="h-4 w-4" /> Downloads
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <section>
            <h1 className="text-4xl sm:text-5xl font-bold mb-3">
              Build <span className="mb-gradient-text">websites, apps & videos</span> from your device.
            </h1>
            <p className="text-muted-foreground max-w-xl mb-6">
              One studio, every section: the MayoCut video editor runs 100% offline; the website &amp; native-app
              builder routes across 8 AI providers with automatic failover. Your device is the database.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="mb-chip"><Scissors className="h-3 w-3" /> MayoCut video — offline</span>
              <span className="mb-chip"><Cpu className="h-3 w-3" /> Smart router (8 providers)</span>
              <span className="mb-chip"><Smartphone className="h-3 w-3" /> Native app generator</span>
              <span className="mb-chip"><Bot className="h-3 w-3" /> AI console</span>
              <span className="mb-chip"><Mic className="h-3 w-3" /> Voice prompts</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/mayocut" className="mb-btn">
                <Scissors className="h-4 w-4" /> Open the video editor
              </Link>
              {!offline && (
                <Link to="/projects/build" className="mb-btn-ghost">
                  <Plus className="h-4 w-4" /> Build a website / app
                </Link>
              )}
            </div>
          </section>
          <section className="mb-card p-8 w-full max-w-md justify-self-center">
            {offline ? <LocalModeCard /> : <AuthForm />}
          </section>
        </div>

        {/* The app's sections — MayoCut is one of them, on equal footing */}
        <section>
          <h2 className="text-xl font-bold mb-4">Everything in one app</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SectionCard
              icon={<Scissors className="h-5 w-5" />}
              title="MayoCut — Video"
              desc="Multi-track editor: LUTs, speed ramp, captions, TTS, denoise, export. Runs fully offline."
              state="works offline"
              to="/mayocut"
              cta="Open editor"
              highlight
            />
            <SectionCard
              icon={<Globe className="h-5 w-5" />}
              title="Website & app builder"
              desc="Prompt-to-site and native mobile apps, with 8-provider AI routing and live preview."
              state={offline ? "needs a connection" : "ready"}
              to={offline ? undefined : "/projects/build"}
              cta="Start building"
            />
            <SectionCard
              icon={<Bot className="h-5 w-5" />}
              title="AI console & AEM"
              desc="Provider health, model management and the AI hub (overseer account)."
              state={offline ? "needs an account" : "sign in above"}
              to={offline ? undefined : "/console"}
              cta="Open console"
            />
            <SectionCard
              icon={<Download className="h-5 w-5" />}
              title="Downloads"
              desc="Windows .exe and Android .apk builds of this app, straight from CI."
              state={offline ? "needs a connection" : "ready"}
              to="/downloads"
              cta="Get the apps"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function WifiOffIcon() {
  // tiny inline glyph so the header chip stays light
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 1l22 22" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

function SectionCard({
  icon,
  title,
  desc,
  state,
  to,
  cta,
  highlight,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  state: string;
  to?: string;
  cta: string;
  highlight?: boolean;
}) {
  return (
    <div className={`mb-card p-5 flex flex-col ${highlight ? "ring-1 ring-cyan-400/40" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-primary">{icon}</span>
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{desc}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`text-[10px] ${state === "works offline" || state === "ready" ? "text-emerald-300" : "text-amber-300/90"}`}>
          {state}
        </span>
        {to ? (
          <Link to={to} className="mb-btn-ghost h-7 px-2.5 text-[11px]">
            {cta}
          </Link>
        ) : (
          <span className="mb-btn-ghost h-7 px-2.5 text-[11px] opacity-40 cursor-not-allowed">{cta}</span>
        )}
      </div>
    </div>
  );
}

/** In-app (APK/EXE) card: what works without a server, and what needs one. */
function LocalModeCard() {
  return (
    <div>
      <h2 className="font-bold text-lg mb-1">Local mode</h2>
      <p className="text-sm text-muted-foreground mb-4">
        This app works without an account and without a server — everything is stored on this device. Cloud sections
        (builder, console, presence) wake up automatically when a connection is available.
      </p>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-emerald-300">✓</span>
          <span><b>MayoCut video editor</b> — full offline editing &amp; export</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-300">✓</span>
          <span><b>Projects &amp; media</b> — saved on this device (IndexedDB)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-300">⚡</span>
          <span className="text-muted-foreground">Website/app builder, AI console — need a connection</span>
        </div>
      </div>
      <Link to="/mayocut" className="mb-btn w-full mt-5">
        <Scissors className="h-4 w-4" /> Start editing
      </Link>
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
            <Link to="/mayocut" className="mb-btn-ghost"><Scissors className="h-4 w-4" /> MayoCut</Link>
            <Link to="/downloads" className="mb-btn-ghost hidden md:flex"><Download className="h-4 w-4" /> Downloads</Link>
            <Link to="/console" className="mb-btn-ghost"><Bot className="h-4 w-4" /> AI Console</Link>
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
            <div className="flex gap-2">
              <Link to="/projects/build" className="mb-btn" style={{background:"linear-gradient(135deg,#6366f1,#4ade80)",color:"#000",fontWeight:"bold"}}>
                <Sparkles className="h-4 w-4" /> Build new app
              </Link>
              <Link to="/projects/new" className="mb-btn-ghost border border-border">
                <Plus className="h-4 w-4" /> Import existing site
              </Link>
            </div>
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
