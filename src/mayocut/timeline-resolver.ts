// MayoCut — the timeline resolver.
//
// ONE place that answers "what is on screen and in the speakers at time t".
// Preview, export and the automated tests all call this, so a clip can never
// look one way while playing and another way when exported.
//
// Design rules:
//
//  1. PURE. No DOM, no AudioContext, no React. Given a Project and a time it
//     returns a plain description. Testable in node with real fixtures, and
//     impossible to drift from the renderers.
//
//  2. COMPLETE. It says how many main clips are visible at t (1, or 2 during a
//     transition), which one is entering and at what progress, so renderers no
//     longer re-derive transition windows and get them slightly wrong in three
//     places.
//
//  3. TOTAL. Every numeric output is finite. A missing or legacy field yields a
//     sane default instead of NaN, because NaN silently disables things
//     downstream (a NaN playbackRate is ignored by the browser; a NaN gain kills
//     the audio chain).
//
// The web Engine consumes this. A native (Android/desktop) engine would consume
// the SAME Project JSON and re-implement only rendering, not timing — the JSON
// is the contract between them.

import {
  mainClipGain,
  mainPlaybackRate,
  mainSpans,
  mainSrcAt,
  projectDuration,
  type MainClip,
  type OverlayClip,
  type OverlayTrack,
  type Project,
} from "./types";

export { mainClipDuration } from "./types";

export interface MainLayer {
  clip: MainClip;
  index: number;
  start: number;
  end: number;
  /** timeline seconds since this clip started */
  local: number;
  /** source position (media seconds) */
  src: number;
  /** playback rate for the media element */
  rate: number;
  /** 0..1 opacity of this layer */
  alpha: number;
  /** 0..1 audio contribution */
  gain: number;
}

export interface TransitionState {
  kind: MainClip["transitionIn"];
  progress: number;
  from: MainLayer;
  to: MainLayer;
}

export interface OverlayLayer {
  clip: OverlayClip;
  trackId: string;
  local: number;
  /** 0..1 entrance/exit envelope (1 when the clip is not animated) */
  fadeAlpha: number;
}

export interface Composition {
  t: number;
  duration: number;
  /** main-track layers, back to front (2 while a transition runs) */
  main: MainLayer[];
  transition: TransitionState | null;
  overlays: OverlayLayer[];
  audioOverlays: OverlayLayer[];
  empty: boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const finite = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

function makeLayer(
  spans: ReturnType<typeof mainSpans>,
  index: number,
  t: number,
  alpha: number,
): MainLayer {
  const s = spans[index];
  const c = s.clip;
  const local = t - s.start;
  const next = index + 1 < spans.length ? spans[index + 1] : null;
  return {
    clip: c,
    index,
    start: s.start,
    end: s.end,
    local,
    src: finite(mainSrcAt(c, local), finite(c.in, 0)),
    rate: finite(mainPlaybackRate(c, local), 1),
    alpha: clamp01(alpha),
    gain: clamp01(mainClipGain(c, s, next, t, index > 0)),
  };
}

function mainLayersAt(
  project: Project,
  t: number,
): { layers: MainLayer[]; transition: TransitionState | null } {
  const spans = mainSpans(project);

  // A transition is searched for FIRST. Scanning for "which span contains t"
  // finds the OUTGOING clip, whose own span still covers t, and would return it
  // before the incoming clip's window was ever considered — which is exactly why
  // the first version of this function never reported a transition at all.
  for (let i = 1; i < spans.length; i++) {
    const c = spans[i].clip;
    if (c.transitionIn === "none") continue;
    const dur = Math.max(0, finite(c.transitionDur, 0));
    if (dur <= 0) continue;
    const winStart = spans[i].start - dur;
    if (t < winStart || t >= spans[i].start) continue;
    const progress = clamp01((t - winStart) / dur);
    const from = makeLayer(spans, i - 1, t, 1 - progress);
    const to = makeLayer(spans, i, t, progress);
    return { layers: [from, to], transition: { kind: c.transitionIn, progress, from, to } };
  }

  // No transition in flight: ordinary single-clip lookup.
  //
  // Half-open spans [start, end) without an epsilon, so at an exact cut the
  // INCOMING clip wins. The old `t >= end + 0.001` tolerance let the outgoing
  // clip claim the boundary frame, which read as a one-frame flash of the clip
  // you just left.
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (t < s.start || t >= s.end) continue;
    return { layers: [makeLayer(spans, i, t, 1)], transition: null };
  }
  // Past the end (or exactly on the final frame): hold the last clip.
  if (spans.length) {
    return { layers: [makeLayer(spans, spans.length - 1, t, 1)], transition: null };
  }
  return { layers: [], transition: null };
}

