import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, Magnet, Music2, Type, Volume2, VolumeX, Wand2 } from "lucide-react";
import type { Keyframe, MediaItem, OverlayClip, Project } from "../types";
import { mainClipDuration } from "../types";
import { fmtTime } from "../utils";

export type Selection =
  { lane: "main"; id: string } | { lane: "overlay"; trackId: string; id: string } | null;

interface Span {
  clip: Project["main"][number];
  start: number;
  end: number;
}

interface Props {
  project: Project;
  pps: number;
  t: number;
  selection: Selection;
  spans: Span[];
  media: MediaItem[];
  onSeek: (t: number) => void;
  onSelect: (s: Selection) => void;
  onDeselect: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onMainTrim: (id: string, edge: "in" | "out", srcTime: number) => void;
  onMainSpeed: (id: string, speed: number) => void;
  onMainMove: (id: string, dir: -1 | 1) => void;
  /** drag a main clip to an arbitrary index (replaces arrow nudges on desktop) */
  onMainReorder?: (id: string, toIndex: number) => void;
  onOverlayPatch: (trackId: string, clipId: string, patch: Partial<OverlayClip>) => void;
  /** move an overlay clip to a different lane */
  onOverlayMoveTrack?: (clipId: string, trackId: string) => void;
  onTrackFlag?: (
    trackId: string,
    patch: { muted?: boolean; solo?: boolean; hidden?: boolean },
  ) => void;
  onZoomChange?: (pps: number) => void;
  /** ask the engine for beats of the audio clip under the playhead */
  onDetectBeats?: (mediaId: string) => void;
  onClearBeats?: () => void;
}

