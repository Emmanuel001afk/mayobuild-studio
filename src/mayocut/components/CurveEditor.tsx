// MayoCut — the tone-curve editor.
//
// A draggable graph rather than four sliders: an S-curve is a shape, and the
// only honest way to pick one is to see and move it. Points are dragged with a
// pointer, clamped to the box, and fed through the same monotone interpolation
// the renderer uses, so the line drawn here IS the line applied to the picture.
import { useCallback, useRef, useState } from "react";
import { curveLut, type CurvePoint } from "../curves";

type Channel = "rgb" | "r" | "g" | "b";

const CHANNEL_COLOR: Record<Channel, string> = {
  rgb: "#e5e7eb",
  r: "#f87171",
  g: "#4ade80",
  b: "#60a5fa",
};

interface Props {
  points: CurvePoint[];
  onChange: (points: CurvePoint[]) => void;
  channel?: Channel;
  size?: number;
}

export function CurveEditor({ points, onChange, channel = "rgb", size = 180 }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const color = CHANNEL_COLOR[channel];

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 1 };
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height)),
    };
  }, []);

  const movePoint = (index: number, x: number, y: number) => {
    const next = points.map((p, i) => (i === index ? { x, y } : p));
    // the two endpoints keep their x so the curve always spans the full range
    if (index === 0) next[0] = { x: 0, y };
    else if (index === points.length - 1) next[index] = { x: 1, y };
    onChange(next);
  };

  const addPoint = (x: number, y: number) => {
    const next = [...points, { x, y }].sort((a, b) => a.x - b.x);
    onChange(next);
  };

  const lut = curveLut(points);
  const path = Array.from({ length: 65 }, (_, i) => {
    const x = i / 64;
    const y = lut[Math.round(x * 255)] / 255;
    return `${i === 0 ? "M" : "L"} ${x * size} ${(1 - y) * size}`;
  }).join(" ");

  return (
    <div className="space-y-1">
      <div
        ref={boxRef}
        className="relative rounded border border-border bg-black/50 touch-none select-none"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          const { x, y } = toLocal(e.clientX, e.clientY);
          // click near an existing point = grab it, otherwise add one
          let best = -1;
          let bestD = 0.06;
          points.forEach((p, i) => {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestD) {
              best = i;
              bestD = d;
            }
          });
          if (best >= 0) {
            setDrag(best);
          } else {
            addPoint(x, y);
          }
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          const { x, y } = toLocal(e.clientX, e.clientY);
          movePoint(drag, x, y);
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        {/* grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <div
            key={`h${g}`}
            className="absolute inset-x-0 border-t border-white/10"
            style={{ top: `${g * 100}%` }}
          />
        ))}
        {[0.25, 0.5, 0.75].map((g) => (
          <div
            key={`v${g}`}
            className="absolute inset-y-0 border-l border-white/10"
            style={{ left: `${g * 100}%` }}
          />
        ))}
        {/* the identity diagonal, for reference */}
        <svg className="absolute inset-0 pointer-events-none" width={size} height={size}>
          <line
            x1={0}
            y1={size}
            x2={size}
            y2={0}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="3 3"
          />
        </svg>
        {/* the curve */}
        <svg className="absolute inset-0 pointer-events-none" width={size} height={size}>
          <path d={path} fill="none" stroke={color} strokeWidth={1.75} />
        </svg>
        {/* control points */}
        {points.map((p, i) => (
          <div
            key={`${i}-${p.x.toFixed(3)}`}
            className="absolute rounded-full border"
            style={{
              width: 9,
              height: 9,
              left: `calc(${p.x * 100}% - 4.5px)`,
              top: `calc(${(1 - p.y) * 100}% - 4.5px)`,
              background: drag === i ? color : "#0b0b0d",
              borderColor: color,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>shadows</span>
        <span>{points.length} points · click to add, drag to shape</span>
        <span>highlights</span>
      </div>
    </div>
  );
}
