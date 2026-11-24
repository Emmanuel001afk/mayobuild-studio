import { useRef, useState } from "react";
import {
  PROPERTIES,
  fmtProp,
  normalisePropPoints,
  propLabel,
  propToUnit,
  propValueAt,
  seedCurve,
  tracksActive,
  unitToProp,
  type PropPoints,
  type PropSpec,
} from "../property-curves";
import type { MainClip, OverlayClip } from "../types";

/**
 * The multi-point property graph.
 *
 * This is the CapCut-style graph the keyframe editor could not be: ONE curve per
 * property, several properties at once, and any number of points between. The
 * keyframe model could only ever draw one mixed value, because a keyframe is a
 * snapshot of all five anim values.
 *
 * Design rules that matter:
 *  · The plot is drawn from `propValueAt` — the exact function the renderer
 *    calls — so the line on screen is the line that plays.
 *  · Every property is normalised to 0..1 vertically, so a volume swing and a
 *    180° rotation read at the same scale. The axis labels show real units.
 *  · Points are draggable, addable (click empty space) and removable (right
 *    click / long press alternative: the ✕ on the selected point).
 *  · Points are also editable numerically, so the graph is usable without a
 *    precise pointer — the same standard as the ease editor.
 */
export function PropertyGraph({
  clip,
  duration,
  playheadLocal,
  onChange,
  onSeekLocal,
}: {
  clip: MainClip | OverlayClip;
  duration: number;
  playheadLocal: number | null;
  onChange: (prop: string, points: PropPoints | null) => void;
  onSeekLocal: (local: number) => void;
}) {
  const kind = "kind" in clip ? "overlay" : "main";
  const specs = PROPERTIES.filter((p) => p.kinds.includes(kind));
  const [active, setActive] = useState<string>(specs[0]?.id ?? "opacity");
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const boxRef = useRef<SVGSVGElement | null>(null);

  const spec: PropSpec = specs.find((p) => p.id === active) ?? specs[0];
  const curves = clip.propCurves ?? {};
  const withCurves = specs.filter((p) => curves[p.id] && curves[p.id].length >= 2);

  const S = 100;
  const pad = 8;
  const plot = S - pad * 2;
  const toPx = (u: number, v: number) => [pad + u * plot, pad + (1 - v) * plot];

  const points = normalisePropPoints(curves[active]) ?? seedCurve(spec, clip);
  const isSeeded = !normalisePropPoints(curves[active]);

  // sample through the real evaluator so the drawn line cannot drift from playback
  const sampleClip = { ...clip, propCurves: { ...curves, [active]: points } } as
    MainClip | OverlayClip;
  const path = Array.from({ length: 65 }, (_, i) => {
    const u = i / 64;
    const real = propValueAt(sampleClip, active, u * Math.max(1e-6, duration), duration);
    return toPx(u, propToUnit(spec, real));
  })
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  const commit = (next: PropPoints) => onChange(active, normalisePropPoints(next));

  const localFromEvent = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    const u = (clientX - r.left) / r.width;
    const vRaw = 1 - (clientY - r.top) / r.height;
    return {
      u: Math.max(0, Math.min(1, (u * S - pad) / plot)),
      v: Math.max(0, Math.min(1, (vRaw * S - pad) / plot)),
    };
  };

  const movePoint = (index: number, u: number, v: number) => {
    const next = points.map((p, i) => (i === index ? { x: u, y: v } : p));
    // keep the ends pinned so the curve always spans the clip
    if (index === 0) next[0] = { x: 0, y: v };
    if (index === points.length - 1) next[index] = { x: 1, y: v };
    commit(next);
  };

  const addPoint = (u: number, v: number) => {
    const next = [...points, { x: u, y: v }];
    commit(next);
  };

  const removePoint = (index: number) => {
    if (points.length <= 2) {
      // two points is the minimum for a curve; removing one resets the property
      onChange(active, null);
      setSelected(null);
      return;
    }
    commit(points.filter((_, i) => i !== index));
    setSelected(null);
  };

  const real = (v: number) => unitToProp(spec, v);
  const playheadX = playheadLocal != null && duration > 0 ? playheadLocal / duration : null;

  return (
    <div className="mt-2 rounded border border-border bg-slate-900/60 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Property graph
        </span>
        <span className="text-[10px] text-cyan-300">
          {withCurves.length ? `${withCurves.length} animated` : "none animated"}
        </span>
      </div>

      {/* property tabs — one per curve, the thing a single keyframe graph cannot do */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {specs.map((p) => {
          const on = !!curves[p.id] && curves[p.id].length >= 2;
          return (
            <button
              key={p.id}
              aria-label={`Graph ${p.label}`}
              className={`h-6 px-1.5 border text-[10px] ${
                active === p.id
                  ? "border-cyan-400 bg-cyan-400/20 text-cyan-200"
                  : on
                    ? "border-cyan-400/40 text-cyan-300"
                    : "border-border text-muted-foreground hover:border-white/40"
              }`}
              onClick={() => {
                setActive(p.id);
                setSelected(null);
              }}
            >
              {p.label}
              {on && <span className="ml-0.5">•</span>}
            </button>
          );
        })}
      </div>

      <svg
        ref={boxRef}
        viewBox={`0 0 ${S} ${S}`}
        className="w-full h-32 bg-slate-950 border border-border rounded touch-none select-none"
        role="img"
        aria-label={`${spec.label} curve over time`}
        onPointerMove={(ev) => {
          if (dragging == null) return;
          const at = localFromEvent(ev.clientX, ev.clientY);
          if (at) movePoint(dragging, at.u, at.v);
        }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
        onDoubleClick={(ev) => {
          const at = localFromEvent(ev.clientX, ev.clientY);
          if (at) addPoint(at.u, at.v);
        }}
      >
        <rect
          x={pad}
          y={pad}
          width={plot}
          height={plot}
          fill="none"
          stroke="#1e293b"
          strokeWidth="0.6"
        />
        {/* midline = the neutral value, so "above/below" is readable at a glance */}
        <line
          x1={pad}
          y1={pad + plot / 2}
          x2={pad + plot}
          y2={pad + plot / 2}
          stroke="#1e293b"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        {playheadX != null && (
          <line
            x1={pad + playheadX * plot}
            y1={pad}
            x2={pad + playheadX * plot}
            y2={pad + plot}
            stroke="#f472b6"
            strokeWidth="0.6"
          />
        )}
        <path d={path} fill="none" stroke="#22d3ee" strokeWidth="1.8" />
        {points.map((p, i) => {
          const [x, y] = toPx(p.x, p.y);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={selected === i ? 3.4 : 2.6}
              fill={selected === i ? "#22d3ee" : "#0f172a"}
              stroke="#22d3ee"
              strokeWidth="1.2"
              className="cursor-grab"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                setSelected(i);
                setDragging(i);
              }}
              onDoubleClick={(ev) => {
                ev.stopPropagation();
                removePoint(i);
              }}
            />
          );
        })}
      </svg>

      <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
        <span>
          {points.length} point{points.length === 1 ? "" : "s"} · {spec.label}
        </span>
        <span className="tabular-nums">
          {fmtProp(spec, real(points[0].y))} → {fmtProp(spec, real(points[points.length - 1].y))}
        </span>
      </div>

      {/* numeric editing for the selected point — the graph must not require a
          precise pointer to be usable */}
      {selected != null && points[selected] && (
        <div className="grid grid-cols-2 gap-1 mt-1.5">
          <label className="text-[9px] text-muted-foreground">
            time (s)
            <input
              type="number"
              step="0.05"
              aria-label="Point time"
              className="w-full bg-slate-900 border border-border rounded px-1 py-0.5 text-[10px] tabular-nums"
              value={Number((points[selected].x * duration).toFixed(2))}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (!Number.isFinite(t) || duration <= 0) return;
                movePoint(selected, Math.max(0, Math.min(1, t / duration)), points[selected].y);
              }}
            />
          </label>
          <label className="text-[9px] text-muted-foreground">
            {spec.label}
            <input
              type="number"
              step={spec.max - spec.min > 20 ? 1 : 0.05}
              aria-label={`Point ${spec.label} value`}
              className="w-full bg-slate-900 border border-border rounded px-1 py-0.5 text-[10px] tabular-nums"
              value={Number(real(points[selected].y).toFixed(2))}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                movePoint(selected, points[selected].x, propToUnit(spec, v));
              }}
            />
          </label>
        </div>
      )}

      <div className="flex gap-1 mt-1.5">
        <button
          className="mb-btn-ghost h-6 px-2 text-[10px] border border-border"
          title="Add a point in the middle of this curve"
          onClick={() => {
            // insert at the largest gap so the new point is reachable
            let gi = 0;
            let best = -1;
            for (let i = 0; i < points.length - 1; i++) {
              const gap = points[i + 1].x - points[i].x;
              if (gap > best) {
                best = gap;
                gi = i;
              }
            }
            const x = (points[gi].x + points[gi + 1].x) / 2;
            const y = (points[gi].y + points[gi + 1].y) / 2;
            addPoint(x, y);
            setSelected(gi + 1);
          }}
        >
          + point
        </button>
        <button
          className="mb-btn-ghost h-6 px-2 text-[10px] border border-border"
          disabled={selected == null}
          onClick={() => selected != null && removePoint(selected)}
          title="Remove the selected point (two points minimum: removing one resets the property)"
        >
          − point
        </button>
        <button
          className="mb-btn-ghost h-6 px-2 text-[10px] border border-border"
          disabled={!curves[active]}
          title={`Reset ${spec.label} to the clip's own value`}
          onClick={() => {
            onChange(active, null);
            setSelected(null);
          }}
        >
          reset {propLabel(active).toLowerCase()}
        </button>
        <button
          className="mb-btn-ghost h-6 px-2 text-[10px] border border-border ml-auto"
          disabled={playheadLocal == null}
          title="Add a point at the playhead"
          onClick={() => {
            if (playheadLocal == null || duration <= 0) return;
            const u = Math.max(0, Math.min(1, playheadLocal / duration));
            const v = propToUnit(
              spec,
              propValueAt(
                { ...clip, propCurves: curves } as MainClip | OverlayClip,
                active,
                playheadLocal,
                duration,
              ),
            );
            addPoint(u, v);
          }}
        >
          + at playhead
        </button>
      </div>

      {isSeeded && (
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
          Nothing animated on {spec.label} yet — this flat line is the clip&apos;s current value.
          Drag a point, double-click the graph to add one, or use “+ at playhead”.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
        Double-click the graph to add a point · drag to move · double-click a point to remove it.
        Playhead is the pink line.
      </p>
    </div>
  );
}
