/**
 * MayoCut's platform-neutral timeline evaluator.
 *
 * Project data uses seconds. Clip intervals are half-open [start, end): at a
 * hard cut exactly one clip owns the playhead. The browser engine and future
 * native renderers can consume the same description without sharing codecs.
 */
import {
  mainClipGain,
  mainPlaybackRate,
  mainSpans,
  mainSrcAt,
  projectDuration,
  type MainClip,
  type OverlayClip,
  type Project,
  type TransitionKind,
} from "./types";

export interface MainSpan {
  clip: MainClip;
  start: number;
  end: number;
}

export interface MainSample extends MainSpan {
  /** Position in the unmodified source, in seconds. */
  sourceTime: number;
  playbackRate: number;
  gain: number;
  /** Incoming transition is evaluated before the clip's nominal start. */
  transition: { kind: TransitionKind; progress: number; previous: MainSpan } | null;
}

export interface OverlaySample {
  trackId: string;
  clip: OverlayClip;
  localTime: number;
  /** Source time for an audio or video overlay before optional looping. */
  sourceTime: number;
}

export interface TimelineSample {
  time: number;
  main: MainSample[];
  overlays: OverlaySample[];
}

/** Immutable, versioned data payload for a future native renderer. */
export interface RenderPlanV1 {
  version: 1;
  timeUnit: "seconds";
  duration: number;
  project: Project;
}

export function makeRenderPlan(project: Project): RenderPlanV1 {
  // Detach from the editor's mutable model: a render job must not change
  // underneath a user who continues editing or presses undo.
  const snapshot = JSON.parse(JSON.stringify(project)) as Project;
  return {
    version: 1,
    timeUnit: "seconds",
    duration: projectDuration(snapshot),
    project: snapshot,
  };
}

/** Evaluate one instant. A negative or non-finite time is not a valid instant. */
export function sampleTimeline(project: Project, time: number): TimelineSample {
  // This throw is correct — a renderer must not be handed an instant that does
  // not exist. What was wrong was the consequence: one non-finite playhead
  // reached here from a corrupt clip duration and the RangeError propagated
  // through the draw loop into the error boundary, which replaced the whole
  // editor. The clock is now clamped at its source (Engine.seek, projectDuration),
  // so this should be unreachable in practice; the message says what to do
  // rather than only what went wrong.
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError(
      `Invalid timeline time (${String(time)}). The playhead must be a finite, non-negative number of seconds.`,
    );
  }
  const spans = mainSpans(project);
  const main: MainSample[] = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const clip = span.clip;
    // The first clip has no previous clip to transition from.
    const dur = i > 0 && clip.transitionIn !== "none" ? Math.max(0, clip.transitionDur) : 0;
    const transitionStart = span.start - dur;
    if (time < transitionStart || time >= span.end) continue;
    const transition =
      dur > 0 && time < span.start
        ? {
            kind: clip.transitionIn,
            progress: Math.max(0, Math.min(1, (time - transitionStart) / dur)),
            previous: spans[i - 1],
          }
        : null;
    main.push({
      ...span,
      sourceTime: mainSrcAt(clip, time - span.start),
      playbackRate: mainPlaybackRate(clip, time - span.start),
      gain: mainClipGain(clip, span, spans[i + 1] ?? null, time),
      transition,
    });
  }
  const overlays: OverlaySample[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (time < clip.start || time >= clip.start + clip.duration) continue;
      const localTime = time - clip.start;
      overlays.push({
        trackId: track.id,
        clip,
        localTime,
        sourceTime:
          (clip.sourceOffset ?? 0) + localTime * (clip.kind === "video" ? (clip.speed ?? 1) : 1),
      });
    }
  }
  return { time, main, overlays };
}

/** Times are derived from an integer frame index to avoid cumulative drift. */
export function timeForFrame(index: number, fpsNumerator: number, fpsDenominator = 1): number {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !Number.isSafeInteger(fpsNumerator) ||
    fpsNumerator <= 0 ||
    !Number.isSafeInteger(fpsDenominator) ||
    fpsDenominator <= 0
  ) {
    throw new RangeError("Invalid frame rate or frame index");
  }
  return (index * fpsDenominator) / fpsNumerator;
}

export interface SharedSourceConflict {
  mediaId: string;
  clipIds: [string, string];
  start: number;
  end: number;
}

/**
 * The current browser backend owns one media element per source. Two
 * simultaneous uses of a video or audio source may require different seeks;
 * report those combinations rather than promising a correct export.
 */
export function findSharedSourceConflicts(
  project: Project,
  mediaKinds: ReadonlyMap<string, "video" | "audio" | "image">,
): SharedSourceConflict[] {
  const uses: { mediaId: string; clipId: string; start: number; end: number }[] = [];
  const spans = mainSpans(project);
  for (let i = 0; i < spans.length; i++) {
    const { clip, start, end } = spans[i];
    if (mediaKinds.get(clip.mediaId) !== "video" && mediaKinds.get(clip.mediaId) !== "audio")
      continue;
    const transition = i > 0 && clip.transitionIn !== "none" ? Math.max(0, clip.transitionDur) : 0;
    uses.push({
      mediaId: clip.mediaId,
      clipId: clip.id,
      start: Math.max(0, start - transition),
      end,
    });
  }
  for (const tr of project.tracks)
    for (const clip of tr.clips) {
      if (!clip.mediaId || (clip.kind !== "audio" && clip.kind !== "video")) continue;
      uses.push({
        mediaId: clip.mediaId,
        clipId: clip.id,
        start: clip.start,
        end: clip.start + clip.duration,
      });
    }
  const conflicts: SharedSourceConflict[] = [];
  for (let i = 0; i < uses.length; i++)
    for (let j = i + 1; j < uses.length; j++) {
      const a = uses[i],
        b = uses[j];
      if (a.mediaId !== b.mediaId) continue;
      const start = Math.max(a.start, b.start),
        end = Math.min(a.end, b.end);
      if (end > start)
        conflicts.push({ mediaId: a.mediaId, clipIds: [a.clipId, b.clipId], start, end });
    }
  return conflicts;
}
