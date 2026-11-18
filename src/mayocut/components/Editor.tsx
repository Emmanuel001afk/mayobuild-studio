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
  RotateCw,
  Scissors,
  Sparkles,
  SlidersHorizontal,
  Square,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { downloadJson, startMicRecording, templateToPackFile } from "../assist";
import { analyzeMono, denoiseAudio, encodeWavMono } from "../denoise";
import { analyzeAudioBlob, detectBeats } from "../assist";
import { tts } from "../tts";
import { can, device } from "../device";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
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
  { lane: "main"; id: string } | { lane: "overlay"; trackId: string; id: string } | null;

type ExportFmt = "auto" | "mp4" | "webm" | "gif" | "png" | "wav";

const EXPORT_FORMATS: { id: ExportFmt; label: string; need?: "mp4" | null; note?: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "mp4", label: "MP4 · H.264", need: "mp4" },
  { id: "webm", label: "WebM · VP9" },
  { id: "gif", label: "GIF · animated" },
  { id: "png", label: "PNG · this frame" },
  { id: "wav", label: "WAV · audio only" },
];

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

/** Phones get a CapCut-style layout (dominant preview + bottom tab bar);
 *  tablets/desktop keep the three-panel studio.
 *
 *  `(max-height: 500px)` is the auto-rotate fix: a phone turned landscape
 *  often crosses the 768px width breakpoint but only has ~380px of height —
 *  the three-panel desktop layout used to squeeze the preview into a sliver
 *  (or off-screen), leaving only the editing area visible. Short viewports
 *  always get the mobile layout, with a compact timeline/tab bar in landscape.
 */
function useIsMobile() {
  const [m, setM] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px), (max-height: 500px)").matches
      : false,
  );
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px), (max-height: 500px)");
    const fn = (e: MediaQueryListEvent) => setM(e.matches);
    q.addEventListener("change", fn);
    return () => q.removeEventListener("change", fn);
  }, []);
  return m;
}

