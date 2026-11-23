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
  Maximize2,
  Minimize2,
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
import { analyzeMono, denoiseAudio, encodeWavChannels, encodeWavMono } from "../denoise";
import { analyzeAudioBlob, detectBeats } from "../assist";
import { tts } from "../tts";
import { can, device } from "../device";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { importLut, loadAllLuts } from "../luts";
import { db, requestPersistentStorage } from "../idb";
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  describeWriteFailure,
  shouldAutosave,
} from "../persistence";
import { buildProxy, canBuildProxy } from "../proxy-build";
import {
  searchEmoji,
  searchStock,
  STOCK_ASSETS,
  stockById,
  stockImageBlob,
  stockThumb,
  stockVideoBlob,
} from "../stock";
import { AUDIO_FX, type AudioFxId } from "../audio-fx";
import {
  patchFor,
  STICKER_CATEGORIES,
  type StickerAsset,
  type StickerCategory,
} from "../sticker-kinds";
import { ANIMATED_STICKER_IDS, searchStickers, stickersIn } from "../stickers";
import { Engine, FILTER_PRESETS, exportBlocker, mp4Supported, pickMime } from "../engine";
import {
  ASPECTS,
  DEFAULT_ADJUST,
  EFFECTS,
  TEXT_PRESETS,
  TRANSITIONS,
  mainSpans,
  projectDuration,
  uid,
  type AnimValues,
  type FilterAdjust,
  type AspectId,
  type EffectId,
  type MainClip,
  type MediaItem,
  type OverlayClip,
  type Project,
  type UserTemplate,
  type TransitionKind,
} from "../types";
import { fmtBytes, fmtTime, importFiles, kindFromMime } from "../utils";
import { findSharedSourceConflicts, makeRenderPlan } from "../timeline";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import { Assist } from "./Assist";
import { EffectPreview, FilterPreview, Library, TransitionPreview } from "./Library";

const MEDIA_ACCEPT =
  "video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.3gp,.3g2,.flv,.ts,.mts,.m2ts,.mpg,.mpeg,.wmv,.vob,.ogv,image/*,.bmp,.heic,.heif,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac";
const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac";

export type Selection =
  { lane: "main"; id: string } | { lane: "overlay"; trackId: string; id: string } | null;

type ExportFmt = "auto" | "mp4" | "webm" | "gif" | "png" | "wav";

type NativeExportBridge = {
  nativeStatus: () => Promise<{ available: boolean; bundled: boolean }>;
  nativeCheckProject: (project: Project) => Promise<{ supported: boolean; reason?: string }>;
  nativeExport: (payload: {
    project: Project;
    name: string;
    options: { width: number; height: number; fps: number; kbps: number };
    sources: { id: string; data: Uint8Array }[];
  }) => Promise<{ canceled: boolean; size?: number }>;
};
function nativeExportBridge(): NativeExportBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { mayocut?: Partial<NativeExportBridge> }).mayocut;
  return bridge?.nativeStatus && bridge.nativeCheckProject && bridge.nativeExport
    ? (bridge as NativeExportBridge)
    : null;
}

const EXPORT_FORMATS: { id: ExportFmt; label: string; need?: "mp4" | null; note?: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "mp4", label: "MP4 · H.264 + AAC", need: "mp4" },
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
/**
 * Stock thumbnails, cached.
 *
 * Each one is a real canvas render of the asset, so recomputing it on every
 * render of the media panel would burn a phone's battery for nothing.
 */
const stockThumbMemo = new Map<string, string>();
function stockThumbData(id: string): string {
  const hit = stockThumbMemo.get(id);
  if (hit !== undefined) return hit;
  const asset = STOCK_ASSETS.find((a) => a.id === id);
  const url = asset ? stockThumb(asset, 112) : "";
  stockThumbMemo.set(id, url);
  return url;
}

/**
 * Build preview proxies for freshly imported footage, one at a time, off the
 * interactive path.
 *
 * Photograph-quality phone footage (4K, high bitrate) is the main cause of a
 * laggy scrub, so it is worth a background re-encode — but never at the cost of
 * the import itself. Each proxy is stored beside its original and only ever
 * used for preview; exports re-point at the original first.
 */
