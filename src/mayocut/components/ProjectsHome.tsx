import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  WifiOff,
} from "lucide-react";
import { db } from "../idb";
import {
  ASPECTS,
  newProject,
  projectDuration,
  uid,
  type AspectId,
  type MediaItem,
  type Project,
  type UserTemplate,
} from "../types";
import { BUILT_IN_TEMPLATES } from "../templates";
import { fmtBytes, fmtTime, importFiles, kindFromMime } from "../utils";

export interface HomeNav {
  onOpenProject: (id: string) => void;
  onGetApp?: () => void;
  onBackToPlatform?: () => void;
}

export function ProjectsHome({ desktop, nav }: { desktop?: boolean; nav: HomeNav }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [userTpls, setUserTpls] = useState<UserTemplate[]>([]);
  const [exports, setExports] = useState<{ id: string; name: string; size: number; createdAt: number; mime: string }[]>([]);
  const [busyImport, setBusyImport] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const [m, p, t, e] = await Promise.all([db.listMedia(), db.listProjects(), db.listTemplates(), db.listExports()]);
    setMedia(m.sort((a, b) => b.createdAt - a.createdAt));
    setProjects(p.sort((a, b) => b.updatedAt - a.updatedAt));
    setUserTpls(t.sort((a, b) => b.createdAt - a.createdAt));
    setExports(e.sort((a, b) => b.createdAt - a.createdAt));
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusyImport(true);
    try {
      const accepted = Array.from(files).filter((f) => kindFromMime(f.type, f.name));
      if (accepted.length === 0) {
        toast.error("No supported media files found (video, image or audio)");
        return;
      }
      const items = await importFiles(accepted);
      for (let i = 0; i < items.length; i++) await db.putMedia(items[i], accepted[i]);
      toast.success(`${items.length} item${items.length > 1 ? "s" : ""} added to your library`);
      await refresh();
    } catch (e) {
      console.error(e);
      toast.error("Import failed — storage may be full");
    } finally {
      setBusyImport(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function createProject(aspect: AspectId, name: string) {
    const p = newProject(name, aspect);
    p.updatedAt = Date.now();
    await db.saveProject(p);
    setNewOpen(false);
    nav.onOpenProject(p.id);
  }

  async function openTemplate(kind: "builtin" | "user", id: string) {
    try {
      if (kind === "builtin") {
        const tpl = BUILT_IN_TEMPLATES.find((t) => t.id === id);
        if (!tpl) return;
        const project = tpl.build(media);
        if (!project) {
          const need = tpl.needs.map((k) => `${k}s`).join(" and ");
          toast.error(`Import at least 2 ${need} into your library to use “${tpl.name}”`);
          return;
        }
        await db.saveProject(project);
        nav.onOpenProject(project.id);
      } else {
        const tpl = userTpls.find((t) => t.id === id);
        if (!tpl) return;
        const project = remapTemplate(tpl, media);
        await db.saveProject(project);
        nav.onOpenProject(project.id);
        if (project.missingMedia?.length) {
          toast.warning(`Opened from template. Missing on this device: ${project.missingMedia.join(", ")} — use Replace on those clips`);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not open template");
    }
  }

  async function delProject(id: string, name: string) {
    if (!confirm(`Delete project “${name}”?`)) return;
    await db.deleteProject(id);
    toast.success("Project deleted");
    await refresh();
  }

  async function dupProject(p: Project) {
    const copy: Project = { ...p, id: uid("prj"), name: `${p.name} copy`, createdAt: Date.now(), updatedAt: Date.now() };
    await db.saveProject(copy);
    await refresh();
  }

  async function delMedia(id: string) {
    await db.deleteMedia(id);
    toast.success("Media removed from library");
    await refresh();
  }

  async function delExport(id: string) {
    await db.deleteExport(id);
    await refresh();
  }

  async function downloadExport(id: string, name: string, mime: string) {
    const blob = await db.getExportBlob(id);
    if (!blob) {
      toast.error("Export data not found on this device");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  if (!loaded) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className={`${desktop ? "" : "min-h-screen"} bg-background text-foreground`}>
      <header className="border-b border-border sticky top-0 z-20 bg-background/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Scissors className="h-6 w-6 text-primary" />
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-lg bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">
              MayoCut
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline">Video Studio</span>
          </div>
          <span className="mb-chip ml-1">
            <WifiOff className="h-3 w-3" /> 100% offline · no account
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!desktop && (
              <>
                {nav.onGetApp && (
                  <button className="mb-btn-ghost text-sm" onClick={nav.onGetApp}>
                    <Download className="h-4 w-4" /> Get the app
                  </button>
                )}
                {nav.onBackToPlatform && (
                  <button className="mb-btn-ghost text-sm" onClick={nav.onBackToPlatform}>
                    ← Mayobuild
                  </button>
                )}
              </>
            )}
            <button className="mb-btn text-sm" onClick={() => fileRef.current?.click()} disabled={busyImport}>
              {busyImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import media
            </button>
            <button className="mb-btn text-sm bg-primary" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New project
            </button>
          </div>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="video/*,image/*,audio/*"
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* Templates */}
        <section>
          <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="Start from a template" sub="Built from your own media — nothing is downloaded, nothing leaves this device." />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {BUILT_IN_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => openTemplate("builtin", t.id)}
                className="mb-card p-0 overflow-hidden text-left hover:scale-[1.02] transition-transform group"
              >
                <div className="h-24 w-full" style={{ background: t.swatch }} />
                <div className="p-3">
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    {t.name}
                    <span className="text-[10px] text-muted-foreground border border-border rounded px-1">{t.aspect}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.desc}</p>
                </div>
              </button>
            ))}
            {userTpls.map((t) => (
              <div key={t.id} className="mb-card p-0 overflow-hidden text-left group">
                <button className="w-full" onClick={() => openTemplate("user", t.id)}>
                  <div className="h-24 w-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                    {t.thumb ? (
                      <img src={t.thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Clapperboard className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {t.name}
                      <span className="text-[10px] text-fuchsia-300">yours</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.desc || "Your own template"}</p>
                  </div>
                </button>
                <div className="px-3 pb-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                    onClick={async () => {
                      if (confirm(`Delete template “${t.name}”?`)) {
                        await db.deleteTemplate(t.id);
                        await refresh();
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Projects */}
        <section>
          <SectionTitle icon={<Film className="h-4 w-4" />} title="Your projects" sub="Saved on this device only (IndexedDB). Open, edit, export — fully offline." />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
            {projects.length === 0 && (
              <div className="col-span-full mb-card p-8 text-center text-muted-foreground text-sm">
                No projects yet. Import some media and hit <b>New project</b>.
              </div>
            )}
            {projects.map((p) => (
              <div key={p.id} className="mb-card p-0 overflow-hidden group relative">
                <button className="w-full text-left" onClick={() => nav.onOpenProject(p.id)}>
                  <div className="aspect-video w-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                    {p.thumb ? (
                      <img src={p.thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Film className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmtTime(projectDuration(p))} · {p.main.length} clip{p.main.length === 1 ? "" : "s"} · {new Date(p.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconBtn title="Duplicate" onClick={() => void dupProject(p)}>
                    <RotateCcw className="h-3.5 w-3.5 rotate-180" />
                  </IconBtn>
                  <IconBtn title="Delete" onClick={() => void delProject(p.id, p.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Media library */}
        <section>
          <SectionTitle
            icon={<ImageIcon className="h-4 w-4" />}
            title={`Media library (${media.length})`}
            sub={`This is your on-device media database. ${media.length ? fmtBytes(media.reduce((a, m) => a + m.size, 0)) + " stored locally." : "Import videos, photos and music from this device."}`}
          />
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3 mt-4">
            {media.length === 0 && (
              <div className="col-span-full mb-card p-6 text-center text-muted-foreground text-sm">
                Your library is empty. Use <b>Import media</b> — files are stored only on this device.
              </div>
            )}
            {media.map((m) => (
              <div key={m.id} className="mb-card p-0 overflow-hidden group relative">
                <div className="aspect-video w-full bg-slate-900 flex items-center justify-center overflow-hidden">
                  {m.thumb ? (
                    <img src={m.thumb} alt="" className="h-full w-full object-cover" />
                  ) : m.kind === "audio" ? (
                    <Music className="h-6 w-6 text-fuchsia-300" />
                  ) : (
                    <Film className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="p-2">
                  <div className="text-[11px] truncate">{m.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {m.kind === "video" && m.duration ? fmtTime(m.duration) : m.kind === "audio" && m.duration ? fmtTime(m.duration) : m.kind} · {fmtBytes(m.size)}
                  </div>
                </div>
                <button
                  className="absolute top-1.5 right-1.5 bg-black/60 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                  onClick={() => void delMedia(m.id)}
                  title="Remove from library"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Exports */}
        {exports.length > 0 && (
          <section>
            <SectionTitle icon={<Download className="h-4 w-4" />} title="Your exports" sub="Rendered videos saved on this device. Re-download anytime." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {exports.map((e) => (
                <div key={e.id} className="mb-card p-4 flex items-center gap-3">
                  <Clapperboard className="h-6 w-6 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtBytes(e.size)} · {new Date(e.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button className="mb-btn-ghost text-xs" onClick={() => void downloadExport(e.id, e.name, e.mime)}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                  <button className="text-muted-foreground hover:text-destructive" onClick={() => void delExport(e.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-muted-foreground py-8 space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Pencil className="h-3 w-3" />
            <span>
              AI assistance is <b>optional and off by default</b> — every feature of MayoCut works with zero internet, zero accounts, zero servers.
            </span>
          </div>
          <div>MayoCut v0.1 · part of the Mayobuild Studio platform</div>
        </footer>
      </main>

      {newOpen && (
        <NewProjectModal
          onClose={() => setNewOpen(false)}
          onCreate={(aspect, name) => void createProject(aspect, name)}
        />
      )}
    </div>
  );
}

function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 font-semibold text-lg">
        <span className="text-primary">{icon}</span> {title}
      </h2>
      <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button className="bg-black/60 rounded p-1.5 hover:text-destructive" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

function NewProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (aspect: AspectId, name: string) => void;
}) {
  const [name, setName] = useState("Untitled project");
  const [aspect, setAspect] = useState<AspectId>("9:16");
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="mb-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg">New project</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a format. The project lives only on this device.
        </p>
        <div className="mt-4 space-y-2">
          {Object.entries(ASPECTS).map(([id, a]) => (
            <label
              key={id}
              className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${
                aspect === id ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <input
                type="radio"
                name="aspect"
                checked={aspect === id}
                onChange={() => setAspect(id as AspectId)}
                className="accent-cyan-400"
              />
              <div
                className="border border-border bg-slate-900"
                style={{
                  width: 26,
                  height: id === "16:9" ? 26 : id === "1:1" ? 26 : id === "4:5" ? 32 : 40,
                }}
              />
              <span className="text-sm">{a.label}</span>
            </label>
          ))}
        </div>
        <input
          className="mt-4 w-full bg-slate-900 border border-border rounded-lg px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button className="mb-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="mb-btn" onClick={() => onCreate(aspect, name.trim() || "Untitled project")}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/** Remap a user template's media ids to the current library by file name. */
export function remapTemplate(tpl: UserTemplate, media: MediaItem[]): Project {
  const p: Project = JSON.parse(JSON.stringify(tpl.project));
  p.id = uid("prj");
  p.name = `From “${tpl.name}”`;
  p.createdAt = Date.now();
  p.updatedAt = Date.now();
  p.sourceTemplate = tpl.name;
  const byName = new Map(media.map((m) => [m.name, m]));
  const used = new Set<string>();
  const remap = (id?: string): string | undefined => {
    if (!id) return id;
    const src = media.find((m) => m.id === id);
    if (src) return id;
    const original = (tpl.project as any).__mediaNames?.[id] as string | undefined;
    const match = byName.get(original ?? "");
    if (match) {
      used.add(match.id);
      return match.id;
    }
    return id;
  };
  const missing: string[] = [];
  const seen = new Set<string>();
  const check = (id?: string) => {
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    if (!media.some((m) => m.id === id) && !missing.includes(id)) missing.push(id);
  };
  for (const c of p.main) {
    c.mediaId = remap(c.mediaId);
    check(c.mediaId);
  }
  for (const tr of p.tracks)
    for (const c of tr.clips) {
      c.mediaId = remap(c.mediaId);
      check(c.mediaId);
    }
  (p as any).missingMedia = missing;
  void used;
  return p;
}