export function Timeline(p: Props) {
  const { project, pps, t, spans } = p;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dur = spans.length ? spans[spans.length - 1].end : 0;
  const [maxEnd, setMaxEnd] = useState(0);
  /** which clip is being dragged (for the "move to index" ghost) */
  const [dragId, setDragId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);

  useEffect(() => {
    let m = dur;
    for (const tr of project.tracks)
      for (const c of tr.clips) m = Math.max(m, c.start + c.duration);
    setMaxEnd(m);
  }, [project, dur]);
  const total = Math.max(20, maxEnd + 2);
  const width = total * pps;
  const snapPointsFor = (clipId: string) => [
    t,
    ...beatsForSnap(project.beats ?? []),
    ...spans.flatMap((s) => [s.start, s.end]),
    // Never snap a clip to its own edges: it is always sitting exactly on
    // them, so every small drag would snap right back and the clip would
    // appear impossible to move (or to resize by a few pixels).
    ...project.tracks.flatMap((tr) =>
      tr.clips
        .filter((clip) => clip.id !== clipId)
        .flatMap((clip) => [clip.start, clip.start + clip.duration]),
    ),
  ];
  // A clip being resized must not snap to its own *other* edge/start either.
  const snapPointsForEdge = (clip: OverlayClip, mode: "move" | "in" | "out") => {
    const own = [clip.start, clip.start + clip.duration];
    const pts = snapPointsFor(clip.id);
    // for "in" the fixed edge is `start`; for "out" it is the end
    const keep = mode === "in" ? own[0] : mode === "out" ? own[1] : null;
    return keep == null ? pts : [keep, ...pts];
  };
  const fitTimeline = () => {
    const el = scrollRef.current;
    if (!el) return;
    p.onZoomChange?.(Math.max(16, Math.min(400, (el.clientWidth - 24) / total)));
    el.scrollLeft = 0;
  };
  const rowH = pps >= 90 ? 64 : 56;

  // keep playhead visible while playing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = t * pps;
    if (x < el.scrollLeft + 60 || x > el.scrollLeft + el.clientWidth - 60) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.25);
    }
  }, [t, pps]);

  const timeAt = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft) / pps);
  };

  // ---- generic drag helper
  const drag = (
    e: React.PointerEvent,
    onMove: (dx: number, e: PointerEvent) => void,
    onClick: () => void,
  ) => {
    if (e.pointerType !== "touch") e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let moved = false;
    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      onMove(dx, ev);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", cleanup);
    };
    const onPointerUp = () => {
      cleanup();
      if (!moved) onClick();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", cleanup);
  };

  // ruler scrub (click = seek, drag = scrub)
  const scrub = (e: React.PointerEvent) => {
    const startT = timeAt(e.clientX);
    p.onSeek(startT);
    const onMove = (ev: PointerEvent) => p.onSeek(timeAt(ev.clientX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const mediaById = (id?: string) => (id ? p.media.find((m) => m.id === id) : undefined);
  const beats = project.beats ?? [];

  // ruler ticks — adaptive density so zooming never floods the ruler
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  const step = steps.find((s) => s * pps >= 64) ?? 120;
  const ticks: number[] = [];
  for (let s = 0; s <= total; s += step) ticks.push(s);

  const wheelZoom = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = Math.max(16, Math.min(400, pps - Math.sign(e.deltaY) * 12));
      p.onZoomChange?.(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pps, p.onZoomChange],
  );

  /** Drag a main clip sideways to re-order it (desktop). */
  const beginReorder = (e: React.PointerEvent, id: string) => {
    if (!p.onMainReorder) return;
    const startX = e.clientX;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > 6) moved = true;
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragId(null);
      if (!moved) return;
      // drop index = which existing span covers the pointer
      const dropT = timeAt(ev.clientX);
      let idx = spans.findIndex((s) => dropT >= s.start && dropT < s.end);
      if (idx === -1) idx = dropT < (spans[0]?.start ?? 0) ? 0 : spans.length - 1;
      const from = spans.findIndex((s) => s.clip.id === id);
      if (from === -1 || from === idx) return;
      p.onMainReorder?.(id, idx);
    };
    setDragId(id);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* toolbar: beat markers + zoom */}
      <div className="h-7 shrink-0 border-b border-border/60 flex items-center gap-1 px-1.5 text-[10px] bg-slate-950/70">
        <button
          className="px-1.5 h-5 rounded hover:bg-slate-700/70 flex items-center gap-1 text-muted-foreground hover:text-cyan-300"
          title="Detect beats on the audio clip under the playhead and draw markers on the ruler"
          onClick={() => {
            const under = project.tracks
              .flatMap((tr) => tr.clips)
              .find(
                (c) => c.kind === "audio" && c.mediaId && t >= c.start && t < c.start + c.duration,
              );
            if (under?.mediaId) p.onDetectBeats?.(under.mediaId);
            else p.onDetectBeats?.("");
          }}
        >
          <Wand2 className="h-3 w-3" /> beats
        </button>
        <button
          className={`px-1.5 h-5 rounded flex items-center gap-1 ${snapEnabled ? "text-cyan-300 bg-cyan-400/10" : "text-muted-foreground hover:bg-slate-700/70"}`}
          title={
            snapEnabled
              ? "Snapping on — align clips to the playhead, beats and clip edges"
              : "Snapping off"
          }
          aria-pressed={snapEnabled}
          onClick={() => setSnapEnabled((v) => !v)}
        >
          <Magnet className="h-3 w-3" /> snap
        </button>
        {beats.length > 0 && (
          <button
            className="px-1.5 h-5 rounded hover:bg-slate-700/70 text-muted-foreground hover:text-red-300"
            title="Clear beat markers"
            onClick={() => p.onClearBeats?.()}
          >
            {beats.length} ✕
          </button>
        )}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {fmtTime(t)} · {fmtTime(dur)}
        </span>
        {p.onZoomChange && (
          <>
            <button
              className="px-1.5 h-5 rounded hover:bg-slate-700/70 text-muted-foreground"
              onClick={fitTimeline}
              title="Fit the complete timeline in view"
            >
              fit
            </button>
            <button
              className="w-5 h-5 rounded hover:bg-slate-700/70 text-muted-foreground"
              onClick={() => p.onZoomChange?.(Math.max(16, pps - 12))}
              title="Zoom out (Ctrl+wheel)"
            >
              −
            </button>
            <button
              className="w-5 h-5 rounded hover:bg-slate-700/70 text-muted-foreground"
              onClick={() => p.onZoomChange?.(Math.min(400, pps + 12))}
              title="Zoom in (Ctrl+wheel)"
            >
              +
            </button>
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto select-none overscroll-contain"
        onWheel={wheelZoom}
      >
        <div className="relative min-h-full" style={{ width, minWidth: "100%" }}>
          {/* ruler */}
          <div
            className="h-6 border-b border-border relative cursor-ew-resize bg-slate-950/60"
            onPointerDown={scrub}
            title="Drag to scrub · Ctrl+wheel to zoom"
          >
            {ticks.map((s) => (
              <div key={s} className="absolute top-0 h-full" style={{ left: s * pps }}>
                <div className="w-px h-2 bg-muted-foreground/60" />
                <span className="text-[9px] text-muted-foreground ml-1">
                  {fmtTime(s).slice(0, 5)}
                </span>
              </div>
            ))}
            {/* beat markers */}
            {beats.map((b, i) => (
              <div
                key={`b${i}`}
                className="absolute bottom-0 w-px bg-fuchsia-400/70"
                style={{ left: b * pps, height: 6 }}
                title={`beat @ ${fmtTime(b)}`}
              />
            ))}
          </div>

          {/* main lane */}
          <Lane label="Main" h={rowH} accent="cyan" onDeselect={p.onDeselect} onSplit={p.onSplit}>
            {spans.map((s, i) => {
              const m = mediaById(s.clip.mediaId);
              const selected = p.selection?.lane === "main" && p.selection.id === s.clip.id;
              const isDragging = dragId === s.clip.id;
              return (
                <div
                  key={s.clip.id}
                  className={`absolute top-1 bottom-1 rounded overflow-hidden border transition-shadow ${
                    selected
                      ? "border-cyan-400 ring-2 ring-cyan-400/60 z-10"
                      : "border-white/15 hover:border-white/40"
                  } cursor-grab active:cursor-grabbing bg-slate-800 ${isDragging ? "opacity-60 ring-2 ring-cyan-300" : ""}`}
                  style={{
                    left: s.start * pps,
                    width: Math.max(8, (s.end - s.start) * pps),
                    touchAction: "pan-y",
                  }}
                  onPointerDown={(e) => {
                    // selecting is the click action; a real drag reorders
                    if (e.pointerType === "touch") {
                      drag(
                        e,
                        () => {},
                        () => p.onSelect({ lane: "main", id: s.clip.id }),
                      );
                    } else {
                      p.onSelect({ lane: "main", id: s.clip.id });
                      beginReorder(e, s.clip.id);
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    p.onSplit();
                  }}
                  title={`${m?.name ?? "clip"} · ${mainClipDuration(s.clip).toFixed(2)}s${
                    s.clip.curve?.length
                      ? " · custom speed curve"
                      : s.clip.speed !== 1
                        ? ` · ${s.clip.speed}×`
                        : ""
                  } (drag = reorder · double-click = split)`}
                >
                  {m?.thumb && (
                    <img
                      src={m.thumb}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none"
                      draggable={false}
                    />
                  )}
                  {s.clip.curve && s.clip.curve.length >= 2 && !s.clip.freeze && (
                    <svg
                      className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <path
                        d={
                          s.clip.curve
                            .slice()
                            .sort((a, b) => a.at - b.at)
                            .map(
                              (q, k) =>
                                `${k ? "L" : "M"}${q.at * 100},${100 - Math.min(100, (q.v / 8) * 100)}`,
                            )
                            .join(" ") + " L100,100 L0,100 Z"
                        }
                        fill="rgba(251,191,36,0.18)"
                        stroke="rgba(251,191,36,0.9)"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  )}
                  <div className="relative h-full px-1.5 py-0.5 flex items-start gap-1 pointer-events-none">
                    <span className="text-[10px] leading-tight truncate w-full drop-shadow">
                      {s.clip.freeze && <span className="mr-1 text-sky-300">❄ freeze</span>}
                      {m?.name ?? "…"}
                      {s.clip.speed !== 1 && !s.clip.freeze && (
                        <span className="ml-1 text-cyan-300">{s.clip.speed}×</span>
                      )}
                      {s.clip.reverse && <span className="ml-1 text-fuchsia-300">⇄ rev</span>}
                      {s.clip.transitionIn !== "none" && i > 0 && (
                        <span className="ml-1 text-fuchsia-300">✂{s.clip.transitionIn}</span>
                      )}
                      {s.clip.rampTo != null && !s.clip.curve?.length && (
                        <span className="ml-1 text-amber-300">ramp</span>
                      )}
                      {s.clip.curve && s.clip.curve.length >= 2 && (
                        <span className="ml-1 text-amber-300">curve</span>
                      )}
                      {(s.clip.effect ?? "none") !== "none" && (
                        <span className="ml-1 text-emerald-300">fx:{s.clip.effect}</span>
                      )}
                      {s.clip.lut && <span className="ml-1 text-violet-300">lut:{s.clip.lut}</span>}
                      {s.clip.fit && s.clip.fit !== "cover" && (
                        <span className="ml-1 text-amber-200">{s.clip.fit}</span>
                      )}
                      {m?.denoised && <span className="ml-1 text-teal-300">denoise</span>}
                    </span>
                  </div>
                  {selected && (s.clip.keyframes?.length ?? 0) > 0 && (
                    <div className="absolute top-0 bottom-0 pointer-events-none">
                      {s.clip.keyframes!.map((k) => (
                        <div
                          key={k.at}
                          className="absolute top-0.5 text-fuchsia-300 text-[8px] leading-none drop-shadow"
                          style={{ left: k.at * pps }}
                          title={`keyframe ${k.at.toFixed(2)}s in clip`}
                        >
                          ◆
                        </div>
                      ))}
                    </div>
                  )}
                  {/* trim handles */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-3.5 cursor-ew-resize bg-cyan-400/30 hover:bg-cyan-400/70 border-r border-black/30 z-10"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const startIn = s.clip.in;
                      const rate = s.clip.freeze ? 1 : s.clip.speed;
                      drag(
                        e,
                        (dx) => {
                          const dSrc = (dx / pps) * rate;
                          p.onMainTrim(s.clip.id, "in", startIn + dSrc);
                        },
                        () => p.onSelect({ lane: "main", id: s.clip.id }),
                      );
                    }}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-3.5 cursor-ew-resize bg-cyan-400/30 hover:bg-cyan-400/70 border-l border-black/30 z-10"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const startOut = s.clip.out;
                      const rate = s.clip.freeze ? 1 : s.clip.speed;
                      drag(
                        e,
                        (dx) => {
                          const dSrc = (dx / pps) * rate;
                          p.onMainTrim(s.clip.id, "out", startOut + dSrc);
                        },
                        () => p.onSelect({ lane: "main", id: s.clip.id }),
                      );
                    }}
                  />
                  {/* grab hint: the whole clip body is draggable to reorder */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-0.5 h-1 w-6 rounded-full bg-white/25 pointer-events-none"
                    aria-hidden
                  />
                </div>
              );
            })}
            {spans.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground pointer-events-none">
                Drop media here or use “+ clip → timeline”
              </div>
            )}
          </Lane>

          {/* overlay lanes */}
          {project.tracks.map((tr) => {
            const isAudioTrack = tr.id === "t_audio";
            return (
              <Lane
                key={tr.id}
                label={tr.name}
                h={40}
                accent={isAudioTrack ? "emerald" : tr.id === "t_text" ? "cyan" : "fuchsia"}
                icon={
                  isAudioTrack ? (
                    <Music2 className="h-2.5 w-2.5" />
                  ) : tr.id === "t_text" ? (
                    <Type className="h-2.5 w-2.5" />
                  ) : undefined
                }
                onDeselect={p.onDeselect}
                onSplit={p.onSplit}
                dim={tr.hidden || tr.muted}
              >
                {/* track controls */}
                <div className="sticky left-1 top-0 z-20 flex w-fit items-center gap-0.5">
                  <button
                    className="h-4 w-4 rounded bg-black/50 hover:bg-slate-700 text-muted-foreground hover:text-cyan-300 flex items-center justify-center"
                    title={tr.hidden ? "Show track" : "Hide track"}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onTrackFlag?.(tr.id, { hidden: !tr.hidden });
                    }}
                  >
                    {tr.hidden ? (
                      <EyeOff className="h-2.5 w-2.5" />
                    ) : (
                      <Eye className="h-2.5 w-2.5" />
                    )}
                  </button>
                  {isAudioTrack && (
                    <>
                      <button
                        className={`h-4 w-4 rounded bg-black/50 hover:bg-slate-700 flex items-center justify-center ${
                          tr.muted ? "text-red-400" : "text-muted-foreground"
                        }`}
                        title={tr.muted ? "Unmute track" : "Mute track"}
                        onClick={(e) => {
                          e.stopPropagation();
                          p.onTrackFlag?.(tr.id, { muted: !tr.muted });
                        }}
                      >
                        {tr.muted ? (
                          <VolumeX className="h-2.5 w-2.5" />
                        ) : (
                          <Volume2 className="h-2.5 w-2.5" />
                        )}
                      </button>
                      <button
                        className={`h-4 w-4 rounded bg-black/50 hover:bg-slate-700 text-[8px] font-bold flex items-center justify-center ${
                          tr.solo ? "text-amber-300 bg-amber-400/20" : "text-muted-foreground"
                        }`}
                        title="Solo this track"
                        onClick={(e) => {
                          e.stopPropagation();
                          p.onTrackFlag?.(tr.id, { solo: !tr.solo });
                        }}
                      >
                        S
                      </button>
                    </>
                  )}
                </div>
                {tr.clips.map((c) => (
                  <OverlayClipBox
                    key={c.id}
                    clip={c}
                    trackId={tr.id}
                    mediaDuration={mediaById(c.mediaId)?.duration}
                    pps={pps}
                    total={total}
                    selected={p.selection?.lane === "overlay" && p.selection.id === c.id}
                    thumb={mediaById(c.mediaId)?.thumb}
                    wave={c.kind === "audio" ? mediaById(c.mediaId)?.wave : undefined}
                    denoised={c.kind === "audio" ? mediaById(c.mediaId)?.denoised : undefined}
                    lanes={project.tracks.map((x) => ({ id: x.id, name: x.name }))}
                    snapEnabled={snapEnabled}
                    snapPoints={snapPointsFor(c.id)}
                    onSelect={() => p.onSelect({ lane: "overlay", trackId: tr.id, id: c.id })}
                    onPatch={(patch) => p.onOverlayPatch(tr.id, c.id, patch)}
                    onMoveTrack={(tid) => p.onOverlayMoveTrack?.(c.id, tid)}
                  />
                ))}
              </Lane>
            );
          })}

          {/* playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400 z-30 pointer-events-none"
            style={{ left: t * pps }}
          >
            <div className="w-3 h-3 -ml-[5px] bg-red-400 [clip-path:polygon(0_0,100%_0,50%_100%)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Lane({
  label,
  h,
  children,
  onDeselect,
  onSplit,
  accent = "cyan",
  icon,
  dim,
}: {
  label: string;
  h: number;
  children: React.ReactNode;
  onDeselect: () => void;
  onSplit: () => void;
  accent?: "cyan" | "fuchsia" | "emerald";
  icon?: React.ReactNode;
  dim?: boolean;
}) {
  const accentCls =
    accent === "fuchsia"
      ? "text-fuchsia-300/60"
      : accent === "emerald"
        ? "text-emerald-300/60"
        : "text-cyan-300/60";
  return (
    <div
      className={`relative border-b border-border/60 bg-slate-950/30 ${dim ? "opacity-50" : ""}`}
      style={{ height: h }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDeselect();
      }}
      onDoubleClick={onSplit}
      title="Double-click: split at playhead"
    >
      <div
        className={`absolute left-1 top-0.5 text-[9px] uppercase tracking-wider pointer-events-none z-10 bg-slate-950/60 rounded px-0.5 flex items-center gap-0.5 ${accentCls}`}
      >
        {icon}
        {label}
      </div>
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

function OverlayClipBox({
  clip,
  trackId,
  mediaDuration,
  pps,
  total,
  selected,
  thumb,
  wave,
  denoised,
  lanes,
  snapEnabled,
  snapPoints,
  onSelect,
  onPatch,
  onMoveTrack,
}: {
  clip: OverlayClip;
  trackId: string;
  mediaDuration?: number;
  pps: number;
  total: number;
  selected: boolean;
  thumb?: string;
  wave?: number[];
  denoised?: boolean;
  lanes: { id: string; name: string }[];
  snapEnabled: boolean;
  snapPoints: number[];
  onSelect: () => void;
  onPatch: (patch: Partial<OverlayClip>) => void;
  onMoveTrack?: (trackId: string) => void;
}) {
  const kindColor =
    clip.kind === "text"
      ? "bg-cyan-500/25 border-cyan-400/50"
      : clip.kind === "image"
        ? "bg-fuchsia-500/25 border-fuchsia-400/50"
        : clip.kind === "video"
          ? "bg-amber-500/25 border-amber-400/50"
          : "bg-emerald-500/25 border-emerald-400/50";

  const begin = (e: React.PointerEvent, mode: "move" | "in" | "out") => {
    if (e.pointerType !== "touch") e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const base = {
      start: clip.start,
      duration: clip.duration,
      sourceOffset: clip.sourceOffset ?? 0,
    };
    const hasSource = clip.kind === "audio" || clip.kind === "video";
    const rate = clip.kind === "video" ? Math.max(0.05, clip.speed ?? 1) : 1;
    let moved = false;
    const startY = e.clientY;
    let laneDone = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      const d = dx / pps;
      const snap = (value: number) => {
        if (!snapEnabled) return value;
        const limit = 8 / pps;
        let best = value;
        let distance = limit;
        for (const point of snapPoints) {
          const delta = Math.abs(point - value);
          if (delta <= distance) {
            best = point;
            distance = delta;
          }
        }
        return best;
      };
      // vertical drag between lanes (only while moving, once per gesture)
      if (
        e.pointerType !== "touch" &&
        mode === "move" &&
        !laneDone &&
        onMoveTrack &&
        Math.abs(ev.clientY - startY) > 30
      ) {
        laneDone = true;
        // find a lane that accepts this clip kind (audio ↔ audio only)
        const wantsAudio = clip.kind === "audio";
        const candidates = lanes.filter((l) =>
          wantsAudio ? l.id === "t_audio" : l.id !== "t_audio",
        );
        const dir = ev.clientY > startY ? 1 : -1;
        const curIdx = candidates.findIndex((l) => l.id === trackId);
        const next =
          candidates[
            Math.max(0, Math.min(candidates.length - 1, (curIdx === -1 ? 0 : curIdx) + dir))
          ];
        if (next && next.id !== (curIdx === -1 ? "" : candidates[curIdx]?.id)) onMoveTrack(next.id);
        return;
      }
      if (mode === "move") {
        const raw = Math.max(0, Math.min(total - base.duration, base.start + d));
        const snappedStart = snap(raw);
        const snappedEnd = snap(raw + base.duration) - base.duration;
        const ns =
          Math.abs(snappedStart - raw) <= Math.abs(snappedEnd - raw) ? snappedStart : snappedEnd;
        onPatch({ start: Math.max(0, Math.min(total - base.duration, ns)) });
      } else if (mode === "in") {
        const earliest = hasSource ? Math.max(0, base.start - base.sourceOffset / rate) : 0;
        const latest = base.start + base.duration - 0.2;
        const rawStart = Math.max(earliest, Math.min(latest, base.start + d));
        const ns = Math.max(earliest, Math.min(latest, snap(rawStart)));
        const nd = base.duration - (ns - base.start);
        onPatch({
          start: ns,
          duration: nd,
          ...(hasSource
            ? { sourceOffset: Math.max(0, base.sourceOffset + (ns - base.start) * rate) }
            : {}),
        });
      } else {
        const sourceEnd =
          hasSource && !clip.loop && mediaDuration != null && mediaDuration > 0
            ? base.start + Math.max(0, (mediaDuration - base.sourceOffset) / rate)
            : total;
        const maxEnd = Math.max(base.start + 0.2, Math.min(total, sourceEnd));
        const rawEnd = Math.max(base.start + 0.2, Math.min(maxEnd, base.start + base.duration + d));
        const end = Math.max(base.start + 0.2, Math.min(maxEnd, snap(rawEnd)));
        onPatch({ duration: end - base.start });
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
    };
    const onUp = () => {
      cleanup();
      if (!moved) onSelect();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
  };

  return (
    <div
      className={`absolute top-1.5 bottom-1.5 rounded border flex items-center px-1.5 cursor-grab active:cursor-grabbing overflow-hidden ${kindColor} ${
        selected ? "ring-2 ring-cyan-400 z-10" : "hover:border-white/40"
      }`}
      style={{
        left: clip.start * pps,
        width: Math.max(14, clip.duration * pps),
        touchAction: "pan-y",
      }}
      onPointerDown={(e) => begin(e, "move")}
      title={`${clip.kind}${clip.text ? `: ${clip.text.slice(0, 30)}` : ""} · ${clip.duration.toFixed(1)}s`}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="w-6 h-6 rounded object-cover mr-1 pointer-events-none"
          draggable={false}
        />
      ) : (
        <span className="text-[10px] truncate pointer-events-none relative z-10 bg-slate-950/40 rounded px-0.5">
          {clip.kind === "text"
            ? clip.text?.split("\n")[0] || "text"
            : clip.kind === "audio"
              ? "♪ audio"
              : clip.kind === "video"
                ? "▸ video"
                : "image"}
          {clip.chroma && " · chroma"}
          {denoised && " · denoise"}
          {clip.anim === "karaoke" && " · karaoke"}
          {clip.fx &&
            ((clip.fx.reverb ?? 0) > 0 || (clip.fx.echo ?? 0) > 0 || (clip.fx.pitch ?? 0) !== 0) &&
            " · fx"}
          {(clip.blend && clip.blend !== "normal") || (clip.mask && clip.mask !== "none")
            ? " · ◑"
            : ""}
          {clip.duck ? " · duck" : ""}
        </span>
      )}
      {wave && (
        <div className="absolute inset-0.5 pointer-events-none">
          <Waveform wave={wave} color="rgba(110,231,183,0.75)" />
        </div>
      )}
      {selected && (clip.keyframes?.length ?? 0) > 0 && (
        <div className="absolute top-0 bottom-0 pointer-events-none">
          {clip.keyframes!.map((k) => (
            <div
              key={k.at}
              className="absolute top-0 text-fuchsia-300 text-[8px] leading-none drop-shadow"
              style={{ left: k.at * pps }}
              title={`keyframe ${k.at.toFixed(2)}s in clip`}
            >
              ◆
            </div>
          ))}
        </div>
      )}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/10 hover:bg-cyan-300/60 z-20"
        onPointerDown={(e) => begin(e, "in")}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/10 hover:bg-cyan-300/60 z-20"
        onPointerDown={(e) => begin(e, "out")}
      />
    </div>
  );
}

/** Filter and de-duplicate finite timeline snap positions. */
function beatsForSnap(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

/** Tiny amplitude bars drawn once per size — audio clips get a real waveform. */
function Waveform({ wave, color = "rgba(125,211,252,0.8)" }: { wave: number[]; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (w < 4 || h < 4) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const bars = Math.max(8, Math.floor(w / 3));
      for (let i = 0; i < bars; i++) {
        const v = wave[Math.floor((i / bars) * wave.length)] ?? 0;
        const bh = Math.max(1, v * (h - 2));
        ctx.fillRect(i * (w / bars), (h - bh) / 2, Math.max(1, w / bars - 1), bh);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [wave, color]);
  return <canvas ref={ref} className="w-full h-full block" />;
}

export type { Keyframe };
