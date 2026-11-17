import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clapperboard,
  Download,
  FileJson,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Music,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Square,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { downloadJson, startMicRecording, templateToPackFile } from "../assist";
import { analyzeMono, denoiseAudio, encodeWavMono } from "../denoise";
import { tts } from "../tts";
import { importLut, loadAllLuts } from "../luts";
import { db } from "../idb";
import { Engine, FILTER_PRESETS, mp4Supported, pickMime } from "../engine";
import {
  ASPECTS,
  mainSpans,
  projectDuration,
  uid,
  type AnimValues,
  type AspectId,
  type MainClip,
  type MediaItem,
  type OverlayClip,
  type Project,
  type UserTemplate,
} from "../types";
import { fmtBytes, fmtTime, importFiles, kindFromMime } from "../utils";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import { Assist } from "./Assist";

export type Selection =
  | { lane: "main"; id: string }
  | { lane: "overlay"; trackId: string; id: string }
  | null;

type ExportFmt = "auto" | "mp4" | "webm";

const EMPTY_PROJECT: Project = {
  id: "",
  name: "",
  aspect: "9:16",
  main: [],
  tracks: [
    { id: "t_text", name: "Text", clips: [] },
    { id: "t_overlay", name: "Overlay", clips: [] },
    { id: "t_audio", name: "Audio", clips: [] },
  ],
  createdAt: 0,
  updatedAt: 0,
};

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
  const [exportFmt, setExportFmt] = useState<ExportFmt>("auto");
  const [exportFps, setExportFps] = useState(30);
  const [exportKbps, setExportKbps] = useState(8000);
  const [exportRes, setExportRes] = useState<1 | 2>(1);
  const [addMode, setAddMode] = useState<"main" | "overlay">("main");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [denoise, setDenoise] = useState<{ mediaId: string; progress: number } | null>(null);
  const [recState, setRecState] = useState<{ active: boolean; secs: number; error?: string }>({ active: false, secs: 0 });
  const recRef = useRef<{ stop: () => void } | null>(null);
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
      const refs = new Set<string>([
        ...project.main.map((c) => c.mediaId),
        ...project.tracks.flatMap((tr) => tr.clips.map((c) => c.mediaId ?? "")),
      ]);
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

  /** Undoable mutation; returns whether it happened. */
  const mutateVoid = useCallback(
    (fn: (eng: Engine) => boolean | void): boolean => {
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

  /** Undoable mutation that returns the created/changed object (null if it didn't happen). */
  const mutateRet = useCallback(
    <T,>(fn: (eng: Engine) => T | false | void): T | null => {
      const eng = engineRef.current;
      if (!eng) return null;
      pushUndo();
      const r = fn(eng);
      if (r === false || r === undefined) undoStack.current.pop();
      eng.draw();
      return r === false || r === undefined ? null : (r as T);
    },
    [pushUndo],
  );

  /** Undoable mutation from the Assist drawer. */
  const undoable = useCallback(
    (fn: (eng: Engine) => void) => {
      const eng = engineRef.current;
      if (!eng) return;
      pushUndo();
      fn(eng);
      eng.draw();
    },
    [pushUndo],
  );

  // The TTS engine keeps a ~15 MB wasm worker alive once loaded — free it whenever the
  // Assist drawer closes so the editor doesn't hold ~230 MB idle.
  useEffect(() => {
    if (!assistOpen) tts.dispose();
  }, [assistOpen]);

  const doSplit = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || eng.duration() === 0) {
      toast.info("Import media first — there is nothing to split");
      return false;
    }
    return mutateVoid((e) => e.splitAt(e.t));
  }, [mutateVoid]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    const ok = mutateVoid((eng) => {
      if (selection.lane === "main") eng.deleteMainClip(selection.id);
      else eng.deleteOverlay(selection.id);
    });
    if (ok) setSelection(null);
  }, [selection, mutateVoid]);

  // ------------------------------------------------------------- keyframes / motion

  const onAnimChange = useCallback(
    (clipId: string, localT: number, patch: Partial<AnimValues>) => {
      const eng = engineRef.current;
      if (!eng) return;
      pushUndo();
      const clip = eng.getClip(clipId);
      if (!clip) {
        undoStack.current.pop();
        return;
      }
      const over = "kind" in clip ? clip : null;
      if (over && (over.kind === "text" || over.kind === "image" || over.kind === "video")) {
        const near = eng.keyframeNear(clipId, localT);
        if (near) {
          eng.updateKeyframeAt(clipId, localT, patch);
        } else {
          const base: Partial<OverlayClip> = {};
          if (patch.x != null) base.x = patch.x;
          if (patch.y != null) base.y = patch.y;
          if (patch.scale != null) base.scale = patch.scale;
          if (patch.rotation != null) base.rot = patch.rotation;
          if (Object.keys(base).length) eng.updateOverlay(clipId, base);
          if (patch.opacity != null) {
            eng.addKeyframe(clipId, localT);
            eng.updateKeyframeAt(clipId, localT, { opacity: patch.opacity });
          }
        }
      } else {
        // main clips have no base motion — a value change is a keyframe
        eng.addKeyframe(clipId, localT);
        eng.updateKeyframeAt(clipId, localT, patch);
      }
      eng.draw();
    },
    [pushUndo],
  );

  const onKeyframeAdd = useCallback(
    (clipId: string) => {
      const eng = engineRef.current;
      if (!eng) return;
      const clip = eng.getClip(clipId);
      if (!clip) return;
      const { clipStart: cs, local: localT } = clipLocal(eng, clipId);
      if (localT == null) {
        toast.info("Put the playhead inside this clip first");
        return;
      }
      pushUndo();
      eng.addKeyframe(clipId, localT);
      eng.draw();
      void cs;
    },
    [pushUndo],
  );

  const onKeyframeDelete = useCallback(
    (clipId: string, at: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      pushUndo();
      eng.deleteKeyframe(clipId, at);
      eng.draw();
    },
    [pushUndo],
  );

  // ------------------------------------------------------------- RNNoise denoise (batch)

  async function denoiseSelected() {
    const eng = engineRef.current;
    if (!eng || !selection || denoise) return;
    let clipMediaId: string | undefined;
    if (selection.lane === "main") {
      const c = eng.project.main.find((x) => x.id === selection.id);
      clipMediaId = c?.mediaId;
    } else {
      const tr = eng.project.tracks.find((x) => x.id === selection.trackId);
      const c = tr?.clips.find((x) => x.id === selection.id);
      if (c && c.kind !== "audio") return;
      clipMediaId = c?.mediaId;
    }
    if (!clipMediaId) return;
    const m = eng.getMedia(clipMediaId);
    if (!m || m.kind !== "audio") {
      toast.info("Denoise works on audio clips");
      return;
    }
    const mediaId = m.id;
    setDenoise({ mediaId, progress: 0 });
    try {
      const blob = await db.getBlob(mediaId);
      if (!blob) throw new Error("media blob not found");
      const res = await denoiseAudio(blob, (d, tot) => setDenoise({ mediaId, progress: tot ? d / tot : 0 }));
      const { wave, rms } = analyzeMono(res.samples);
      const base = m.name.replace(/\.[a-z0-9]{2,5}$/i, "");
      const item: MediaItem = {
        ...m,
        id: uid("med"),
        name: `${base} (denoised)`,
        size: res.wav.size,
        duration: res.duration,
        createdAt: Date.now(),
        denoised: true,
        wave,
        rms,
      };
      await db.putMedia(item, res.wav);
      const all = await db.listMedia();
      setMedia(all);
      eng.setMedia(all);
      eng.attachUrl(item.id, URL.createObjectURL(res.wav));
      const sel = selection;
      undoable((e) => {
        if (sel.lane === "main") {
          const c = e.project.main.find((x) => x.id === sel.id);
          if (c) c.mediaId = item.id;
        } else {
          const tr = e.project.tracks.find((x) => x.id === sel.trackId);
          const c = tr?.clips.find((x) => x.id === sel.id);
          if (c) c.mediaId = item.id;
        }
      });
      toast.success(
        res.speechProb < 0.05
          ? "Denoised — note: little speech was detected in this clip"
          : "Noise reduced (RNNoise, 100% local)",
      );
    } catch (err) {
      toast.error(`Denoise failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDenoise(null);
    }
  }

  // ------------------------------------------------------------- TTS audio (from Assist)

  async function addTtsClip(samples: Float32Array, sampleRate: number, name: string) {
    const eng = engineRef.current;
    if (!eng) return;
    const wav = encodeWavMono(samples, sampleRate);
    const id = uid("med");
    const { wave, rms } = analyzeMono(samples);
    const item: MediaItem = {
      id,
      name: `Voice: ${name}`,
      kind: "audio",
      size: wav.size,
      createdAt: Date.now(),
      duration: samples.length / sampleRate,
      wave,
      rms,
    };
    try {
      await db.putMedia(item, wav);
      const all = await db.listMedia();
      setMedia(all);
      eng.setMedia(all);
      eng.attachUrl(id, URL.createObjectURL(wav));
      const at = Math.max(0, eng.t);
      undoable((e) => {
        e.addAudioClip("t_audio", item, at);
      });
      toast.success("Voice clip added to the Audio track at the playhead");
    } catch (err) {
      toast.error(`Could not save voice clip: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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

  function startRecording() {
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
      setRecState({ active: false, secs: 0 });
      return;
    }
    const handle = startMicRecording(
      (secs) => setRecState({ active: true, secs }),
      async (file, err) => {
        recRef.current = null;
        setRecState({ active: false, secs: 0, error: err });
        if (err) {
          toast.error(err);
          return;
        }
        if (!file) return;
        const items = await importFiles([file]);
        for (let i = 0; i < items.length; i++) await db.putMedia(items[i], file);
        const all = await db.listMedia();
        setMedia(all);
        engineRef.current?.setMedia(all);
        const blob = await db.getBlob(items[0].id);
        if (blob) engineRef.current?.attachUrl(items[0].id, URL.createObjectURL(blob));
        toast.success("Recording added to your library");
      },
    );
    recRef.current = handle;
    setRecState({ active: true, secs: 0 });
  }

  function addMediaToTimeline(item: MediaItem) {
    const eng = engineRef.current;
    if (!eng) return;
    if (item.kind === "audio") {
      const clip = mutateRet((e) => e.addAudioClip("t_audio", item, Math.max(0, e.t)));
      if (clip) setSelection({ lane: "overlay", trackId: "t_audio", id: clip.id });
      return;
    }
    if (addMode === "overlay") {
      if (item.kind === "image" || item.kind === "video") {
        const clip = mutateRet((e) => e.addImageOverlay("t_overlay", item, Math.max(0, e.t)));
        if (clip) setSelection({ lane: "overlay", trackId: "t_overlay", id: clip.id });
        return;
      }
      toast.info("Only images and videos go on the overlay track");
      return;
    }
    const clip = mutateRet((e) => e.addMainClip(item));
    if (clip) setSelection({ lane: "main", id: clip.id });
  }

  function addText() {
    const eng = engineRef.current;
    if (!eng) return;
    const clip = mutateRet((e) => e.addTextClip("t_text", Math.max(0, e.t)));
    if (clip) setSelection({ lane: "overlay", trackId: "t_text", id: clip.id });
  }

  function addEmoji(emoji: string) {
    const clip = mutateRet((e) =>
      e.addTextClip("t_text", Math.max(0, e.t), {
        text: emoji,
        size: 150,
        pos: "mc",
        bg: "",
        anim: "bounce",
      }),
    );
    if (clip) setSelection({ lane: "overlay", trackId: "t_text", id: clip.id });
  }

  // ------------------------------------------------------------- LUTs
  const [lutList, setLutList] = useState<{ id: string; name: string; builtin?: boolean }[]>([]);
  const refreshLuts = useCallback(async () => {
    const map = await loadAllLuts();
    engineRef.current?.setLuts(map);
    setLutList(Array.from(map.values()).map((l) => ({ id: l.name, name: l.name, builtin: l.builtin })));
  }, []);
  useEffect(() => {
    void refreshLuts();
  }, [refreshLuts]);
  async function onImportLut(f: File) {
    try {
      const name = f.name.replace(/\.cube$/i, "").replace(/[^\w\-]+/g, "-").toLowerCase() || "custom-lut";
      const t = await importLut(name, f);
      await refreshLuts();
      toast.success(`LUT "${t.name}" imported — pick it in the clip's Color LUT section`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse that .cube file");
    }
  }

  const EMOJI_STICKERS = useMemo(
    () =>
      [
        "🔥", "❤️", "😂", "😮", "👀", "👏", "💯", "✨", "⚡", "🎉",
        "🚀", "💰", "📈", "🏆", "🎯", "🍿", "🥶", "😍", "🤯", "👉",
        "👆", "✅", "❌", "⭐", "🌊", "🌙", "☀️", "🎵", "🎬", "📱",
        "💬", "🙌", "💪", "🧠", "👑", "🍕", "🏖️", "🎮", "🛹", "📸",
      ],
    [],
  );

  // ------------------------------------------------------------- export

  const canMp4 = mp4Supported();

  async function runExport() {
    const eng = engineRef.current;
    if (!eng || exporting) return;
    if (eng.duration() === 0) {
      toast.error("The timeline is empty — add media first");
      return;
    }
    if (!pickMime() && !canMp4) {
      toast.error("This browser can't record video. Use Chrome or Edge, or the desktop app.");
      return;
    }
    const wantMp4 = exportFmt === "mp4" || (exportFmt === "auto" && canMp4);
    const opts = {
      fps: exportFps,
      videoBitsPerSecond: (exportKbps * 1000) * (exportRes === 2 ? 1.75 : 1),
      audioBitsPerSecond: 192_000,
      scale: exportRes,
    };
    setExporting(true);
    setExportProgress(0);
    try {
      toast.info("Export runs in real time — keep this window open");
      let blob: Blob;
      if (wantMp4 && canMp4) {
        try {
          blob = await eng.exportMP4(opts, (p) => setExportProgress(p));
        } catch (e) {
          console.warn("MP4 failed, falling back to WebM", e);
          toast.warning("MP4 encoder unavailable at this size — exported WebM instead");
          blob = await eng.exportMedia(opts, (p) => setExportProgress(p));
        }
      } else {
        if (exportFmt === "mp4" && !canMp4) toast.warning("MP4 needs Chrome/Edge — exported WebM");
        blob = await eng.exportMedia(opts, (p) => setExportProgress(p));
      }
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const name = `${eng.project.name.replace(/[^\w\- ]+/g, "").trim() || "mayocut"}.${ext}`;
      // download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      // keep a copy in the local export library
      const extItem = { id: uid("exp"), name, size: blob.size, createdAt: Date.now(), mime: blob.type };
      try {
        await db.saveExport(extItem, blob);
      } catch {
        /* storage full — the download already succeeded */
      }
      toast.success(`Exported ${fmtBytes(blob.size)} (${ext.toUpperCase()}) — saved to this device`);
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
      const proj = JSON.parse(JSON.stringify(eng.project));
      const tpl = {
        id: uid("tpl"),
        name,
        desc: "Your own template",
        aspect: eng.project.aspect,
        createdAt: Date.now(),
        kind: "project" as const,
        project: proj,
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

  function exportTemplateJson() {
    const eng = engineRef.current;
    if (!eng) return;
    const proj = JSON.parse(JSON.stringify(eng.project));
    const names: Record<string, string> = {};
    for (const m of media) names[m.id] = m.name;
    (proj as any).__mediaNames = names;
    const tpl: UserTemplate = {
      id: eng.project.id,
      name: eng.project.name,
      desc: "Shared from MayoCut",
      aspect: eng.project.aspect,
      createdAt: Date.now(),
      kind: "project" as const,
      project: proj,
    };
    const pack = templateToPackFile(tpl);
    downloadJson(`${(eng.project.name || "template").replace(/[^\w\- ]+/g, "_")}.mayocut-pack.json`, pack);
    toast.success("Template pack exported — share the .json file");
  }

  // ------------------------------------------------------------- selection-derived

  const spans = mainSpans(project ?? EMPTY_PROJECT);
  const dur = project ? projectDuration(project) : 0;
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

  const { clipStart, local: playheadLocal } = selClip ? clipLocal(engineRef.current!, selClip.id) : { clipStart: 0, local: null };
  const anim: AnimValues =
    selClip && engineRef.current
      ? engineRef.current.animAtPlayhead(selClip, clipStart)
      : { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

  const assistClip = (() => {
    if (!selection || !selClip) return null;
    const oc = "kind" in selClip ? selClip : null;
    return {
      id: selClip.id,
      kind: oc ? oc.kind : "main",
      mediaId: "mediaId" in selClip ? selClip.mediaId : undefined,
    };
  })();

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
        <button
          className="mb-chip hidden lg:flex items-center gap-1 hover:border-primary"
          onClick={() => setAssistOpen(true)}
          title="Assist: on-device tools (beats, loudness, color) + optional local AI"
        >
          <Sparkles className="h-3 w-3" /> Assist
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button className="mb-btn-ghost h-8 px-2 text-xs" onClick={() => void saveAsTemplate()} disabled={savingTemplate}>
            <Clapperboard className="h-3.5 w-3.5" /> {savingTemplate ? "Saving…" : "Save as template"}
          </button>
          <button className="mb-btn-ghost h-8 px-2 text-xs" onClick={exportTemplateJson} title="Export this project as a shareable .json template pack">
            <FileJson className="h-3.5 w-3.5" /> Export pack
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
            <button
              className={`mb-btn-ghost w-full h-7 mt-1 text-[11px] ${recState.active ? "text-red-400 border-red-400/50" : ""}`}
              onClick={startRecording}
              title="Record voiceover or music from the microphone"
            >
              {recState.active ? (
                <span className="flex items-center justify-center gap-1">
                  <Square className="h-3 w-3" /> Stop · {recState.secs}s
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1">
                  <Mic className="h-3 w-3" /> Record audio
                </span>
              )}
            </button>
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
            <div className="mt-2">
              <div className="text-[10px] text-muted-foreground mb-1">Stickers (emoji, instant)</div>
              <div className="flex gap-0.5 flex-wrap">
                {EMOJI_STICKERS.map((em) => (
                  <button
                    key={em}
                    className="h-7 w-7 rounded hover:bg-slate-700 text-base leading-none"
                    title={`Add ${em}`}
                    onClick={() => addEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
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
            {spans.length === 0 && project.tracks.every((tr) => tr.clips.length === 0) && (
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
            <button className="mb-btn-ghost h-7 px-2" onClick={doUndo} title="Undo (Ctrl+Z)">
              <RotateCcw className="h-3.5 w-3.5" /> {undoCount > 0 && <span className="text-[10px] text-muted-foreground">{undoCount}</span>}
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
                mutateVoid((eng) => {
                  const c = eng.project.main.find((x) => x.id === id);
                  if (!c) return false;
                  if (edge === "in") c.in = Math.max(0, Math.min(srcTime, c.out - 0.1));
                  else c.out = Math.min(c.in + 0.1, Math.max(srcTime, c.in + 0.1));
                })
              }
              onMainSpeed={(id, speed) =>
                mutateVoid((eng) => {
                  const c = eng.project.main.find((x) => x.id === id);
                  if (c) c.speed = speed;
                })
              }
              onMainMove={(id, dir) => mutateVoid((eng) => eng.moveMainClip(id, dir))}
              onOverlayPatch={(trackId, clipId, patch) =>
                mutateVoid((eng) => {
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
            t={t}
            clipStart={clipStart}
            playheadLocal={playheadLocal}
            anim={anim}
            onPatchMain={(patch) => {
              if (!selection || selection.lane !== "main") return;
              mutateVoid((eng) => {
                const c = eng.project.main.find((x) => x.id === selection.id);
                if (!c) return false;
                Object.assign(c, patch);
                if (patch.adjust) c.adjust = { ...c.adjust, ...patch.adjust };
              });
            }}
            onPatchOverlay={(trackId, patch) => {
              if (!selection || selection.lane !== "overlay") return;
              mutateVoid((eng) => {
                const tr = eng.project.tracks.find((x) => x.id === trackId);
                const c = tr?.clips.find((x) => x.id === selection.id);
                if (!c) return false;
                Object.assign(c, patch);
              });
            }}
            onAnimChange={onAnimChange}
            onKeyframeAdd={onKeyframeAdd}
            onKeyframeDelete={onKeyframeDelete}
            onSetAspect={(a) => {
              const eng = engineRef.current;
              if (eng) {
                pushUndo();
                eng.setAspect(a);
              }
            }}
            onReplaceMedia={(clipId, item) =>
              mutateVoid((eng) => {
                eng.replaceMainClipMedia(clipId, item);
              })
            }
            onSplit={doSplit}
            onDuplicate={() => {
              if (!selection) return;
              mutateVoid((eng) => {
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
            onSeek={(v) => engineRef.current?.seek(v)}
            filters={FILTER_PRESETS}
            luts={lutList}
            onImportLut={(f) => void onImportLut(f)}
            denoise={denoise}
            onDenoise={() => void denoiseSelected()}
          />
        </div>
      </div>

      {/* assist drawer */}
      {assistOpen && engineRef.current && (
        <Assist
          engine={engineRef.current}
          project={engineRef.current.project}
          media={media}
          onUndoable={undoable}
          onCanvas={() => canvasWrapRef.current?.querySelector("canvas") ?? null}
          onClose={() => setAssistOpen(false)}
          selectedClip={assistClip}
          onAddTts={(audio, name) => void addTtsClip(audio.samples, audio.sampleRate, name)}
        />
      )}

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
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground text-xs mb-1">Format</div>
                <div className="flex gap-1.5">
                  {(
                    [
                      ["auto", canMp4 ? "Auto (MP4 here)" : "Auto (WebM here)"],
                      ["mp4", canMp4 ? "MP4 · H.264" : "MP4 · needs Chrome/Edge"],
                      ["webm", "WebM · VP9"],
                    ] as [ExportFmt, string][]
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      className={`text-xs border rounded px-2 py-1 ${exportFmt === v ? "border-cyan-400 bg-cyan-400/10" : "border-border"}`}
                      onClick={() => setExportFmt(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="text-muted-foreground text-xs mb-1">Frame rate</div>
                  <div className="flex gap-1.5">
                    {[24, 30, 60].map((f) => (
                      <button
                        key={f}
                        className={`text-xs border rounded px-2 py-1 ${exportFps === f ? "border-cyan-400 bg-cyan-400/10" : "border-border"}`}
                        onClick={() => setExportFps(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-muted-foreground text-xs mb-1">Quality</div>
                  <div className="flex gap-1.5">
                    {(
                      [
                        [4000, "4"],
                        [8000, "8"],
                        [16000, "16"],
                      ] as [number, string][]
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        className={`text-xs border rounded px-2 py-1 ${exportKbps === k ? "border-cyan-400 bg-cyan-400/10" : "border-border"}`}
                        onClick={() => setExportKbps(k)}
                      >
                        {label}M
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="text-muted-foreground text-xs mb-1">Resolution</div>
                  <div className="flex gap-1.5">
                    <button
                      className={`text-xs border rounded px-2 py-1 ${exportRes === 1 ? "border-cyan-400 bg-cyan-400/10" : "border-border"}`}
                      onClick={() => setExportRes(1)}
                    >
                      {ASPECTS[project.aspect].w}×{ASPECTS[project.aspect].h}
                    </button>
                    <button
                      className={`text-xs border rounded px-2 py-1 ${exportRes === 2 ? "border-cyan-400 bg-cyan-400/10" : "border-border"}`}
                      onClick={() => setExportRes(2)}
                    >
                      4K · {ASPECTS[project.aspect].w * 2}×{ASPECTS[project.aspect].h * 2}
                    </button>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-muted-foreground text-xs mb-1">Aspect</div>
                  <div className="text-xs leading-6">{project.aspect}</div>
                </div>
              </div>
              {exportRes === 2 && (
                <p className="text-[11px] text-amber-300/90 -mt-1">
                  4K uses more battery/heat and needs a decent GPU — the MP4 encoder may fall back to WebM on weak devices.
                </p>
              )}
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
              MP4 (H.264 + Opus) is encoded by the WebCodecs engine — Chrome, Edge and the desktop/Android builds. The
              finished video is saved on this device (downloads + export library).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Where does the playhead sit relative to a clip? */
function clipLocal(eng: Engine, clipId: string): { clipStart: number; local: number | null } {
  const spans = mainSpans(eng.project);
  const s = spans.find((x) => x.clip.id === clipId);
  if (s) {
    const local = eng.t - s.start;
    return { clipStart: s.start, local: local >= 0 && local <= s.end - s.start ? local : null };
  }
  for (const tr of eng.project.tracks) {
    const c = tr.clips.find((x) => x.id === clipId);
    if (c) {
      const local = eng.t - c.start;
      return { clipStart: c.start, local: local >= 0 && local <= c.duration ? local : null };
    }
  }
  return { clipStart: 0, local: null };
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
