import { useEffect, useState } from "react";
import type { MediaItem, OverlayClip, Project } from "../types";
import { mainClipDuration } from "../types";
import { fmtTime } from "../utils";

export type Selection =
  | { lane: "main"; id: string }
  | { lane: "overlay"; trackId: string; id: string }
  | null;

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
  onOverlayPatch: (trackId: string, clipId: string, patch: Partial<OverlayClip>) => void;
}

export function Timeline(p: Props) {
  const { project, pps, t, spans } = p;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dur = spans.length ? spans[spans.length - 1].end : 0;
  const [maxEnd, setMaxEnd] = useState(0);
  useEffect(() => {
    let m = dur;
    for (const tr of project.tracks) for (const c of tr.clips) m = Math.max(m, c.start + c.duration);
    setMaxEnd(m);
  }, [project, dur]);
  const total = Math.max(20, maxEnd + 2);
  const width = total * pps;

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
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let moved = false;
    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      onMove(dx, ev);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (!moved) onClick();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // ruler scrub
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

  const mediaById = (id: string) => p.media.find((m) => m.id === id);

  // ruler ticks
  const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const step = steps.find((s) => s * pps >= 64) ?? 60;
  const ticks: number[] = [];
  for (let s = 0; s <= total; s += step) ticks.push(s);

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden select-none">
        <div className="relative h-full" style={{ width }}>
          {/* ruler */}
          <div
            className="h-6 border-b border-border relative cursor-ew-resize bg-slate-950/60"
            onPointerDown={scrub}
            title="Drag to scrub"
          >
            {ticks.map((s) => (
              <div key={s} className="absolute top-0 h-full" style={{ left: s * pps }}>
                <div className="w-px h-2 bg-muted-foreground/60" />
                <span className="text-[9px] text-muted-foreground ml-1">{fmtTime(s).slice(0, 5)}</span>
              </div>
            ))}
          </div>

          {/* main lane */}
          <Lane label="Main" h={64} onDeselect={p.onDeselect} onSplit={p.onSplit} onDoubleClick={p.onSplit}>
            {spans.map((s, i) => {
              const m = mediaById(s.clip.mediaId);
              const selected = p.selection?.lane === "main" && p.selection.id === s.clip.id;
              return (
                <div
                  key={s.clip.id}
                  className={`absolute top-1 bottom-1 rounded overflow-hidden border transition-shadow ${
                    selected ? "border-cyan-400 ring-2 ring-cyan-400/60 z-10" : "border-white/15 hover:border-white/40"
                  } cursor-pointer bg-slate-800`}
                  style={{ left: s.start * pps, width: Math.max(8, (s.end - s.start) * pps) }}
                  onPointerDown={(e) =>
                    drag(e, () => undefined, () => p.onSelect({ lane: "main", id: s.clip.id }))
                  }
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    p.onSplit();
                  }}
                  title={`${m?.name ?? "clip"} · ${mainClipDuration(s.clip).toFixed(2)}s${s.clip.speed !== 1 ? ` · ${s.clip.speed}×` : ""} (double-click = split)`}
                >
                  {m?.thumb && (
                    <img
                      src={m.thumb}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none"
                      draggable={false}
                    />
                  )}
                  <div className="relative h-full px-1.5 py-0.5 flex items-start gap-1 pointer-events-none">
                    <span className="text-[10px] leading-tight truncate w-full drop-shadow">
                      {m?.name ?? "…"}
                      {s.clip.speed !== 1 && <span className="ml-1 text-cyan-300">{s.clip.speed}×</span>}
                      {s.clip.transitionIn !== "none" && i > 0 && (
                        <span className="ml-1 text-fuchsia-300">✂{s.clip.transitionIn}</span>
                      )}
                    </span>
                  </div>
                  {/* trim handles */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/0 hover:bg-cyan-400/50"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag(e, (dx) => {
                        const dSrc = (dx / pps) * s.clip.speed;
                        p.onMainTrim(s.clip.id, "in", s.clip.in + dSrc);
                      }, () => p.onSelect({ lane: "main", id: s.clip.id }));
                    }}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/0 hover:bg-cyan-400/50"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag(e, (dx) => {
                        const maxOut = m?.duration ?? s.clip.out + 1000;
                        const dSrc = (dx / pps) * s.clip.speed;
                        p.onMainTrim(s.clip.id, "out", Math.min(maxOut, s.clip.out + dSrc));
                      }, () => p.onSelect({ lane: "main", id: s.clip.id }));
                    }}
                  />
                  {/* move arrows */}
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5 pointer-events-auto" style={{ opacity: selected ? 1 : 0 }}>
                    <button
                      className="bg-black/70 rounded px-1 text-[9px] hover:text-cyan-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onMainMove(s.clip.id, -1);
                      }}
                    >
                      ◀
                    </button>
                    <button
                      className="bg-black/70 rounded px-1 text-[9px] hover:text-cyan-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onMainMove(s.clip.id, 1);
                      }}
                    >
                      ▶
                    </button>
                  </div>
                </div>
              );
            })}
          </Lane>

          {/* overlay lanes */}
          {project.tracks.map((tr) => (
            <Lane
              key={tr.id}
              label={tr.name}
              h={40}
              onDeselect={p.onDeselect}
              onSplit={p.onSplit}
              onDoubleClick={p.onSplit}
            >
              {tr.clips.map((c) => (
                <OverlayClipBox
                  key={c.id}
                  clip={c}
                  pps={pps}
                  total={total}
                  selected={p.selection?.lane === "overlay" && p.selection.id === c.id}
                  thumb={c.mediaId ? mediaById(c.mediaId)?.thumb : undefined}
                  onSelect={() => p.onSelect({ lane: "overlay", trackId: tr.id, id: c.id })}
                  onPatch={(patch) => p.onOverlayPatch(tr.id, c.id, patch)}
                />
              ))}
            </Lane>
          ))}

          {/* playhead */}
          <div className="absolute top-0 bottom-0 w-px bg-red-400 z-20 pointer-events-none" style={{ left: t * pps }}>
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
  onDoubleClick,
}: {
  label: string;
  h: number;
  children: React.ReactNode;
  onDeselect: () => void;
  onSplit: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      className="relative border-b border-border/60 bg-slate-950/30"
      style={{ height: h }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDeselect();
      }}
      onDoubleClick={onDoubleClick}
      title="Double-click: split at playhead"
    >
      <div className="absolute left-1 top-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/70 pointer-events-none">
        {label}
      </div>
      <div className="absolute inset-y-0 left-10 right-0">{children}</div>
    </div>
  );
}

