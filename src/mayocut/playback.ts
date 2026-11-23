// MayoCut — the rules that decide when the play loop may advance.
//
// These were tangled inside Engine.loopRaf(), where they could only be exercised
// by a real browser with real video — which is why the freeze they caused went
// unnoticed. Extracted so the policy is testable, and so the next person can see
// the rule instead of inferring it from an rAF closure.

/**
 * Should this playing video hold the whole transport up?
 *
 * The original test was `readyState < 2 || seeking`. `readyState < 2` is ALSO
 * what a browser reports while re-buffering a clip that has been playing
 * happily for seconds, and `seeking` is what the drift correction itself sets
 * every frame. So with a second video on screen the loop kept pausing
 * everything, including the element whose seek was about to complete, and
 * playback stalled in the middle of a clip and again near the end.
 *
 * The rule now distinguishes the three genuinely different states:
 *
 *   never loaded   → hold (nothing can be shown, the decoders need the budget)
 *   seek in flight → hold, but only until `seeked` (bounded by the caller)
 *   was playing    → do not hold; a stale frame for a few ms beats a freeze
 */
export interface VideoPlaybackState {
  /** HTMLMediaElement.readyState */
  readyState: number;
  /** a seek we issued has not reported `seeked` yet */
  seeking: boolean;
  /** this element has produced a frame for the current clip before */
  warm: boolean;
  /** cannot decode video at all — its sound plays through a shadow element */
  videoBroken: boolean;
}

export const HAVE_CURRENT_DATA = 2;

export function blocksPlayback(s: VideoPlaybackState): boolean {
  if (s.videoBroken) return false; // nothing will ever arrive; do not hold the show
  if (s.seeking) return true;
  if (s.readyState >= HAVE_CURRENT_DATA) return false;
  return !s.warm;
}

/**
 * Should the transport PAUSE, given what is on screen?
 *
 * Pausing every element is a hard stop that can cancel the very seek that would
 * resolve the wait. It is only justified when nothing on screen can render —
 * if one element is catching up while another is showing a frame, the picture is
 * alive and stopping it is the wrong call.
 */
export function shouldHardStop(states: VideoPlaybackState[]): boolean {
  const relevant = states.filter((s) => !s.videoBroken);
  if (relevant.length === 0) return false;
  // A warm clip is alive even while it refills: it still has its last frame on
  // screen, so stopping the transport would freeze a picture that is fine. This
  // was wrong in the first draft of this function — the states were checked by
  // readyState alone, which is exactly the mistake that caused the original bug.
  return relevant.every((s) => s.readyState < HAVE_CURRENT_DATA && !s.warm);
}
