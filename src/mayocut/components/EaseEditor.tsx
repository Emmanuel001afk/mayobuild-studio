import { useRef, useState } from "react";
import {
  DEFAULT_BEZIER,
  EASE_PRESETS,
  easeName,
  sampleEase,
  type Bezier4,
  type EaseId,
} from "../easings";

/**
 * A graph editor for the segment after one keyframe.
 *
 * CapCut ships a draggable Bezier graph here; without one the only alternative
 * is a dropdown of presets, which cannot express the curve someone actually
 * wants. The handles are dragged directly on the curve, and the plot is the
 * same `sampleEase` the renderer uses, so the shape on screen is the shape that
 * plays back — not an approximation drawn for the eye.
 *
 * Accessibility: dragging is a pointer nicety, not the only way in. The four
 * control-point numbers are editable, and every preset is a button, so the
 * feature is usable without a precise pointer.
 */
export function EaseEditor({
  ease,
  bez,
  onChange,
}: {
  ease: EaseId;
  bez?: Bezier4;
  onChange: (ease: EaseId, bez?: Bezier4) => void;
}) {
  const curve = bez ?? DEFAULT_BEZIER;
  const [dragging, setDragging] = useState<null | "p1" | "p2">(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // plot box in viewBox units; y is flipped because a canvas grows downward
  const S = 100;
  const pad = 10;
  const plot = S - pad * 2;
  const toPx = (u: number, v: number) => [pad + u * plot, pad + (1 - v) * plot];

  const points = sampleEase(ease, curve, 40);
  const path = points
    .map(([u, v], i) => {
      const [x, y] = toPx(u, v);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const [h1x, h1y] = toPx(curve.x1, curve.y1);
  const [h2x, h2y] = toPx(curve.x2, curve.y2);

  const move = (which: "p1" | "p2", clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const u = (clientX - r.left) / r.width;
    // flip, then rescale from the padded plot box
    const vRaw = 1 - (clientY - r.top) / r.height;
    const uu = Math.max(0, Math.min(1, (u * S - pad) / plot));
    // x must stay in 0..1 or the curve stops being a function of time; y may
    // overshoot deliberately, so it is only bounded loosely.
    const vv = Math.max(-0.5, Math.min(1.5, (vRaw * S - pad) / plot));
    const next: Bezier4 =
      which === "p1" ? { ...curve, x1: uu, y1: vv } : { ...curve, x2: uu, y2: vv };
    onChange("custom", next);
  };

  return (
    <div className="mt-1.5 rounded border border-border bg-slate-900/60 p-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">Ease after this keyframe</span>
        <span className="text-[10px] text-fuchsia-300">{easeName(ease)}</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-1.5">
        {EASE_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`h-6 px-1.5 border text-[10px] ${
              ease === p.id
                ? "border-fuchsia-400 bg-fuchsia-400/20 text-fuchsia-200"
                : "border-border text-muted-foreground hover:border-white/40"
            }`}
            title={`${p.name} interpolation for the segment after this keyframe`}
            onClick={() => onChange(p.id, p.id === "custom" ? curve : undefined)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${S} ${S}`}
        className="w-full h-24 bg-slate-950 border border-border rounded touch-none select-none"
        onPointerMove={(ev) => {
          if (!dragging) return;
          move(dragging, ev.clientX, ev.clientY);
        }}
        onPointerUp={() => setDragging(null)}
        onPointerLeave={() => setDragging(null)}
      >
        {/* the linear reference, so the curve's shape is readable */}
        <line
          x1={pad}
          y1={pad + plot}
          x2={pad + plot}
          y2={pad}
          stroke="#334155"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        <rect
          x={pad}
          y={pad}
          width={plot}
          height={plot}
          fill="none"
          stroke="#1e293b"
          strokeWidth="0.6"
        />
        <path d={path} fill="none" stroke="#e879f9" strokeWidth="1.8" />
        {/* control-point tethers, drawn like a curve editor rather than a parabola */}
        <line x1={pad} y1={pad + plot} x2={h1x} y2={h1y} stroke="#475569" strokeWidth="0.7" />
        <line x1={pad + plot} y1={pad} x2={h2x} y2={h2y} stroke="#475569" strokeWidth="0.7" />
        <circle
          cx={h1x}
          cy={h1y}
          r="3.2"
          fill="#0f172a"
          stroke="#22d3ee"
          strokeWidth="1.2"
          className="cursor-grab"
          onPointerDown={(ev) => {
            ev.stopPropagation();
            setDragging("p1");
          }}
        />
        <circle
          cx={h2x}
          cy={h2y}
          r="3.2"
          fill="#0f172a"
          stroke="#22d3ee"
          strokeWidth="1.2"
          className="cursor-grab"
          onPointerDown={(ev) => {
            ev.stopPropagation();
            setDragging("p2");
          }}
        />
      </svg>

      {/* numeric entry — the pointer drag is a convenience, not the only way */}
      <div className="grid grid-cols-4 gap-1 mt-1.5">
        {(
          [
            ["x1", curve.x1],
            ["y1", curve.y1],
            ["x2", curve.x2],
            ["y2", curve.y2],
          ] as const
        ).map(([k, val]) => (
          <label key={k} className="text-[9px] text-muted-foreground">
            {k}
            <input
              type="number"
              step="0.05"
              aria-label={`Bezier ${k}`}
              className="w-full bg-slate-900 border border-border rounded px-1 py-0.5 text-[10px] tabular-nums text-foreground"
              value={Number(val.toFixed(2))}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                const next: Bezier4 = { ...curve, [k]: n };
                // x outside 0..1 would stop the curve being monotonic in time
                if (k === "x1" || k === "x2") next[k] = Math.max(0, Math.min(1, n));
                else next[k] = Math.max(-0.5, Math.min(1.5, n));
                onChange("custom", next);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