function queueProxyBuilds(
  items: {
    id: string;
    kind: string;
    width?: number;
    height?: number;
    duration?: number;
    size?: number;
  }[],
  onBuilt?: (mediaId: string, proxy: Blob) => void,
) {
  if (!canBuildProxy() || !items.length) return;
  void (async () => {
    for (const item of items) {
      try {
        if (await db.getProxy(item.id)) continue; // already built
        const blob = await db.getBlob(item.id);
        if (!blob) continue;
        const built = await buildProxy(blob, item);
        if (!built) continue;
        await db.putProxy(item.id, built.blob);
        onBuilt?.(item.id, built.blob);
      } catch {
        /* a proxy is an optimisation; never surface its failure */
      }
    }
  })();
}

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
  const [buffering, setBuffering] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [pps, setPps] = useState(48); // pixels per second (zoom)
  const [loop, setLoop] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [nativeExportSelected, setNativeExportSelected] = useState(false);
  const [nativeExportInfo, setNativeExportInfo] = useState<{
    available: boolean;
    supported: boolean;
    bundled?: boolean;
    reason?: string;
  } | null>(null);
  const [exportFmt, setExportFmt] = useState<ExportFmt>("auto");
  const [exportFps, setExportFps] = useState(30);
  const [exportKbps, setExportKbps] = useState(8000);
  const [exportRes, setExportRes] = useState<1 | 2>(1);
  // Measured render speed for THIS device, so the export dialog can show an
  // honest time estimate before a long render starts.
  const [exportPlan, setExportPlan] = useState<ReturnType<Engine["planExport"]> | null>(null);
  const [planning, setPlanning] = useState(false);
  // which built-in stock asset is being generated right now (null = idle)
  const [stockBusy, setStockBusy] = useState<string | null>(null);
  const [previewQuality, setPreviewQuality] = useState<"auto" | "540" | "720" | "1080">("auto");
  const devProfile = device(); // memoized; drives export/feature gating
  const [addMode, setAddMode] = useState<"main" | "overlay">("main");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistInitialTab, setAssistInitialTab] = useState<
    "tools" | "ai" | "cloud" | "captions" | "voice"
  >("tools");
  const isMobile = useIsMobile();
  const landscape = useOrientationLandscape();
  // Rotated (landscape) phones: compact the fixed chrome so the preview stays
  // visible instead of being squeezed out by the timeline + tab bar.
  const compact = isMobile && landscape;
  const [sheet, setSheet] = useState<null | "media" | "tune">(null);
  const [workspaceTab, setWorkspaceTab] = useState<
    | "media"
    | "audio"
    | "text"
    | "stickers"
    | "effects"
    | "filters"
    | "transitions"
    | "adjust"
    | "captions"
    | "ai"
  >("media");
  /** Inspector tab: CapCut splits clip properties into Video / Audio / Speed / Animation. */
  const [inspectorTab, setInspectorTab] = useState<string>("video");
  const inspectorBodyRef = useRef<HTMLDivElement>(null);
  const [denoise, setDenoise] = useState<{ mediaId: string; progress: number } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
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
  /** first un-saved edit, or null when everything is on disk */
  const dirtySince = useRef<number | null>(null);
  const lastWriteAt = useRef(0);
  const lastEditAt = useRef(0);
  const saveInFlight = useRef(false);
  /** serialised failure banner, so a broken store is visible, not guessed at */
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  /** playback rate for the transport (1 = real time); audit-friendly preview */
  const [rate, setRate] = useState(1);
  /** step field: the frame grid the arrow keys move on */
  const [stepFps, setStepFps] = useState(30);
  /** in/out marks for a loop region (seconds); null = loop the whole timeline */
  const [loopRegion, setLoopRegion] = useState<{ a: number; b: number } | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  // Expanded preview: hide the side panels so the picture gets the whole
  // window. Playback, scrubbing and overlay dragging all keep working because
  // the canvas element itself is not remounted — only the surrounding chrome
  // is hidden.
  const [stageMax, setStageMax] = useState(false);

  // ------------------------------------------------------------- load

  useEffect(() => {
    let alive = true;
    // Ask for durable storage before importing anything, so a large clip is
    // not silently evicted the next time the app is closed.
    void requestPersistentStorage();
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

  // The desktop bridge is absent in browsers and Android. Check availability
  // and the complete project before offering the restricted native renderer.
  useEffect(() => {
    const bridge = nativeExportBridge();
    if (!showExport || !project || !bridge) return;
    let alive = true;
    setNativeExportInfo(null);
    void Promise.all([bridge.nativeStatus(), bridge.nativeCheckProject(project)])
      .then(([status, check]) => {
        if (alive) {
          setNativeExportInfo({
            available: status.available,
            bundled: status.bundled,
            supported: check.supported,
            reason: check.reason,
          });
          if (!status.available || !check.supported) setNativeExportSelected(false);
        }
      })
      .catch(() => {
        if (alive) setNativeExportInfo({ available: false, supported: false });
      });
    return () => {
      alive = false;
    };
  }, [showExport, project]);

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
    eng.onBufferingChange = (v) => setBuffering(v);
    eng.onVersion = () => {
      setProject({ ...eng.project });
      setMedia((m) => [...m]); // media metadata may have gained durations
      scheduleAutosave();
    };
    // resolve object URLs for referenced media
    let alive = true;
    (async () => {
      const refs = new Set<string>([
        ...project.main.map((c) => c.mediaId),
        ...project.tracks.flatMap((tr) => tr.clips.map((c) => c.mediaId ?? "")),
      ]);
      for (const id of refs) {
        const item = media.find((m) => m.id === id);
        if (!item) continue;
        const blob = await db.getBlob(id);
        if (!alive) return;
        if (!blob) continue;
        eng.attachUrl(id, URL.createObjectURL(blob));
        const proxy = await db.getProxy(id);
        if (!alive) return;
        if (proxy) eng.attachProxy(id, URL.createObjectURL(proxy));
      }
      if (!alive) return;
      setEngineReady(true);
      const canvas = canvasWrapRef.current?.querySelector("canvas");
      if (canvas) eng.bind(canvas);
      eng.draw();
    })();
    return () => {
      alive = false;
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      eng.destroy();
      if (engineRef.current === eng) engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const deviceCap = devProfile.limits.previewMaxSide;
    const requested = previewQuality === "auto" ? deviceCap : Number(previewQuality);
    eng.previewMaxSide =
      previewQuality === "auto" || deviceCap <= 0 ? requested : Math.min(deviceCap, requested);
    eng.draw();
  }, [previewQuality, devProfile.limits.previewMaxSide]);

  /**
   * Write the project to disk, and REPORT whether it actually landed.
   *
   * The previous version fired a debounced write and a toast on failure, but
   * nothing verified the result and the debounce was reset by every edit — so a
   * continuous edit session (or a tab closed within 1.2 s) wrote nothing at all.
   */
  const flushSave = useCallback(async (): Promise<boolean> => {
    const eng = engineRef.current;
    if (!eng || saveInFlight.current) return false;
    saveInFlight.current = true;
    try {
      const p = { ...eng.project, updatedAt: Date.now() };
      // thumbnail snapshot (best effort — never let it block the save)
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
      await db.saveProject(p);
      // Read nothing back here: the transaction resolving IS the confirmation.
      // What matters is that we waited for it instead of assuming.
      dirtySince.current = null;
      lastWriteAt.current = Date.now();
      setSaveProblem(null);
      return true;
    } catch (error) {
      const f = describeWriteFailure(error);
      console.error("MayoCut could not save the project", f.detail);
      // Latch the banner on rather than firing a toast per attempt: a full disk
      // fails on every keystroke, and a toast storm hides the one message that
      // matters.
      setSaveProblem(f.advice);
      return false;
    } finally {
      saveInFlight.current = false;
    }
  }, []);

  // The transport's own settings are engine state, not React state: the play
  // loop reads them every frame, so pushing them in an effect keeps the two in
  // step without a render per frame.
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.playbackRate = rate;
    eng.loopRegion = loopRegion;
  }, [rate, loopRegion, engineReady]);

  const scheduleAutosave = useCallback(() => {
    const now = Date.now();
    if (dirtySince.current === null) dirtySince.current = now;
    lastEditAt.current = now;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    // Debounce normally, but never wait longer than AUTOSAVE_MAX_WAIT_MS past
    // the first un-saved edit — a long drag must still reach the disk.
    const waited = now - (dirtySince.current ?? now);
    const delay = Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS - waited));
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = null;
      if (shouldAutosave(Date.now(), dirtySince.current, lastEditAt.current, lastWriteAt.current))
        void flushSave();
    }, delay);
  }, [flushSave]);

  // Anything that can end the session gets a last, synchronous-ish write. React
  // effect cleanup does NOT run when a phone kills a backgrounded tab, which is
  // precisely the case where work was disappearing.
  useEffect(() => {
    const flush = () => {
      if (dirtySince.current === null) return;
      // Not awaited: the page may be going away. The write is still queued in
      // IndexedDB, which is allowed to complete after `pagehide`.
      void flushSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushSave]);

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
      } else if (e.key === "j" || e.key === "J") {
        // J/K/L, the convention every editor and NLE shares: J plays backwards
        // (nearest thing here is a faster reverse scrub), K pauses, L plays.
        setRate((r) => Math.max(0.25, r / 2));
        if (!eng.playing) void eng.play();
      } else if (e.key === "k" || e.key === "K") {
        if (eng.playing) eng.pause();
      } else if (e.key === "l" || e.key === "L") {
        setRate((r) => Math.min(4, r * 2));
        if (!eng.playing) void eng.play();
      } else if (e.key === "i" || e.key === "I") {
        setLoopRegion((r) => ({ a: eng.t, b: r?.b ?? eng.duration() }));
        toast.success("Loop in set");
      } else if (e.key === "o" || e.key === "O") {
        setLoopRegion((r) => ({ a: r?.a ?? 0, b: eng.t }));
        toast.success("Loop out set");
      } else if (e.key === "s" || e.key === "S") {
        if (doSplit()) toast.success("Split at playhead");
      } else if (e.key === "f" || e.key === "F") {
        doFreeze();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelection();
      } else if (e.key === "ArrowLeft") {
        // One frame on the project's frame grid; Shift = one second. The grid is
        // explicit so a 24 fps project does not step in 30ths.
        eng.seek(eng.t - (e.shiftKey ? 1 : 1 / Math.max(1, stepFps)));
      } else if (e.key === "ArrowRight") {
        eng.seek(eng.t + (e.shiftKey ? 1 : 1 / Math.max(1, stepFps)));
      } else if (e.key === "Escape") {
        setStageMax(false);
      } else if (e.key === "Home") {
        eng.seek(0);
      } else if (e.key === "End") {
        eng.seek(eng.duration());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, project, exportFps, stepFps]);

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
      if (r === false) {
        undoStack.current.pop();
        setUndoCount(undoStack.current.length);
      } else eng.commitChange();
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
      if (r === false || r === undefined) {
        undoStack.current.pop();
        setUndoCount(undoStack.current.length);
      } else eng.commitChange();
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
      eng.commitChange();
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
    const ok = mutateVoid((e) => e.splitAt(e.t));
    if (!ok)
      toast.info(
        "Place the playhead inside a clip. Freeze frames and variable-speed clips cannot be split yet.",
      );
    return ok;
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

  // Selecting a clip outside the playhead should show the clip being edited,
  // so a filter, effect or sticker adjustment is immediately visible.
  const selectTimelineClip = useCallback((sel: Selection) => {
    setSelection(sel);
    const eng = engineRef.current;
    if (!eng || !sel) return;
    const span =
      sel.lane === "main"
        ? mainSpans(eng.project).find((s) => s.clip.id === sel.id)
        : (() => {
            const clip = eng.project.tracks
              .find((tr) => tr.id === sel.trackId)
              ?.clips.find((c) => c.id === sel.id);
            return clip ? { start: clip.start, end: clip.start + clip.duration } : undefined;
          })();
    if (span && (eng.t < span.start || eng.t >= span.end)) eng.seek(span.start);
  }, []);

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
    const ok = mutateVoid((e) => e.freezeAt(e.t, 3) !== false);
    if (ok) toast.success("Frozen frame inserted (3 s)");
    else toast.info("Place the playhead inside a normal-speed video clip to freeze a frame.");
  }, [mutateVoid]);

  /**
   * Flip the project between landscape and portrait, carrying the framing with
   * it. The clip positions are rotated rather than dropped, so nothing the user
   * placed ends up off-canvas.
   */
  const rotateProject = useCallback(
    (dir: "cw" | "ccw") => {
      mutateVoid((eng) => {
        const to = eng.rotateOrientation(dir);
        toast.success(`Turned ${dir === "cw" ? "right" : "left"} — now ${to}`);
      });
    },
    [mutateVoid],
  );

  /**
   * Generate a built-in stock asset and drop it on the overlay track.
   *
   * Shared by the library grid and the sticker search so the two can never
   * behave differently — the project is saved, the media is stored, and the
   * engine is told about it in exactly one place.
   */
  const addStockAsset = useCallback(
    (assetId: string) => {
      const asset = stockById(assetId);
      if (!asset) return;
      setStockBusy(assetId);
      void (async () => {
        try {
          const blob =
            asset.kind === "video" ? await stockVideoBlob(asset) : await stockImageBlob(asset);
          if (!blob) {
            toast.error(
              asset.kind === "video"
                ? "This device can't record a generated clip — the still assets still work."
                : "Could not generate that asset on this device.",
            );
            return;
          }
          const file = new File([blob], `${asset.id}.${asset.kind === "video" ? "webm" : "png"}`, {
            type: blob.type || (asset.kind === "video" ? "video/webm" : "image/png"),
          });
          const [item] = await importFiles([file]);
          if (!item) return;
          await db.putMedia(item, file);
          const all = await db.listMedia();
          setMedia(all);
          engineRef.current?.setMedia(all);
          const stored = await db.getBlob(item.id);
          if (stored) engineRef.current?.attachUrl(item.id, URL.createObjectURL(stored));
          const fresh = all.find((m) => m.id === item.id) ?? item;
          mutateRet((e) => e.addImageOverlay("t_overlay", fresh, Math.max(0, e.t)));
          toast.success(`${asset.name} added to the overlay track`);
        } catch (e) {
          console.error(e);
          toast.error("Could not generate that asset on this device.");
        } finally {
          setStockBusy(null);
        }
      })();
    },
    [mutateRet],
  );

  /**
   * Apply a one-tap audio effect to whichever clip is selected.
   *
   * Shared by the desktop rail and the inspector's library so the two can
   * never diverge, and so the "select something first" message is written in
   * one place instead of two.
   */
  const applyAudioFx = useCallback(
    (id: AudioFxId) => {
      // Works on an audio overlay, a video overlay with sound, or the main
      // clip — whichever is selected. Saying so beats silently doing nothing.
      if (!selection) {
        toast.info("Select a clip on the timeline first");
        return;
      }
      if (selection.lane === "overlay") {
        const clip = project?.tracks
          .find((t) => t.id === selection.trackId)
          ?.clips.find((c) => c.id === selection.id);
        if (clip && clip.kind !== "text") {
          mutateVoid((eng) => eng.patchClip(selection.id, { audioFx: id }));
          toast.success(id === "none" ? "Audio effect removed" : "Audio effect applied");
          return;
        }
        toast.info("That clip is text — audio effects need sound");
        return;
      }
      if (selection.lane === "main") {
        mutateVoid((eng) => eng.patchClip(selection.id, { audioFx: id }));
        toast.success(id === "none" ? "Audio effect removed" : "Audio effect applied");
        return;
      }
      const anyAudio = project?.tracks.some((tr) => tr.clips.some((c) => c.kind === "audio"));
      toast.info(
        anyAudio
          ? "Select an audio clip on the timeline, then pick an effect"
          : "Add audio or a video clip first — effects need something to process",
      );
    },
    [selection, project, mutateVoid],
  );

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
    if (
      clip.reverse ||
      clip.freeze ||
      clip.speed !== 1 ||
      clip.rampTo != null ||
      (clip.curve?.length ?? 0) >= 2
    ) {
      toast.error(
        "Extract audio currently requires a normal-speed, forward video clip. Reset its speed first.",
      );
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
      const wav = encodeWavChannels(res.channels, res.sampleRate);
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
        const audio = e.addAudioClip("t_audio", item, at);
        audio.duration = res.duration;
        audio.fadeIn = 0;
        audio.fadeOut = 0;
        audio.volume = clip.volume;
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
    if (!files || files.length === 0 || importing) return;
    const accepted = Array.from(files).filter((f) => kindFromMime(f.type, f.name));
    if (!accepted.length) {
      toast.error("No supported media files");
      return;
    }
    setImporting(true);
    setImportProgress({ done: 0, total: accepted.length });
    try {
      // Ask the browser to protect the local library from automatic eviction.
      void navigator.storage?.persist?.().catch(() => false);
      const items = await importFiles(accepted, (done, total) => {
        setImportProgress({ done, total });
      });
      if (items.length === 0) {
        toast.error("No media could be read from those files");
        return;
      }
      // pair by the item's own sourceFile — never by array index, which
      // drifts as soon as one file is skipped and stores the wrong bytes
      await Promise.all(items.map(({ sourceFile, ...item }) => db.putMedia(item, sourceFile)));
      const all = await db.listMedia();
      setMedia(all);
      engineRef.current?.setMedia(all);
      // Attach each source only after its metadata/frame probe has completed.
      for (const item of items) {
        const blob = await db.getBlob(item.id);
        if (blob) engineRef.current?.attachUrl(item.id, URL.createObjectURL(blob));
      }
      // Proxy building waits until the import has visibly finished, so a 4K
      // clip never delays the moment the user sees their footage. It is
      // best-effort: a phone with no spare CPU simply keeps the original.
      queueProxyBuilds(
        items.filter((item) => item.kind === "video" && !item.unplayable),
        (mediaId, proxy) => engineRef.current?.attachProxy(mediaId, URL.createObjectURL(proxy)),
      );
      const badVideos = items.filter((item) => item.kind === "video" && item.unplayable);
      const badImages = items.filter((item) => item.kind === "image" && item.unplayable);
      toast.success(`Added ${items.length} media item${items.length === 1 ? "" : "s"}`);
      if (badVideos.length) {
        const hevcCount = badVideos.filter((item) => item.codecHint === "HEVC/H.265").length;
        const knownCodecs = badVideos
          .map((item) => item.codecHint)
          .filter((codec) => codec && codec !== "Unknown");
        const detail =
          hevcCount > 0
            ? `Detected HEVC/H.265 in ${hevcCount} clip(s). This device has no HEVC decoder, so those clips cannot be played or exported here.`
            : knownCodecs.length > 0
              ? `Detected ${Array.from(new Set(knownCodecs)).join(", ")} in media that this device could not decode, so those clips cannot be played or exported here.`
              : "This device could not decode these video files — their container or codec may be unsupported, or the files may be damaged.";
        toast.warning(detail, { duration: 12000 });
      }
      if (badImages.length) {
        toast.warning(
          `${badImages.length} image file(s) could not be decoded here — the file may be damaged or in an unsupported variant.`,
          { duration: 10000 },
        );
      }
    } catch (error) {
      console.error("MayoCut media import failed:", error);
      toast.error(
        error instanceof Error
          ? `Media import failed: ${error.message}`
          : "Media import failed — check available device storage",
      );
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
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

  async function addMediaToTimeline(item: MediaItem) {
    const eng = engineRef.current;
    if (!eng) return;
    // Library items from previous sessions are not necessarily referenced by
    // this project yet, so restore their source before putting them on it.
    if (!eng.hasMediaUrl(item.id)) {
      try {
        const blob = await db.getBlob(item.id);
        if (!blob) {
          toast.error(
            "The original media file is missing from this device. Please import it again.",
          );
          return;
        }
        if (engineRef.current !== eng) return;
        if (!eng.hasMediaUrl(item.id)) eng.attachUrl(item.id, URL.createObjectURL(blob));
      } catch {
        toast.error("Could not read this media from local storage");
        return;
      }
    }
    if (item.kind === "image" && item.unplayable) {
      toast.error("This image format cannot be decoded on this device, so it cannot be added.");
      return;
    }
    if (item.kind === "video" && item.unplayable) {
      toast.warning(
        item.codecHint === "HEVC/H.265"
          ? "HEVC/H.265 was detected. This device has no HEVC decoder, so this clip cannot be previewed or exported here."
          : "This video could not be decoded for preview on this device. You can still try its audio track if the audio codec is supported.",
      );
    }
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

  function addTextPreset(preset: (typeof TEXT_PRESETS)[number]) {
    const clip = mutateRet((e) => {
      const created = e.addTextClip("t_text", Math.max(0, e.t));
      Object.assign(created, preset.patch);
      return created;
    });
    if (clip) setSelection({ lane: "overlay", trackId: "t_text", id: clip.id });
  }

  /**
   * The main clip an apply-action should target.
   *
   * Falls back to whatever is under the playhead (CapCut's behaviour) instead
   * of refusing to do anything, and selects it so the user sees what changed.
   */
  function targetMainClipId(): string | null {
    const eng = engineRef.current;
    if (!eng) return null;
    if (selection?.lane === "main") {
      const sel = eng.project.main.find((c) => c.id === selection.id);
      if (sel) return sel.id;
    }
    const spans = mainSpans(eng.project);
    const hit = spans.find((sp) => eng.t >= sp.start && eng.t < sp.end);
    if (hit) {
      setSelection({ lane: "main", id: hit.clip.id });
      return hit.clip.id;
    }
    const first = eng.project.main[0];
    if (first) {
      setSelection({ lane: "main", id: first.id });
      return first.id;
    }
    return null;
  }

  function applyMainEffect(effect: EffectId) {
    const id = targetMainClipId();
    if (!id) {
      toast.info("Add a clip to the timeline first, then choose an effect");
      return;
    }
    const changed = mutateVoid((eng) => {
      const clip = eng.project.main.find((item) => item.id === id);
      if (!clip) return false;
      clip.effect = effect;
    });
    if (changed) toast.success("Effect applied to the clip under the playhead");
  }

  /** Merge one clip-adjust change (used by the Adjust tab's live sliders). */
  function applyAdjust(patch: Partial<FilterAdjust>, replace = false) {
    const id = targetMainClipId();
    if (!id) {
      toast.info("Add a clip to the timeline first, then adjust it");
      return;
    }
    mutateVoid((eng) => {
      const clip = eng.project.main.find((item) => item.id === id);
      if (!clip) return false;
      clip.adjust = replace ? { ...DEFAULT_ADJUST } : { ...clip.adjust, ...patch };
    });
  }

  function applyMainFilter(filter: string) {
    const id = targetMainClipId();
    if (!id) {
      toast.info("Add a clip to the timeline first, then choose a filter");
      return;
    }
    mutateVoid((eng) => {
      const clip = eng.project.main.find((item) => item.id === id);
      if (!clip) return false;
      clip.filter = filter;
    });
  }

  function applyMainTransition(kind: TransitionKind) {
    const id = targetMainClipId();
    if (!id) {
      toast.info("Add a second clip first — a transition needs something to cut from");
      return;
    }
    const changed = mutateVoid((eng) => {
      const index = eng.project.main.findIndex((item) => item.id === id);
      const clip = eng.project.main[index];
      if (!clip || index === 0) return false;
      clip.transitionIn = kind;
      clip.transitionDur = kind === "none" ? 0 : 0.5;
    });
    if (changed) toast.success("Incoming transition updated");
    else toast.info("The first main-track clip has no incoming transition");
  }

  /** Add a text-layer sticker (emoji or shape glyph) at the playhead. */
  /**
   * Insert a catalogue asset with the defaults its KIND calls for.
   *
   * An emoji stays still (it is a character), a graphic pops in (a sticker with
   * no entrance reads as a mistake), and a video sticker carries no text
   * animation at all because its movement is its own footage.
   */
  function addStickerAsset(asset: StickerAsset) {
    // patchFor() is the single place that decides how a sticker lands: its own
    // size and entrance, no background, centred. Kind-specific defaults come
    // from sticker-kinds.ts so an emoji never arrives wobbling.
    addEmoji(asset.glyph ?? "", patchFor(asset));
  }

  function addEmoji(emoji: string, patch: Partial<OverlayClip> = {}) {
    const clip = mutateRet((e) =>
      e.addTextClip("t_text", Math.max(0, e.t), {
        text: emoji,
        size: 150,
        pos: "mc",
        bg: "",
        anim: "bounce",
        ...patch,
      }),
    );
    if (clip) setSelection({ lane: "overlay", trackId: "t_text", id: clip.id });
  }

  /**
   * Apply a one-tap text look. With a text clip selected it restyles that clip;
   * otherwise it creates a new text clip already wearing the look, so clicking
   * a style in the library always does something useful instead of erroring.
   */
  function applyTextPreset(patch: Partial<OverlayClip>) {
    if (selection?.lane === "overlay") {
      const eng = engineRef.current;
      const tr = eng?.project.tracks.find((x) => x.id === selection.trackId);
      const c = tr?.clips.find((x) => x.id === selection.id);
      if (c && c.kind === "text") {
        mutateVoid((e) => {
          const t2 = e.project.tracks.find((x) => x.id === selection.trackId);
          const c2 = t2?.clips.find((x) => x.id === selection.id);
          if (!c2) return false;
          Object.assign(c2, patch);
        });
        return;
      }
    }
    const clip = mutateRet((e) =>
      e.addTextClip("t_text", Math.max(0, e.t), { text: "Your text", ...patch }),
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

  // CapCut keeps Emoji and Stickers apart, and so do we — see sticker-kinds.ts
  // for why the distinction is real rather than cosmetic.
  const [stickerCategory, setStickerCategory] = useState<StickerCategory>("emoji");
  const [stickerQuery, setStickerQuery] = useState("");
  const stickerItems = useMemo(() => {
    if (stickerQuery.trim()) return searchStickers(stickerQuery).slice(0, 60);
    return stickersIn(stickerCategory);
  }, [stickerCategory, stickerQuery]);

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
      let savedToLibrary = true;
      await db
        .saveExport(
          { id: uid("exp"), name, size: blob.size, createdAt: Date.now(), mime: blob.type },
          blob,
        )
        .catch(() => {
          savedToLibrary = false;
        });
      if (savedToLibrary)
        toast.success(
          `Export ready (${ext.toUpperCase()}) — check downloads or the export library`,
        );
      else
        toast.warning(
          "Export is ready for download, but could not be saved in the local export library. Check device storage.",
        );
    };
    const baseName = eng.project.name.replace(/[^\w\- ]+/g, "").trim() || "mayocut";

    // Native desktop export is explicit and limited to edits the native
    // backend validates. Never silently drop unsupported effects or tracks.
    if (nativeExportSelected && (exportFmt === "auto" || exportFmt === "mp4")) {
      const bridge = nativeExportBridge();
      if (!bridge || !nativeExportInfo?.available || !nativeExportInfo.supported) {
        toast.error(
          "Native export is not available for this project. Choose the standard exporter.",
        );
        return;
      }
      setExporting(true);
      setExportProgress(0);
      try {
        const snapshot = makeRenderPlan(eng.project).project;
        const check = await bridge.nativeCheckProject(snapshot);
        if (!check.supported)
          throw new Error(check.reason ?? "This project is not supported by native export");
        const ids = [
          ...new Set([
            ...snapshot.main.map((c) => c.mediaId),
            ...snapshot.tracks.flatMap((track) =>
              track.clips.map((c) => c.mediaId).filter((id): id is string => !!id),
            ),
          ]),
        ];
        const sources: { id: string; data: Uint8Array }[] = [];
        let total = 0;
        for (const id of ids) {
          const item = media.find((m) => m.id === id);
          if (!item || (item.kind !== "video" && item.kind !== "audio"))
            throw new Error("Native export requires available video or audio sources");
          const blob = await db.getBlob(id);
          if (!blob) throw new Error(`Source media is missing: ${item.name}`);
          total += blob.size;
          if (total > 512 * 1024 * 1024)
            throw new Error("Native export supports up to 512 MB of source media");
          sources.push({ id, data: new Uint8Array(await blob.arrayBuffer()) });
        }
        const size = ASPECTS[snapshot.aspect];
        const result = await bridge.nativeExport({
          project: snapshot,
          name: baseName,
          options: {
            width: size.w * exportRes,
            height: size.h * exportRes,
            fps: exportFps,
            kbps: exportKbps,
          },
          sources,
        });
        if (!result.canceled) toast.success("Native MP4 saved to the location you selected");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Native export failed");
      } finally {
        setExporting(false);
        setShowExport(false);
      }
      return;
    }

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
      toast.error(
        "This browser can't record video, so a video file can't be written here. Export a PNG frame or the WAV audio instead.",
      );
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
      let blob: Blob;
      // Two frame-stepped paths: MP4 (H.264) where the device can encode it,
      // and WebM (VP9/VP8) where it cannot — Safari and Firefox. Both give the
      // same "every frame confirmed" guarantee, so neither is a downgrade in
      // correctness, only in container.
      let steppedKind: "mp4" | "webm" | null = null;
      if (wantMp4 && canMp4 && (await eng.canExportStepped())) steppedKind = "mp4";
      // No H.264 encoder here, or it refused this size: VP9 still gives the
      // exact same frame-by-frame guarantee, just in a WebM container.
      if (!steppedKind && (await eng.canExportSteppedWebm())) steppedKind = "webm";
      let stepped = steppedKind !== null;
      if (stepped) {
        // A device slow enough that frame-stepping would take many times real
        // time is better served by the real-time recorder. Measure once (or
        // reuse the number the dialog already showed) before committing.
        let plan = exportPlan;
        if (!plan) {
          try {
            plan = await eng.measureThroughput();
          } catch {
            plan = null;
          }
        }
        if (plan && plan.strategy === "realtime") {
          stepped = false;
          toast.info("This device is slow at frame-by-frame rendering — exporting in real time");
        }
      }
      if (stepped && steppedKind === "mp4") {
        // Frame-stepped: every frame is confirmed before it is encoded, so the
        // result matches the preview exactly. Slower than real time on a weak
        // device but never drops or blanks a frame.
        toast.info("Rendering frame by frame — keep this window open");
        blob = await eng.exportMP4Stepped(opts, (p) => setExportProgress(p));
      } else if (stepped && steppedKind === "webm") {
        toast.info("Rendering frame by frame (WebM) — keep this window open");
        blob = await eng.exportWebmStepped(opts, (p) => setExportProgress(p));
      } else if (wantMp4 && canMp4) {
        toast.info("Export runs in real time — keep this window open");
        try {
          blob = await eng.exportMP4(opts, (p) => setExportProgress(p));
        } catch (e) {
          console.warn("MP4 failed, falling back to WebM", e);
          toast.warning(
            "Standard MP4 (H.264 + AAC) is unavailable on this device — exported WebM instead.",
          );
          blob = await eng.exportMedia(opts, (p) => setExportProgress(p));
        }
      } else {
        if (exportFmt === "mp4" && !canMp4)
          toast.warning("This browser can't encode MP4 — exported WebM instead");
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

  /**
   * Measure this device's real render speed, once, so the export dialog can say
   * "about 40 seconds" instead of guessing. Runs a short probe against the live
   * preview; the plan it returns is refreshed when fps or resolution changes.
   */
  async function measureExportSpeed() {
    const eng = engineRef.current;
    if (!eng || planning || exporting) return;
    setPlanning(true);
    try {
      const plan = await eng.measureThroughput();
      if (plan) setExportPlan(eng.planExport({ fps: exportFps, scale: exportRes }));
    } catch {
      /* an estimate is optional; the export still works without one */
    } finally {
      setPlanning(false);
    }
  }

  // Keep the estimate in step with the chosen fps/resolution, using the last
  // measurement. No probing happens here — only arithmetic.
  function refreshPlan(res: 1 | 2, fps = exportFps) {
    const eng = engineRef.current;
    if (!eng || !exportPlan) return;
    setExportPlan(eng.planExport({ fps, scale: res }));
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
    })()
      .catch((error) => {
        console.error("Template save failed", error);
        toast.error("Could not save the template — check device storage");
      })
      .finally(() => setSavingTemplate(false));
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

  // The existing backend shares one media element per source. Overlapping
  // instances may compete for its seek position until per-clip decoders ship.
  const sourceConflicts = useMemo(
    () =>
      project
        ? findSharedSourceConflicts(project, new Map(media.map((item) => [item.id, item.kind])))
        : [],
    [project, media],
  );
  const conflictAtPlayhead = sourceConflicts.some(
    (conflict) => t >= conflict.start && t < conflict.end,
  );

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
        onClick={() => {
          setAssistInitialTab("tools");
          setAssistOpen(true);
        }}
        title="Assist: on-device tools (beats, loudness, color) + optional local AI"
      >
        <Sparkles className="h-3 w-3" /> Assist
      </button>
      <div className="ml-auto flex items-center gap-2">
        {saveProblem && (
          // A save that failed silently is how an entire session disappeared.
          // This stays visible until a write succeeds, and offers the only
          // remedy that actually works (free space), plus a way out that does
          // not depend on this browser's storage.
          <div
            role="alert"
            className="flex items-center gap-1.5 rounded border border-red-400/50 bg-red-500/10 px-2 py-1 text-[10px] text-red-200"
            title={saveProblem}
          >
            <span className="font-semibold">Not saved</span>
            <span className="max-w-[16rem] truncate">{saveProblem}</span>
            <button className="underline shrink-0" onClick={() => void flushSave()}>
              retry
            </button>
            <button className="underline shrink-0" onClick={() => setShowExport(true)}>
              export
            </button>
          </div>
        )}
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
          title={
            m.codecHint && m.codecHint !== "Unknown"
              ? `${m.codecHint} detected; this device could not decode the video. Audio may still be available if its codec is supported.`
              : "This device could not decode this media file, so it cannot be previewed or exported here."
          }
        >
          ⚠ unsupported
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
  const selectedMainClip =
    selection?.lane === "main" ? project.main.find((clip) => clip.id === selection.id) : undefined;
  const workspaceTabs = [
    { id: "media", label: "Media", icon: Film },
    { id: "audio", label: "Audio", icon: Music },
    { id: "text", label: "Text", icon: Plus },
    { id: "stickers", label: "Stickers", icon: ImageIcon },
    { id: "effects", label: "Effects", icon: Sparkles },
    { id: "filters", label: "Filters", icon: SlidersHorizontal },
    { id: "transitions", label: "Transitions", icon: Scissors },
    { id: "adjust", label: "Adjust", icon: SlidersHorizontal },
    { id: "captions", label: "Captions", icon: Clapperboard },
    { id: "ai", label: "AI Studio", icon: Sparkles },
  ] as const;
  const mediaPanel = (
    <div className="w-52 md:w-60 border-r border-border flex shrink-0 min-h-0">
      <nav
        className="w-12 shrink-0 border-r border-border flex flex-col py-1 gap-0.5 overflow-y-auto"
        aria-label="Editing tools"
      >
        {workspaceTabs.map((tab) => (
          <button
            key={tab.id}
            className={`h-12 flex flex-col items-center justify-center gap-0.5 text-[9px] rounded mx-0.5 ${workspaceTab === tab.id ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-card"}`}
            aria-pressed={workspaceTab === tab.id}
            title={tab.label}
            onClick={() => setWorkspaceTab(tab.id)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-2 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold">
            {workspaceTabs.find((tab) => tab.id === workspaceTab)?.label}
          </span>
          {workspaceTab === "ai" && (
            <button
              className="mb-btn h-6 px-2 text-[10px]"
              onClick={() => {
                setAssistInitialTab("tools");
                setAssistOpen(true);
              }}
            >
              Open
            </button>
          )}
        </div>
        {workspaceTab === "media" && (
          <>
            <div className="p-2 border-b border-border space-y-1.5">
              <button
                className="mb-btn w-full h-8 text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {importing && importProgress
                  ? `Checking ${importProgress.done}/${importProgress.total}…`
                  : importing
                    ? "Importing…"
                    : "Import media"}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={MEDIA_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  void onImport(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="text-[9px] leading-snug text-muted-foreground">
                Clips this device cannot decode still keep their audio, captions and export — only
                the picture needs a decoder it doesn't have.
              </div>
              <div className="flex gap-1">
                <button
                  className={`flex-1 text-[10px] rounded px-1 py-1 border ${addMode === "main" ? "border-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                  onClick={() => setAddMode("main")}
                >
                  Main clip
                </button>
                <button
                  className={`flex-1 text-[10px] rounded px-1 py-1 border ${addMode === "overlay" ? "border-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                  onClick={() => setAddMode("overlay")}
                >
                  Overlay
                </button>
              </div>
            </div>
            <div
              className={`flex-1 min-h-0 overflow-y-auto p-2 grid gap-2 content-start ${isMobile ? "grid-cols-3" : "grid-cols-2"}`}
            >
              {media.filter((item) => item.kind !== "audio").map(mediaCard)}
              {media.every((item) => item.kind === "audio") && (
                <div className="col-span-3 text-[10px] text-muted-foreground text-center py-2">
                  Import videos or images to start editing
                </div>
              )}
              {STOCK_ASSETS.map((a) => (
                <button
                  key={a.id}
                  className="relative group rounded overflow-hidden border border-border hover:border-primary text-left"
                  title={`${a.hint}${a.kind === "video" ? " (renders a short clip)" : ""}`}
                  onClick={() => addStockAsset(a.id)}
                  disabled={stockBusy !== null}
                >
                  <div className="relative aspect-square bg-slate-900 flex items-center justify-center">
                    {stockThumbData(a.id) ? (
                      <img
                        src={stockThumbData(a.id)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                    {a.kind === "video" && (
                      <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/70 rounded px-1">
                        clip
                      </span>
                    )}
                    {stockBusy === a.id && (
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] bg-black/70">
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </span>
                    )}
                  </div>
                  <div className="px-1 py-0.5 text-[9px] truncate">{a.name}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {workspaceTab === "audio" && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={AUDIO_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void onImport(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="p-2 border-b border-border space-y-1.5">
              <button
                className="mb-btn w-full h-8 text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {importing ? "Importing…" : "Import audio"}
              </button>
              <button
                className={`mb-btn-ghost w-full h-8 text-xs ${recState.active ? "text-red-400 border-red-400/50" : ""}`}
                onClick={startRecording}
              >
                {recState.active ? (
                  <Square className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
                {recState.active ? `Stop recording · ${recState.secs}s` : "Record voice / music"}
              </button>
              <p className="text-[10px] text-muted-foreground">
                Add music, voiceovers and sound effects. Select an audio clip to edit volume, fades
                and audio effects.
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
              {media.filter((item) => item.kind === "audio").map(mediaCard)}
              {!media.some((item) => item.kind === "audio") && (
                <div className="col-span-2 text-[10px] text-muted-foreground text-center py-6">
                  No audio imported yet
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-border p-2 space-y-1.5 max-h-56 overflow-y-auto">
              <div className="text-[10px] font-semibold">Audio effects</div>
              <div className="text-[9px] text-muted-foreground leading-snug">
                Applied to the selected clip and rendered into the export, not just the preview.
              </div>
              <div className="grid grid-cols-3 gap-1">
                {AUDIO_FX.map((f) => {
                  const active =
                    selectedMainClip?.audioFx === f.id ||
                    (selection?.lane === "overlay"
                      ? project.tracks.flatMap((t) => t.clips).find((c) => c.id === selection.id)
                          ?.audioFx === f.id
                      : false);
                  return (
                    <button
                      key={f.id}
                      className={`text-[9px] rounded border px-1 py-1 leading-none ${
                        active
                          ? "border-cyan-400 bg-cyan-400/10"
                          : "border-border hover:border-white/40"
                      }`}
                      title={f.hint}
                      onClick={() => applyAudioFx(f.id)}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {workspaceTab === "text" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
            <button className="mb-btn w-full h-8 text-xs" onClick={addText}>
              <Plus className="h-3.5 w-3.5" /> Add text at playhead
            </button>
            <div className="text-[10px] text-muted-foreground">
              Text styles · adds a styled title to the timeline
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TEXT_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  className="flex flex-col overflow-hidden border border-border rounded text-[10px] text-left hover:border-primary"
                  onClick={() => addTextPreset(preset)}
                  title={`Add a “${preset.name}” title`}
                >
                  {/* a real miniature of the look, not a label in a box */}
                  <span
                    className="h-9 flex items-center justify-center px-1 truncate font-semibold"
                    style={{
                      color: preset.patch.color ?? "#fff",
                      background: preset.patch.bg || "rgba(15,23,42,0.9)",
                      textTransform: preset.patch.upper ? "uppercase" : undefined,
                      fontStyle: preset.patch.italic ? "italic" : undefined,
                      textDecoration: preset.patch.underline ? "underline" : undefined,
                      letterSpacing: preset.patch.tracking ? "0.06em" : undefined,
                      fontSize: preset.patch.size && preset.patch.size > 80 ? 15 : 11,
                    }}
                  >
                    Aa
                  </span>
                  <span className="px-1 py-0.5 truncate text-muted-foreground">{preset.name}</span>
                </button>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground pt-1">
              Animations, fonts, outline and spacing are in the Anim tab once a text clip is
              selected.
            </div>
          </div>
        )}
        {workspaceTab === "stickers" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            <p className="text-[10px] text-muted-foreground mb-2">Sticker library</p>
            <input
              className="w-full mb-2 bg-transparent border border-border rounded px-2 py-1 text-[11px] placeholder:text-muted-foreground"
              placeholder="Search stickers — try “light”, “fire”, “arrow”"
              value={stickerQuery}
              onChange={(e) => setStickerQuery(e.target.value)}
            />
            {stickerQuery.trim() ? (
              <div className="space-y-2">
                {(() => {
                  const emojiHits = searchEmoji(stickerQuery).slice(0, 20);
                  const stockHits = searchStock(stickerQuery).slice(0, 6);
                  return (
                    <>
                      {emojiHits.length > 0 && (
                        <div className="grid grid-cols-5 gap-1">
                          {emojiHits.map((emoji) => (
                            <button
                              key={emoji}
                              className="h-8 rounded hover:bg-slate-700 text-lg"
                              title={`Add ${emoji}`}
                              onClick={() => addEmoji(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                      {stockHits.map((a) => (
                        <button
                          key={a.id}
                          className="w-full flex items-center gap-2 rounded border border-border hover:border-primary px-1.5 py-1 text-left"
                          title={a.hint}
                          onClick={() => addStockAsset(a.id)}
                        >
                          {stockThumbData(a.id) ? (
                            <img
                              src={stockThumbData(a.id)}
                              alt=""
                              className="h-7 w-7 rounded object-cover"
                            />
                          ) : null}
                          <span className="text-[10px] flex-1 truncate">{a.name}</span>
                          <span className="text-[8px] text-muted-foreground">
                            {a.kind === "video" ? "clip" : "still"}
                          </span>
                        </button>
                      ))}
                      {emojiHits.length === 0 && stockHits.length === 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          Nothing matches “{stickerQuery}”. The built-in set is generated on your
                          device, so it is small — but it works offline.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : null}
            <div className="flex gap-1 flex-wrap mb-2" role="group" aria-label="Sticker categories">
              {STICKER_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  className={`px-1.5 py-1 rounded text-[10px] ${
                    stickerCategory === cat.id && !stickerQuery.trim()
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-slate-700"
                  }`}
                  aria-pressed={stickerCategory === cat.id && !stickerQuery.trim()}
                  title={cat.hint}
                  onClick={() => {
                    setStickerCategory(cat.id);
                    setStickerQuery("");
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="text-[9px] text-muted-foreground mb-1 leading-snug">
              {STICKER_CATEGORIES.find((c) => c.id === stickerCategory)?.hint}
            </div>
            {stickerCategory === "video" && !stickerQuery.trim() ? (
              <div className="grid grid-cols-2 gap-1">
                {ANIMATED_STICKER_IDS.map((id) => {
                  const asset = stockById(id);
                  if (!asset) return null;
                  return (
                    <button
                      key={id}
                      className="flex items-center gap-1.5 rounded border border-border hover:border-primary px-1.5 py-1 text-left"
                      title={asset.hint}
                      onClick={() => addStockAsset(id)}
                    >
                      {stockThumbData(id) ? (
                        <img
                          src={stockThumbData(id)}
                          alt=""
                          className="h-7 w-7 rounded object-cover"
                        />
                      ) : null}
                      <span className="text-[10px] flex-1 truncate">{asset.name}</span>
                    </button>
                  );
                })}
                <div className="col-span-2 text-[9px] text-muted-foreground leading-snug">
                  Animated stickers are generated on this device — they move because the clip moves,
                  not because a text animation is applied to them.
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-5 gap-1">
                  {stickerItems.map((asset) => (
                    <button
                      key={asset.id}
                      className="h-9 rounded hover:bg-slate-700 flex items-center justify-center overflow-hidden"
                      title={`${asset.glyph ?? ""} — ${asset.category}${asset.kind === "graphic" ? ", animated in" : ""}`}
                      style={{
                        color: asset.color,
                        fontSize: asset.category === "text" ? 9 : 19,
                        fontWeight: asset.category === "text" ? 700 : undefined,
                        lineHeight: 1,
                      }}
                      onClick={() => addStickerAsset(asset)}
                    >
                      {asset.glyph}
                    </button>
                  ))}
                </div>
                {stickerItems.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Nothing matches “{stickerQuery}”. The catalogue is generated on your device, so
                    it is small — but it works offline.
                  </p>
                )}
                <div className="text-[9px] text-muted-foreground leading-snug mt-1">
                  Emoji stay editable as text. Graphics arrive with their own entrance animation.
                  Both are infinitely sharp because they are drawn, not bitmaps.
                </div>
              </>
            )}
          </div>
        )}
        {workspaceTab === "effects" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            <p className="text-[10px] text-muted-foreground mb-2">
              Apply a motion or visual effect to the selected main-track clip.
            </p>
            <div className="grid grid-cols-2 gap-1">
              {EFFECTS.map((effect) => (
                <button
                  key={effect.id}
                  className={`flex flex-col overflow-hidden rounded border text-[10px] text-left ${
                    selectedMainClip?.effect === effect.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary"
                  }`}
                  onClick={() => applyMainEffect(effect.id)}
                  title={effect.name}
                >
                  <EffectPreview id={effect.id} />
                  <span className="px-1 py-0.5 truncate">{effect.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {workspaceTab === "filters" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 content-start">
            {FILTER_PRESETS.map((filter) => (
              <button
                key={filter.id}
                className={`flex flex-col overflow-hidden border rounded text-[10px] text-left ${
                  selectedMainClip?.filter === filter.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary"
                }`}
                onClick={() => applyMainFilter(filter.id)}
                title={filter.name}
              >
                <FilterPreview css={filter.css} />
                <span className="px-1 py-0.5 truncate">{filter.name}</span>
              </button>
            ))}
          </div>
        )}
        {workspaceTab === "transitions" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            <p className="text-[10px] text-muted-foreground mb-2">
              Choose the incoming transition for the selected clip. The first clip has no incoming
              transition.
            </p>
            <div className="grid grid-cols-2 gap-1">
              {TRANSITIONS.map((transition) => (
                <button
                  key={transition.id}
                  className={`flex flex-col overflow-hidden rounded border text-[10px] text-left ${
                    selectedMainClip?.transitionIn === transition.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary"
                  }`}
                  onClick={() => applyMainTransition(transition.id)}
                  title={transition.name}
                >
                  <TransitionPreview kind={transition.id} seed={transition.id} />
                  <span className="px-1 py-0.5 truncate">{transition.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {workspaceTab === "adjust" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
            {!selectedMainClip ? (
              <p className="text-[10px] text-muted-foreground">
                Select a main-track clip, then drag these. The preview updates as you move them.
              </p>
            ) : (
              (
                [
                  ["brightness", "Brightness", 40, 200],
                  ["contrast", "Contrast", 40, 200],
                  ["saturation", "Saturation", 0, 250],
                  ["hue", "Hue", -180, 180],
                  ["temperature", "Temperature", -100, 100],
                  ["tint", "Tint", -100, 100],
                  ["fade", "Fade", 0, 100],
                  ["sharpen", "Sharpen", 0, 100],
                  ["vignette", "Vignette", 0, 100],
                  ["splitTone", "Split tone", 0, 100],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key} className="block">
                  <span className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{label}</span>
                    <span className="tabular-nums">{selectedMainClip.adjust?.[key] ?? 0}</span>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={selectedMainClip.adjust?.[key] ?? (key === "hue" ? 0 : 100)}
                    onChange={(e) =>
                      applyAdjust({ [key]: Number(e.target.value) } as Partial<FilterAdjust>)
                    }
                    className="w-full accent-cyan-400"
                  />
                </label>
              ))
            )}
            {selectedMainClip && (
              <button
                className="mb-btn-ghost w-full h-7 text-[10px] mt-1"
                onClick={() => applyAdjust(DEFAULT_ADJUST, true)}
              >
                Reset adjustments
              </button>
            )}
          </div>
        )}
        {workspaceTab === "captions" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <Clapperboard className="h-7 w-7 text-primary" />
            <p className="text-xs font-semibold">Auto captions</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Generate editable, timed subtitles from your main-track audio using the on-device
              Whisper workflow.
            </p>
            <button
              className="mb-btn w-full h-8 text-xs"
              onClick={() => {
                setAssistInitialTab("captions");
                setAssistOpen(true);
              }}
            >
              <Clapperboard className="h-3.5 w-3.5" /> Open caption tools
            </button>
          </div>
        )}
        {workspaceTab === "ai" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <Sparkles className="h-7 w-7 text-primary" />
            <p className="text-xs font-semibold">AI Studio</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Open the assistant for project-aware editing help, voice tools, captions and AI
              workflows.
            </p>
            <button
              className="mb-btn w-full h-8 text-xs"
              onClick={() => {
                setAssistInitialTab("tools");
                setAssistOpen(true);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Open AI Studio
            </button>
          </div>
        )}
      </div>
    </div>
  );
  const previewArea = (
    <div
      className={`flex-1 min-h-0 flex items-center justify-center bg-black/60 relative overflow-hidden ${
        stageMax ? "p-0" : "p-2 sm:p-3"
      }`}
    >
      {/* Expand / restore the preview. CapCut has a full-screen preview button;
          this gives the same thing without leaving the editor, so the picture
          can be judged at size without losing the timeline. */}
      <button
        className="absolute top-2 right-2 z-20 h-7 w-7 rounded bg-black/60 hover:bg-black/80 border border-white/15 text-white/80 flex items-center justify-center"
        title={stageMax ? "Exit expanded preview (Esc)" : "Expand preview — hides the side panels"}
        aria-label={stageMax ? "Exit expanded preview" : "Expand preview"}
        aria-pressed={stageMax}
        onClick={() => setStageMax((v) => !v)}
      >
        {stageMax ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>
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
      {buffering && !brokenAtPlayhead && (
        <div
          role="status"
          className="absolute bottom-2 left-2 rounded bg-black/75 text-white px-2 py-1 text-xs pointer-events-none"
        >
          Preparing video…
        </div>
      )}
      {conflictAtPlayhead && !brokenAtPlayhead && (
        <div
          role="status"
          className="absolute bottom-2 inset-x-2 bg-amber-950/90 text-amber-100 rounded px-2 py-1 text-xs pointer-events-none"
        >
          Overlapping uses of the same source may not play correctly. Remove the transition or use a
          separate copy of the media.
        </div>
      )}
      {brokenAtPlayhead && (
        <div className="absolute bottom-2 inset-x-2 sm:inset-x-8 bg-amber-400/15 border border-amber-400/40 text-amber-200 rounded-lg px-3 py-2 text-[11px] sm:text-xs leading-snug pointer-events-none">
          ⚠ “{brokenAtPlayhead}” can't be decoded on this device (usually an HEVC camera clip). Its{" "}
          <b>audio + captions still work</b>, so you can cut, caption and export the sound here —
          the picture needs a device with an HEVC decoder.
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
      <button
        className="mb-btn-ghost h-7 px-2 text-[10px]"
        onClick={() => rotateProject("ccw")}
        title="Turn the whole project left (landscape ↔ portrait)"
      >
        ⟲
      </button>
      <button
        className="mb-btn-ghost h-7 px-2 text-[10px]"
        onClick={() => rotateProject("cw")}
        title="Turn the whole project right (landscape ↔ portrait)"
      >
        ⟳
      </button>
      {/* Frame-accurate stepping: one button per frame on the chosen grid, so a
          cut can be nudged without touching the keyboard. */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Frame stepping">
        <button
          className="mb-btn-ghost h-7 px-1.5 text-[10px]"
          onClick={() => engineRef.current?.seek(t - 1 / Math.max(1, stepFps))}
          title="Back one frame (←)"
        >
          ◀|
        </button>
        <select
          className="h-7 rounded border border-border bg-card px-1 text-[10px]"
          value={stepFps}
          onChange={(e) => setStepFps(Number(e.target.value))}
          title="Frame grid used by the arrow keys and the step buttons"
          aria-label="Frame grid"
        >
          {[24, 25, 30, 50, 60].map((f) => (
            <option key={f} value={f}>
              {f}fps
            </option>
          ))}
        </select>
        <button
          className="mb-btn-ghost h-7 px-1.5 text-[10px]"
          onClick={() => engineRef.current?.seek(t + 1 / Math.max(1, stepFps))}
          title="Forward one frame (→)"
        >
          |▶
        </button>
      </div>
      {/* Transport speed. 0.25x is the one that matters: it is how you hear
          whether a cut lands on the beat. */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Playback speed">
        {[0.25, 0.5, 1, 2].map((r) => (
          <button
            key={r}
            className={`mb-btn-ghost h-7 px-1 text-[10px] ${rate === r ? "text-primary" : "text-muted-foreground"}`}
            aria-pressed={rate === r}
            onClick={() => setRate(r)}
            title={`Play at ${r}x`}
          >
            {r}x
          </button>
        ))}
      </div>
      {/* Loop region: I/O set the marks, ✕ clears them. */}
      <div className="flex items-center gap-1" role="group" aria-label="Loop region">
        <button
          className="mb-btn-ghost h-7 px-1.5 text-[10px]"
          onClick={() => {
            setLoopRegion({ a: t, b: loopRegion?.b ?? dur });
            toast.success("Loop in set");
          }}
          title="Set loop in-point at the playhead (I)"
        >
          [
        </button>
        <button
          className="mb-btn-ghost h-7 px-1.5 text-[10px]"
          onClick={() => {
            setLoopRegion({ a: loopRegion?.a ?? 0, b: t });
            toast.success("Loop out set");
          }}
          title="Set loop out-point at the playhead (O)"
        >
          ]
        </button>
        {loopRegion && (
          <>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {fmtTime(Math.min(loopRegion.a, loopRegion.b))}–
              {fmtTime(Math.max(loopRegion.a, loopRegion.b))}
            </span>
            <button
              className="mb-btn-ghost h-7 px-1 text-[10px]"
              onClick={() => setLoopRegion(null)}
              title="Clear loop region"
            >
              ✕
            </button>
          </>
        )}
      </div>
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
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          Preview
          <select
            className="h-7 rounded border border-border bg-card px-1 text-[10px] text-foreground"
            value={previewQuality}
            onChange={(event) =>
              setPreviewQuality(event.target.value as "auto" | "540" | "720" | "1080")
            }
            title="Preview render resolution. Export quality is unaffected."
          >
            <option value="auto">Auto</option>
            <option value="540">540p</option>
            <option value="720">720p</option>
            <option value="1080">1080p</option>
          </select>
        </label>
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
      onSearchStock={(q) =>
        searchStock(q).map((a) => ({ id: a.id, name: a.name, hint: a.hint, kind: a.kind }))
      }
      onAddStock={(id) => void addStockAsset(id)}
    />
  );
  /**
   * Desktop inspector. CapCut splits clip properties into tabs (Video / Audio /
   * Speed / Animation) rather than one long scroll; the tab strip jumps to the
   * matching section so the same sections are reused, not duplicated.
   */
  /**
   * Jump the inspector to a section.
   *
   * Two bugs were making tabs feel dead:
   *  - `scrollIntoView` scrolls the nearest scrollable ANCESTOR, which on a
   *    phone could be the page instead of the panel (so the sheet jumped but
   *    the content did not move to the section);
   *  - the section for a tab may only exist after this render, so the query
   *    ran before it was in the DOM and silently matched nothing.
   * Now we move the panel's own scrollTop, on the next frame.
   */
  const jumpToInspectorSection = (id: string) => {
    setInspectorTab(id);
    requestAnimationFrame(() => {
      const body = inspectorBodyRef.current;
      if (!body) return;
      const el = body.querySelector<HTMLElement>(`[data-sec~="${id}"]`);
      if (!el) {
        // nothing for this tab on this selection — say so instead of no-oping
        toast.info(
          `No ${id} settings for this clip. Pick a ${id === "audio" ? "audio or clip" : "clip"} on the timeline.`,
        );
        return;
      }
      const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top;
      body.scrollTo({ top: Math.max(0, body.scrollTop + top - 4), behavior: "smooth" });
    });
  };

  const INSPECTOR_TABS = [
    { id: "video", label: "Video" },
    { id: "audio", label: "Audio" },
    { id: "speed", label: "Speed" },
    { id: "anim", label: "Anim" },
    { id: "adjust", label: "Adjust" },
  ];
  const inspectorTabs = (
    <div className="shrink-0 border-b border-border flex items-stretch overflow-x-auto no-scrollbar">
      {INSPECTOR_TABS.map((tb) => {
        const on = inspectorTab === tb.id;
        return (
          <button
            key={tb.id}
            onClick={() => jumpToInspectorSection(tb.id)}
            className={`relative flex-1 shrink-0 py-1.5 text-[10px] transition-colors ${
              on ? "text-cyan-300" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tb.label}
            {on && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cyan-400" />}
          </button>
        );
      })}
    </div>
  );
  const inspectorPanel = (
    <div className="w-64 md:w-80 border-l border-border shrink-0 flex flex-col min-h-0 bg-card/40">
      {inspectorTabs}
      <div ref={inspectorBodyRef} className="flex-1 min-h-0 overflow-y-auto p-2.5">
        {renderInspector()}
      </div>
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
          onClick={() => {
            if (b.id === "assist") {
              setAssistInitialTab("tools");
              setAssistOpen(true);
            } else {
              // "Add" and "Media" both open the Library drawer: every creation
              // category now lives in one panel, so a separate Add sheet would
              // be a second, thinner copy of it.
              const target = b.id === "add" ? "media" : b.id;
              setSheet(sheet === target ? null : target);
            }
          }}
        >
          <b.icon className="h-5 w-5" />
          {b.label}
        </button>
      ))}
    </div>
  );
  /** The Library, reused verbatim in the mobile drawer so both platforms match. */
  const libraryNode = (
    <Library
      project={project}
      media={media}
      compact
      mainClip={
        selection?.lane === "main"
          ? (project.main.find((c) => c.id === selection.id) ?? null)
          : null
      }
      selectedOverlay={
        selection?.lane === "overlay"
          ? (project.tracks
              .find((t) => t.id === selection.trackId)
              ?.clips.find((c) => c.id === selection.id) ?? null)
          : null
      }
      onImport={() => fileRef.current?.click()}
      onAddMedia={addMediaToTimeline}
      onDeleteMedia={(m) => void deleteMediaItem(m)}
      onAddText={addText}
      onAddSticker={(label, patch) =>
        addEmoji(label, { size: 150, pos: "mc", bg: "", anim: "bounce", ...patch })
      }
      onApplyTextPreset={(patch) => applyTextPreset(patch)}
      onSetTextAnim={(anim) => {
        if (selection?.lane !== "overlay") {
          toast.info("Select a text clip first");
          return;
        }
        mutateVoid((eng) => {
          const tr = eng.project.tracks.find((x) => x.id === selection.trackId);
          const c = tr?.clips.find((x) => x.id === selection.id);
          if (!c) return false;
          c.anim = anim;
        });
      }}
      onPatchMain={(patch) => {
        if (selection?.lane !== "main") {
          toast.info("Select a video clip on the timeline first");
          return;
        }
        mutateVoid((eng) => {
          const c = eng.project.main.find((x) => x.id === selection.id);
          if (!c) return false;
          Object.assign(c, patch);
        });
      }}
      onSetTransition={(kind) => {
        if (selection?.lane !== "main") {
          toast.info("Select the clip that comes second");
          return;
        }
        mutateVoid((eng) => {
          const idx = eng.project.main.findIndex((c) => c.id === selection.id);
          const dur =
            eng.project.main[idx]?.transitionDur ||
            Math.min(0.5, Math.max(0.2, mainSpans(eng.project)[idx]?.end ?? 0.5));
          eng.setTransition(selection.id, kind, dur);
        });
      }}
      onApplyTransitionAll={(kind) =>
        mutateVoid((eng) => {
          eng.setTransitionAll(kind, 0.4);
        })
      }
      stockBusy={stockBusy}
      onAddStock={addStockAsset}
      onApplyAudioFx={applyAudioFx}
      onApplyFilter={(id) => {
        if (selection?.lane !== "main") {
          toast.info("Select a video clip to give it a look");
          return;
        }
        mutateVoid((eng) => {
          const c = eng.project.main.find((x) => x.id === selection.id);
          if (!c) return false;
          c.filter = id;
        });
      }}
      onSwitchToAdjust={() => {
        setSheet("tune");
      }}
      onOpenCaptions={() => {
        setSheet(null);
        setAssistOpen(true);
      }}
      onRecord={startRecording}
      onAddAtPlayhead={() => {
        const first = media[0];
        if (first) addMediaToTimeline(first);
        else fileRef.current?.click();
      }}
      recording={recState.active}
    />
  );

  const bottomSheets = (
    <>
      <Drawer open={sheet === "media"} onClose={() => setSheet(null)}>
        <DrawerContent className="max-h-[85dvh] flex flex-col overflow-hidden">
          <DrawerHeader className="p-3 pb-2 text-left shrink-0">
            <DrawerTitle className="text-sm">Media library</DrawerTitle>
          </DrawerHeader>
          {/* the ONE scrolling region — must be a flex child of a flex parent */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {libraryNode}
          </div>
        </DrawerContent>
      </Drawer>
      <Drawer open={sheet === "tune"} onClose={() => setSheet(null)}>
        <DrawerContent className="max-h-[88dvh] flex flex-col overflow-hidden">
          <DrawerHeader className="p-3 pb-2 text-left shrink-0">
            <DrawerTitle className="text-sm">
              {selection ? "Tune the selected clip" : "Tune"}
            </DrawerTitle>
            <span className="text-[11px] text-muted-foreground font-normal">
              {selection
                ? "Filters, motion, keyframes, text, position and audio."
                : "Tap a clip on the timeline first."}
            </span>
          </DrawerHeader>
          {inspectorTabs}
          <div
            ref={inspectorBodyRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-[max(2rem,env(safe-area-inset-bottom))]"
          >
            {renderInspector()}
          </div>
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
                selectTimelineClip(sel);
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
          {!stageMax && mediaPanel}
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
                onSelect={selectTimelineClip}
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
          {!stageMax && inspectorPanel}
        </div>
      )}
      {assistOpen && engineRef.current && (
        <Assist
          engine={engineRef.current}
          project={engineRef.current.project}
          initialTab={assistInitialTab}
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
            {exportBlocker() && (
              <div className="mt-3 rounded border border-amber-400/40 bg-amber-400/10 text-amber-200 text-[11px] leading-snug px-2.5 py-2">
                ⚠ Video export can't run here: {exportBlocker()}
                <div className="mt-1 text-amber-200/70">
                  You can still export the current frame as PNG, or the audio as WAV.
                </div>
              </div>
            )}
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
                          unsupported
                            ? "This browser can't encode MP4 — WebM works and exports frame-accurately"
                            : f.note
                        }
                        onClick={() => {
                          setExportFmt(f.id);
                          if (f.id !== "auto" && f.id !== "mp4") setNativeExportSelected(false);
                        }}
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
              {nativeExportBridge() && (
                <div className="rounded border border-border p-2 text-xs space-y-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={nativeExportSelected}
                      disabled={
                        !nativeExportInfo?.available ||
                        !nativeExportInfo?.supported ||
                        (exportFmt !== "auto" && exportFmt !== "mp4")
                      }
                      onChange={(e) => setNativeExportSelected(e.target.checked)}
                    />
                    Native desktop MP4 (experimental)
                  </label>
                  <p className="text-muted-foreground">
                    {!nativeExportInfo
                      ? "Checking native export…"
                      : !nativeExportInfo.available
                        ? nativeExportInfo.bundled
                          ? "The bundled media tools could not be started. Reinstall the desktop app, or use the standard exporter."
                          : "Native export is not available on this platform; use the standard exporter."
                        : !nativeExportInfo.supported
                          ? nativeExportInfo.reason
                          : "For simple video cuts and audio tracks. Saves to a location you choose; the standard exporter remains available."}
                  </p>
                </div>
              )}
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
                      onClick={() => {
                        setExportRes(1);
                        refreshPlan(1);
                      }}
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
                      onClick={() => {
                        setExportRes(2);
                        refreshPlan(2);
                      }}
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
              {nativeExportSelected && (exportFmt === "auto" || exportFmt === "mp4") && (
                <Row k="Speed" v="Native render — keep this window open" />
              )}
              {exportPlan ? (
                <div className="rounded border border-border bg-white/[0.03] px-2.5 py-2 text-[11px] leading-snug">
                  <div className="font-medium text-foreground">
                    {exportPlan.summary}
                    {exportPlan.heuristic && (
                      <span className="text-muted-foreground"> (roughly — not measured yet)</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      className="border border-border rounded px-1.5 py-0.5 hover:border-white/40 disabled:opacity-50"
                      onClick={() => void measureExportSpeed()}
                      disabled={planning}
                    >
                      {planning ? "Measuring…" : "Re-measure"}
                    </button>
                    <span className="text-muted-foreground">
                      {exportPlan.totalFrames} frames · {exportPlan.width}×{exportPlan.height}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-2 text-[11px]">
                  <span className="text-muted-foreground">
                    Time unknown — this device hasn&apos;t rendered before.
                  </span>
                  <button
                    className="shrink-0 border border-border rounded px-1.5 py-0.5 hover:border-white/40 disabled:opacity-50"
                    onClick={() => void measureExportSpeed()}
                    disabled={planning}
                  >
                    {planning ? "Measuring…" : "Measure speed"}
                  </button>
                </div>
              )}
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
                  {nativeExportSelected && (exportFmt === "auto" || exportFmt === "mp4")
                    ? "Native rendering…"
                    : `Rendering… ${Math.round(exportProgress * 100)}%`}
                </div>
              </div>
            ) : (
              <button className="mb-btn w-full mt-5" onClick={() => void runExport()}>
                <Loader2 className={`h-4 w-4 ${dur === 0 ? "animate-spin" : "opacity-0"}`} /> Start
                export
              </button>
            )}
            {sourceConflicts.length > 0 && (
              <p className="text-[11px] text-amber-300/90 mt-3" role="status">
                {sourceConflicts.length} overlap(s) use the same media at once. The current renderer
                may show the wrong picture or sound; remove the overlap or import a separate copy
                before exporting.
              </p>
            )}
            {unplayableMainCount > 0 &&
              !(nativeExportSelected && (exportFmt === "auto" || exportFmt === "mp4")) && (
                <p className="text-[11px] text-amber-300/90 -mt-1">
                  ⚠ {unplayableMainCount} clip(s) can't be decoded on this device — they will be
                  exported as audio over a black screen.
                </p>
              )}
            <p className="text-[11px] text-muted-foreground mt-3">
              MP4 (H.264 + AAC) is encoded by the WebCodecs engine — Chrome, Edge and the
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
