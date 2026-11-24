// MayoCut — the Scopes panel.
//
// Kdenlive docks histogram, waveform and vectorscope next to the monitor because
// you cannot grade what you cannot measure. Without them, "the sky is clipped"
// and "this clip is warmer than the last" are guesses made by squinting.
//
// Three deliberate decisions:
//
//  1. The reading, not just the picture. Each scope is followed by a sentence
//     saying what it means. A waveform that requires a colour-grading course to
//     interpret is a feature for the people who least need it.
//  2. Numbers are visible. Clipped share, mean saturation, channel cast. Half
//     the value of a scope is the ability to say "6.2% blown" out loud.
//  3. It tells you when it cannot measure. A tainted canvas returns null, and
//     the panel says so rather than drawing a flat line that looks like data.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  channelBalance,
  readExposure,
  type Histogram,
  type Vectorscope,
  type Waveform,
} from "../scopes";

interface PanelProps {
  /** null when the caller has no canvas or the readback was refused */
  sample: () => { histogram: Histogram; waveform: Waveform; vectorscope: Vectorscope } | null;
  /** bumps when the picture changes, so the scopes refresh */
  version: number;
}

type ScopeTab = "histogram" | "waveform" | "vectorscope";

export function Scopes({ sample, version }: PanelProps) {
  const [tab, setTab] = useState<ScopeTab>("histogram");
  const [data, setData] = useState<ReturnType<PanelProps["sample"]>>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    // one frame later: let the engine finish drawing before reading back
    requestAnimationFrame(() => {
      try {
        const r = sample();
        setData(r);
        setFailed(!r);
      } catch {
        setFailed(true);
      } finally {
        busy.current = false;
      }
    });
  }, [sample]);

  useEffect(() => {
    refresh();
  }, [refresh, version]);

  const reading = data ? readExposure(data.histogram) : null;
  const balance = data ? channelBalance(data.histogram) : null;

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Scopes</span>
        <div className="flex gap-0.5">
          {(["histogram", "waveform", "vectorscope"] as ScopeTab[]).map((t) => (
            <button
              key={t}
              className={`px-1.5 h-5 rounded text-[10px] border ${
                tab === t
                  ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                  : "border-border text-muted-foreground hover:border-white/40"
              }`}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === "vectorscope" ? "Vector" : t === "waveform" ? "Wave" : "Histogram"}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <div className="text-[10px] text-amber-300 leading-snug">
          Cannot read this frame. That happens when the media comes from another origin — the
          browser blocks pixel readback. The grade still applies; only the measurement is missing.
        </div>
      )}

      {!data && !failed && <div className="h-28 rounded bg-slate-900 animate-pulse" />}

      {data && tab === "histogram" && <HistogramView h={data.histogram} />}
      {data && tab === "waveform" && <WaveformView w={data.waveform} />}
      {data && tab === "vectorscope" && <VectorView v={data.vectorscope} />}

      {reading && (
        <div
          className={`rounded border px-2 py-1 text-[10px] leading-snug ${
            reading.verdict === "balanced"
              ? "border-emerald-500/40 text-emerald-300"
              : reading.verdict === "flat"
                ? "border-border text-muted-foreground"
                : "border-amber-500/40 text-amber-300"
          }`}
        >
          {reading.message}
        </div>
      )}

      {balance && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
          <span>
            R {Math.round(balance.r)} · G {Math.round(balance.g)} · B {Math.round(balance.b)}
          </span>
          <span className={balance.cast === "neutral" ? "" : "text-amber-300"}>{balance.cast}</span>
        </div>
      )}

      <button className="mb-btn-ghost w-full h-6 text-[10px]" onClick={refresh}>
        Measure this frame
      </button>
    </div>
  );
}

/** Per-channel histogram. Channel peaks are normalised independently, which is
 *  what makes a colour cast visible instead of hiding it behind the green. */
