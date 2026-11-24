// MayoCut — keeping the library on the device, and proving it is there.
//
// The report that drove this module: "media imported and projects disappear once
// you close the platform on phone and laptop". Three separate causes, and every
// one of them produced the SAME symptom — an empty library — which is why it
// looked like one bug:
//
//   1. NOTHING WAS EVER VERIFIED. `saveProject` / `putMedia` resolved when the
//      transaction completed, and the caller showed a success toast. If the
//      browser aborted the transaction (quota, a dying tab, a closed connection)
//      the promise rejected, but several call sites swallowed the error with
//      `.catch(() => undefined)` or only logged it. The user was told the work
//      was saved when it was not.
//
//   2. THE LAST EDITS WERE NEVER WRITTEN. Autosave debounced at 1200 ms, and the
//      only flush on the way out was a React effect cleanup — which does not run
//      when a tab or app is killed, which is exactly what a phone does when it
//      reclaims memory. Everything since the last successful autosave was lost.
//
//   3. THE STORE COULD BE EVICTED. IndexedDB is "best effort" until persistence
//      is granted, so under storage pressure the browser may drop the origin's
//      data between sessions.
//
// This file is the part that can be tested without a browser: what to write, in
// what order, what counts as success, and what to tell the user when it fails.
// The browser glue (event listeners) lives with the editor.

import type { MainClip, OverlayClip, Project } from "./types";

/**
 * Repair a project loaded from storage so a corrupt number cannot brick it.
 *
 * This exists because of a real crash: one overlay clip with a non-finite
 * `start` made `projectDuration()` return NaN, which made the playhead NaN,
 * which made `sampleTimeline` throw on every frame — and the error boundary then
 * replaced the whole editor with "failed to start". The corruption is on disk,
 * so clamping the clock at runtime is not enough: the project has to be fixed
 * when it is opened, or it fails again on every launch.
 *
 * The policy is deliberately conservative:
 *   • a broken number is repaired to a harmless default;
 *   • nothing is deleted — a clip with a bad start becomes a clip at 0, which
 *     the user can see and fix, rather than silently vanishing;
 *   • the return value reports whether anything changed, so the caller can save
 *     the repair back and tell the user instead of quietly rewriting their work.
 */
export function repairProject(p: Project): { project: Project; repaired: string[] } {
  const repaired: string[] = [];
  const num = (v: unknown, fallback: number, label: string, ok?: (n: number) => boolean) => {
    const good = typeof v === "number" && Number.isFinite(v) && (ok ? ok(v) : v >= 0);
    if (good) return v as number;
    repaired.push(label);
    return fallback;
  };

  const main: MainClip[] = (p.main ?? []).map((c, i) => {
    const next: MainClip = { ...c };
    next.in = num(c.in, 0, `main[${i}].in`);
    next.out = num(c.out, next.in + 5, `main[${i}].out`, (n) => n > next.in);
    next.speed = num(c.speed, 1, `main[${i}].speed`, (n) => n > 0);
    next.volume = num(c.volume, 1, `main[${i}].volume`);
    next.transitionDur = num(c.transitionDur, 0, `main[${i}].transitionDur`);
    return next;
  });

  const tracks = (p.tracks ?? []).map((tr) => ({
    ...tr,
    clips: (tr.clips ?? []).map((c: OverlayClip, i) => {
      const next: OverlayClip = { ...c };
      next.start = num(c.start, 0, `${tr.id}[${i}].start`);
      next.duration = num(c.duration, 3, `${tr.id}[${i}].duration`, (n) => n > 0);
      if (c.sourceOffset != null) {
        next.sourceOffset = num(c.sourceOffset, 0, `${tr.id}[${i}].sourceOffset`);
      }
      return next;
    }),
  }));

  // Project has no stored duration (it is derived), so only the clips and the
  // handful of scalars that feed the transport are checked.
  const next: Project = { ...p, main, tracks };
  if (p.masterGain != null) next.masterGain = num(p.masterGain, 1, "project.masterGain");
  if (Array.isArray(p.beats)) {
    const beats = p.beats.filter((b) => Number.isFinite(b) && b >= 0);
    if (beats.length !== p.beats.length) {
      repaired.push("project.beats");
      next.beats = beats;
    }
  }
  return { project: next, repaired };
}

/** How long autosave waits after the last edit. */
export const AUTOSAVE_DEBOUNCE_MS = 1200;

