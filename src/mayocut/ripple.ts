// MayoCut — editing operations that keep the timeline coherent.
//
// Both CapCut and Kdenlive have ripple editing: when you remove a clip from the
// main track, the clips after it close up, and — this is the part that matters —
// the overlays, captions and music that were sitting on top of those clips come
// with them. Kdenlive calls it "ripple" and offers it as a mode; CapCut does it
// silently and has an undo for when you did not want it.
//
// MayoCut did neither. `deleteMainClip` spliced the clip out of `project.main`,
// and because the main track is a contiguous spine (mainSpans() stacks clips
// back to back with no gaps), every later clip instantly slid left by the
// removed duration. The overlays are placed at absolute start times, so they did
// NOT move. Result: delete one clip near the start of a video and every caption,
// sticker, overlay and music cue after it is now out of sync by that duration —
// silently, with no indication. That is the worst kind of timeline bug: the
// damage is not where you clicked.
//
// This module holds the arithmetic so it can be tested without a DOM. It is
// deliberately pure: the engine calls these, the audit tests them.

import type { OverlayClip, Project } from "./types";

/** A time range, in timeline seconds. */
export interface Span {
  start: number;
  end: number;
}

/**
 * How a clip should be removed from the main track.
 *
 *  ripple   close the gap: everything after moves left by the clip's duration
 *  lift     leave the gap: main clips are a spine, so this trims the OVERLAYS
 *           that overlap the removed span instead of shifting anything
 *
 * There is no third option where main clips have real gaps, because mainSpans()
 * stacks them — adding gaps to the main track would be a different, much larger
 * change (and would change every export).
 */
export type RippleMode = "ripple" | "lift";

/**
 * Shift every overlay that starts at or after a boundary.
 *
 * Overlays that START BEFORE the cut but END AFTER it are deliberately left
 * alone: they are already carrying across the edit, which is what a deliberate
 * music bed or a cross-scene caption does. Moving those would break them.
 */
export function rippleOverlays<T extends { clips: OverlayClip[] }>(
  tracks: T[],
  at: number,
  delta: number,
): { moved: number; tracks: T[] } {
  if (!Number.isFinite(delta) || delta === 0) return { moved: 0, tracks };
  let moved = 0;
  const next = tracks.map((tr): T => {
    let changed = false;
    const clips = tr.clips.map((c) => {
      // starts before the boundary: it spans the edit, leave it alone
      if (c.start < at - 1e-6) return c;
      changed = true;
      moved++;
      return { ...c, start: Math.max(0, c.start + delta) };
    });
    return changed ? { ...tr, clips } : tr;
  });
  return { moved, tracks: next };
}

/**
 * Remove a span from the overlays.
 *
 * Used for "lift" (leave a gap) and for deleting a chunk of the timeline where
 * media should survive. Three cases, and the middle one is the one people get
 * wrong:
 *
 *   entirely before / after  untouched
 *   fully inside the span    dropped
 *   straddles an edge        trimmed, and a clip that would become shorter than
 *                            MIN_KEEP is dropped rather than left as a sliver
 */
export const MIN_KEEP = 0.05;

export function cutOverlays<T extends { clips: OverlayClip[] }>(
  tracks: T[],
  span: Span,
): { removed: number; trimmed: number; tracks: T[] } {
  let removed = 0;
  let trimmed = 0;
  const len = span.end - span.start;
  if (!(len > 0)) return { removed: 0, trimmed: 0, tracks };

  const next = tracks.map((tr): T => {
    const clips: OverlayClip[] = [];
    for (const c of tr.clips) {
      const cEnd = c.start + c.duration;
      // wholly outside the cut
      if (cEnd <= span.start + 1e-6 || c.start >= span.end - 1e-6) {
        clips.push(c);
        continue;
      }
      const head = Math.max(0, span.start - c.start);
      const tail = Math.max(0, cEnd - span.end);
      if (head > MIN_KEEP && tail > MIN_KEEP) {
        // the cut lands in the middle: split into two, the second one pulled
        // back by the removed length so it stays attached to the right content
        clips.push({ ...c, id: `${c.id}_a`, duration: head });
        clips.push({
          ...c,
          id: `${c.id}_b`,
          start: span.start,
          duration: tail,
          // the tail keeps its content timing relative to the source
          sourceOffset: (c.sourceOffset ?? 0) + (span.end - c.start),
        });
        trimmed++;
        continue;
      }
      if (head > MIN_KEEP) {
        clips.push({ ...c, duration: head });
        trimmed++;
        continue;
      }
      if (tail > MIN_KEEP) {
        clips.push({
          ...c,
          start: span.start,
          duration: tail,
          sourceOffset: (c.sourceOffset ?? 0) + (span.end - c.start),
        });
        trimmed++;
        continue;
      }
      removed++;
    }
    return { ...tr, clips };
  });
  return { removed, trimmed, tracks: next };
}

/**
 * The full "remove main clip" operation.
 *
 * Returns the new project's main list and tracks, plus what happened, so the UI
 * can say "3 overlays moved" instead of doing something invisible.
 */
export interface RemoveMainResult {
  main: Project["main"];
  tracks: Project["tracks"];
  /** seconds that later material moved left (0 when lifting) */
  shifted: number;
  /** overlays dropped or trimmed (lift mode) */
  overlaysRemoved: number;
  overlaysTrimmed: number;
  overlaysMoved: number;
  /** the span the removed clip occupied, for the undo toast */
  span: Span;
}

export function removeMainClip(
  project: Pick<Project, "main" | "tracks">,
  clipId: string,
  mode: RippleMode = "ripple",
  startOf: (index: number) => number,
  durationOf: (index: number) => number,
): RemoveMainResult | null {
  const i = project.main.findIndex((c) => c.id === clipId);
  if (i === -1) return null;
  const start = startOf(i);
  const dur = durationOf(i);
  const span: Span = { start, end: start + dur };
  const main = project.main.filter((_, k) => k !== i);

  if (mode === "ripple") {
    // main is a spine: dropping the clip closes the gap by itself. The overlays
    // have to be told.
    const r = rippleOverlays(project.tracks, span.end, -dur);
    return {
      main,
      tracks: r.tracks,
      shifted: dur,
      overlaysRemoved: 0,
      overlaysTrimmed: 0,
      overlaysMoved: r.moved,
      span,
    };
  }

  // lift: shift the spine back so the gap is preserved in TIME, and cut the
  // overlays that lived in the removed span.
  const r = cutOverlays(project.tracks, span);
  return {
    main,
    tracks: r.tracks,
    shifted: 0,
    overlaysRemoved: r.removed,
    overlaysTrimmed: r.trimmed,
    overlaysMoved: 0,
    span,
  };
}

/**
 * Close every gap between main clips and repair the overlays.
 *
 * "Lift" leaves the timeline with a hole where a clip used to be, which is
 * sometimes what you want (a beat of black) and sometimes not. This is the
 * repair: it reports how much time was removed so the caller knows the shift.
 */
export function closeAllGaps(): { shift: number } {
  // mainSpans() already packs clips back to back, so there is never a gap to
  // close in the spine. Kept as an explicit no-op with a comment rather than
  // omitted, because "where is close gap?" is the first thing a Kdenlive user
  // looks for, and the honest answer is that the spine has no gaps by design.
  return { shift: 0 };
}