function HistogramView({ h }: { h: Histogram }) {
  const W = 256;
  const H = 96;
  const path = (bins: Uint32Array, peak: number) => {
    let d = `M0,${H}`;
    for (let i = 0; i < 256; i++) {
      // sqrt scale: a single bright sky pixel is 1000x the count of a midtone,
      // and a linear plot is one spike with an unreadable flat line beside it
      const y = H - Math.min(H, Math.sqrt(bins[i] / Math.max(1, peak)) * H);
      d += ` L${i},${y}`;
    }
    return `${d} L${W},${H} Z`;
  };
  return (
    <div className="rounded overflow-hidden bg-slate-950 border border-border">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" aria-label="Histogram">
        <path d={path(h.r, Math.max(...h.r))} fill="rgba(248,113,113,0.45)" />
        <path d={path(h.g, Math.max(...h.g))} fill="rgba(74,222,128,0.45)" />
        <path d={path(h.b, Math.max(...h.b))} fill="rgba(96,165,250,0.45)" />
      </svg>
      <div className="flex justify-between px-1 pb-0.5 text-[9px] text-muted-foreground tabular-nums">
        <span>shadows</span>
        <span>{((h.clipped / Math.max(1, h.total)) * 100).toFixed(1)}% clipped</span>
        <span>highlights</span>
      </div>
    </div>
  );
}

/** Luma waveform: horizontal position = where in the frame, vertical = luma. */
function WaveformView({ w }: { w: Waveform }) {
  const H = 256;
  const cols = w.w;
  const cells: { x: number; y: number; a: number }[] = [];
  const n = Math.max(1, w.peak);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < H; y++) {
      const v = w.data[x * H + y];
      if (!v) continue;
      cells.push({ x, y, a: Math.sqrt(v / n) });
    }
  }
  return (
    <div className="rounded overflow-hidden bg-slate-950 border border-border">
      <svg viewBox={`0 0 ${cols} ${H}`} className="w-full h-24" aria-label="Waveform">
        {cells.map((c, i) => (
          <rect
            key={i}
            x={c.x}
            y={H - c.y}
            width={1}
            height={1}
            fill="rgba(74,222,128,0.75)"
            opacity={Math.min(1, c.a)}
          />
        ))}
        {/* 0 / 50 / 100 IRE guides, so "properly exposed" is visible not implied */}
        {[0, 128, 255].map((y) => (
          <line
            key={y}
            x1={0}
            x2={cols}
            y1={H - y}
            y2={H - y}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={0.5}
          />
        ))}
      </svg>
      <div className="px-1 pb-0.5 text-[9px] text-muted-foreground">
        left of frame → right · higher = brighter
      </div>
    </div>
  );
}

/** Vectorscope: chroma density, with the broadcast-safe circle drawn. */
function VectorView({ v }: { v: Vectorscope }) {
  const N = v.n;
  const n = Math.max(1, v.peak);
  const pts: { x: number; y: number; a: number }[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = v.data[y * N + x];
      if (!c) continue;
      pts.push({ x, y, a: Math.sqrt(c / n) });
    }
  }
  return (
    <div className="rounded overflow-hidden bg-slate-950 border border-border">
      <svg viewBox={`0 0 ${N} ${N}`} className="w-full h-32" aria-label="Vectorscope">
        <circle cx={N / 2} cy={N / 2} r={N / 2 - 1} fill="none" stroke="rgba(255,255,255,0.12)" />
        <line x1={N / 2} x2={N / 2} y1={1} y2={N - 1} stroke="rgba(255,255,255,0.1)" />
        <line y1={N / 2} y2={N / 2} x1={1} x2={N - 1} stroke="rgba(255,255,255,0.1)" />
        {pts.map((p, i) => (
          <rect
            key={i}
            x={p.x}
            y={N - p.y}
            width={1}
            height={1}
            fill="rgba(250,204,21,0.8)"
            opacity={p.a}
          />
        ))}
      </svg>
      <div className="flex justify-between px-1 pb-0.5 text-[9px] text-muted-foreground tabular-nums">
        <span>saturation {(v.meanSaturation * 100).toFixed(0)}%</span>
        <span>{v.atLimit > 0 ? "some pixels near illegal" : "within range"}</span>
      </div>
    </div>
  );
}
