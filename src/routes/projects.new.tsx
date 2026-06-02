import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createProject } from "@/lib/projects.functions";
import { useAuth } from "@/hooks/use-auth";
import { Globe, Smartphone, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/new")({
  head: () => ({ meta: [{ title: "New project — Mayobuild Studio" }] }),
  component: NewProject,
});

function NewProject() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const create = useServerFn(createProject);
  const [kind, setKind] = useState<"website" | "mobile">("website");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!loading && !user) { navigate({ to: "/auth" }); return null; }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const p = await create({ data: { name, kind, description: desc || undefined } });
      navigate({ to: "/projects/$id", params: { id: p.id } });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <Link to="/" className="mb-btn-ghost mb-6 inline-flex"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div className="mb-card p-8">
        <h1 className="text-2xl font-bold mb-1">New project</h1>
        <p className="text-muted-foreground mb-6">Pick a type and give it a name.</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button onClick={() => setKind("website")} className={`mb-card p-4 text-left ${kind === "website" ? "ring-2 ring-primary" : ""}`}>
            <Globe className="h-6 w-6 text-primary mb-2" />
            <div className="font-semibold">Website</div>
            <div className="text-xs text-muted-foreground">Generated HTML preview</div>
          </button>
          <button onClick={() => setKind("mobile")} className={`mb-card p-4 text-left ${kind === "mobile" ? "ring-2 ring-accent" : ""}`}>
            <Smartphone className="h-6 w-6 text-accent mb-2" />
            <div className="font-semibold">Mobile app</div>
            <div className="text-xs text-muted-foreground">Downloadable Expo project</div>
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input className="mb-input" required maxLength={120} placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="mb-input min-h-[80px]" placeholder="What is this project about? (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          {err && <div className="text-sm text-destructive">{err}</div>}
          <button className="mb-btn w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create project
          </button>
        </form>
      </div>
    </div>
  );
}