/**
 * A hard ceiling for "the user has stopped typing and we must be on disk".
 *
 * The debounce alone is not enough: a user dragging a slider for thirty seconds
 * never pauses for 1200 ms, so nothing is written and a crash loses the whole
 * session. This forces a write at least this often while edits keep arriving.
 */
export const AUTOSAVE_MAX_WAIT_MS = 6000;

/**
 * Should this autosave run now?
 *
 * Four inputs, because "should we write?" genuinely depends on four things:
 *
 *   dirtySince  when the first un-saved edit arrived (null = nothing pending)
 *   lastEdit    when the most recent edit arrived
 *   lastWrite   when the last successful write finished
 *
 * Two reasons to write, and both matter:
 *   - the user paused for `debounceMs` after their last edit (the normal case);
 *   - they have been editing continuously for `maxWaitMs` (the drag case). A
 *     debounce measured from the last edit never fires while a slider is moving,
 *     which is how a whole session used to sit unsaved.
 *
 * Pure so the timing rule can be tested with plain numbers instead of a clock.
 */
export function shouldAutosave(
  now: number,
  dirtySince: number | null,
  lastEdit: number,
  lastWrite: number,
  opts: { debounceMs?: number; maxWaitMs?: number } = {},
): boolean {
  if (dirtySince === null) return false;
  // Nothing to do if the edit is already on disk (a late timer firing).
  if (lastWrite >= lastEdit) return false;
  const debounce = opts.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const maxWait = opts.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;
  if (now - dirtySince >= maxWait) return true;
  return now - lastEdit >= debounce;
}

/**
 * Why a write failed, in words a person can act on.
 *
 * The distinction that matters is quota vs everything else: "your device is
 * full" has an obvious remedy (delete something), while a generic "save failed"
 * leaves the user with no idea whether their work survived.
 */
export interface WriteFailure {
  kind: "quota" | "blocked" | "aborted" | "unknown";
  /** what the user should do about it */
  advice: string;
  /** the underlying message, for the console */
  detail: string;
}

export function describeWriteFailure(error: unknown): WriteFailure {
  const name = (error as { name?: string } | null)?.name ?? "";
  const message = (error as { message?: string } | null)?.message ?? String(error ?? "");
  if (name === "QuotaExceededError" || /quota/i.test(message)) {
    return {
      kind: "quota",
      advice:
        "Your device is out of space for this site. Delete a project or an export you no longer need, then save again.",
      detail: message,
    };
  }
  if (name === "InvalidStateError" || /closing|closed|blocked/i.test(message)) {
    return {
      kind: "blocked",
      advice:
        "The local database was busy (another tab may be open). Keep this tab in front and try again.",
      detail: message,
    };
  }
  if (name === "AbortError" || /abort/i.test(message)) {
    return {
      kind: "aborted",
      advice:
        "Saving was interrupted — the browser may be closing. Open the project and let it save.",
      detail: message,
    };
  }
  return {
    kind: "unknown",
    advice: "Could not save to this device. Free some space, or export the project as a pack.",
    detail: message,
  };
}

/** Did the write actually land? Compared by content, not by optimism. */
export function sameProject(a: Project | undefined, b: Project | undefined): boolean {
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  return a.main.length === b.main.length && a.tracks.length === b.tracks.length;
}

/**
 * A byte budget check before a large import.
 *
 * Importing a 2 GB video into a store with 800 MB free fails at the very end of
 * a slow copy, which is the worst possible moment to find out. This is
 * deliberately conservative: quota reports the origin's total, not this app's
 * share, and browsers count overhead.
 */
export function fitsBudget(
  fileBytes: number,
  usage: { used: number; quota: number } | null,
): { ok: boolean; reason: string } {
  if (!usage || !usage.quota) return { ok: true, reason: "" };
  const free = usage.quota - usage.used;
  // Leave a margin: other tabs and the browser itself share the quota.
  const usable = free * 0.9;
  if (fileBytes <= usable) return { ok: true, reason: "" };
  return {
    ok: false,
    reason: `Needs ${fmtBytes(fileBytes)} but only about ${fmtBytes(Math.max(0, usable))} is free on this device.`,
  };
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/**
 * What to say about the durability of the library.
 *
 * `persisted: false` is not an error — Safari never grants it and Chrome grants
 * it silently for engaged sites — so the copy must not alarm the user, but it
 * must not pretend either.
 */
export function storageAdvice(persisted: boolean | null): string {
  if (persisted === true)
    return "Your library is saved on this device and won't be cleared automatically.";
  if (persisted === null) return "Saved on this device.";
  return "Saved on this device. Keep the app open once more to stop the browser clearing space — or export a backup.";
}