function useOrientationLandscape() {
  const [l, setL] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(orientation: landscape)").matches : false,
  );
  useEffect(() => {
    const q = window.matchMedia("(orientation: landscape)");
    const fn = (e: MediaQueryListEvent) => setL(e.matches);
    q.addEventListener("change", fn);
    return () => q.removeEventListener("change", fn);
  }, []);
  return l;
}

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
  const devProfile = device(); // memoized; drives export/feature gating
  const [addMode, setAddMode] = useState<"main" | "overlay">("main");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const isMobile = useIsMobile();
  const landscape = useOrientationLandscape();
  // Rotated (landscape) phones: compact the fixed chrome so the preview stays
  // visible instead of being squeezed out by the timeline + tab bar.
  const compact = isMobile && landscape;
  const [sheet, setSheet] = useState<null | "media" | "add" | "tune">(null);
  const [denoise, setDenoise] = useState<{ mediaId: string; progress: number } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [recState, setRecState] = useState<{ active: boolean; secs: number; error?: string }>({
    active: false,
    secs: 0,
  });
  const recRef = useRef<{ stop: () => void } | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
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
        if (p.exportPreset) {
          setExportFps(p.exportPreset.fps);
          setExportKbps(p.exportPreset.kbps);
          setExportRes(p.exportPreset.scale);
        }
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
    // Stabilization: cap the live-preview buffer on weak devices (exports are
    // unaffected — they always render at full quality).
    eng.previewMaxSide = device().limits.previewMaxSide;
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
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        doRedo();
        return;
      }
      if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        doDuplicate();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        eng.toggle();
      } else if (e.key === "s" || e.key === "S") {
        if (doSplit()) toast.success("Split at playhead");
      } else if (e.key === "f" || e.key === "F") {
        doFreeze();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelection();
      } else if (e.key === "ArrowLeft") {
        // Step by the selected export frame rate so frame-accurate review
        // remains aligned with 24/30/60 fps projects.
        eng.seek(eng.t - (e.shiftKey ? 1 : 1 / Math.max(1, exportFps)));
      } else if (e.key === "ArrowRight") {
        eng.seek(eng.t + (e.shiftKey ? 1 : 1 / Math.max(1, exportFps)));
      } else if (e.key === "Home") {
        eng.seek(0);
      } else if (e.key === "End") {
        eng.seek(eng.duration());
      } else if (e.key === "j" || e.key === "J") {
        if (!eng.playing) void eng.play();
      } else if (e.key === "k" || e.key === "K") {
        eng.pause();
      } else if (e.key === "l" || e.key === "L") {
        if (!eng.playing) void eng.play();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, project, exportFps]);

  // ------------------------------------------------------------- mutations

  const pushUndo = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    undoStack.current.push(eng.snapshot());
    if (undoStack.current.length > 80) undoStack.current.shift();
    redoStack.current = []; // a new edit invalidates the redo branch
    setUndoCount(undoStack.current.length);
    setRedoCount(0);
  }, []);

  const doUndo = useCallback(() => {
    const eng = engineRef.current;
    const snap = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!eng || !snap) {
      toast.info("Nothing to undo");
      return;
    }
    redoStack.current.push(eng.snapshot());
    setRedoCount(redoStack.current.length);
    eng.restore(snap);
  }, []);

  const doRedo = useCallback(() => {
    const eng = engineRef.current;
    const snap = redoStack.current.pop();
    setRedoCount(redoStack.current.length);
    if (!eng || !snap) {
      toast.info("Nothing to redo");
      return;
    }
    undoStack.current.push(eng.snapshot());
    setUndoCount(undoStack.current.length);
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

  const doDuplicate = useCallback(() => {
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
  }, [selection, mutateVoid]);

  // ------------------------------------------------------------- drag-to-move
  // Dragging a text/sticker directly on the preview repositions it (the
  // CapCut way). One undo snapshot per drag gesture.
  const onOverlayDragStart = useCallback(
    (clipId: string) => {
      const eng = engineRef.current;
      if (!eng) return;
      const trackId = eng.overlayTrackOf(clipId);
      if (!trackId) return;
      pushUndo();
      setSelection({ lane: "overlay", trackId, id: clipId });
    },
    [pushUndo],
  );

  const onOverlayDragMove = useCallback((clipId: string, x: number, y: number) => {
    engineRef.current?.setOverlayFreePos(clipId, x, y);
  }, []);

  const onOverlayDragEnd = useCallback((moved: boolean) => {
    if (!moved) {
      // plain tap: select only — drop the snapshot so it doesn't fill undo
      undoStack.current.pop();
      setUndoCount(undoStack.current.length);
    }
  }, []);

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

  /**
   * Trim a main clip on the timeline.
   *
   * The old right-edge formula clamped `out` to `in + 0.1` — dragging the
   * right handle collapsed the clip to a tenth of a second. This version
   * clamps to the media length and keeps at least one frame on each side.
   */
  const trimMain = useCallback(
    (id: string, edge: "in" | "out", srcTime: number) => {
      mutateVoid((eng) => {
        const c = eng.project.main.find((x) => x.id === id);
        if (!c) return false;
        const media = eng.getMedia(c.mediaId);
        const len = media?.duration && media.duration > 0 ? media.duration : undefined;
        const MIN = 1 / 30;
        if (edge === "in") {
          const maxIn = c.out - MIN;
          c.in = Math.max(0, Math.min(srcTime, maxIn));
        } else {
          const minOut = c.in + MIN;
          const maxOut = len ?? srcTime;
          c.out = Math.max(minOut, Math.min(srcTime, maxOut));
        }
        if (c.freeze) c.out = Math.max(c.in + 0.2, c.out);
      });
    },
    [mutateVoid],
  );

  // ------------------------------------------------------------- freeze frame

  const doFreeze = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || eng.duration() === 0) {
      toast.info("Add a clip first — nothing to freeze");
      return;
    }
    const ok = mutateVoid((e) => {
      e.freezeAt(e.t, 3);
    });
    if (ok) toast.success("Frozen frame inserted (3 s)");
  }, [mutateVoid]);

  /** Aspect change keeps a single undo step and refreshes the canvas. */
  const setAspect = useCallback(
    (a: AspectId) => {
      mutateVoid((eng) => eng.setAspect(a));
    },
    [mutateVoid],
  );

  /** Colour match: copy this clip's grade to every other main clip. */
  const doMatchColor = useCallback(
    (clipId: string) => {
      const eng = engineRef.current;
      const src = eng?.project.main.find((c) => c.id === clipId);
      if (!src) return;
      const grade = { ...src.adjust };
      const filter = src.filter;
      const lut = src.lut;
      mutateVoid((e) => {
        let n = 0;
        for (const c of e.project.main) {
          if (c.id === clipId) continue;
          c.adjust = { ...grade };
          c.filter = filter;
          c.lut = lut;
          n++;
        }
        if (n === 0) return false;
      });
      toast.success("Color matched across the timeline");
    },
    [mutateVoid],
  );

  /** Beat detection from the timeline toolbar (audio under the playhead). */
  const doDetectBeats = useCallback(
    async (mediaId: string) => {
      const eng = engineRef.current;
      if (!eng) return;
      const audioClips = eng.project.tracks
        .flatMap((tr) => tr.clips)
        .filter((c) => c.kind === "audio" && c.mediaId);
      const target =
        (mediaId && audioClips.find((c) => c.mediaId === mediaId)) ||
        audioClips.find((c) => eng.t >= c.start && eng.t < c.start + c.duration) ||
        audioClips[0];
      if (!target?.mediaId) {
        toast.info("Add an audio clip (music or voiceover) first");
        return;
      }
      const blob = await db.getBlob(target.mediaId);
      if (!blob) {
        toast.error("Audio data isn't on this device");
        return;
      }
      try {
        const { peaks, duration } = await analyzeAudioBlob(blob, 0.04);
        const found = detectBeats(peaks, duration, 24);
        if (found.length < 2) {
          toast.error("No clear rhythm found in that track");
          return;
        }
        // beat times are source-relative: map to timeline via the clip
        const shifted = found.map((b) => b + target.start).filter((b) => b <= eng.duration());
        pushUndo();
        eng.setBeats(shifted);
        toast.success(`${shifted.length} beat markers on the ruler`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Beat analysis failed");
      }
    },
    [pushUndo],
  );

  /** Import a font (.ttf/.otf) — stored on-device, usable in text clips. */
  async function importFont(file: File) {
    try {
      const family = `mc-${file.name.replace(/[^\w]+/g, "-").toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
      const buf = await file.arrayBuffer();
      const face = new FontFace(family, buf);
      await face.load();
      (document.fonts as FontFaceSet).add(face);
      const fonts = [
        ...(project?.fonts ?? []),
        { id: family, family, name: file.name.replace(/\.[a-z0-9]+$/i, "") },
      ];
      await db
        .saveFont?.({ id: family, family, name: file.name, blob: new Blob([buf]) })
        .catch(() => undefined);
      mutateVoid((eng) => {
        eng.project.fonts = fonts;
      });
      toast.success(`Font “${file.name}” imported`);
    } catch (e) {
      toast.error(
        e instanceof Error ? `Could not load that font: ${e.message}` : "Could not load that font",
      );
    }
  }

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
      const res = await denoiseAudio(blob, (d, tot) =>
        setDenoise({ mediaId, progress: tot ? d / tot : 0 }),
      );
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

  // ------------------------------------------------------------- Extract audio (CapCut-style)
  // Pulls a video clip's sound out into an independent clip on the Audio
  // track, then mutes the video clip — same workflow as CapCut's
  // "Extract Audio" (the extracted copy is what you then trim/move/delete).
  async function extractAudioSelected() {
    const eng = engineRef.current;
    const sel = selection;
    if (!eng || !sel || sel.lane !== "main" || extracting) return;
    const clip = eng.project.main.find((c) => c.id === sel.id);
    if (!clip) return;
    const media = eng.getMedia(clip.mediaId);
    if (!media || media.kind !== "video") {
      toast.info("Extract audio works on video clips");
      return;
    }
    if (media.duration != null && media.duration > 15 * 60) {
      toast.error("That source is longer than 15 min — too big to decode on-device");
      return;
    }
    pushUndo();
    setExtracting(true);
    try {
      const res = await eng.extractAudioWav(clip.mediaId, clip.in, clip.out);
      if (!res) {
        toast.error("No audio found in this clip");
        return;
      }
      const wav = encodeWavMono(res.samples, res.sampleRate);
      const id = uid("med");
      const { wave, rms } = analyzeMono(res.samples);
      const span = mainSpans(eng.project).find((x) => x.clip.id === sel.id);
      const at = span ? span.start : Math.max(0, eng.t);
      const item: MediaItem = {
        id,
        name: `Audio: ${media.name}`,
        kind: "audio",
        size: wav.size,
        createdAt: Date.now(),
        duration: res.duration,
        wave,
        rms,
      };
      await db.putMedia(item, wav);
      const all = await db.listMedia();
      setMedia(all);
      eng.setMedia(all);
      eng.attachUrl(id, URL.createObjectURL(wav));
      undoable((e) => {
        e.addAudioClip("t_audio", item, at);
        const c = e.project.main.find((x) => x.id === sel.id);
        if (c) c.muted = true;
      });
      toast.success("Audio extracted to the Audio track — the video clip is now muted");
    } catch (err) {
      toast.error(`Could not extract audio: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExtracting(false);
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
    const bad = items.filter((i) => i.unplayable);
    toast.success(`${items.length} item(s) added`);
    if (bad.length)
      toast.warning(
        `${bad.length} video(s) can't be played on this device (codec — often HEVC camera clips). Their audio + captions still work in the editor.`,
        { duration: 8000 },
      );
  }

  // ------------------------------------------------------------- media delete
  /** Remove a media item from the library (and any clips using it). */
  async function deleteMediaItem(item: MediaItem) {
    const eng = engineRef.current;
    if (!eng) return;
    const used =
      eng.project.main.filter((c) => c.mediaId === item.id).length +
      eng.project.tracks.reduce(
        (a, tr) => a + tr.clips.filter((c) => c.mediaId === item.id).length,
        0,
      );
    const msg = used
      ? `Remove “${item.name}” from the library?\nIt is used by ${used} timeline clip(s) — those will be removed too.`
      : `Remove “${item.name}” from the library?`;
    if (!window.confirm(msg)) return;
    pushUndo();
    const removed = eng.dropMediaRefs(item.id);
    try {
      await db.deleteMedia(item.id);
    } catch {
      /* storage error — the timeline change already happened */
    }
    eng.draw();
    const all = await db.listMedia();
    setMedia(all);
    eng.setMedia(all);
    if (selection) {
      const stillThere =
        selection.lane === "main"
          ? eng.project.main.some((c) => c.id === selection.id)
          : eng.project.tracks.some((tr) => tr.clips.some((c) => c.id === selection.id));
      if (!stillThere) setSelection(null);
    }
    toast.success(used ? `Removed media and ${removed} clip(s)` : "Removed from library");
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
    if (clip) {
      setSelection({ lane: "main", id: clip.id });
      if (eng.project.main.length > 1) {
        toast.success(
          `Added after the last clip — ${eng.project.main.length} clips on the timeline (tap one in Tune to split, mute or move it)`,
        );
      }
    }
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
    setLutList(
      Array.from(map.values()).map((l) => ({ id: l.name, name: l.name, builtin: l.builtin })),
    );
  }, []);
  useEffect(() => {
    void refreshLuts();
  }, [refreshLuts]);
  async function onImportLut(f: File) {
    try {
      const name =
        f.name
          .replace(/\.cube$/i, "")
          .replace(/[^\w-]+/g, "-")
          .toLowerCase() || "custom-lut";
      const t = await importLut(name, f);
      await refreshLuts();
      toast.success(`LUT "${t.name}" imported — pick it in the clip's Color LUT section`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse that .cube file");
    }
  }

  const EMOJI_STICKERS = useMemo(
    () => [
      "🔥",
      "❤️",
      "😂",
      "😮",
      "👀",
      "👏",
      "💯",
      "✨",
      "⚡",
      "🎉",
      "🚀",
      "💰",
      "📈",
      "🏆",
      "🎯",
      "🍿",
      "🥶",
      "😍",
      "🤯",
      "👉",
      "👆",
      "✅",
      "❌",
      "⭐",
      "🌊",
      "🌙",
      "☀️",
      "🎵",
      "🎬",
      "📱",
      "💬",
      "🙌",
      "💪",
      "🧠",
      "👑",
      "🍕",
      "🏖️",
      "🎮",
      "🛹",
      "📸",
    ],
    [],
  );
  const [stickerCategory, setStickerCategory] = useState("All");
  const stickerGroups = useMemo(
    () => [
      { name: "All", items: EMOJI_STICKERS },
      {
        name: "Reactions",
        items: ["🔥", "❤️", "😂", "😮", "👀", "👏", "💯", "🥶", "😍", "🤯", "🙌", "💪"],
      },
      {
        name: "Creator",
        items: [
          "✨",
          "⚡",
          "🎉",
          "🚀",
          "💰",
          "📈",
          "🏆",
          "🎯",
          "🍿",
          "✅",
          "❌",
          "⭐",
          "🎵",
          "🎬",
          "📱",
          "💬",
          "🧠",
          "👑",
          "📸",
        ],
      },
      {
        name: "Lifestyle",
        items: ["👉", "👆", "🌊", "🌙", "☀️", "🍕", "🏖️", "🎮", "🛹"],
      },
    ],
    [EMOJI_STICKERS],
  );
  const visibleStickers =
    stickerGroups.find((group) => group.name === stickerCategory)?.items ?? EMOJI_STICKERS;

  // ------------------------------------------------------------- export

  const canMp4 = mp4Supported();

  async function runExport() {
    const eng = engineRef.current;
    if (!eng || exporting) return;
    if (eng.duration() === 0) {
      toast.error("The timeline is empty — add media first");
      return;
    }
    // Remember the user's export choices on the project (CapCut remembers too).
    eng.project.exportPreset = { fps: exportFps, kbps: exportKbps, scale: exportRes };
    scheduleAutosave();

    const save = async (blob: Blob, baseName: string, ext: string) => {
      const name = `${baseName}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      await db
        .saveExport(
          { id: uid("exp"), name, size: blob.size, createdAt: Date.now(), mime: blob.type },
          blob,
        )
        .catch(() => undefined);
      toast.success(
        `Exported ${fmtBytes(blob.size)} (${ext.toUpperCase()}) — saved to this device`,
      );
    };
    const baseName = eng.project.name.replace(/[^\w\- ]+/g, "").trim() || "mayocut";

    // --- non-video formats -------------------------------------------------
    if (exportFmt === "png" || exportFmt === "wav") {
      setExporting(true);
      setExportProgress(0);
      try {
        if (exportFmt === "png") {
          const blob = await eng.exportStill(ASPECTS[eng.project.aspect].w * exportRes);
          await save(blob, `${baseName}-frame`, "png");
        } else {
          const blob = await eng.exportAudioWav((p) => setExportProgress(p));
          await save(blob, baseName, "wav");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Export failed");
      } finally {
        setExporting(false);
        setShowExport(false);
      }
      return;
    }

    if (exportFmt === "gif") {
      setExporting(true);
      setExportProgress(0);
      try {
        toast.info("GIF renders frame-by-frame — a few seconds per clip length");
        const blob = await eng.exportGIF(
          { fps: Math.min(exportFps, 15), maxSide: exportRes === 2 ? 720 : 480 },
          (p) => setExportProgress(p),
        );
        await save(blob, baseName, "gif");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "GIF export failed");
      } finally {
        setExporting(false);
        setShowExport(false);
      }
      return;
    }

    // --- video formats -----------------------------------------------------
    if (!pickMime() && !canMp4) {
      toast.error("This browser can't record video. Use Chrome or Edge, or the desktop app.");
      return;
    }
    // Respect this device's capability limits — downgrade (with a note) rather
    // than render 4K/60fps that a weak CPU/GPU can't sustain.
    const dev = device();
    let scale: 1 | 2 = exportRes;
    let fps = exportFps;
    if (scale > dev.limits.exportMaxScale) {
      scale = dev.limits.exportMaxScale;
      toast.warning(
        "4K export isn't available on this device — exported at full (1080p-class) instead",
      );
    }
    if (fps > dev.limits.maxExportFps) {
      fps = dev.limits.maxExportFps;
      toast.warning(`This device is capped at ${fps} fps — using that`);
    }
    const wantMp4 = exportFmt === "mp4" || (exportFmt === "auto" && canMp4);
    const opts = {
      fps,
      videoBitsPerSecond: exportKbps * 1000 * (scale === 2 ? 1.75 : 1),
      audioBitsPerSecond: 192_000,
      scale,
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
      await save(blob, baseName, ext);
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
      (tpl.project as Project & { __mediaNames?: Record<string, string> }).__mediaNames = names;
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
    (proj as Project & { __mediaNames?: Record<string, string> }).__mediaNames = names;
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
    downloadJson(
      `${(eng.project.name || "template").replace(/[^\w\- ]+/g, "_")}.mayocut-pack.json`,
      pack,
    );
    toast.success("Template pack exported — share the .json file");
  }

  // ------------------------------------------------------------- selection-derived

  const spans = mainSpans(project ?? EMPTY_PROJECT);
  const dur = project ? projectDuration(project) : 0;
  const selClip: MainClip | OverlayClip | null = (() => {
    const eng = engineRef.current;
    if (!eng || !selection) return null;
    if (selection.lane === "main")
      return eng.project.main.find((c) => c.id === selection.id) ?? null;
    for (const tr of eng.project.tracks) {
      const c = tr.clips.find((x) => x.id === selection.id);
      if (c) return c;
    }
    return null;
  })();

  const { clipStart, local: playheadLocal } = selClip
    ? clipLocal(engineRef.current!, selClip.id)
    : { clipStart: 0, local: null };
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

  // Video at the playhead that this device can't decode (runtime-confirmed
  // or flagged at import) — explain it instead of a mysterious placeholder.
  const brokenAtPlayhead = (() => {
    const eng = engineRef.current;
    if (!eng) return null;
    for (const s of spans) {
      if (t >= s.start && t < s.end) {
        const m = eng.getMedia(s.clip.mediaId);
        if (m?.kind === "video" && (m.unplayable || eng.isVideoBroken(m.id))) return m.name;
        return null;
      }
    }
    return null;
  })();

  // main clips that will export as audio-over-black on this device
  const unplayableMainCount = (project?.main ?? []).filter((c) => {
    const m = media.find((x) => x.id === c.mediaId);
    return m?.kind === "video" && (m.unplayable || engineRef.current?.isVideoBroken(m.id));
  }).length;

  // ------------------------------------------------------------- render

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="mb-card p-8 max-w-sm text-center">
          <Clapperboard className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-semibold">{loadError}</div>
          <button
            className="mb-btn mt-4"
            onClick={onExit ?? (() => window.location.assign("/mayocut"))}
          >
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

  // --------------------------------------------------------- layout pieces
  // Desktop and mobile compose the SAME fragments — on phones the layout is
  // CapCut-style: dominant preview, compact transport, timeline, and a bottom
  // tab bar that opens sheets (Media / Add / Tune). Assist goes full-screen.

  const topbarDesktop = (
    <div className="h-12 border-b border-border flex items-center gap-2 px-3 shrink-0">
      <button
        className="mb-btn-ghost h-8 px-2"
        onClick={onExit ?? (() => window.location.assign("/mayocut"))}
        title="Save & close"
      >
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
        <button
          className="mb-btn-ghost h-8 px-2 text-xs"
          onClick={() => void saveAsTemplate()}
          disabled={savingTemplate}
        >
          <Clapperboard className="h-3.5 w-3.5" /> {savingTemplate ? "Saving…" : "Save as template"}
        </button>
        <button
          className="mb-btn-ghost h-8 px-2 text-xs"
          onClick={exportTemplateJson}
          title="Export this project as a shareable .json template pack"
        >
          <FileJson className="h-3.5 w-3.5" /> Export pack
        </button>
        <button className="mb-btn h-8 px-3 text-sm bg-primary" onClick={() => setShowExport(true)}>
          <Download className="h-4 w-4" /> Export
        </button>
      </div>
    </div>
  );
  const topbarMobile = (
    <div
      className={`shrink-0 border-b border-border flex items-center gap-1.5 px-2 ${compact ? "h-11" : "h-12"}`}
    >
      <button
        className="mb-btn-ghost h-8 w-8 p-0"
        onClick={onExit ?? (() => window.location.assign("/mayocut"))}
        title="Save & close"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <Scissors className="h-4 w-4 text-primary shrink-0" />
      <input
        className="flex-1 min-w-0 bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 text-sm"
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
      <button
        className="mb-btn-ghost h-8 w-8 p-0"
        onClick={() => void saveAsTemplate()}
        disabled={savingTemplate}
        title="Save as template"
      >
        <Clapperboard className="h-4 w-4" />
      </button>
      <button
        className="mb-btn-ghost h-8 w-8 p-0"
        onClick={exportTemplateJson}
        title="Export this project as a shareable .json template pack"
      >
        <FileJson className="h-4 w-4" />
      </button>
      <button
        className="mb-btn h-8 px-3 text-xs bg-primary shrink-0"
        onClick={() => setShowExport(true)}
      >
        <Download className="h-4 w-4" /> Export
      </button>
    </div>
  );
  /** Library card: tap to add to the timeline, × to delete from the library. */
  const mediaCard = (m: MediaItem) => (
    <div key={m.id} className="relative rounded overflow-hidden border border-border group">
      <button
        className="w-full block text-left hover:border-primary"
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
      {m.unplayable && (
        <div
          className="absolute top-1 left-1 text-[9px] leading-tight text-amber-300 bg-black/75 border border-amber-400/30 rounded px-1 max-w-[70%] truncate"
          title="Imported, but this device can't decode this video's codec (audio + captions still work)"
        >
          ⚠ won't play here
        </div>
      )}
      <button
        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 border border-white/25 text-[11px] leading-none text-white/75 hover:text-white hover:border-red-400 flex items-center justify-center"
        title={`Delete ${m.name} from the library`}
        onClick={(e) => {
          e.stopPropagation();
          void deleteMediaItem(m);
        }}
      >
        ×
      </button>
    </div>
  );
  const mediaPanel = (
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
          <div className="text-[10px] text-muted-foreground mb-1">Sticker library</div>
          <div className="flex gap-1 flex-wrap mb-1.5" role="group" aria-label="Sticker categories">
            {stickerGroups.map((group) => (
              <button
                key={group.name}
                className={`px-1.5 py-0.5 rounded text-[10px] ${stickerCategory === group.name ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-slate-700"}`}
                aria-pressed={stickerCategory === group.name}
                onClick={() => setStickerCategory(group.name)}
              >
                {group.name}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 flex-wrap">
            {visibleStickers.map((em) => (
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
      <div
        className={`flex-1 overflow-y-auto p-2 grid gap-2 content-start ${isMobile ? "grid-cols-3" : "grid-cols-2"}`}
      >
        {media.map(mediaCard)}
        {media.length === 0 && (
          <div className="col-span-2 text-[11px] text-muted-foreground text-center py-6">
            Library empty.
            <br />
            Import media to start.
          </div>
        )}
      </div>
    </div>
  );
  const previewArea = (
    <div className="flex-1 min-h-0 flex items-center justify-center bg-black/60 p-2 sm:p-3 relative overflow-hidden">
      <div
        ref={canvasWrapRef}
        className="relative max-h-full max-w-full"
        style={{
          aspectRatio: `${ASPECTS[project.aspect].w} / ${ASPECTS[project.aspect].h}`,
          height: "100%",
        }}
      >
        <EditorCanvas
          engine={engineRef}
          project={project}
          onReady={(c) => engineRef.current?.bind(c)}
          onDragStart={onOverlayDragStart}
          onDragMove={onOverlayDragMove}
          onDragEnd={onOverlayDragEnd}
        />
      </div>
      {brokenAtPlayhead && (
        <div className="absolute bottom-2 inset-x-2 sm:inset-x-8 bg-amber-400/15 border border-amber-400/40 text-amber-200 rounded-lg px-3 py-2 text-[11px] sm:text-xs leading-snug pointer-events-none">
          ⚠ “{brokenAtPlayhead}” can't be decoded on this device (usually an HEVC camera clip). Its{" "}
          <b>audio + captions still work</b> — for the picture, convert it to H.264 (any video
          converter / compressor app) and import it again.
        </div>
      )}
      {spans.length === 0 && project.tracks.every((tr) => tr.clips.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-muted-foreground text-xs sm:text-sm max-w-[92%] bg-black/60 rounded-lg px-4 py-3">
            <Film className="h-8 w-8 mx-auto mb-2 opacity-60" />
            Import media on the left, then click a clip to add it
            <div className="text-xs mt-1 opacity-70">
              or start from a template on the home screen
            </div>
          </div>
        </div>
      )}
    </div>
  );
  const transportDesktop = (
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
      <button
        className="mb-btn-ghost h-7 px-2"
        onClick={doUndo}
        title="Undo (Ctrl+Z)"
        disabled={undoCount === 0}
      >
        <RotateCcw className="h-3.5 w-3.5" />{" "}
        {undoCount > 0 && <span className="text-[10px] text-muted-foreground">{undoCount}</span>}
      </button>
      <button
        className="mb-btn-ghost h-7 px-2"
        onClick={doRedo}
        title="Redo (Ctrl+Shift+Z)"
        disabled={redoCount === 0}
      >
        <RotateCw className="h-3.5 w-3.5" />{" "}
        {redoCount > 0 && <span className="text-[10px] text-muted-foreground">{redoCount}</span>}
      </button>
      <button
        className="mb-btn-ghost h-7 px-2 text-[10px]"
        onClick={doFreeze}
        title="Freeze frame at playhead (F)"
      >
        ❄
      </button>
      <span className="font-mono tabular-nums">
        {fmtTime(t)} <span className="text-muted-foreground">/ {fmtTime(dur)}</span>
      </span>
      {selection && (
        <div className="flex items-center gap-1">
          <button
            className="mb-btn-ghost h-7 px-2 text-[10px]"
            onClick={doSplit}
            title="Split at playhead (S)"
          >
            ✂ Split
          </button>
          <button
            className="mb-btn-ghost h-7 px-2 text-[10px]"
            onClick={doDuplicate}
            title="Duplicate selected clip"
          >
            ⧉ Duplicate
          </button>
          <button
            className="mb-btn-ghost h-7 px-2 text-[10px] text-red-400"
            onClick={deleteSelection}
            title="Delete selected clip (Del)"
          >
            🗑 Delete
          </button>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button
          className="mb-btn-ghost h-7 px-2"
          onClick={() => setPps((v) => Math.max(16, v - 12))}
          title="Zoom out"
        >
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
        <button
          className="mb-btn-ghost h-7 px-2"
          onClick={() => setPps((v) => Math.min(160, v + 12))}
          title="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
  const transportMobile = (
    <div
      className={`shrink-0 border-t border-border flex items-center gap-1 px-2 text-xs ${compact ? "h-9" : "h-10"}`}
    >
      <button className="mb-btn-ghost h-7 px-2.5" onClick={() => engineRef.current?.toggle()}>
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
      <button
        className="mb-btn-ghost h-7 px-2"
        onClick={doUndo}
        title="Undo (Ctrl+Z)"
        disabled={undoCount === 0}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        className="mb-btn-ghost h-7 px-2"
        onClick={doRedo}
        title="Redo"
        disabled={redoCount === 0}
      >
        <RotateCw className="h-3.5 w-3.5" />
      </button>
      <span className="font-mono tabular-nums ml-1">
        {fmtTime(t)} <span className="text-muted-foreground">/ {fmtTime(dur)}</span>
      </span>
      {selection && (
        <div className="flex items-center gap-0.5 ml-1">
          <button
            className="mb-btn-ghost h-7 px-1.5 text-[10px]"
            onClick={doSplit}
            title="Split at playhead"
          >
            ✂
          </button>
          <button
            className="mb-btn-ghost h-7 px-1.5 text-[10px]"
            onClick={doDuplicate}
            title="Duplicate clip"
          >
            ⧉
          </button>
          <button
            className="mb-btn-ghost h-7 px-1.5 text-[10px] text-red-400"
            onClick={deleteSelection}
            title="Delete clip"
          >
            🗑
          </button>
        </div>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          className="mb-btn-ghost h-7 w-7 p-0"
          onClick={() => setPps((v) => Math.max(16, v - 12))}
          title="Zoom out"
        >
          −
        </button>
        <button
          className="mb-btn-ghost h-7 w-7 p-0"
          onClick={() => setPps((v) => Math.min(160, v + 12))}
          title="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
  /** One Inspector instance, shared by the desktop panel and the mobile Tune sheet. */
  const renderInspector = () => (
    <Inspector
      selection={selection}
      clip={selClip}
      project={project}
      media={media}
      denoiseGate={can("denoise")}
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
      onSetAspect={setAspect}
      onReplaceMedia={(clipId, item) =>
        mutateVoid((eng) => {
          eng.replaceMainClipMedia(clipId, item);
        })
      }
      onSplit={doSplit}
      onDuplicate={doDuplicate}
      onDelete={deleteSelection}
      onSeek={(v) => engineRef.current?.seek(v)}
      filters={FILTER_PRESETS}
      luts={lutList}
      onImportLut={(f) => void onImportLut(f)}
      denoise={denoise}
      onDenoise={() => void denoiseSelected()}
      onExtractAudio={() => void extractAudioSelected()}
      extracting={extracting}
      onFreeze={doFreeze}
      onApplyTransitionAll={(kind, dur) =>
        mutateVoid((eng) => {
          eng.setTransitionAll(kind, dur);
        })
      }
      onMatchColor={doMatchColor}
      onSetBackground={(color) =>
        mutateVoid((eng) => {
          eng.project.background = color;
        })
      }
      onPatchProject={(patch) =>
        mutateVoid((eng) => {
          Object.assign(eng.project, patch);
        })
      }
      onSplitAtBeats={() => {
        const n = mutateRet((eng) => eng.splitAtAllBeats());
        if (n) toast.success(`Split at ${n} beat${n === 1 ? "" : "s"}`);
        else toast.info("Detect beats first (timeline toolbar → beats)");
      }}
      onImportFont={(f) => void importFont(f)}
      projectFonts={project.fonts}
    />
  );
  const inspectorPanel = (
    <div className="w-60 md:w-72 border-l border-border shrink-0 overflow-y-auto">
      {renderInspector()}
    </div>
  );
  const bottomBar = (
    <div
      className={`shrink-0 border-t border-border grid grid-cols-4 bg-card/90 backdrop-blur ${compact ? "h-12" : "h-14"}`}
    >
      {(
        [
          { id: "media", icon: Film, label: "Media" },
          { id: "add", icon: Plus, label: "Add" },
          { id: "tune", icon: SlidersHorizontal, label: "Tune" },
          { id: "assist", icon: Sparkles, label: "Assist" },
        ] as const
      ).map((b) => (
        <button
          key={b.id}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] ${
            b.id === "assist" || sheet === b.id ? "text-cyan-300" : "text-muted-foreground"
          }`}
          onClick={() =>
            b.id === "assist" ? setAssistOpen(true) : setSheet(sheet === b.id ? null : b.id)
          }
        >
          <b.icon className="h-5 w-5" />
          {b.label}
        </button>
      ))}
    </div>
  );
  const bottomSheets = (
    <>
      <Drawer open={sheet === "media"} onClose={() => setSheet(null)}>
        <DrawerContent className="max-h-[80dvh]">
          <DrawerHeader className="p-3 pb-2 text-left">
            <DrawerTitle className="text-sm">Media library</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-3 pb-8">
            <div className="p-2 border-b border-border">
              <button
                className="mb-btn w-full h-8 text-xs"
                onClick={() => fileRef.current?.click()}
              >
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
                <div className="text-[10px] text-muted-foreground mb-1">
                  Stickers (emoji, instant)
                </div>
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
            <div
              className={`flex-1 overflow-y-auto p-2 grid gap-2 content-start ${isMobile ? "grid-cols-3" : "grid-cols-2"}`}
            >
              {media.map(mediaCard)}
              {media.length === 0 && (
                <div className="col-span-2 text-[11px] text-muted-foreground text-center py-6">
                  Library empty.
                  <br />
                  Import media to start.
                </div>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
      <Drawer open={sheet === "add"} onClose={() => setSheet(null)}>
        <DrawerContent className="max-h-[80dvh]">
          <DrawerHeader className="p-3 pb-2 text-left">
            <DrawerTitle className="text-sm">Add to the timeline</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-3 pb-8">
            <button className="mb-btn-ghost w-full h-10 text-xs" onClick={addText}>
              <Plus className="h-4 w-4" /> Add text at playhead
            </button>
            <div>
              <div className="text-[10px] text-muted-foreground mb-1.5">
                Stickers (emoji, instant)
              </div>
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_STICKERS.map((em) => (
                  <button
                    key={em}
                    className="h-9 w-9 rounded-lg border border-border hover:border-cyan-400/60 text-lg leading-none"
                    title={`Add ${em}`}
                    onClick={() => addEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Audio: record a voiceover or import a track in <b>Media</b>. Spoken voice
              (text-to-speech) lives in <b>Assist → Voice</b>.
            </p>
          </div>
        </DrawerContent>
      </Drawer>
      <Drawer open={sheet === "tune"} onClose={() => setSheet(null)}>
        <DrawerContent className="max-h-[82dvh]">
          <DrawerHeader className="p-3 pb-2 text-left">
            <DrawerTitle className="text-sm">
              {selection ? "Tune the selected clip" : "Tune"}
            </DrawerTitle>
            <span className="text-[11px] text-muted-foreground font-normal">
              {selection
                ? "Filters, motion, keyframes, text, position and audio."
                : "Tap a clip on the timeline first."}
            </span>
          </DrawerHeader>
          <div className="overflow-y-auto px-3 pb-8">{renderInspector()}</div>
        </DrawerContent>
      </Drawer>
    </>
  );

  return (
    // h-screen is the safe base (100dvh is ignored on older WebViews); modern
    // browsers upgrade to dynamic viewport height so the tab bar stays visible.
    <div className="h-screen supports-[height:100dvh]:h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      {isMobile ? topbarMobile : topbarDesktop}
      {isMobile ? (
        <>
          {previewArea}
          {transportMobile}
          <div className={`border-t border-border shrink-0 ${compact ? "h-28" : "h-44"}`}>
            <Timeline
              project={project}
              pps={pps}
              t={t}
              selection={selection}
              spans={spans}
              onSeek={(v) => engineRef.current?.seek(v)}
              onSelect={(sel) => {
                setSelection(sel);
                if (isMobile) setSheet("tune");
              }}
              onMainTrim={trimMain}
              onMainSpeed={(id, speed) =>
                mutateVoid((eng) => {
                  const c = eng.project.main.find((x) => x.id === id);
                  if (!c) return false;
                  c.speed = speed;
                })
              }
              onMainMove={(id, dir) => mutateVoid((eng) => eng.moveMainClip(id, dir))}
              onMainReorder={(id, idx) => mutateVoid((eng) => eng.reorderMainClip(id, idx))}
              onOverlayPatch={(trackId, clipId, patch) =>
                mutateVoid((eng) => {
                  const tr = eng.project.tracks.find((x) => x.id === trackId);
                  const c = tr?.clips.find((x) => x.id === clipId);
                  if (!c) return false;
                  Object.assign(c, patch);
                })
              }
              onOverlayMoveTrack={(clipId, trackId) =>
                mutateVoid((eng) => {
                  eng.moveOverlayToTrack(clipId, trackId);
                })
              }
              onTrackFlag={(trackId, patch) =>
                mutateVoid((eng) => {
                  eng.setTrackFlag(trackId, patch);
                })
              }
              onZoomChange={setPps}
              onDetectBeats={(mediaId) => void doDetectBeats(mediaId)}
              onClearBeats={() =>
                mutateVoid((eng) => {
                  eng.setBeats([]);
                })
              }
              onSplit={doSplit}
              onDelete={deleteSelection}
              onDeselect={() => setSelection(null)}
              media={media}
            />
          </div>
          {bottomBar}
          {bottomSheets}
        </>
      ) : (
        <div className="flex-1 flex min-h-0">
          {mediaPanel}
          <div className="flex-1 flex flex-col min-w-0">
            {previewArea}
            {transportDesktop}
            <div className="h-56 border-t border-border shrink-0">
              <Timeline
                project={project}
                pps={pps}
                t={t}
                selection={selection}
                spans={spans}
                onSeek={(v) => engineRef.current?.seek(v)}
                onSelect={(sel) => setSelection(sel)}
                onMainTrim={trimMain}
                onMainSpeed={(id, speed) =>
                  mutateVoid((eng) => {
                    const c = eng.project.main.find((x) => x.id === id);
                    if (c) c.speed = speed;
                  })
                }
                onMainMove={(id, dir) => mutateVoid((eng) => eng.moveMainClip(id, dir))}
                onMainReorder={(id, idx) => mutateVoid((eng) => eng.reorderMainClip(id, idx))}
                onOverlayPatch={(trackId, clipId, patch) =>
                  mutateVoid((eng) => {
                    const tr = eng.project.tracks.find((x) => x.id === trackId);
                    const c = tr?.clips.find((x) => x.id === clipId);
                    if (!c) return false;
                    Object.assign(c, patch);
                  })
                }
                onOverlayMoveTrack={(clipId, trackId) =>
                  mutateVoid((eng) => {
                    eng.moveOverlayToTrack(clipId, trackId);
                  })
                }
                onTrackFlag={(trackId, patch) =>
                  mutateVoid((eng) => {
                    eng.setTrackFlag(trackId, patch);
                  })
                }
                onZoomChange={setPps}
                onDetectBeats={(mediaId) => void doDetectBeats(mediaId)}
                onClearBeats={() =>
                  mutateVoid((eng) => {
                    eng.setBeats([]);
                  })
                }
                onSplit={doSplit}
                onDelete={deleteSelection}
                onDeselect={() => setSelection(null)}
                media={media}
              />
            </div>
          </div>
          {inspectorPanel}
        </div>
      )}
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
      {showExport && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !exporting && setShowExport(false)}
        >
          <div className="mb-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-lg">Export video</h3>
              {!exporting && (
                <button
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => setShowExport(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground text-xs mb-1">Format</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {EXPORT_FORMATS.map((f) => {
                    const unsupported = f.need === "mp4" && !canMp4;
                    return (
                      <button
                        key={f.id}
                        className={`text-[11px] border rounded px-2 py-1.5 text-left ${
                          exportFmt === f.id
                            ? "border-cyan-400 bg-cyan-400/10"
                            : "border-border hover:border-white/40"
                        } ${unsupported ? "opacity-50" : ""}`}
                        title={
                          unsupported ? "MP4 needs Chrome/Edge — WebM works everywhere" : f.note
                        }
                        onClick={() => setExportFmt(f.id)}
                      >
                        {f.id === "auto" ? (canMp4 ? "Auto (MP4)" : "Auto (WebM)") : f.label}
                      </button>
                    );
                  })}
                </div>
                {(exportFmt === "gif" || exportFmt === "png" || exportFmt === "wav") && (
                  <p className="text-[10px] text-amber-200/80 mt-1.5 leading-snug">
                    {exportFmt === "gif"
                      ? "GIF: silent, 15 fps, capped at 480–720 px — perfect for chats and sticker packs."
                      : exportFmt === "png"
                        ? "PNG: a still of the current playhead frame (set the frame you want first)."
                        : "WAV: the full audio mix, 16-bit stereo — podcasts, voiceovers, music beds."}
                  </p>
                )}
              </div>
              {exportFmt !== "png" && exportFmt !== "wav" && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-muted-foreground text-xs mb-1">Frame rate</div>
                    <div className="flex gap-1.5">
                      {[24, 30, 60].map((f) => {
                        const off = f > devProfile.limits.maxExportFps;
                        return (
                          <button
                            key={f}
                            className={`text-xs border rounded px-2 py-1 ${exportFps === f ? "border-cyan-400 bg-cyan-400/10" : "border-border"} ${
                              off ? "opacity-40 cursor-not-allowed" : ""
                            }`}
                            title={
                              off
                                ? `This device is capped at ${devProfile.limits.maxExportFps} fps`
                                : undefined
                            }
                            disabled={off}
                            onClick={() => setExportFps(f)}
                          >
                            {f}
                          </button>
                        );
                      })}
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
              )}
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
                      className={`text-xs border rounded px-2 py-1 ${exportRes === 2 ? "border-cyan-400 bg-cyan-400/10" : "border-border"} ${
                        devProfile.limits.exportMaxScale < 2 ? "opacity-40 cursor-not-allowed" : ""
                      }`}
                      title={
                        devProfile.limits.exportMaxScale < 2
                          ? "4K needs more CPU/GPU than this device has — 1080p-class export is enabled"
                          : undefined
                      }
                      disabled={devProfile.limits.exportMaxScale < 2}
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
                  4K uses more battery/heat and needs a decent GPU — the MP4 encoder may fall back
                  to WebM on weak devices.
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
                <Loader2 className={`h-4 w-4 ${dur === 0 ? "animate-spin" : "opacity-0"}`} /> Start
                export
              </button>
            )}
            {unplayableMainCount > 0 && (
              <p className="text-[11px] text-amber-300/90 -mt-1">
                ⚠ {unplayableMainCount} clip(s) can't be decoded on this device — they will be
                exported as audio over a black screen.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-3">
              MP4 (H.264 + Opus) is encoded by the WebCodecs engine — Chrome, Edge and the
              desktop/Android builds. The finished video is saved on this device (downloads + export
              library).
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

/** Canvas host: creates the <canvas>, hands it to the engine, and lets the
 *  user drag text/stickers directly on the preview (CapCut-style). */
function EditorCanvas({
  engine,
  project,
  onReady,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  engine: React.RefObject<Engine | null>;
  project: Project;
  onReady: (c: HTMLCanvasElement) => void;
  onDragStart: (clipId: string) => void;
  onDragMove: (clipId: string, x: number, y: number) => void;
  onDragEnd: (moved: boolean) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  useEffect(() => {
    if (ref.current) onReady(ref.current);
    // rebind when aspect changes
  }, [project.aspect, onReady]);
  return (
    <canvas
      ref={ref}
      className="w-full h-full rounded shadow-2xl touch-none"
      onDoubleClick={() => engine.current?.toggle()}
      onPointerDown={(e) => {
        const eng = engine.current;
        const c = ref.current;
        if (!eng || !c) return;
        const r = c.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * c.width;
        const y = ((e.clientY - r.top) / r.height) * c.height;
        const id = eng.pickOverlayAt(x, y);
        if (id) {
          dragRef.current = { id, moved: false };
          c.setPointerCapture(e.pointerId);
          onDragStart(id);
        }
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        const c = ref.current;
        if (!d || !c) return;
        const r = c.getBoundingClientRect();
        const fx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const fy = ((e.clientY - r.top) / r.height) * 2 - 1;
        d.moved = true;
        onDragMove(d.id, fx, fy);
      }}
      onPointerUp={() => {
        const d = dragRef.current;
        dragRef.current = null;
        if (d) onDragEnd(d.moved);
      }}
      onPointerCancel={() => {
        const d = dragRef.current;
        dragRef.current = null;
        if (d) onDragEnd(d.moved);
      }}
    />
  );
}
