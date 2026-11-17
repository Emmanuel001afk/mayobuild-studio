import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  Plus,
  Scissors,
  Sparkles,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { db } from "../idb";
import { Engine, FILTER_PRESETS, pickMime } from "../engine";
import {
  ASPECTS,
  mainSpans,
  projectDuration,
  uid,
  type AspectId,
  type MainClip,
  type MediaItem,
  type OverlayClip,
  type Project,
} from "../types";
import { fmtBytes, fmtTime, importFiles, kindFromMime } from "../utils";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";

export type Selection =
  | { lane: "main"; id: string }
  | { lane: "overlay"; trackId: string; id: string }
  | null;

export function Editor({
  projectId,
  onExit,
  desktop,
}: {
  projectId: string;
  onExit?: () => void;
  desktop?: boolean;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const engineRef = useRef<Engine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [pps, setPps] = useState(48); // pixels per second (zoom)
  const [loop, setLoop] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [addMode, setAddMode] = useState<"main" | "overlay">("main");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const undoStack = useRef<string[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const autosaveTimer = useRef<number | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------- load

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, m] = await Promise.all([db.getProject(projectId), db.listMedia()]);
        if (!alive) return;
        if (!p) {
          setLoadError("Project not found on this device.");
          return;
        }
        setProject(p);
        setMedia(m);
      } catch (e) {
        console.error(e);
        setLoadError("Could not load project from local storage.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  // ------------------------------------------------------------- engine

  useEffect(() => {
    if (!project) return;
    const eng = new Engine(JSON.parse(JSON.stringify(project)));
    engineRef.current = eng;
    eng.setMedia(media);
    eng.onTime = (v) => setT(v);
    eng.onPlayingChange = (v) => setPlaying(v);
    eng.onVersion = () => {
      setProject({ ...eng.project });
      setMedia((m) => [...m]); // media metadata may have gained durations
      scheduleAutosave();
    };
    // resolve object URLs for referenced media
    (async () => {
      const refs = new Set<string>([...project.main.map((c) => c.mediaId), ...project.tracks.flatMap((tr) => tr.clips.map((c) => c.mediaId ?? ""))]);
      for (const id of refs) {
        const item = media.find((m) => m.id === id);
        if (!item) continue;
        const blob = await db.getBlob(id);
        if (blob) eng.attachUrl(id, URL.createObjectURL(blob));
      }
      setEngineReady(true);
      const canvas = canvasWrapRef.current?.querySelector("canvas");
      if (canvas) eng.bind(canvas);
      eng.draw();
    })();
    return () => {
      eng.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      const eng = engineRef.current;
      if (!eng) return;
      const p = { ...eng.project, updatedAt: Date.now() };
      // thumbnail snapshot (best effort)
      try {
        const canvas = canvasWrapRef.current?.querySelector("canvas");
        if (canvas) {
          const snap = document.createElement("canvas");
          snap.width = 320;
          snap.height = Math.round((320 * canvas.height) / canvas.width);
          snap.getContext("2d")?.drawImage(canvas, 0, 0, snap.width, snap.height);
          p.thumb = snap.toDataURL("image/jpeg", 0.5);
        }
      } catch {
        /* ignore */
      }
      try {
        await db.saveProject(p);
      } catch {
        toast.error("Auto-save failed — storage may be full");
      }
    }, 1200);
  }, []);

  // save + exit
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng) {
        try {
          void db.saveProject({ ...eng.project, updatedAt: Date.now() });
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const eng = engineRef.current;
      if (!eng) return;
      if (e.code === "Space") {
        e.preventDefault();
        eng.toggle();
      } else if (e.key === "s" || e.key === "S") {
        if (doSplit()) toast.success("Split at playhead");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelection();
      } else if (e.key === "ArrowLeft") {
        eng.seek(eng.t - 1 / 30);
      } else if (e.key === "ArrowRight") {
        eng.seek(eng.t + 1 / 30);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        doUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, project]);

  // ------------------------------------------------------------- mutations

  const pushUndo = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    undoStack.current.push(eng.snapshot());
    if (undoStack.current.length > 60) undoStack.current.shift();
    setUndoCount(undoStack.current.length);
  }, []);

  const doUndo = useCallback(() => {
    const eng = engineRef.current;
    const snap = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!eng || !snap) {
      toast.info("Nothing to undo");
      return;
    }
    eng.restore(snap);
  }, []);

  const mutate = useCallback(
    (fn: (eng: Engine) => boolean | void) => {
      const eng = engineRef.current;
      if (!eng) return false;
      pushUndo();
      const r = fn(eng);
      if (r === false) undoStack.current.pop();
      eng.draw();
      return r !== false;
    },
    [pushUndo],
  );

  const doSplit = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || eng.duration() === 0) {
      toast.info("Import media first — there is nothing to split");
      return false;
    }
    const ok = mutate((e) => e.splitAt(e.t));
    return ok;
  }, [mutate]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    const ok = mutate((eng) => {
      if (selection.lane === "main") eng.deleteMainClip(selection.id);
      else eng.deleteOverlay(selection.id);
    });
    if (ok) setSelection(null);
  }, [selection, mutate]);

  // ------------------------------------------------------------- media import (in editor)

  async function onImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    const accepted = Array.from(files).filter((f) => kindFromMime(f.type, f.name));
    if (!accepted.length) {
      toast.error("No supported media files");
      return;
    }
    const items = await importFiles(accepted);
    for (let i = 0; i < items.length; i++) await db.putMedia(items[i], accepted[i]);
    const all = await db.listMedia();
    setMedia(all);
    engineRef.current?.setMedia(all);
    // resolve urls for the new items so they play instantly
    for (const item of items) {
      const blob = await db.getBlob(item.id);
      if (blob) engineRef.current?.attachUrl(item.id, URL.createObjectURL(blob));
    }
    toast.success(`${items.length} item(s) added`);
  }

  function addMediaToTimeline(item: MediaItem) {
    const eng = engineRef.current;
    if (!eng) return;
    if (item.kind === "audio") {
      const clip = mutate((e) => e.addAudioClip("t_audio", item, Math.max(0, e.t)));
      if (clip) setSelection({ lane: "overlay", trackId: "t_audio", id: clip.id });
      return;
    }
    if (addMode === "overlay") {
      if (item.kind !== "image") {
        toast.info("Videos go on the main timeline; pick Timeline mode");
        return;
      }
      const clip = mutate((e) => e.addImageOverlay("t_overlay", item, Math.max(0, e.t)));
      if (clip) setSelection({ lane: "overlay", trackId: "t_overlay", id: clip.id });
      return;
    }
    const clip = mutate((e) => e.addMainClip(item));
    if (clip) setSelection({ lane: "main", id: clip.id });
  }

  function addText() {
    const eng = engineRef.current;
    if (!eng) return;
    const clip = mutate((e) => e.addTextClip("t_text", Math.max(0, e.t)));
    if (clip) setSelection({ lane: "overlay", trackId: "t_text", id: clip.id });
  }

  // ------------------------------------------------------------- export

  async function runExport() {
    const eng = engineRef.current;
    if (!eng || exporting) return;
    if (eng.duration() === 0) {
      toast.error("The timeline is empty — add media first");
      return;
    }
    if (!pickMime()) {
      toast.error("This browser can't record video. Use Chrome or Edge, or the desktop app.");
      return;
    }
    setExporting(true);
    setExportProgress(0);
    const name = `${eng.project.name.replace(/[^\w\- ]+/g, "").trim() || "mayocut"}.webm`;
    try {
      toast.info("Export runs in real time — keep this window open");
      const blob = await eng.exportMedia(
        { fps: 30, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 },
        (p) => setExportProgress(p),
      );
      // download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      // keep a copy in the local export library
      const ext = { id: uid("exp"), name, size: blob.size, createdAt: Date.now(), mime: blob.type };
      try {
        await db.saveExport(ext, blob);
      } catch {
        /* storage full — the download already succeeded */
      }
      toast.success(`Exported ${fmtBytes(blob.size)} — saved to this device`);
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
      setShowExport(false);
    }
  }

  function saveAsTemplate() {
    const eng = engineRef.current;
    if (!eng) return;
    const name = prompt("Template name", eng.project.name);
    if (!name) return;
    setSavingTemplate(true);
    (async () => {
      const tpl = {
        id: uid("tpl"),
        name,
        desc: "Your own template",
        aspect: eng.project.aspect,
        createdAt: Date.now(),
        project: JSON.parse(JSON.stringify(eng.project)),
        thumb: eng.project.thumb,
      };
      // remember original file names so other devices can re-match media
      const names: Record<string, string> = {};
      for (const m of media) names[m.id] = m.name;
      (tpl.project as any).__mediaNames = names;
      await db.saveTemplate(tpl);
      toast.success("Template saved — find it in the template gallery");
    })().finally(() => setSavingTemplate(false));
  }

  // ------------------------------------------------------------- render

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="mb-card p-8 max-w-sm text-center">
          <Clapperboard className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-semibold">{loadError}</div>
          <button className="mb-btn mt-4" onClick={onExit ?? (() => window.location.assign("/mayocut"))}>
            Back to projects
          </button>
        </div>
      </div>
    );
  }
  if (!project || !engineReady) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const spans = mainSpans(project);
  const dur = projectDuration(project);
  const selClip: (MainClip | OverlayClip | null) = (() => {
    const eng = engineRef.current;
    if (!eng || !selection) return null;
    if (selection.lane === "main") return eng.project.main.find((c) => c.id === selection.id) ?? null;
    for (const tr of eng.project.tracks) {
      const c = tr.clips.find((x) => x.id === selection.id);
      if (c) return c;
    }
    return null;
  })();

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* top bar */}
      <div className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0">
        <button className="mb-btn-ghost h-8 px-2" onClick={onExit ?? (() => window.location.assign("/mayocut"))} title="Save & close">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Scissors className="h-4 w-4 text-primary" />
        <input
          className="bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 text-sm w-44 md:w-64"
          value={project.name}
          onChange={(e) => {
            const eng = engineRef.current;
            if (eng) {
              eng.project.name = e.target.value;
              setProject({ ...eng.project });
              scheduleAutosave();
            }
          }}
        />
        <span className="mb-chip hidden md:flex items-center gap-1">
          <WifiOff className="h-3 w-3" /> offline
        </span>
        <span className="mb-chip hidden lg:flex items-center gap-1" title="AI features are optional, off by default, and never block editing">
          <Sparkles className="h-3 w-3" /> AI: optional · off
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button className="mb-btn-ghost h-8 px-2 text-xs" onClick={() => void saveAsTemplate()} disabled={savingTemplate}>
            <Clapperboard className="h-3.5 w-3.5" /> {savingTemplate ? "Saving…" : "Save as template"}
          </button>
          <button className="mb-btn h-8 px-3 text-sm bg-primary" onClick={() => setShowExport(true)}>
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 flex min-h-0">
        {/* media panel */}
        <div className="w-52 md:w-60 border-r border-border flex flex-col shrink-0">
          <div className="p-2 border-b border-border">
            <button className="mb-btn w-full h-8 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Import media
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="video/*,image/*,audio/*"
              className="hidden"
              onChange={(e) => {
                void onImport(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex gap-1 mt-2">
              <button
                className={`flex-1 text-[11px] rounded px-1 py-1 border ${addMode === "main" ? "border-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                onClick={() => setAddMode("main")}
              >
                + clip → timeline
              </button>
              <button
                className={`flex-1 text-[11px] rounded px-1 py-1 border ${addMode === "overlay" ? "border-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                onClick={() => setAddMode("overlay")}
              >
                + sticker → overlay
              </button>
            </div>
            <button className="mb-btn-ghost w-full h-7 mt-1 text-[11px]" onClick={addText}>
              <Plus className="h-3 w-3" /> Add text at playhead
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
            {media.map((m) => (
              <button
                key={m.id}
                className="relative rounded overflow-hidden border border-border hover:border-primary group text-left"
                onClick={() => addMediaToTimeline(m)}
                title={`Add ${m.name} (${fmtBytes(m.size)})`}
              >
                <div className="aspect-video bg-slate-900 flex items-center justify-center">
                  {m.thumb ? (
                    <img src={m.thumb} alt="" className="w-full h-full object-cover" />
                  ) : m.kind === "audio" ? (
                    <Music className="h-4 w-4 text-fuchsia-300" />
                  ) : m.kind === "image" ? (
                    <ImageIcon className="h-4 w-4 text-cyan-300" />
                  ) : (
                    <Film className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="px-1 py-0.5 text-[10px] truncate">{m.name}</div>
              </button>
            ))}
            {media.length === 0 && (
              <div className="col-span-2 text-[11px] text-muted-foreground text-center py-6">
                Library empty.
                <br />
                Import media to start.
              </div>
            )}
          </div>
        </div>

        {/* center: preview + timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* preview */}
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black/60 p-3 relative">
            <div
              ref={canvasWrapRef}
              className="relative max-h-full max-w-full"
              style={{
                aspectRatio: `${ASPECTS[project.aspect].w} / ${ASPECTS[project.aspect].h}`,
                height: "100%",
              }}
            >
              <EditorCanvas engine={engineRef} project={project} onReady={(c) => engineRef.current?.bind(c)} />
            </div>
            {spans.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-muted-foreground text-sm bg-black/50 rounded-lg px-6 py-4">
                  <Film className="h-8 w-8 mx-auto mb-2 opacity-60" />
                  Import media on the left, then click a clip to add it
                  <div className="text-xs mt-1 opacity-70">or start from a template on the home screen</div>
                </div>
              </div>
            )}
          </div>

          {/* transport */}
          <div className="h-10 border-t border-border flex items-center gap-2 px-3 text-xs shrink-0">
            <button className="mb-btn-ghost h-7 px-3" onClick={() => engineRef.current?.toggle()}>
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              className={`mb-btn-ghost h-7 px-2 ${loop ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => {
                const v = !loop;
                setLoop(v);
                if (engineRef.current) engineRef.current.loop = v;
              }}
              title="Loop"
            >
              ⟳
            </button>
            <span className="font-mono tabular-nums">
              {fmtTime(t)} <span className="text-muted-foreground">/ {fmtTime(dur)}</span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button className="mb-btn-ghost h-7 px-2" onClick={() => setPps((v) => Math.max(16, v - 12))} title="Zoom out">
                −
              </button>
              <input
                type="range"
                min={16}
                max={160}
                step={4}
                value={pps}
                onChange={(e) => setPps(Number(e.target.value))}
                className="w-28 accent-cyan-400"
                title="Timeline zoom"
              />
              <button className="mb-btn-ghost h-7 px-2" onClick={() => setPps((v) => Math.min(160, v + 12))} title="Zoom in">
                +
              </button>
            </div>
          </div>

          {/* timeline */}
          <div className="h-56 border-t border-border shrink-0">
            <Timeline
              project={project}
              pps={pps}
              t={t}
              selection={selection}
              spans={spans}
              onSeek={(v) => engineRef.current?.seek(v)}
              onSelect={setSelection}
              onMainTrim={(id, edge, srcTime) =>
                mutate((eng) => {
                  const c = eng.project.main.find((x) => x.id === id);
                  if (!c) return false;
                  if (edge === "in") c.in = Math.max(0, Math.min(srcTime, c.out - 0.1));
                  else c.out = Math.min(c.in + 0.1, Math.max(srcTime, c.in + 0.1));
                })
              }
              onMainSpeed={(id, speed) =>
                mutate((eng) => {
                  const c = eng.project.main.find((x) => x.id === id);
                  if (c) c.speed = speed;
                })
              }
              onMainMove={(id, dir) => mutate((eng) => eng.moveMainClip(id, dir))}
              onOverlayPatch={(trackId, clipId, patch) =>
                mutate((eng) => {
                  const tr = eng.project.tracks.find((x) => x.id === trackId);
                  const c = tr?.clips.find((x) => x.id === clipId);
                  if (!c) return false;
                  Object.assign(c, patch);
                })
              }
              onSplit={doSplit}
              onDelete={deleteSelection}
              onDeselect={() => setSelection(null)}
              media={media}
            />
          </div>
        </div>

        {/* inspector */}
        <div className="w-60 md:w-72 border-l border-border shrink-0 overflow-y-auto">
          <Inspector
            selection={selection}
            clip={selClip}
            project={project}
            media={media}
            onPatchMain={(patch) => {
              if (!selection || selection.lane !== "main") return;
              mutate((eng) => {
                const c = eng.project.main.find((x) => x.id === selection.id);
                if (!c) return false;
                Object.assign(c, patch);
                if (patch.adjust) c.adjust = { ...c.adjust, ...patch.adjust };
              });
            }}
            onPatchOverlay={(trackId, patch) => {
              if (!selection || selection.lane !== "overlay") return;
              mutate((eng) => {
                const tr = eng.project.tracks.find((x) => x.id === trackId);
                const c = tr?.clips.find((x) => x.id === selection.id);
                if (!c) return false;
                Object.assign(c, patch);
              });
            }}
            onSetAspect={(a) => {
              const eng = engineRef.current;
              if (eng) {
                pushUndo();
                eng.setAspect(a);
              }
            }}
            onReplaceMedia={(clipId, item) =>
              mutate((eng) => {
                eng.replaceMainClipMedia(clipId, item);
              })
            }
            onSplit={doSplit}
            onDuplicate={() => {
              if (!selection) return;
              mutate((eng) => {
                if (selection.lane === "main") {
                  eng.duplicateMainClip(selection.id);
                } else {
                  const tr = eng.project.tracks.find((x) => x.id === selection.trackId);
                  const c = tr?.clips.find((x) => x.id === selection.id);
                  if (c) tr!.clips.push({ ...c, id: uid("dup"), start: c.start + c.duration * 0.5 });
                }
              });
            }}
            onDelete={deleteSelection}
            filters={FILTER_PRESETS}
          />
        </div>
      </div>

      {/* export dialog */}
      {showExport && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !exporting && setShowExport(false)}>
          <div className="mb-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-lg">Export video</h3>
              {!exporting && (
                <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setShowExport(false)}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <Row k="Format" v="WebM (VP9/Opus) — plays everywhere, built 100% on this device" />
              <Row k="Resolution" v={`${ASPECTS[project.aspect].w}×${ASPECTS[project.aspect].h} (${project.aspect})`} />
              <Row k="Length" v={fmtTime(dur)} />
              <Row k="Speed" v="Real-time render — keep this window open" />
            </div>
            {exporting ? (
              <div className="mt-5">
                <div className="h-2 bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-all"
                    style={{ width: `${Math.round(exportProgress * 100)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-2 text-center">
                  Rendering… {Math.round(exportProgress * 100)}%
                </div>
              </div>
            ) : (
              <button className="mb-btn w-full mt-5" onClick={() => void runExport()}>
                <Loader2 className={`h-4 w-4 ${dur === 0 ? "animate-spin" : "opacity-0"}`} /> Start export
              </button>
            )}
            <p className="text-[11px] text-muted-foreground mt-3">
              The finished video is saved to this device (downloads + MayoCut export library). MP4 export ships with the
              desktop & Android builds.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 text-muted-foreground shrink-0">{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** Canvas host: creates the <canvas> and hands it to the engine. */
function EditorCanvas({
  engine,
  project,
  onReady,
}: {
  engine: React.RefObject<Engine | null>;
  project: Project;
  onReady: (c: HTMLCanvasElement) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) onReady(ref.current);
    // rebind when aspect changes
  }, [project.aspect, onReady]);
  return (
    <canvas
      ref={ref}
      className="w-full h-full rounded shadow-2xl"
      onDoubleClick={() => engine.current?.toggle()}
    />
  );
}
