import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createProject, linkGitHubRepo } from "@/lib/projects.functions";
import { importZipProject } from "@/lib/zip-import.functions";
import { useAuth } from "@/hooks/use-auth";
import { Globe, Smartphone, Loader2, ArrowLeft, Upload, Sparkles, Github } from "lucide-react";

export const Route = createFileRoute("/projects/new")({
  head: () => ({ meta: [{ title: "New project — Mayobuild Studio" }] }),
  component: NewProject,
});

function NewProject() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const create = useServerFn(createProject);
  const importZip = useServerFn(importZipProject);
  const linkRepo = useServerFn(linkGitHubRepo);

  const [mode, setMode] = useState<"new" | "import">("new");
  const [kind, setKind] = useState<"website" | "mobile">("website");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [upgrades, setUpgrades] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  if (!loading && !user) { navigate({ to: "/" }); return null; }

  // Auto-detect repo from ZIP filename
  function detectRepo(filename: string): string {
    const base = filename.replace(/\.zip$/i, "").replace(/-main$/, "").replace(/_main$/, "");
    // Map known project names to repos
    const knownRepos: Record<string, string> = {
      "lite-read": "Emmanuel001afk/lite-read",
      "mayobuild-studio": "Emmanuel001afk/mayobuild-studio",
      "halwayin-connect": "Emmanuel001afk/halwayin-connect",
    };
    const key = base.toLowerCase();
    for (const [k, v] of Object.entries(knownRepos)) {
      if (key.includes(k)) return v;
    }
    return "";
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const p = await create({ data: { name, kind, description: desc || undefined, github_repo: githubRepo || undefined } });
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
      const projectName = name || file.name.replace(/\.zip$/i, "");
      const res = await importZip({
        data: { name: projectName, filename: file.name, zipBase64, upgrades: upgrades || undefined },
      });

      // Auto-link GitHub repo
      const detectedRepo = githubRepo || detectRepo(file.name);
      if (detectedRepo) {
        await linkRepo({ data: { projectId: res.projectId, github_repo: detectedRepo } });
        setProgress(`Cleaned ${res.filesProcessed} files, removed ${res.watermarksRemoved} watermarks. Linked to ${detectedRepo}.`);
      } else {
        setProgress(`Cleaned ${res.filesProcessed} files, removed ${res.watermarksRemoved} watermark elements.`);
      }

      navigate({ to: "/projects/$id", params: { id: res.projectId } });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <Link to="/" className="mb-btn-ghost mb-6 inline-flex"><ArrowLeft className="h-4 w-4" /> Back</Link>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode("new")} className={`mb-chip ${mode === "new" ? "ring-2 ring-primary" : ""}`}>
          <Sparkles className="h-3 w-3" /> Start fresh
        </button>
        <button onClick={() => setMode("import")} className={`mb-chip ${mode === "import" ? "ring-2 ring-primary" : ""}`}>
          <Upload className="h-3 w-3" /> Import .zip (auto-clean)
        </button>
      </div>

      <div className="mb-card p-8">
        {mode === "new" ? (
          <>
            <h1 className="text-2xl font-bold mb-1">New project</h1>
            <p className="text-muted-foreground mb-6">Pick a type, give it a name, and optionally link a GitHub repo so edits deploy as real React code.</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setKind("website")} className={`mb-card p-4 text-left ${kind === "website" ? "ring-2 ring-primary" : ""}`}>
                <Globe className="h-6 w-6 text-primary mb-2" />
                <div className="font-semibold">Website</div>
                <div className="text-xs text-muted-foreground">HTML preview + optional React via GitHub</div>
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
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <Github className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  className="bg-transparent flex-1 outline-none text-sm"
                  placeholder="GitHub repo (e.g. Emmanuel001afk/my-site) — optional"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">If you add a GitHub repo, clicking Publish will push your edits directly to GitHub and Vercel will redeploy automatically as a real React app.</p>
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
              Upload a <code>.zip</code> of any site. We strip watermarks, read all source files, and link to GitHub automatically so edits deploy as real React code.
            </p>
            <form onSubmit={submitImport} className="space-y-3">
              <input className="mb-input" maxLength={120} placeholder="Project name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f) {
                    const detected = detectRepo(f.name);
                    if (detected && !githubRepo) setGithubRepo(detected);
                  }
                }}
                className="mb-input file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground"
              />
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <Github className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  className="bg-transparent flex-1 outline-none text-sm"
                  placeholder="GitHub repo — auto-detected from ZIP name"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                />
              </div>
              <textarea
                className="mb-input min-h-[80px]"
                placeholder="Requested upgrades (e.g. add a contact form, switch palette to dark)"
                value={upgrades}
                onChange={(e) => setUpgrades(e.target.value)}
              />
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
