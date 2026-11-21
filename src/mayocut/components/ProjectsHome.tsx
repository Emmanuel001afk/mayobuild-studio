import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Clapperboard,
  Cpu,
  Download,
  FileJson,
  Film,
  HardDrive,
  ShieldCheck,
  Image as ImageIcon,
  Loader2,
  Music,
  PackageOpen,
  Play,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  WifiOff,
  Wand2,
  X,
} from "lucide-react";
import {
  applyEnhanceOps,
  BUNDLED_PACKS,
  loadBundledPack,
  packToTemplates,
  validatePack,
} from "../assist";
import { device } from "../device";
import { db } from "../idb";
import {
  ASPECT_ORDER,
  ASPECTS,
  newProject,
  projectDuration,
  uid,
  type AspectId,
  type MediaItem,
  type Project,
  type TemplatePack,
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
  const [exports, setExports] = useState<
    { id: string; name: string; size: number; createdAt: number; mime: string }[]
  >([]);
  const [busyImport, setBusyImport] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const packFileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const dev = device(); // device capability profile (memoized)
  const [installing, setInstalling] = useState<string | null>(null);
  const [enhanceFor, setEnhanceFor] = useState<UserTemplate | null>(null);
  const [installedPacks, setInstalledPacks] = useState<Set<string>>(new Set());
  const [storage, setStorage] = useState<{
    used: number;
    quota: number;
    persisted: boolean;
  } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /** Inline playback of a finished export (CapCut's "watch before sharing"). */
  async function togglePreviewExport(id: string) {
    if (previewing === id) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewing(null);
      return;
    }
    const blob = await db.getExportBlob(id);
    if (!blob) {
      toast.error("That export is no longer stored on this device");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(blob));
    setPreviewing(id);
  }

  async function refresh() {
    const [m, p, t, e] = await Promise.all([
      db.listMedia(),
      db.listProjects(),
      db.listTemplates(),
      db.listExports(),
    ]);
    setMedia(m.sort((a, b) => b.createdAt - a.createdAt));
    setProjects(p.sort((a, b) => b.updatedAt - a.updatedAt));
    setUserTpls(t.sort((a, b) => b.createdAt - a.createdAt));
    setExports(e.sort((a, b) => b.createdAt - a.createdAt));
    setInstalledPacks(new Set(userTemplatePackNames(t)));
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
    void (async () => {
      try {
        const est = await navigator.storage?.estimate?.();
        if (!est) return;
        setStorage({
          used: est.usage ?? 0,
          quota: est.quota ?? 0,
          persisted: (await navigator.storage?.persisted?.()) ?? false,
        });
      } catch {
        /* storage API unavailable — the meter simply hides */
      }
    })();
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
      // Ask the browser to protect the local library from automatic eviction.
      void navigator.storage?.persist?.().catch(() => false);
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

  // ------------------------------------------------------------- packs

  async function installPackFile(pack: TemplatePack) {
    const rows = packToTemplates(pack);
    const existing = new Set(userTpls.map((t) => t.id));
    let added = 0;
    for (const r of rows) {
      if (existing.has(r.id)) continue;
      await db.saveTemplate(r);
      added++;
    }
    if (added === 0) toast.info(`“${pack.name}” is already installed`);
    else toast.success(`Installed ${added} template${added > 1 ? "s" : ""} from “${pack.name}”`);
    await refresh();
  }

  async function installBundled(file: string) {
    setInstalling(file);
    try {
      const pack = await loadBundledPack(file);
      await installPackFile(pack);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not install the pack");
    } finally {
      setInstalling(null);
    }
  }

  async function onImportPackFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    try {
      const pack = validatePack(JSON.parse(await f.text()));
      await installPackFile(pack);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that pack file");
    } finally {
      if (packFileRef.current) packFileRef.current.value = "";
    }
  }

  async function openEnhanceFrom(tpl: UserTemplate, projectId: string) {
    const src = await db.getProject(projectId);
    if (!src || !tpl.enhance) {
      toast.error("Project not found");
      return;
    }
    const p = applyEnhanceOps(src, tpl.enhance, tpl.name);
    await db.saveProject(p);
    setEnhanceFor(null);
    nav.onOpenProject(p.id);
    toast.success(`“${tpl.name}” applied — you can keep editing`);
  }

  async function openTemplate(kind: "builtin" | "user", id: string) {
    try {
      if (kind === "builtin") {
        const tpl = BUILT_IN_TEMPLATES.find((t) => t.id === id);
        if (!tpl) return;
        const project = tpl.build(media);
        if (!project) {
          const need = tpl.needs.map((k) => k).join(" and ");
          toast.error(`Import ${need} into your library to use “${tpl.name}”`);
          return;
        }
        await db.saveProject(project);
        nav.onOpenProject(project.id);
      } else {
        const tpl = userTpls.find((t) => t.id === id);
        if (!tpl) return;
        if (tpl.kind === "enhance") {
          if (projects.length === 0) {
            toast.info("Create a project first, then this treatment can be applied to it");
            return;
          }
          setEnhanceFor(tpl);
          return;
        }
        const project = remapTemplate(tpl, media);
        await db.saveProject(project);
        nav.onOpenProject(project.id);
        if (project.missingMedia?.length) {
          toast.warning(
            `Opened from template. Missing on this device: ${project.missingMedia.join(", ")} — use Replace on those clips`,
          );
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
    const copy: Project = {
      ...p,
      id: uid("prj"),
      name: `${p.name} copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
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
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
          <Scissors className="h-6 w-6 text-primary shrink-0" />
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-bold text-base sm:text-lg bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent truncate">
              MayoCut
            </span>
            <span className="text-xs text-muted-foreground hidden md:inline">Video Studio</span>
          </div>
          <span className="mb-chip ml-1 hidden lg:inline-flex">
            <WifiOff className="h-3 w-3" /> 100% offline · no account
          </span>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {!desktop && (
              <>
                {nav.onGetApp && (
                  <button
                    className="mb-btn-ghost text-xs px-2 hidden sm:inline-flex"
                    onClick={nav.onGetApp}
                  >
                    <Download className="h-4 w-4" /> Get the app
                  </button>
                )}
                {nav.onBackToPlatform && (
                  <button
                    className="mb-btn-ghost text-xs px-2 hidden sm:inline-flex"
                    onClick={nav.onBackToPlatform}
                  >
                    ← Mayobuild
                  </button>
                )}
              </>
            )}
            <button
              className="mb-btn text-xs px-2.5 sm:text-sm sm:px-4"
              onClick={() => fileRef.current?.click()}
              disabled={busyImport}
            >
              {busyImport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>Import media</span>
            </button>
            <button
              className="mb-btn text-xs px-2.5 sm:text-sm sm:px-4 bg-primary"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span>New project</span>
            </button>
          </div>
        </div>
      </header>

      {dev.tier === "low" && (
        <div className="border-b border-amber-500/30 bg-amber-500/10">
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 text-[12px] text-amber-200">
            <Cpu className="h-4 w-4 shrink-0" />
            <span>
              <b>Low-power device detected</b> ({dev.cores} cores
              {dev.memoryGB ? `, ${dev.memoryGB} GB RAM` : ""}, {dev.gpu}). Text-to-speech, audio
              denoise, local AI and auto captions are switched off so editing stays smooth — they
              turn on automatically on a faster device. Full editing and export still work.
            </span>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.3gp,.3g2,.flv,.ts,.mts,.m2ts,.mpg,.mpeg,.wmv,.vob,.ogv,image/*,.bmp,.heic,.heif,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* Template packs */}
        <section>
          <SectionTitle
            icon={<PackageOpen className="h-4 w-4" />}
            title="Template packs"
            sub="Downloadable layout & look packs, and .json packs shared by other users. Everything installs straight into your local gallery."
          />
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            {BUNDLED_PACKS.map((bp) => {
              const installed = installedPacks.has(bp.name);
              return (
                <div key={bp.file} className="mb-card p-0 overflow-hidden">
                  <div className="h-14 w-full" style={{ background: bp.swatch }} />
                  <div className="p-3">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {bp.name}
                      {installed && (
                        <span className="text-[10px] text-emerald-300 border border-emerald-400/40 rounded px-1">
                          installed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{bp.desc}</p>
                    <button
                      className="mb-btn-ghost w-full h-7 mt-2 text-[11px]"
                      disabled={installing === bp.file || installed}
                      onClick={() => void installBundled(bp.file)}
                    >
                      {installing === bp.file ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
                      ) : (
                        <Download className="h-3.5 w-3.5 inline" />
                      )}
                      {installed
                        ? "Installed"
                        : installing === bp.file
                          ? "Installing…"
                          : "Install pack (on-device)"}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="mb-card p-0 overflow-hidden flex flex-col">
              <div className="h-14 w-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                <FileJson className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <div className="font-semibold text-sm">Shared .json packs</div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">
                  Import a pack someone shared with you — or export your own project as one from the
                  editor (“Export pack”).
                </p>
                <button
                  className="mb-btn-ghost w-full h-7 mt-2 text-[11px]"
                  onClick={() => packFileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 inline" /> Import pack file…
                </button>
                <input
                  ref={packFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => void onImportPackFile(e.target.files)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Templates */}
        <section>
          <SectionTitle
            icon={<Sparkles className="h-4 w-4" />}
            title="Start from a template"
            sub="Built from your own media — nothing is downloaded, nothing leaves this device."
          />
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
                    <span className="text-[10px] text-muted-foreground border border-border rounded px-1">
                      {t.aspect}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.desc}</p>
                </div>
              </button>
            ))}
            {userTpls.map((t) => (
              <div key={t.id} className="mb-card p-0 overflow-hidden text-left group">
                <button className="w-full" onClick={() => openTemplate("user", t.id)}>
                  <div
                    className="h-24 w-full flex items-center justify-center"
                    style={t.swatch ? { background: t.swatch } : undefined}
                  >
                    <div className="w-full h-full bg-black/30">
                      {t.thumb ? (
                        <img src={t.thumb} alt="" className="h-full w-full object-cover" />
                      ) : t.kind === "enhance" ? (
                        <Wand2 className="h-8 w-8 text-white/80" />
                      ) : (
                        <Clapperboard className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="font-semibold text-sm flex items-center gap-1.5">
                      {t.name}
                      {t.kind === "enhance" ? (
                        <span className="text-[10px] text-amber-300 border border-amber-400/40 rounded px-1">
                          treatment
                        </span>
                      ) : t.packName ? (
                        <span
                          className="text-[10px] text-cyan-300 border border-cyan-400/40 rounded px-1"
                          title={`from pack ${t.packName}`}
                        >
                          pack
                        </span>
                      ) : (
                        <span className="text-[10px] text-fuchsia-300">yours</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {t.desc || "Your own template"}
                    </p>
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

        {/* Storage — the device is the database, so show what it is using */}
        {storage && storage.quota > 0 && (
          <section className="mb-card p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <HardDrive className="h-4 w-4 text-cyan-300 shrink-0" />
              <span className="font-medium">On-device storage</span>
              <span className="text-muted-foreground">
                {fmtBytes(storage.used)} of {fmtBytes(storage.quota)} used
              </span>
              <button
                className="ml-auto mb-btn-ghost h-7 text-[11px]"
                title={
                  storage.persisted
                    ? "This origin is marked persistent — the browser won't evict it"
                    : "Ask the browser to keep your media from being evicted"
                }
                onClick={async () => {
                  try {
                    const ok = await navigator.storage?.persist?.();
                    setStorage({ ...storage, persisted: !!ok });
                    toast[ok ? "success" : "info"](
                      ok
                        ? "Persistent storage granted — your media is protected"
                        : "The browser declined; free up space and try again",
                    );
                  } catch {
                    toast.error("This browser can't mark storage persistent");
                  }
                }}
              >
                <ShieldCheck className="h-3 w-3" />{" "}
                {storage.persisted ? "Protected" : "Protect my media"}
              </button>
            </div>
            <div className="mt-2 h-1.5 rounded bg-secondary overflow-hidden">
              <div
                className={`h-full ${storage.used / storage.quota > 0.85 ? "bg-red-400" : "bg-cyan-400"}`}
                style={{
                  width: `${Math.min(100, (storage.used / Math.max(1, storage.quota)) * 100)}%`,
                }}
              />
            </div>
            {storage.used / storage.quota > 0.85 && (
              <p className="text-[11px] text-amber-300 mt-1.5">
                Storage is nearly full — delete unused media or exports below, or export finished
                videos and remove them from the library.
              </p>
            )}
          </section>
        )}

        {/* Projects */}
        <section>
          <SectionTitle
            icon={<Film className="h-4 w-4" />}
            title="Your projects"
            sub="Saved on this device only (IndexedDB). Open, edit, export — fully offline."
          />
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
                      {fmtTime(projectDuration(p))} · {p.main.length} clip
                      {p.main.length === 1 ? "" : "s"} ·{" "}
                      {new Date(p.updatedAt).toLocaleDateString()}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3 mt-4">
            {media.length === 0 && (
              <div className="col-span-full mb-card p-6 text-center text-muted-foreground text-sm">
                Your library is empty. Use <b>Import media</b> — files are stored only on this
                device.
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
                    {m.kind === "video" && m.duration
                      ? fmtTime(m.duration)
                      : m.kind === "audio" && m.duration
                        ? fmtTime(m.duration)
                        : m.kind}{" "}
                    · {fmtBytes(m.size)}
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
            <SectionTitle
              icon={<Download className="h-4 w-4" />}
              title="Your exports"
              sub="Rendered videos saved on this device. Re-download anytime."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {exports.map((e) => (
                <div key={e.id} className="mb-card p-3">
                  <div className="flex items-center gap-3">
                    {e.mime.startsWith("image/") ? (
                      <ImageIcon className="h-6 w-6 text-fuchsia-300 shrink-0" />
                    ) : e.mime.startsWith("audio/") ? (
                      <Music className="h-6 w-6 text-emerald-300 shrink-0" />
                    ) : (
                      <Clapperboard className="h-6 w-6 text-primary shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{e.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtBytes(e.size)} · {new Date(e.createdAt).toLocaleString()} ·{" "}
                        {exportKind(e.name, e.mime)}
                      </div>
                    </div>
                    <button
                      className="mb-btn-ghost text-xs"
                      title="Play / view it here before saving"
                      onClick={() => void togglePreviewExport(e.id)}
                    >
                      <Play className="h-3.5 w-3.5" /> {previewing === e.id ? "Close" : "Preview"}
                    </button>
                    <button
                      className="mb-btn-ghost text-xs"
                      onClick={() => void downloadExport(e.id, e.name, e.mime)}
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void delExport(e.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {previewing === e.id && previewUrl && (
                    <div className="mt-2 rounded overflow-hidden bg-black flex items-center justify-center">
                      {e.mime.startsWith("image/") ? (
                        <img src={previewUrl} alt={e.name} className="max-h-[50vh] w-auto" />
                      ) : e.mime.startsWith("audio/") ? (
                        <audio src={previewUrl} controls className="w-full" />
                      ) : (
                        <video
                          src={previewUrl}
                          controls
                          playsInline
                          className="max-h-[50vh] w-full"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-muted-foreground py-8 space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Pencil className="h-3 w-3" />
            <span>
              AI assistance is <b>optional and off by default</b> — every feature of MayoCut works
              with zero internet, zero accounts, zero servers.
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

      {enhanceFor && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setEnhanceFor(null)}
        >
          <div className="mb-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-amber-300" />
              <h3 className="font-bold text-lg">{enhanceFor.name}</h3>
              <button
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => setEnhanceFor(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              This treatment restyles a copy of one of your projects (your original stays
              untouched). Which project?
            </p>
            <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className="w-full flex items-center gap-2 border border-border rounded-lg p-2 hover:border-cyan-400 text-left"
                  onClick={() => void openEnhanceFrom(enhanceFor, p.id)}
                >
                  <div className="w-14 h-9 bg-slate-900 rounded overflow-hidden shrink-0 flex items-center justify-center">
                    {p.thumb ? (
                      <img src={p.thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {fmtTime(projectDuration(p))} · {p.main.length} clip
                      {p.main.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </button>
              ))}
              {projects.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No projects yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function userTemplatePackNames(tpls: UserTemplate[]): string[] {
  return tpls.filter((t) => t.packName).map((t) => t.packName!);
}

/** Short human label for an export's container/codec. */
function exportKind(name: string, mime: string): string {
  const ext = name.split(".").pop()?.toUpperCase() ?? "FILE";
  if (mime.includes("mp4")) return "MP4 · H.264";
  if (mime.includes("webm")) return "WebM · VP9";
  if (mime === "image/gif") return "GIF · animated";
  if (mime === "image/png") return "PNG · still";
  if (mime.includes("wav")) return "WAV · audio";
  return ext;
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

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      className="bg-black/60 rounded p-1.5 hover:text-destructive"
      title={title}
      onClick={onClick}
    >
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
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="mb-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg">New project</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a format. The project lives only on this device.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 max-h-[46vh] overflow-y-auto pr-1">
          {ASPECT_ORDER.map((id) => {
            const a = ASPECTS[id];
            return (
              <label
                key={id}
                className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer transition-colors ${
                  aspect === id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-muted-foreground/50"
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
                  className="border border-border bg-slate-900 shrink-0"
                  style={{
                    width: Math.max(10, Math.round(26 * Math.min(1, a.w / a.h)) + 8),
                    height: Math.max(10, Math.round(26 * Math.min(1, a.h / a.w)) + 8),
                  }}
                />
                <span className="text-xs leading-tight">
                  {id}
                  <span className="block text-[10px] text-muted-foreground">{a.hint}</span>
                </span>
              </label>
            );
          })}
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
          <button
            className="mb-btn"
            onClick={() => onCreate(aspect, name.trim() || "Untitled project")}
          >
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
    const original = (tpl.project as Project & { __mediaNames?: Record<string, string> })
      .__mediaNames?.[id];
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
    const rid = remap(c.mediaId);
    if (rid) c.mediaId = rid;
    check(c.mediaId);
  }
  for (const tr of p.tracks)
    for (const c of tr.clips) {
      c.mediaId = remap(c.mediaId);
      check(c.mediaId);
    }
  p.missingMedia = missing;
  void used;
  return p;
}