function overlayLayersAt(project: Project, t: number): OverlayLayer[] {
  const out: OverlayLayer[] = [];
  for (const tr of project.tracks as OverlayTrack[]) {
    if (tr.hidden) continue;
    for (const c of tr.clips) {
      const start = finite(c.start, 0);
      const dur = Math.max(0, finite(c.duration, 0));
      if (t < start || t >= start + dur) continue;
      const local = t - start;
      const rampIn = Math.min(1, local / 0.4);
      const rampOut = Math.min(1, (start + dur - t) / 0.3);
      out.push({
        clip: c,
        trackId: tr.id,
        local,
        fadeAlpha: c.anim && c.anim !== "none" ? clamp01(rampIn * rampOut) : 1,
      });
    }
  }
  return out;
}

/** Resolve the whole composition at `t`. Renderers should not re-derive this. */
export function resolveComposition(project: Project, t: number): Composition {
  const duration = projectDuration(project);
  const safeT = Math.max(0, Math.min(duration, finite(t, 0)));
  const { layers, transition } = mainLayersAt(project, safeT);
  const overlays = overlayLayersAt(project, safeT);
  return {
    t: safeT,
    duration,
    main: layers,
    transition,
    overlays,
    audioOverlays: overlays.filter((o) => o.clip.kind === "audio" && !!o.clip.mediaId),
    empty: layers.length === 0 && overlays.length === 0,
  };
}

/**
 * Media ids visible or audible at `t`, in priority order.
 *
 * The playback engine pre-warms these BEFORE advancing its clock. That is what
 * stops the opening frames of a clip being black or silent: previously the clock
 * ran on while the element was still seeking.
 */
export function requiredMediaAt(project: Project, t: number): string[] {
  const comp = resolveComposition(project, t);
  const ids: string[] = [];
  const push = (id?: string) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const l of comp.main) push(l.clip.mediaId);
  for (const o of comp.overlays) push(o.clip.mediaId);
  return ids;
}

export type ReadinessVerdict = "ready" | "loading" | "seek-needed";

/**
 * Can this element be shown for `src`?
 *
 * `readyState >= 2` is HAVE_CURRENT_DATA. The tolerance is loose on purpose: a
 * seek within a couple of frames is visually identical, and demanding tighter
 * causes seek-thrash on phones.
 */
export function readinessFor(
  readyState: number,
  currentTime: number,
  src: number,
  paused: boolean,
  tolerance = 0.12,
): ReadinessVerdict {
  if (readyState < 2) return "loading";
  if (paused) return "ready";
  return Math.abs(finite(currentTime, 0) - finite(src, 0)) <= tolerance ? "ready" : "seek-needed";
}

/**
 * Should the transport clock advance this frame?
 *
 * The old engine advanced `t` on every animation frame whether or not the
 * element had a frame for that instant, so the picture lagged the sound and the
 * start of a clip showed a placeholder. Holding the clock until the visible
 * layer is ready is what makes playback "wait for frames".
 *
 * `stalledForMs` bounds the wait: a genuinely broken source must not freeze the
 * editor forever, so past that we let the clock run and let the caller show its
 * "can't decode" affordance.
 */
export function shouldAdvanceClock(
  verdicts: ReadinessVerdict[],
  stalledForMs: number,
  stallMs = 900,
): boolean {
  if (stalledForMs >= stallMs) return true;
  return verdicts.every((v) => v !== "loading");
}