function OverlayClipBox({
  clip,
  pps,
  total,
  selected,
  thumb,
  onSelect,
  onPatch,
}: {
  clip: OverlayClip;
  pps: number;
  total: number;
  selected: boolean;
  thumb?: string;
  onSelect: () => void;
  onPatch: (patch: Partial<OverlayClip>) => void;
}) {
  const kindColor =
    clip.kind === "text"
      ? "bg-cyan-500/25 border-cyan-400/50"
      : clip.kind === "image"
        ? "bg-fuchsia-500/25 border-fuchsia-400/50"
        : "bg-emerald-500/25 border-emerald-400/50";

  const begin = (e: React.PointerEvent, mode: "move" | "in" | "out") => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const base = { start: clip.start, duration: clip.duration };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      const d = dx / pps;
      if (mode === "move") {
        const ns = Math.max(0, Math.min(total - base.duration, base.start + d));
        onPatch({ start: ns });
      } else if (mode === "in") {
        const nd = Math.max(0.2, base.duration - d);
        const ns = Math.max(0, Math.min(total - nd, base.start + d));
        onPatch({ start: ns, duration: nd });
      } else {
        onPatch({ duration: Math.max(0.2, Math.min(total - base.start, base.duration + d)) });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) onSelect();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={`absolute top-1.5 bottom-1.5 rounded border flex items-center px-1.5 cursor-grab active:cursor-grabbing ${kindColor} ${
        selected ? "ring-2 ring-cyan-400 z-10" : "hover:border-white/40"
      }`}
      style={{ left: clip.start * pps, width: Math.max(14, clip.duration * pps) }}
      onPointerDown={(e) => begin(e, "move")}
      title={`${clip.kind}${clip.text ? `: ${clip.text.slice(0, 30)}` : ""} · ${clip.duration.toFixed(1)}s`}
    >
      {thumb ? (
        <img src={thumb} alt="" className="w-6 h-6 rounded object-cover mr-1 pointer-events-none" draggable={false} />
      ) : (
        <span className="text-[10px] truncate pointer-events-none">
          {clip.kind === "text" ? clip.text?.split("\n")[0] ?? "text" : clip.kind === "audio" ? "♪ audio" : "image"}
        </span>
      )}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/10 hover:bg-cyan-300/60"
        onPointerDown={(e) => begin(e, "in")}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/10 hover:bg-cyan-300/60"
        onPointerDown={(e) => begin(e, "out")}
      />
    </div>
  );
}
