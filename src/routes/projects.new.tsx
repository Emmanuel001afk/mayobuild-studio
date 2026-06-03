import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createProject } from "@/lib/projects.functions";
import { importZipProject } from "@/lib/zip-import.functions";
import { useAuth } from "@/hooks/use-auth";
import { Globe, Smartphone, Loader2, ArrowLeft, Upload, Sparkles } from "lucide-react";

export const Route = createFileRoute("/projects/new")({
  head: () => ({ meta: [{ title: "New project — Mayobuild Studio" }] }),
  component: NewProject,
});

function NewProject() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const create = useServerFn(createProject);
  const importZip = useServerFn(importZipProject);

  const [mode, setMode] = useState<"new" | "import">("new");
  const [kind, setKind] = useState<"website" | "mobile">("website");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [upgrades, setUpgrades] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  if (!loading && !user) { navigate({ to: "/" }); return null; }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const p = await create({ data: { name, kind, description: desc || undefined } });
      navigate({ to: "/projects/$id", params: { id: p.id } });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setErr("Choose a .zip file"); return; }
    if (file.size > 25 * 1024 * 1024) { setErr("Max 25 MB"); return; }
    setBusy(true); setErr(null); setProgress("Reading zip…");
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const zipBase64 = btoa(bin);
      setProgress("Cleaning watermarks & creating project…");
      const res = await importZip({
        data: { name: name || file.name.replace(/\.zip$/i, ""), filename: file.name, zipBase64, upgrades: upgrades || undefined },
      });
      setProgress(`Cleaned ${res.filesProcessed} files, removed ${res.watermarksRemoved} watermark elements.`);
      navigate({ to: "/projects/$id", params: { id: res.projectId } });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <Link to="/" className="mb-btn-ghost mb-6 inline-flex"><ArrowLeft className="h-4 w-4" /> Back</Link>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode("new")}
          className={`mb-chip ${mode === "new" ? "ring-2 ring-primary" : ""}`}>
          <Sparkles className="h-3 w-3" /> Start fresh
        </button>
        <button onClick={() => setMode("import")}
          className={`mb-chip ${mode === "import" ? "ring-2 ring-primary" : ""}`}>
          <Upload className="h-3 w-3" /> Import .zip (auto-clean)
        </button>
      </div>

      <div className="mb-card p-8">
        {mode === "new" ? (
          <>
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
            <form onSubmit={submitNew} className="space-y-3">
              <input className="mb-input" required maxLength={120} placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
              <textarea className="mb-input min-h-[80px]" placeholder="What is this project about? (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
              {err && <div className="text-sm text-destructive">{err}</div>}
              <button className="mb-btn w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create project
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-1">Import & auto-clean a website</h1>
            <p className="text-muted-foreground mb-6">
              Upload a <code>.zip</code> of an existing site. We safely extract every file,
              strip third-party watermarks & branding badges (Lovable, Webflow, Wix, Squarespace,
              GPT-Engineer, etc.), and drop the cleaned project into your workspace.
            </p>
            <form onSubmit={submitImport} className="space-y-3">
              <input className="mb-input" maxLength={120} placeholder="Project name (optional)"
                value={name} onChange={(e) => setName(e.target.value)} />
              <input type="file" accept=".zip,application/zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mb-input file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground" />
              <textarea className="mb-input min-h-[80px]"
                placeholder="Requested upgrades (e.g. add a contact form, switch palette to dark)"
                value={upgrades} onChange={(e) => setUpgrades(e.target.value)} />
              {progress && <div className="text-sm text-muted-foreground">{progress}</div>}
              {err && <div className="text-sm text-destructive">{err}</div>}
              <button className="mb-btn w-full" disabled={busy || !file}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Clean & import
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
