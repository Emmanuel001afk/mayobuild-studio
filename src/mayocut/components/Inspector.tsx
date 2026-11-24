import { useRef, useState } from "react";
import { CurveEditor } from "./CurveEditor";
import { CURVE_PRESETS, curvesActive, normalisePoints, type CurvePoint } from "../curves";
import { searchEmoji } from "../stock";
import { defaultAnimFor, defaultSizeFor, isEmojiOverlay, overlayLabel } from "../sticker-kinds";
import { FONT_CATALOGUE, fontName } from "../fonts";
import { HSL_BANDS, hslActive, type HslAdjust, type HslBand } from "../hsl";

type Channel = "rgb" | "r" | "g" | "b";
import { Clock, Copy, Diamond, Scissors, SlidersHorizontal, Spline, Trash2 } from "lucide-react";
import { CROP_PRESETS, clampGeometry, isDefaultGeometry } from "../geometry";
import type {
  AnimValues,
  AspectId,
  EffectId,
  FrameFit,
  Keyframe,
  MainClip,
  MediaItem,
  OverlayClip,
  Project,
  TextAnim,
  TextPos,
  SpeedPoint,
  TextWord,
  TransitionKind,
} from "../types";
import {
  ASPECT_ORDER,
  ASPECTS,
  EFFECTS,
  FONTS,
  fontCss,
  SPEED_PRESETS,
  TEXT_ANIMS,
  TEXT_PRESETS,
  TRANSITIONS,
  mainClipDuration,
  nudgeWord,
  respaceWords,
  shiftWords,
} from "../types";

interface Props {
  selection: { lane: "main"; id: string } | { lane: "overlay"; trackId: string; id: string } | null;
  clip: MainClip | OverlayClip | null;
  project: Project;
  media: MediaItem[];
  /** playhead time (timeline seconds) and where the selected clip starts */
  t: number;
  clipStart: number;
  playheadLocal: number | null; // playhead relative to clip start (null if outside)
  anim: AnimValues; // interpolated display values for the selected clip
  onPatchMain: (patch: Partial<MainClip>) => void;
  onPatchOverlay: (trackId: string, patch: Partial<OverlayClip>) => void;
  onAnimChange: (clipId: string, localT: number, patch: Partial<AnimValues>) => void;
  onKeyframeAdd: (clipId: string) => void;
  onKeyframeDelete: (clipId: string, at: number) => void;
  onSetAspect: (a: AspectId) => void;
  onReplaceMedia: (clipId: string, item: MediaItem) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSplit: () => void;
  onSeek: (v: number) => void;
  filters: { id: string; name: string; css: string }[];
  luts: { id: string; name: string; builtin?: boolean }[];
  onImportLut: (f: File) => void;
  denoise: { mediaId: string; progress: number } | null;
  onDenoise: () => void;
  denoiseGate: { ok: boolean; reason?: string };
  onExtractAudio?: () => void;
  extracting?: boolean;
  onFreeze?: () => void;
  onDuplicateToNext?: () => void;
  onApplyTransitionAll?: (kind: TransitionKind, dur: number) => void;
  onSetBackground?: (color: string) => void;
  onPatchProject?: (patch: Partial<Project>) => void;
  onSplitAtBeats?: () => void;
  onMatchColor?: (clipId: string) => void;
  onImportFont?: (f: File) => void;
  /**
   * Search stock assets by free text ("snow", "arrow", "light"). Returns
   * generated-on-device assets, so the answer is the same offline.
   */
  onSearchStock?: (query: string) => { id: string; name: string; hint: string; kind: string }[];
  onAddStock?: (assetId: string) => void;
  projectFonts?: { id: string; family: string; name: string }[];
  onTrackFlag?: (
    trackId: string,
    patch: { muted?: boolean; solo?: boolean; hidden?: boolean },
  ) => void;
}

function DenoiseRow({
  media,
  denoise,
  onDenoise,
  denoiseGate,
}: {
  media?: MediaItem;
  denoise: { mediaId: string; progress: number } | null;
  onDenoise: () => void;
  denoiseGate: { ok: boolean; reason?: string };
  onExtractAudio?: () => void;
  extracting?: boolean;
  onFreeze?: () => void;
  onDuplicateToNext?: () => void;
  onApplyTransitionAll?: (kind: TransitionKind, dur: number) => void;
  onSetBackground?: (color: string) => void;
  onPatchProject?: (patch: Partial<Project>) => void;
  onSplitAtBeats?: () => void;
  onMatchColor?: (clipId: string) => void;
  onImportFont?: (f: File) => void;
  /**
   * Search stock assets by free text ("snow", "arrow", "light"). Returns
   * generated-on-device assets, so the answer is the same offline.
   */
  onSearchStock?: (query: string) => { id: string; name: string; hint: string; kind: string }[];
  onAddStock?: (assetId: string) => void;
  projectFonts?: { id: string; family: string; name: string }[];
  onTrackFlag?: (
    trackId: string,
    patch: { muted?: boolean; solo?: boolean; hidden?: boolean },
  ) => void;
}) {
  if (!media || media.kind !== "audio") return null;
  if (denoise && denoise.mediaId === media.id) {
    const pct = Math.round(denoise.progress * 100);
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Reducing noise (RNNoise)…</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 rounded bg-secondary overflow-hidden">
          <div
            className="h-full bg-cyan-400 transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }
  if (media.denoised) {
    return (
      <p className="text-[10px] text-emerald-400 mt-2">✓ Denoised with RNNoise (100% local)</p>
    );
  }
  return (
    <button
      className={`mb-btn-ghost w-full text-xs h-7 mt-2 ${denoiseGate.ok ? "" : "opacity-40 cursor-not-allowed"}`}
      onClick={denoiseGate.ok ? onDenoise : undefined}
      disabled={!denoiseGate.ok}
      title={
        denoiseGate.ok
          ? "Speech denoise — runs the RNNoise model in the browser, replaces this clip's audio with a denoised copy"
          : (denoiseGate.reason ?? "Unavailable on this device")
      }
    >
      🎙️ Denoise (RNNoise, local){!denoiseGate.ok && " — off on this device"}
    </button>
  );
}

/**
 * Sticker search.
 *
 * CapCut's sticker panel is a searchable library — you type "snow" and get a
 * snow overlay. Ours has emoji and shapes already; this adds a row that
 * searches the generated-on-device stock set (light leaks, bokeh, dust,
 * countdown) plus the emoji set, so a video sticker is two taps away instead
 * of a hidden capability.
 */
function StickerSearch({
  onSelectEmoji,
  onSearchStock,
  onAddStock,
}: {
  onSelectEmoji: (emoji: string) => void;
  onSearchStock?: (q: string) => { id: string; name: string; hint: string; kind: string }[];
  onAddStock?: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const results = (onSearchStock?.(q) ?? []).slice(0, 6);
  const emojiHit = searchEmoji(q).slice(0, 12);
  if (!q.trim()) {
    return (
      <div className="text-[10px] text-muted-foreground leading-snug">
        Type to search stickers and footage — try “light”, “snow”, “arrow”, “heart”.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {emojiHit.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {emojiHit.map((e) => (
            <button
              key={e}
              className="h-7 w-7 rounded hover:bg-slate-700 text-base leading-none"
              onClick={() => onSelectEmoji(e)}
              title={`Add ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        {results.map((r) => (
          <button
            key={r.id}
            className="text-left border border-border rounded px-1.5 py-1 hover:border-white/40"
            onClick={() => onAddStock?.(r.id)}
            title={r.hint}
          >
            <div className="text-[10px] truncate">{r.name}</div>
            <div className="text-[8px] text-muted-foreground">
              {r.kind === "video" ? "video sticker" : "image"}
            </div>
          </button>
        ))}
      </div>
      {emojiHit.length === 0 && results.length === 0 && (
        <div className="text-[10px] text-muted-foreground">
          Nothing matches “{q}” — the built-in set is small on purpose (it is generated on your
          device, not downloaded).
        </div>
      )}
    </div>
  );
}

/**
 * The HSL panel: eight colour ranges, hue / saturation / luminance each.
 *
 * Only the selected band's sliders are shown, because fourteen sliders at once
 * is a wall. The band chips double as the live state — a band that has been
 * moved is marked, so you can see what you have changed without opening each
 * one.
 */
function HslSection({
  main,
  onPatchMain,
}: {
  main: MainClip;
  onPatchMain: (patch: Partial<MainClip>) => void;
}) {
  const [band, setBand] = useState<HslBand>("red");
  const set = main.hsl ?? {};
  const current = set[band] ?? { h: 0, s: 0, l: 0 };
  const patch = (next: Partial<HslAdjust>) => {
    onPatchMain({ hsl: { ...set, [band]: { ...current, ...next } } });
  };
  return (
    <div className="mt-2 border-t border-border pt-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">HSL</span>
        {hslActive(set) && (
          <button
            className="text-[9px] border border-border rounded px-1.5 py-0.5 text-muted-foreground hover:border-white/40"
            onClick={() => onPatchMain({ hsl: undefined })}
          >
            Reset all
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {HSL_BANDS.map((b) => {
          const adj = set[b.id];
          const moved = !!adj && ((adj.h ?? 0) !== 0 || (adj.s ?? 0) !== 0 || (adj.l ?? 0) !== 0);
          return (
            <button
              key={b.id}
              className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[9px] ${
                band === b.id
                  ? "border-cyan-400 bg-cyan-400/10"
                  : "border-border hover:border-white/40"
              }`}
              onClick={() => setBand(b.id)}
              title={`${b.name}${moved ? " — adjusted" : ""}`}
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: b.swatch }} />
              <span className="truncate">{b.name}</span>
              {moved && <span className="ml-auto text-cyan-300">•</span>}
            </button>
          );
        })}
      </div>
      <Slider
        label="Hue"
        min={-100}
        max={100}
        step={1}
        value={current.h ?? 0}
        onChange={(v) => patch({ h: v })}
      />
      <Slider
        label="Saturation"
        min={-100}
        max={100}
        step={1}
        value={current.s ?? 0}
        onChange={(v) => patch({ s: v })}
      />
      <Slider
        label="Luminance"
        min={-100}
        max={100}
        step={1}
        value={current.l ?? 0}
        onChange={(v) => patch({ l: v })}
      />
      <div className="text-[9px] text-muted-foreground leading-snug">
        Affects only {HSL_BANDS.find((b) => b.id === band)?.name.toLowerCase()} tones — everything
        else in the frame stays as it is.
      </div>
    </div>
  );
}

/** The tone-curve block: channel tabs, presets and the draggable graph. */
function CurveSection({
  main,
  onPatchMain,
}: {
  main: MainClip;
  onPatchMain: (patch: Partial<MainClip>) => void;
}) {
  const [channel, setChannel] = useState<Channel>("rgb");
  const curves = main.curves ?? {};
  const points = curves[channel] ?? [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
  const setPoints = (pts: CurvePoint[]) => {
    onPatchMain({ curves: { ...curves, [channel]: normalisePoints(pts) } });
  };
  const active = curvesActive(curves);
  return (
    <div className="mt-2 border-t border-border pt-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Curves</span>
        <div className="flex gap-0.5">
          {(["rgb", "r", "g", "b"] as Channel[]).map((ch) => (
            <button
              key={ch}
              className={`text-[10px] border rounded w-6 h-5 uppercase ${
                channel === ch ? "border-cyan-400 bg-cyan-400/10" : "border-border"
              }`}
              onClick={() => setChannel(ch)}
              title={ch === "rgb" ? "Master curve" : `${ch.toUpperCase()} channel`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center">
        <CurveEditor points={points} onChange={setPoints} channel={channel} size={168} />
      </div>
      <div className="flex flex-wrap gap-1">
        {CURVE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className="text-[9px] border border-border rounded px-1.5 py-0.5 hover:border-white/40"
            onClick={() => setPoints(preset.points)}
          >
            {preset.name}
          </button>
        ))}
        {active && (
          <button
            className="text-[9px] border border-border rounded px-1.5 py-0.5 hover:border-white/40 text-muted-foreground"
            onClick={() => onPatchMain({ curves: undefined })}
            title="Remove every curve on this clip"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

const POSITIONS: TextPos[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

export function Inspector(p: Props) {
  const [replaceOpen, setReplaceOpen] = useState(false);
  if (!p.selection || !p.clip) {
    return (
      <div className="p-4 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" /> Inspector
        </h3>
        <p className="text-xs text-muted-foreground">
          Select a clip on the timeline to edit its filters, motion, keyframes, text, position and
          audio.
        </p>
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-xs font-medium">Canvas format</div>
          <div className="grid grid-cols-4 gap-1">
            {ASPECT_ORDER.map((id) => {
              const a = ASPECTS[id];
              const active = p.project.aspect === id;
              return (
                <button
                  key={id}
                  className={`border rounded px-1 py-1.5 text-[10px] flex flex-col items-center gap-1 ${
                    active
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-border hover:border-white/40"
                  }`}
                  title={a.hint}
                  onClick={() => p.onSetAspect(id)}
                >
                  <span
                    className="border border-current opacity-60 rounded-[2px]"
                    style={{ width: 14, height: Math.max(8, Math.round((14 * a.h) / a.w)) }}
                  />
                  {id}
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {ASPECTS[p.project.aspect].w}×{ASPECTS[p.project.aspect].h} ·{" "}
            {ASPECTS[p.project.aspect].hint}
          </div>
          <div className="text-xs font-medium mt-3">Background (letterbox colour)</div>
          <div className="flex gap-1 mt-1">
            {[
              "#000000",
              "#ffffff",
              "#0f172a",
              "#111827",
              "#f5f5f4",
              "#7c3aed",
              "#0ea5e9",
              "#22c55e",
            ].map((c) => (
              <button
                key={c}
                className={`h-6 w-6 rounded border ${
                  (p.project.background ?? "#000000").toLowerCase() === c
                    ? "border-cyan-400 ring-1 ring-cyan-400"
                    : "border-border"
                }`}
                style={{ background: c }}
                title={c}
                onClick={() => p.onSetBackground?.(c)}
              />
            ))}
            <label
              className="h-6 w-6 rounded border border-border flex items-center justify-center text-[10px] cursor-pointer"
              title="Custom colour"
            >
              +
              <input
                type="color"
                className="sr-only"
                value={p.project.background ?? "#000000"}
                onChange={(e) => p.onSetBackground?.(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="border-t border-border pt-3">
          <div className="text-xs font-medium mb-1">Mix</div>
          <Slider
            label="Master volume"
            min={0}
            max={2}
            step={0.05}
            value={p.project.masterGain ?? 1}
            onChange={(v) => p.onPatchProject?.({ masterGain: v })}
          />
          <Slider
            label="Auto-duck strength"
            min={0}
            max={1}
            step={0.05}
            value={p.project.duckAmount ?? 0.7}
            onChange={(v) => p.onPatchProject?.({ duckAmount: v })}
          />
          <p className="text-[10px] text-muted-foreground leading-snug">
            Ducking lowers music automatically under any clip with «Duck music» enabled.
          </p>
          <button
            className="mb-btn-ghost w-full h-7 mt-2 text-[11px]"
            onClick={p.onSplitAtBeats}
            title="Split every main clip at each beat marker"
          >
            ⚡ Split at beat markers
          </button>
        </div>
        <div className="border-t border-border pt-3">
          <div className="text-xs font-medium mb-2">Shortcuts</div>
          <ul className="text-[11px] text-muted-foreground space-y-1">
            <li>
              <Kbd>Space</Kbd> play / pause
            </li>
            <li>
              <Kbd>S</Kbd> or double-click — split at playhead
            </li>
            <li>
              <Kbd>←</Kbd> <Kbd>→</Kbd> step one frame
            </li>
            <li>
              <Kbd>Del</Kbd> delete selected clip
            </li>
            <li>
              <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> undo · <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Z</Kbd> redo
            </li>
            <li>
              <Kbd>Ctrl</Kbd>+<Kbd>D</Kbd> duplicate · <Kbd>F</Kbd> freeze frame
            </li>
            <li>
              <Kbd>Ctrl</Kbd>+wheel zoom the timeline
            </li>
            <li>Drag clip edges to trim · drag a clip body to reorder</li>
          </ul>
        </div>
        <div className="border-t border-border pt-3 text-[11px] text-muted-foreground">
          Everything stays on this device. No uploads, no account, no database.
        </div>
      </div>
    );
  }

  const trackId = p.selection.lane === "overlay" ? p.selection.trackId : "";
  const isMain = p.selection.lane === "main";
  const main = isMain ? (p.clip as MainClip) : null;
  const over = !isMain && p.selection.lane === "overlay" ? (p.clip as OverlayClip) : null;
  const mainMedia = main ? p.media.find((m) => m.id === main.mediaId) : undefined;
  const overMedia = over?.mediaId ? p.media.find((m) => m.id === over.mediaId) : undefined;
  const clipId = p.clip.id;
  const localT = p.playheadLocal ?? 0;
  const setAnim = (patch: Partial<AnimValues>) => p.onAnimChange(clipId, localT, patch);

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">
          {main ? "Clip" : over ? overlayLabel(over) : "Audio"}
        </h3>
        {main?.reverse && (
          <span className="text-[10px] text-fuchsia-300 border border-fuchsia-400/40 rounded px-1">
            reverse
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <button className="mb-btn-ghost h-7 px-2" title="Duplicate" onClick={p.onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </button>
          {isMain && (
            <button className="mb-btn-ghost h-7 px-2" title="Split at playhead" onClick={p.onSplit}>
              <Scissors className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            className="mb-btn-ghost h-7 px-2 hover:text-destructive"
            title="Delete"
            onClick={p.onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ---------------- main clip ---------------- */}
      {main && (
        <>
          <div className="text-[11px] text-muted-foreground truncate">
            {p.media.find((m) => m.id === main.mediaId)?.name ?? "media"}
          </div>

          <Section label="Speed & direction" anchor="speed">
            <Slider
              label="Speed"
              min={0.25}
              max={4}
              step={0.05}
              value={main.speed}
              onChange={(v) => p.onPatchMain({ speed: v })}
            />
            <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground -mt-1">
              {SPEED_PRESETS.map((s) => (
                <button
                  key={s}
                  className={`border rounded px-1 py-0.5 ${main.speed === s ? "border-cyan-400 text-cyan-300" : "border-border"}`}
                  onClick={() => p.onPatchMain({ speed: s })}
                >
                  {s}×
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 mt-2">
              <button
                className="mb-btn-ghost h-7 text-[11px]"
                onClick={p.onFreeze}
                title="Hold this exact frame for 3 seconds (CapCut Freeze)"
              >
                ❄ Freeze frame
              </button>
              <button
                className="mb-btn-ghost h-7 text-[11px]"
                onClick={() => p.onPatchMain({ freeze: !main.freeze })}
                title="Turn this clip into a held frame (or back into motion)"
              >
                {main.freeze ? "▶ Un-freeze" : "❄ Hold whole clip"}
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs mt-2">
              <input
                type="checkbox"
                className="accent-fuchsia-400"
                checked={main.reverse}
                onChange={(e) => p.onPatchMain({ reverse: e.target.checked })}
              />
              <span>
                Play backwards{" "}
                <span className="text-muted-foreground text-[10px]">
                  (audio muted, frame-stepped)
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs mt-2">
              <input
                type="checkbox"
                className="accent-cyan-400"
                checked={main.rampTo != null}
                onChange={(e) =>
                  p.onPatchMain(e.target.checked ? { rampTo: main.speed } : { rampTo: undefined })
                }
              />
              <span>
                Speed ramp{" "}
                <span className="text-muted-foreground text-[10px]">
                  (ease the speed across the clip)
                </span>
              </span>
            </label>
            {main.rampTo != null && (
              <Slider
                label="Ramp to (end speed)"
                min={0.25}
                max={4}
                step={0.05}
                value={main.rampTo}
                onChange={(v) => p.onPatchMain({ rampTo: v })}
              />
            )}
            <SpeedCurve
              clip={main}
              onChange={(curve) => p.onPatchMain({ curve })}
              playhead={p.playheadLocal}
            />
          </Section>

          <Section label="Effect" anchor="anim">
            <select
              className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs"
              value={main.effect ?? "none"}
              onChange={(e) => p.onPatchMain({ effect: e.target.value as EffectId })}
            >
              {EFFECTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Section>

          <Section label="Framing" anchor="video">
            <div className="grid grid-cols-3 gap-1">
              {(["cover", "contain", "blur"] as FrameFit[]).map((f) => (
                <button
                  key={f}
                  className={`h-7 border rounded text-[10px] capitalize ${
                    (main.fit ?? "cover") === f
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-border hover:border-white/40"
                  }`}
                  onClick={() => p.onPatchMain({ fit: f })}
                  title={
                    f === "cover"
                      ? "Fill the frame, cropping the edges"
                      : f === "contain"
                        ? "Fit the whole picture, letterboxing the rest"
                        : "Fit the picture over a blurred fill"
                  }
                >
                  {f}
                </button>
              ))}
            </div>
            {/*
              Crop, the way CapCut and Kdenlive both offer it. Sliders rather
              than a drag box because the preview is already draggable for
              overlays, and a second drag mode that changes what a drag MEANS
              depending on a hidden state is how you get "why did my text move
              when I tried to crop". Sliders are slower but unambiguous, and the
              numbers are visible.
            */}
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Crop</span>
                <button
                  className="text-[10px] text-cyan-400 hover:underline"
                  onClick={() => p.onPatchMain({ frame: undefined })}
                  title="Reset crop, zoom and rotation"
                >
                  reset
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {CROP_PRESETS.map((cp) => {
                  const active =
                    cp.aspect === null
                      ? !main.frame?.crop
                      : main.frame?.crop != null &&
                        Math.abs((main.frame.crop ?? 0) - (cp.aspect || 1)) < 0.01;
                  return (
                    <button
                      key={cp.id}
                      className={`px-1.5 h-5 rounded border text-[10px] ${
                        active
                          ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                          : "border-border text-muted-foreground hover:border-white/40"
                      }`}
                      onClick={() =>
                        p.onPatchMain({
                          frame: {
                            ...clampGeometry(main.frame),
                            crop: cp.aspect === null ? null : cp.aspect || null,
                          },
                        })
                      }
                      title={
                        cp.aspect === null
                          ? "No crop: use the frame's own shape"
                          : `Crop to ${cp.name}`
                      }
                    >
                      {cp.name}
                    </button>
                  );
                })}
              </div>
              {[
                { key: "zoom" as const, label: "Zoom", min: 1, max: 4, step: 0.01 },
                { key: "ax" as const, label: "Horizontal", min: 0, max: 1, step: 0.01 },
                { key: "ay" as const, label: "Vertical", min: 0, max: 1, step: 0.01 },
                { key: "rot" as const, label: "Rotation", min: -180, max: 180, step: 1 },
              ].map((s2) => {
                const g = clampGeometry(main.frame);
                return (
                  <label key={s2.key} className="flex items-center gap-1.5 text-[10px]">
                    <span className="w-16 shrink-0 text-muted-foreground">{s2.label}</span>
                    <input
                      type="range"
                      className="flex-1 accent-cyan-400"
                      min={s2.min}
                      max={s2.max}
                      step={s2.step}
                      value={g[s2.key]}
                      onChange={(e) =>
                        p.onPatchMain({
                          frame: { ...g, [s2.key]: Number(e.target.value) },
                        })
                      }
                    />
                    <span className="w-9 text-right tabular-nums text-muted-foreground">
                      {s2.key === "zoom"
                        ? `${g.zoom.toFixed(2)}x`
                        : s2.key === "rot"
                          ? `${Math.round(g.rot)}°`
                          : `${Math.round(g[s2.key] * 100)}%`}
                    </span>
                  </label>
                );
              })}
              {main.frame && !isDefaultGeometry(main.frame) && (
                <div className="text-[10px] text-muted-foreground leading-snug">
                  The crop applies to the export too — what you see is what renders.
                </div>
              )}
            </div>
          </Section>

          <Section label="Color LUT" anchor="adjust">
            <select
              className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs"
              value={main.lut ?? ""}
              onChange={(e) => p.onPatchMain({ lut: e.target.value || undefined })}
            >
              <option value="">None</option>
              {p.luts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.builtin ? "" : " (imported)"}
                </option>
              ))}
            </select>
            <label className="block text-[11px] text-muted-foreground mt-2">
              Import a .cube LUT…
              <input
                type="file"
                accept=".cube"
                className="block mt-1 text-[10px] text-muted-foreground file:mb-btn-ghost file:mr-2 file:text-xs file:cursor-pointer"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) p.onImportLut(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </Section>

          <Section label="Motion & keyframes" anchor="anim">
            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
              Move the playhead, then drag a value — a keyframe is written where a ◆ already sits
              nearby, otherwise the clip starts a new animation from here.
            </p>
            <Slider
              label="X position"
              min={-1}
              max={1}
              step={0.01}
              value={p.anim.x}
              onChange={(v) => setAnim({ x: v })}
            />
            <Slider
              label="Y position"
              min={-1}
              max={1}
              step={0.01}
              value={p.anim.y}
              onChange={(v) => setAnim({ y: v })}
            />
            <Slider
              label="Scale (zoom)"
              min={0.4}
              max={2.2}
              step={0.01}
              value={p.anim.scale}
              onChange={(v) => setAnim({ scale: v })}
            />
            <Slider
              label="Rotation"
              min={-180}
              max={180}
              step={1}
              value={p.anim.rotation}
              onChange={(v) => setAnim({ rotation: v })}
            />
            <Slider
              label="Opacity"
              min={0}
              max={1}
              step={0.01}
              value={p.anim.opacity}
              onChange={(v) => setAnim({ opacity: v })}
            />
            <KeyframeSection
              clip={main}
              clipStart={p.clipStart}
              playheadLocal={p.playheadLocal}
              onAdd={() => p.onKeyframeAdd(clipId)}
              onDelete={(at) => p.onKeyframeDelete(clipId, at)}
              onSeek={p.onSeek}
            />
            <div className="grid grid-cols-2 gap-1 mt-2">
              <button
                className={`h-7 border rounded text-[10px] ${main.flipX ? "border-cyan-400 bg-cyan-400/10" : "border-border hover:border-white/40"}`}
                aria-pressed={main.flipX ?? false}
                onClick={() => p.onPatchMain({ flipX: !main.flipX })}
              >
                ↔ Flip horizontal
              </button>
              <button
                className={`h-7 border rounded text-[10px] ${main.flipY ? "border-cyan-400 bg-cyan-400/10" : "border-border hover:border-white/40"}`}
                aria-pressed={main.flipY ?? false}
                onClick={() => p.onPatchMain({ flipY: !main.flipY })}
              >
                ↕ Flip vertical
              </button>
            </div>
          </Section>

          <Section label="Filter" anchor="adjust">
            <div className="grid grid-cols-2 gap-1.5">
              {p.filters.map((f) => (
                <button
                  key={f.id}
                  className={`text-[11px] border rounded px-2 py-1 text-left ${
                    main.filter === f.id
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-border hover:border-white/40"
                  }`}
                  onClick={() => p.onPatchMain({ filter: f.id })}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </Section>

          <Section label="Adjust" anchor="adjust">
            <Slider
              label="Brightness"
              min={50}
              max={160}
              value={main.adjust.brightness}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, brightness: v } })}
            />
            <Slider
              label="Contrast"
              min={50}
              max={160}
              value={main.adjust.contrast}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, contrast: v } })}
            />
            <Slider
              label="Saturation"
              min={0}
              max={200}
              value={main.adjust.saturation}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, saturation: v } })}
            />
            <Slider
              label="Hue"
              min={-180}
              max={180}
              value={main.adjust.hue}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, hue: v } })}
            />
            <Slider
              label="Temperature"
              min={-100}
              max={100}
              step={1}
              value={main.adjust.temperature ?? 0}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, temperature: v } })}
            />
            <Slider
              label="Tint"
              min={-100}
              max={100}
              step={1}
              value={main.adjust.tint ?? 0}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, tint: v } })}
            />
            <Slider
              label="Fade"
              min={0}
              max={100}
              step={1}
              value={main.adjust.fade ?? 0}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, fade: v } })}
            />
            <Slider
              label="Sharpen"
              min={0}
              max={100}
              step={1}
              value={main.adjust.sharpen ?? 0}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, sharpen: v } })}
            />
            <Slider
              label="Vignette"
              min={0}
              max={100}
              step={1}
              value={main.adjust.vignette ?? 0}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, vignette: v } })}
            />
            <Slider
              label="Split tone"
              min={0}
              max={100}
              step={1}
              value={main.adjust.splitTone ?? 0}
              onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, splitTone: v } })}
            />
            <CurveSection main={main} onPatchMain={p.onPatchMain} />
            <HslSection main={main} onPatchMain={p.onPatchMain} />
            <div className="flex gap-1 mt-1">
              <button
                className="mb-btn-ghost flex-1 h-6 text-[10px]"
                onClick={() =>
                  p.onPatchMain({
                    adjust: {
                      brightness: 100,
                      contrast: 100,
                      saturation: 100,
                      hue: 0,
                      temperature: 0,
                      tint: 0,
                      fade: 0,
                      sharpen: 0,
                      vignette: 0,
                      splitTone: 0,
                    },
                  })
                }
              >
                Reset adjust
              </button>
              <button
                className="mb-btn-ghost flex-1 h-6 text-[10px]"
                onClick={() => p.onMatchColor?.(main.id)}
                title="Copy this clip's colour grade to every other main clip (match colours)"
              >
                Match all clips
              </button>
            </div>
          </Section>

          <Section label="Transition in" anchor="anim">
            <div className="grid grid-cols-2 gap-1">
              {TRANSITIONS.map((tr) => (
                <button
                  key={tr.id}
                  className={`text-[10px] border rounded px-1 py-1 text-left truncate ${
                    main.transitionIn === tr.id
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-border hover:border-white/40"
                  }`}
                  onClick={() =>
                    p.onPatchMain({
                      transitionIn: tr.id,
                      transitionDur: tr.id === "none" ? 0 : main.transitionDur || 0.5,
                    })
                  }
                  title={tr.name}
                >
                  {tr.name}
                </button>
              ))}
            </div>
            {main.transitionIn !== "none" && (
              <>
                <Slider
                  label="Duration"
                  min={0.1}
                  max={2}
                  step={0.1}
                  value={main.transitionDur}
                  onChange={(v) => p.onPatchMain({ transitionDur: v })}
                />
                <button
                  className="mb-btn-ghost w-full h-6 text-[10px]"
                  onClick={() => p.onApplyTransitionAll?.(main.transitionIn, main.transitionDur)}
                  title="Use this transition between every clip on the main track"
                >
                  Apply to every cut
                </button>
              </>
            )}
          </Section>

          <Section label="Audio" anchor="audio">
            <Slider
              label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={main.volume}
              onChange={(v) => p.onPatchMain({ volume: v })}
            />
            <label className="flex items-center gap-2 text-xs mt-1">
              <input
                type="checkbox"
                className="accent-cyan-400"
                checked={main.muted}
                onChange={(e) => p.onPatchMain({ muted: e.target.checked })}
              />
              Mute original sound
            </label>
            {mainMedia?.kind === "video" && p.onExtractAudio && (
              <button
                className={`mb-btn-ghost w-full text-xs h-7 mt-2 ${p.extracting ? "opacity-60" : ""}`}
                onClick={p.extracting ? undefined : p.onExtractAudio}
                disabled={!!p.extracting}
                title="Move this clip's sound to the Audio track as an independent clip (like CapCut's Extract Audio). The video clip is then muted — delete it to keep only the audio."
              >
                {p.extracting ? "Extracting audio…" : "🎵 Extract audio to Audio track"}
              </button>
            )}
            <DenoiseRow
              media={mainMedia}
              denoise={p.denoise}
              onDenoise={p.onDenoise}
              denoiseGate={p.denoiseGate}
            />
          </Section>

          <Section label="Voice shaping" anchor="audio">
            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
              Bass / mid / treble shaping on this clip's own sound — the quick fix for thin or boomy
              voices.
            </p>
            <Slider
              label="Bass"
              min={-1}
              max={1}
              step={0.05}
              value={main.voice?.low ?? 0}
              onChange={(v) => p.onPatchMain({ voice: { ...main.voice, low: v } })}
            />
            <Slider
              label="Clarity (mid)"
              min={-1}
              max={1}
              step={0.05}
              value={main.voice?.mid ?? 0}
              onChange={(v) => p.onPatchMain({ voice: { ...main.voice, mid: v } })}
            />
            <Slider
              label="Air (treble)"
              min={-1}
              max={1}
              step={0.05}
              value={main.voice?.high ?? 0}
              onChange={(v) => p.onPatchMain({ voice: { ...main.voice, high: v } })}
            />
            <div className="flex gap-1 mt-1">
              <button
                className="mb-btn-ghost flex-1 h-6 text-[10px]"
                onClick={() => p.onPatchMain({ voice: { low: 0.25, mid: 0.35, high: 0.3 } })}
                title="Podcast-style voice enhance"
              >
                Voice enhance
              </button>
              <button
                className="mb-btn-ghost h-6 text-[10px] px-2"
                onClick={() => p.onPatchMain({ voice: undefined })}
              >
                Reset
              </button>
            </div>
          </Section>

          <Section label="Replace media" anchor="video">
            <button
              className="mb-btn-ghost w-full text-xs h-7"
              onClick={() => setReplaceOpen((v) => !v)}
            >
              Swap in a different file…
            </button>
            {replaceOpen && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {p.media
                  .filter(
                    (m) => m.kind === (p.media.find((x) => x.id === main.mediaId)?.kind ?? "video"),
                  )
                  .map((m) => (
                    <button
                      key={m.id}
                      className="w-full text-left text-[11px] border border-border rounded px-2 py-1 hover:border-cyan-400 truncate"
                      onClick={() => {
                        p.onReplaceMedia(main.id, m);
                        setReplaceOpen(false);
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
              </div>
            )}
          </Section>
        </>
      )}

      {/* ---------------- text overlay ---------------- */}
      {over?.kind === "adjustment" && (
        <Section label="Adjustment band" anchor="adjust">
          <p className="text-[10px] text-muted-foreground leading-snug mb-1">
            Grades every clip underneath for {over.duration.toFixed(1)}s. One band instead of eight
            hand-matched clips.
          </p>
          {(
            [
              { key: "brightness", label: "Brightness", min: 50, max: 150 },
              { key: "contrast", label: "Contrast", min: 50, max: 200 },
              { key: "saturation", label: "Saturation", min: 0, max: 200 },
              { key: "temperature", label: "Temperature", min: -100, max: 100 },
              { key: "vignette", label: "Vignette", min: 0, max: 100 },
            ] as const
          ).map((s2) => {
            const defaults: Record<string, number> = {
              brightness: 100,
              contrast: 100,
              saturation: 100,
              temperature: 0,
              vignette: 0,
            };
            const cur = over.adjust ?? { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
            return (
              <Slider
                key={s2.key}
                label={s2.label}
                min={s2.min}
                max={s2.max}
                step={1}
                value={(cur as unknown as Record<string, number>)[s2.key] ?? defaults[s2.key]}
                onChange={(v) => p.onPatchOverlay(trackId, { adjust: { ...cur, [s2.key]: v } })}
              />
            );
          })}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Look</span>
            <button
              className="text-cyan-400 hover:underline"
              onClick={() =>
                p.onPatchOverlay(trackId, {
                  adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0 },
                })
              }
            >
              reset grade
            </button>
          </div>
          <select
            className="w-full bg-slate-900 border border-border rounded px-2 py-1 text-[11px]"
            value={over.filter ?? "none"}
            onChange={(e) =>
              p.onPatchOverlay(trackId, {
                filter: e.target.value === "none" ? undefined : e.target.value,
              })
            }
          >
            <option value="none">No look</option>
            {p.filters
              .filter((f) => f.id !== "none")
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        </Section>
      )}
      {over?.kind === "text" && (
        <>
          <Section label="Text" anchor="video">
            <textarea
              className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs min-h-24 resize-y leading-snug"
              value={over.text ?? ""}
              placeholder="Type your text — Enter starts a new line"
              spellCheck
              onChange={(e) => p.onPatchOverlay(trackId, { text: e.target.value })}
            />
            <div className="text-[10px] text-muted-foreground">
              {(over.text ?? "").length} characters · {(over.text ?? "").split("\n").length} line
              {(over.text ?? "").split("\n").length === 1 ? "" : "s"}
            </div>
          </Section>
          <Section label="Text presets" anchor="video">
            <div className="grid grid-cols-2 gap-1">
              {TEXT_PRESETS.map((tp) => (
                <button
                  key={tp.name}
                  className="border border-border rounded px-1.5 py-1 text-[10px] hover:border-cyan-400 text-left truncate"
                  onClick={() => p.onPatchOverlay(trackId, tp.patch)}
                  title={tp.name}
                >
                  {tp.name}
                </button>
              ))}
            </div>
          </Section>
          <Section label="Style" anchor="video">
            <Slider
              label="Size"
              min={24}
              max={220}
              value={over.size ?? 72}
              onChange={(v) => p.onPatchOverlay(trackId, { size: v })}
            />
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs flex items-center gap-1">
                Color
                <input
                  type="color"
                  value={over.color ?? "#ffffff"}
                  onChange={(e) => p.onPatchOverlay(trackId, { color: e.target.value })}
                />
              </label>
              <label className="text-xs flex items-center gap-1">
                Background
                <select
                  className="bg-slate-900 border border-border rounded px-1 text-xs"
                  value={over.bg ?? ""}
                  onChange={(e) => p.onPatchOverlay(trackId, { bg: e.target.value })}
                >
                  <option value="">none</option>
                  <option value="#000000aa">black</option>
                  <option value="#facc15">yellow</option>
                  <option value="#ef4444">red</option>
                  <option value="#0ea5e9">blue</option>
                </select>
              </label>
              <label className="text-xs flex items-center gap-1 ml-auto">
                <input
                  type="checkbox"
                  className="accent-cyan-400"
                  checked={over.bold ?? false}
                  onChange={(e) => p.onPatchOverlay(trackId, { bold: e.target.checked })}
                />
                B
              </label>
            </div>
            <div className="text-xs mt-2 mb-1">Position</div>
            <div className="grid grid-cols-3 gap-1 w-24">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  className={`h-6 border text-[10px] ${
                    (over.pos ?? "mc") === pos
                      ? "border-cyan-400 bg-cyan-400/20"
                      : "border-border hover:border-white/40"
                  }`}
                  onClick={() => p.onPatchOverlay(trackId, { pos })}
                  title={pos}
                >
                  {pos}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground mt-2 mb-1">
              Fine position <span className="opacity-70">(or drag the text on the preview)</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <Slider
                label="X offset"
                min={-1.5}
                max={1.5}
                step={0.01}
                value={over.x ?? 0}
                onChange={(v) => p.onPatchOverlay(trackId, { x: v })}
              />
              <Slider
                label="Y offset"
                min={-1.5}
                max={1.5}
                step={0.01}
                value={over.y ?? 0}
                onChange={(v) => p.onPatchOverlay(trackId, { y: v })}
              />
            </div>
            <FontPicker
              value={over.font}
              imported={p.projectFonts}
              onPick={(id) => p.onPatchOverlay(trackId, { font: id })}
            />
            {p.onImportFont && (
              <label className="block text-[10px] text-muted-foreground mt-1">
                Import a font (.ttf / .otf / .woff)…
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2,font/*"
                  className="block mt-1 text-[10px] file:mb-btn-ghost file:mr-2 file:text-xs file:cursor-pointer"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) p.onImportFont?.(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
            <div className="grid grid-cols-3 gap-1 mt-2">
              {(["left", "center", "right"] as const).map((al) => (
                <button
                  key={al}
                  className={`h-6 border rounded text-[10px] capitalize ${
                    (over.align ?? "center") === al
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-border"
                  }`}
                  onClick={() => p.onPatchOverlay(trackId, { align: al })}
                >
                  {al}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {(
                [
                  ["I", "italic", over.italic],
                  ["U", "underline", over.underline],
                  ["AA", "upper", over.upper],
                ] as [string, "italic" | "underline" | "upper", boolean | undefined][]
              ).map(([label, key]) => (
                <button
                  key={key}
                  className={`h-6 px-2 border rounded text-[10px] ${over[key] ? "border-cyan-400 bg-cyan-400/10" : "border-border"}`}
                  onClick={() => p.onPatchOverlay(trackId, { [key]: !over[key] })}
                  title={key}
                >
                  {label}
                </button>
              ))}
            </div>
            <Slider
              label="Letter spacing"
              min={-10}
              max={40}
              step={1}
              value={over.tracking ?? 0}
              onChange={(v) => p.onPatchOverlay(trackId, { tracking: v })}
            />
            <Slider
              label="Line height"
              min={0.9}
              max={2}
              step={0.02}
              value={over.leading ?? 1.18}
              onChange={(v) => p.onPatchOverlay(trackId, { leading: v })}
            />
            <Slider
              label="Opacity"
              min={0}
              max={1}
              step={0.01}
              value={over.opacity ?? 1}
              onChange={(v) => p.onPatchOverlay(trackId, { opacity: v })}
            />
            <div className="text-[10px] text-muted-foreground mt-1 mb-0.5">Outline</div>
            <div className="flex items-center gap-1">
              <Slider
                label=""
                min={0}
                max={20}
                step={1}
                value={over.stroke ?? 0}
                onChange={(v) => p.onPatchOverlay(trackId, { stroke: v })}
              />
              <input
                type="color"
                value={over.strokeColor ?? "#000000"}
                onChange={(e) => p.onPatchOverlay(trackId, { strokeColor: e.target.value })}
                title="Outline colour"
              />
            </div>
            <Slider
              label="Shadow"
              min={0}
              max={1}
              step={0.05}
              value={over.shadow ?? 0.55}
              onChange={(v) => p.onPatchOverlay(trackId, { shadow: v })}
            />
            <Slider
              label="Pill radius"
              min={0}
              max={100}
              step={1}
              value={over.radius ?? 40}
              onChange={(v) => p.onPatchOverlay(trackId, { radius: v })}
            />
          </Section>
          <Section label="Animation" anchor="anim">
            <select
              className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs"
              value={over.anim ?? "none"}
              onChange={(e) => p.onPatchOverlay(trackId, { anim: e.target.value as TextAnim })}
            >
              {TEXT_ANIMS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {over.anim === "karaoke" && (
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                {over.words?.length
                  ? `Highlighting ${over.words.length} words from captions.`
                  : "Karaoke needs word timing — generate captions in Assist (it fills this automatically), or use another animation."}
              </p>
            )}
            {(over.words?.length ?? 0) > 0 && (
              <WordTiming
                words={over.words ?? []}
                duration={over.duration}
                playhead={p.playheadLocal ?? 0}
                onChange={(words) => p.onPatchOverlay(trackId, { words })}
                onSeek={(t) => p.onSeek(p.clipStart + t)}
              />
            )}
            <Slider
              label="Opacity (keyframable)"
              min={0}
              max={1}
              step={0.01}
              value={p.anim.opacity}
              onChange={(v) => setAnim({ opacity: v })}
            />
            <KeyframeSection
              clip={over}
              clipStart={p.clipStart}
              playheadLocal={p.playheadLocal}
              onAdd={() => p.onKeyframeAdd(clipId)}
              onDelete={(at) => p.onKeyframeDelete(clipId, at)}
              onSeek={p.onSeek}
            />
          </Section>
          <TimingSection over={over} onPatch={(patch) => p.onPatchOverlay(trackId, patch)} />
        </>
      )}

      {/* ---------------- image / video overlay ---------------- */}
      {(over?.kind === "image" || over?.kind === "video") && (
        <>
          <Section label="Transform & keyframes" anchor="anim">
            <Slider
              label="Scale"
              min={0.05}
              max={1.2}
              step={0.01}
              value={p.anim.scale}
              onChange={(v) => setAnim({ scale: v })}
            />
            <Slider
              label="X"
              min={-1}
              max={1}
              step={0.01}
              value={p.anim.x}
              onChange={(v) => setAnim({ x: v })}
            />
            <Slider
              label="Y"
              min={-1}
              max={1}
              step={0.01}
              value={p.anim.y}
              onChange={(v) => setAnim({ y: v })}
            />
            <Slider
              label="Rotation"
              min={-180}
              max={180}
              step={1}
              value={p.anim.rotation}
              onChange={(v) => setAnim({ rotation: v })}
            />
            <Slider
              label="Opacity (keyframable)"
              min={0}
              max={1}
              step={0.01}
              value={p.anim.opacity}
              onChange={(v) => setAnim({ opacity: v })}
            />
            <KeyframeSection
              clip={over}
              clipStart={p.clipStart}
              playheadLocal={p.playheadLocal}
              onAdd={() => p.onKeyframeAdd(clipId)}
              onDelete={(at) => p.onKeyframeDelete(clipId, at)}
              onSeek={p.onSeek}
            />
            <div className="grid grid-cols-2 gap-1 mt-2">
              <button
                className={`h-7 border rounded text-[10px] ${over.flipX ? "border-cyan-400 bg-cyan-400/10" : "border-border hover:border-white/40"}`}
                aria-pressed={over.flipX ?? false}
                onClick={() => p.onPatchOverlay(trackId, { flipX: !over.flipX })}
              >
                ↔ Flip horizontal
              </button>
              <button
                className={`h-7 border rounded text-[10px] ${over.flipY ? "border-cyan-400 bg-cyan-400/10" : "border-border hover:border-white/40"}`}
                aria-pressed={over.flipY ?? false}
                onClick={() => p.onPatchOverlay(trackId, { flipY: !over.flipY })}
              >
                ↕ Flip vertical
              </button>
            </div>
          </Section>
          <Section label="Framing & motion" anchor="video">
            <div className="grid grid-cols-3 gap-1">
              {(["cover", "contain", "blur"] as FrameFit[]).map((f) => (
                <button
                  key={f}
                  className={`h-7 border rounded text-[10px] capitalize ${
                    (over.fit ?? "cover") === f
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-border hover:border-white/40"
                  }`}
                  onClick={() => p.onPatchOverlay(trackId, { fit: f })}
                >
                  {f}
                </button>
              ))}
            </div>
            {over.kind === "video" && (
              <>
                <Slider
                  label="Sticker speed"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={over.speed ?? 1}
                  onChange={(v) => p.onPatchOverlay(trackId, { speed: v })}
                />
                <label className="flex items-center gap-2 text-xs mt-1">
                  <input
                    type="checkbox"
                    className="accent-cyan-400"
                    checked={!!over.loop}
                    onChange={(e) => p.onPatchOverlay(trackId, { loop: e.target.checked })}
                  />
                  Loop the footage
                </label>
              </>
            )}
          </Section>
          <Section
            label={isEmojiOverlay(over) ? "Replace emoji" : "Replace sticker"}
            anchor="media"
          >
            {/* Replacing keeps the object's kind honest: a swapped emoji stays a
                still character, and a swapped graphic keeps its entrance. */}
            <StickerSearch
              onSelectEmoji={(emoji) =>
                p.onPatchOverlay(
                  trackId,
                  // An emoji replaced by an emoji keeps whatever the user set;
                  // anything else becomes a plain, still emoji.
                  isEmojiOverlay(over)
                    ? { text: emoji, kind: "text" }
                    : {
                        text: emoji,
                        kind: "text",
                        size: defaultSizeFor("emoji"),
                        anim: defaultAnimFor("emoji"),
                        sticker: "emoji",
                      },
                )
              }
              onSearchStock={p.onSearchStock}
              onAddStock={p.onAddStock}
            />
          </Section>
          <Section label="Sticker filter" anchor="adjust">
            <div className="grid grid-cols-2 gap-1">
              <button
                className={`text-[10px] border rounded px-1 py-1 text-left ${!over.filter || over.filter === "none" ? "border-cyan-400 bg-cyan-400/10" : "border-border"}`}
                onClick={() => p.onPatchOverlay(trackId, { filter: "none" })}
              >
                Original
              </button>
              {p.filters
                .filter((f) => f.id !== "none")
                .map((f) => (
                  <button
                    key={f.id}
                    className={`text-[10px] border rounded px-1 py-1 text-left truncate ${
                      over.filter === f.id
                        ? "border-cyan-400 bg-cyan-400/10"
                        : "border-border hover:border-white/40"
                    }`}
                    onClick={() => p.onPatchOverlay(trackId, { filter: f.id })}
                  >
                    {f.name}
                  </button>
                ))}
            </div>
          </Section>
          <Section label="Audio ducking" anchor="audio">
            <Slider
              label="Duck music under this clip"
              min={0}
              max={1}
              step={0.05}
              value={over.duck ?? 0}
              onChange={(v) => p.onPatchOverlay(trackId, { duck: v })}
            />
            <p className="text-[10px] text-muted-foreground leading-snug">
              Lowers every other audio clip while this one plays — the standard way to keep a
              voiceover clear over music.
            </p>
          </Section>
          <Section label="Green screen" anchor="video">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="accent-emerald-400"
                checked={!!over.chroma}
                onChange={(e) => p.onPatchOverlay(trackId, { chroma: e.target.checked })}
              />
              <span>Key out the background color (chroma)</span>
            </label>
            {over.chroma && (
              <div className="mt-2">
                <Slider
                  label="Tolerance"
                  min={10}
                  max={200}
                  step={5}
                  value={over.chromaTol ?? 90}
                  onChange={(v) => p.onPatchOverlay(trackId, { chromaTol: v })}
                />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  The key color is sampled from the corners of the footage. Works on green, blue or
                  any solid backdrop.
                </p>
              </div>
            )}
          </Section>
          <Section label="Blend & mask" anchor="video">
            <div className="text-xs mb-1">Blend mode</div>
            <select
              className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs"
              value={over.blend ?? "normal"}
              onChange={(e) =>
                p.onPatchOverlay(trackId, { blend: e.target.value as OverlayClip["blend"] })
              }
            >
              {["normal", "multiply", "screen", "overlay", "lighten", "darken", "difference"].map(
                (b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ),
              )}
            </select>
            <div className="text-xs mb-1 mt-2">Mask</div>
            <div className="grid grid-cols-4 gap-1">
              {(["none", "spotlight", "bar", "line"] as const).map((m) => (
                <button
                  key={m}
                  className={`h-7 border text-[10px] capitalize ${
                    (over.mask ?? "none") === m
                      ? "border-cyan-400 bg-cyan-400/20"
                      : "border-border hover:border-white/40"
                  }`}
                  onClick={() => p.onPatchOverlay(trackId, { mask: m })}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
              Spotlight = round window, bar = horizontal band, line = half-plane (rotate the clip to
              aim it).
            </p>
          </Section>
          <TimingSection over={over} onPatch={(patch) => p.onPatchOverlay(trackId, patch)} />
        </>
      )}

      {/* ---------------- audio ---------------- */}
      {over?.kind === "audio" && (
        <>
          <Section label="Audio" anchor="audio">
            <Slider
              label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={over.volume ?? 1}
              onChange={(v) => p.onPatchOverlay(trackId, { volume: v })}
            />
            <Slider
              label="Fade in"
              min={0}
              max={3}
              step={0.05}
              value={over.fadeIn ?? 0.15}
              onChange={(v) => p.onPatchOverlay(trackId, { fadeIn: v })}
            />
            <Slider
              label="Fade out"
              min={0}
              max={3}
              step={0.05}
              value={over.fadeOut ?? 0.15}
              onChange={(v) => p.onPatchOverlay(trackId, { fadeOut: v })}
            />
          </Section>
          <Section label="Audio FX" anchor="audio">
            <Slider
              label="Reverb"
              min={0}
              max={1}
              step={0.05}
              value={over.fx?.reverb ?? 0}
              onChange={(v) => p.onPatchOverlay(trackId, { fx: { ...over.fx, reverb: v } })}
            />
            <Slider
              label="Echo"
              min={0}
              max={1}
              step={0.05}
              value={over.fx?.echo ?? 0}
              onChange={(v) => p.onPatchOverlay(trackId, { fx: { ...over.fx, echo: v } })}
            />
            <Slider
              label="Pitch (semitones)"
              min={-12}
              max={12}
              step={1}
              value={over.fx?.pitch ?? 0}
              onChange={(v) => p.onPatchOverlay(trackId, { fx: { ...over.fx, pitch: v } })}
            />
            <div className="text-[10px] text-muted-foreground mt-1 mb-1">Voice presets</div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["Normal", 0],
                  ["Slightly higher", 3],
                  ["Chipmunk", 7],
                  ["Lower", -5],
                  ["Deep", -10],
                ] as [string, number][]
              ).map(([label, semis]) => (
                <button
                  key={label}
                  className={`text-[10px] border rounded px-1.5 py-0.5 ${
                    (over.fx?.pitch ?? 0) === semis
                      ? "border-cyan-400 bg-cyan-400/10"
                      : "border-border hover:border-white/40"
                  }`}
                  onClick={() => p.onPatchOverlay(trackId, { fx: { ...over.fx, pitch: semis } })}
                >
                  {label}
                </button>
              ))}
            </div>
            <DenoiseRow
              media={overMedia}
              denoise={p.denoise}
              onDenoise={p.onDenoise}
              denoiseGate={p.denoiseGate}
            />
            <p className="text-[10px] text-muted-foreground leading-snug">
              Pitch-shifts clips up to 2 minutes (chipmuck / deep-voice). Reverb and echo apply to
              any length. Denoise runs the RNNoise speech model in the browser and swaps in a clean
              copy of the audio. All local — included in exports.
            </p>
          </Section>
          <TimingSection over={over} onPatch={(patch) => p.onPatchOverlay(trackId, patch)} />
        </>
      )}
    </div>
  );
}

/**
 * Word-level caption re-timing.
 *
 * Captions arrive with a start time per word but no editable end, so a
 * mis-timed word stays mis-timed forever. This nudge editor is the CapCut
 * "click a word and fix it" flow: tap a word to jump the playhead to it, then
 * shift it earlier/later. Everything is stored clip-local, so trimming the
 * caption afterwards keeps the words aligned.
 */
function WordTiming({
  words,
  duration,
  playhead,
  onChange,
  onSeek,
}: {
  words: TextWord[];
  duration: number;
  playhead: number;
  onChange: (words: TextWord[]) => void;
  onSeek: (t: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const STEP = 0.05;

  const nudge = (i: number, delta: number) => onChange(nudgeWord(words, i, delta, duration, STEP));
  const respace = () => onChange(respaceWords(words, duration));
  const shiftAll = (delta: number) => onChange(shiftWords(words, delta, duration));

  const active = words.reduce((acc, w, i) => (playhead >= w.t ? i : acc), -1);

  return (
    <div className="mt-2 border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] hover:bg-secondary/60"
        onClick={() => setOpen((v) => !v)}
      >
        <Clock className="h-3 w-3" />
        <span className="font-medium">Word timing</span>
        <span className="text-muted-foreground">
          {words.length} words{active >= 0 ? ` · now “${words[active].text}”` : ""}
        </span>
        <span className="ml-auto text-muted-foreground">{open ? "hide" : "fix"}</span>
      </button>
      {open && (
        <div className="p-2 border-t border-border space-y-1">
          <div className="flex items-center gap-1 pb-1">
            <button className="mb-btn-ghost h-6 text-[10px] px-1.5" onClick={() => shiftAll(-STEP)}>
              All −{Math.round(STEP * 1000)}ms
            </button>
            <button className="mb-btn-ghost h-6 text-[10px] px-1.5" onClick={() => shiftAll(STEP)}>
              All +{Math.round(STEP * 1000)}ms
            </button>
            <button
              className="mb-btn-ghost h-6 text-[10px] px-1.5 ml-auto"
              title="Spread the words evenly across this caption"
              onClick={respace}
            >
              Re-space evenly
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {words.map((w, i) => (
              <div
                key={`${i}-${w.text}`}
                className={`flex items-center gap-1 rounded px-1 py-0.5 text-[11px] ${
                  i === active ? "bg-primary/15 text-foreground" : "text-muted-foreground"
                }`}
              >
                <button
                  className="flex-1 text-left truncate hover:text-foreground"
                  title="Jump the playhead to this word"
                  onClick={() => onSeek(w.t)}
                >
                  {w.text}
                </button>
                <span className="tabular-nums text-[10px] opacity-70">{w.t.toFixed(2)}</span>
                <button
                  className="w-4 hover:text-foreground"
                  title="Earlier"
                  onClick={() => nudge(i, -STEP)}
                >
                  ◀
                </button>
                <button
                  className="w-4 hover:text-foreground"
                  title="Later"
                  onClick={() => nudge(i, STEP)}
                >
                  ▶
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Drawable speed curve (CapCut's custom speed curve).
 *
 * Drag a point up/down to change speed there, drag sideways to move it through
 * the clip. Double-click the graph to add a point, double-click a point to
 * remove it (always keeping at least two). Since the engine integrates the
 * curve in closed form, the timeline length and the source position stay exact
 * at any point count — preview and export agree frame for frame.
 */
function SpeedCurve({
  clip,
  onChange,
  playhead,
}: {
  clip: MainClip;
  onChange: (curve: SpeedPoint[] | undefined) => void;
  playhead: number | null;
}) {
  const [open, setOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const MIN = 0.05;
  const MAX = 8;

  // The graph always shows a concrete curve, materialising the linear ramp if
  // the clip only has `speed` / `rampTo` — so the handle is never invisible.
  const pts: SpeedPoint[] =
    clip.curve && clip.curve.length >= 2
      ? clip.curve
      : [
          { at: 0, v: clip.speed },
          { at: 1, v: clip.rampTo ?? clip.speed },
        ];

  const W = 100;
  const H = 46;
  const PAD = 3;
  const toY = (v: number) =>
    H -
    PAD -
    ((Math.log(clamp01(v, MIN, MAX)) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN))) *
      (H - PAD * 2);
  const fromY = (y: number) =>
    Math.exp(Math.log(MIN) + ((H - PAD - y) / (H - PAD * 2)) * (Math.log(MAX) - Math.log(MIN)));
  const toX = (at: number) => PAD + clamp01(at, 0, 1) * (W - PAD * 2);
  const fromX = (x: number) => clamp01((x - PAD) / (W - PAD * 2), 0, 1);

  /** pointer position in graph units, from a React pointer event */
  function point(ev: React.PointerEvent) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    // preserveAspectRatio="none" → a straight linear map is correct
    return {
      x: fromX(((ev.clientX - box.left) / box.width) * W),
      y: ((ev.clientY - box.top) / box.height) * H,
    };
  }

  function move(index: number, ev: React.PointerEvent) {
    const { x, y } = point(ev);
    const next = pts.map((q) => ({ ...q }));
    const lo = index === 0 ? 0 : next[index - 1].at + 0.02;
    const hi = index === pts.length - 1 ? 1 : next[index + 1].at - 0.02;
    next[index] = {
      at: index === 0 ? 0 : index === pts.length - 1 ? 1 : Math.min(hi, Math.max(lo, x)),
      v: Math.round(fromY(y) * 100) / 100,
    };
    onChange(next);
  }

  function addPoint(ev: React.PointerEvent) {
    const { x, y } = point(ev);
    const next = [...pts, { at: Math.min(0.98, Math.max(0.02, x)), v: fromY(y) }].sort(
      (a, b) => a.at - b.at,
    );
    onChange(next.map((q) => ({ ...q, v: Math.round(q.v * 100) / 100 })));
  }

  function removePoint(i: number) {
    if (pts.length <= 2) return;
    onChange(pts.filter((_, j) => j !== i));
  }

  /** A one-tap S-curve: fast → slow → fast, the classic jump-cut smoothy. */
  function presetS() {
    onChange([
      { at: 0, v: 0.5 },
      { at: 0.35, v: 0.2 },
      { at: 0.65, v: 0.2 },
      { at: 1, v: 0.5 },
    ]);
  }
  function presetBullet() {
    onChange([
      { at: 0, v: 0.25 },
      { at: 0.5, v: 4 },
      { at: 1, v: 0.25 },
    ]);
  }

  const path = pts.map((q, i) => `${i ? "L" : "M"}${toX(q.at)},${toY(q.v)}`).join(" ");
  const dur = mainClipDurationLength(clip);

  return (
    <div className="mt-2 border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] hover:bg-secondary/60"
        onClick={() => setOpen((v) => !v)}
      >
        <Spline className="h-3 w-3" />
        <span className="font-medium">Speed curve</span>
        <span className="text-muted-foreground">
          {pts.length} pts · {dur.toFixed(2)}s
        </span>
        <span className="ml-auto text-muted-foreground">{open ? "hide" : "draw"}</span>
      </button>
      {open && (
        <div className="p-2 border-t border-border">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full h-24 rounded bg-slate-950 touch-none cursor-crosshair"
            onDoubleClick={(e) => addPoint(e as unknown as React.PointerEvent)}
            onPointerMove={(e) => drag != null && move(drag, e)}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => setDrag(null)}
          >
            {/* speed gridlines at 0.25 / 1 / 4 */}
            {[0.25, 1, 4].map((v) => (
              <g key={v}>
                <line
                  x1={PAD}
                  x2={W - PAD}
                  y1={toY(v)}
                  y2={toY(v)}
                  stroke="rgba(148,163,184,0.2)"
                  strokeWidth={0.4}
                  strokeDasharray="1.5 1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
            {/* playhead */}
            {playhead != null && dur > 0 && (
              <line
                x1={toX(playhead / dur)}
                x2={toX(playhead / dur)}
                y1={PAD}
                y2={H - PAD}
                stroke="rgba(244,114,182,0.8)"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={`${path} L${toX(1)},${H - PAD} L${toX(0)},${H - PAD} Z`}
              fill="rgba(34,211,238,0.12)"
            />
            <path
              d={path}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
            />
            {pts.map((q, i) => (
              <circle
                key={i}
                cx={toX(q.at)}
                cy={toY(q.v)}
                r={2.4}
                fill="#0f172a"
                stroke="#22d3ee"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
                className="cursor-grab"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDrag(i);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  removePoint(i);
                }}
              >
                <title>{`${q.v.toFixed(2)}× at ${Math.round(q.at * 100)}%`}</title>
              </circle>
            ))}
          </svg>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>0.05×</span>
            <span>double-click the graph to add · a point to remove</span>
            <span>8×</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <button className="mb-btn-ghost h-6 px-1.5 text-[10px]" onClick={presetS}>
              Slow in / out
            </button>
            <button className="mb-btn-ghost h-6 px-1.5 text-[10px]" onClick={presetBullet}>
              Bullet time
            </button>
            <button
              className="mb-btn-ghost h-6 px-1.5 text-[10px]"
              title="Back to a constant speed"
              onClick={() => onChange(undefined)}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const clamp01 = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Local copy of the clip length so this panel never imports the engine. */
function mainClipDurationLength(c: MainClip): number {
  return mainClipDuration(c);
}

function KeyframeSection({
  clip,
  clipStart,
  playheadLocal,
  onAdd,
  onDelete,
  onSeek,
}: {
  clip: { keyframes?: Keyframe[] };
  clipStart: number;
  playheadLocal: number | null;
  onAdd: () => void;
  onDelete: (at: number) => void;
  onSeek: (v: number) => void;
}) {
  const kfs = clip.keyframes ?? [];
  return (
    <div className="mt-2">
      <button
        className="mb-btn-ghost w-full h-7 text-[11px] text-fuchsia-300 border border-fuchsia-400/40"
        onClick={onAdd}
        disabled={playheadLocal == null}
        title={
          playheadLocal == null
            ? "Put the playhead inside this clip first"
            : "Write all motion values at the playhead"
        }
      >
        <Diamond className="h-3 w-3 inline -mt-0.5" /> Add keyframe at playhead
        {playheadLocal != null && (
          <span className="text-muted-foreground">({playheadLocal.toFixed(2)}s in)</span>
        )}
      </button>
      {kfs.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {kfs.map((k) => (
            <div
              key={k.at}
              className="flex items-center gap-1.5 text-[10px] bg-slate-900/70 border border-border rounded px-1.5 py-1"
            >
              <button
                className="text-fuchsia-300 hover:scale-125 transition-transform"
                title="Jump playhead here"
                onClick={() => onSeek(clipStart + k.at)}
              >
                ◆
              </button>
              <span className="tabular-nums text-muted-foreground">{k.at.toFixed(2)}s</span>
              <span className="text-muted-foreground truncate flex-1">
                ×{k.v.scale.toFixed(2)} · {Math.round(k.v.opacity * 100)}%
                {(k.v.x !== 0 || k.v.y !== 0 || k.v.rotation !== 0) &&
                  ` · ${k.v.x.toFixed(2)},${k.v.y.toFixed(2)} ${Math.round(k.v.rotation)}°`}
              </span>
              <button
                className="text-muted-foreground hover:text-destructive"
                title="Delete keyframe"
                onClick={() => onDelete(k.at)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
          No keyframes yet — motion holds its current values. Add one, then keep adjusting to shape
          the animation.
        </p>
      )}
    </div>
  );
}

function TimingSection({
  over,
  onPatch,
}: {
  over: OverlayClip;
  onPatch: (p: Partial<OverlayClip>) => void;
}) {
  return (
    <Section label="Timing" anchor="video">
      <Slider
        label="Start"
        min={0}
        max={Math.max(1, over.start + over.duration)}
        step={0.1}
        value={over.start}
        onChange={(v) => onPatch({ start: v })}
      />
      <Slider
        label="Duration"
        min={0.2}
        max={60}
        step={0.1}
        value={over.duration}
        onChange={(v) => onPatch({ duration: v })}
      />
    </Section>
  );
}

/**
 * A titled group of controls.
 *
 * `anchor` marks which inspector tab (Video / Audio / Speed / Anim / Adjust)
 * this section belongs to, so the tab strip can scroll straight to it — the
 * sections stay single-source instead of being duplicated per tab.
 */
function Section({
  label,
  children,
  anchor,
}: {
  label: string;
  children: React.ReactNode;
  anchor?: string;
}) {
  return (
    <div className="border-t border-border pt-3" data-sec={anchor}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      {children}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const shown =
    step < 1
      ? value >= 10 && step >= 0.5
        ? Math.round(value).toString()
        : value.toFixed(2)
      : Math.round(value).toString();
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{shown}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400"
      />
    </div>
  );
}

/**
 * Font picker.
 *
 * A <select> can list font names but cannot SHOW them, which is the only thing
 * that matters when choosing a face — "Condensed" tells you nothing until you
 * see the letters. Each row renders in its own family, so the list is the
 * preview. Imported fonts appear in the same list, labelled, and preview in
 * their own face too (they are real FontFaces by the time they get here).
 */
function FontPicker({
  value,
  imported,
  onPick,
}: {
  value?: string;
  imported?: { id: string; family: string; name: string }[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = fontName(value, imported);
  const preview = "Aa Bb 123";
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span>Font</span>
        <button
          className="text-[10px] text-cyan-300 hover:underline"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "hide list" : `change (${FONT_CATALOGUE.length})`}
        </button>
      </div>
      <button
        className="w-full flex items-center justify-between gap-2 bg-slate-900 border border-border rounded px-2 py-1.5 text-left"
        aria-label="Font"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate" style={{ fontFamily: fontCss(value, imported) }}>
          {current}
        </span>
        <span className="text-muted-foreground text-[10px] shrink-0">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto border border-border rounded divide-y divide-border/60">
          {FONT_CATALOGUE.map((f) => (
            <button
              key={f.id}
              className={`w-full text-left px-2 py-1.5 hover:bg-slate-800 ${
                (value ?? "system") === f.id ? "bg-cyan-400/10" : ""
              }`}
              onClick={() => {
                onPick(f.id);
                setOpen(false);
              }}
              title={f.note}
            >
              <div className="text-sm leading-tight truncate" style={{ fontFamily: f.css }}>
                {f.sample ?? preview}
              </div>
              <div className="text-[9px] text-muted-foreground truncate">
                {f.name} · {f.note}
              </div>
            </button>
          ))}
          {(imported ?? []).map((f) => (
            <button
              key={f.id}
              className={`w-full text-left px-2 py-1.5 hover:bg-slate-800 ${
                value === f.id ? "bg-cyan-400/10" : ""
              }`}
              onClick={() => {
                onPick(f.id);
                setOpen(false);
              }}
            >
              <div
                className="text-sm leading-tight truncate"
                style={{ fontFamily: `"${f.family}", ${FONTS[0].css}` }}
              >
                {preview}
              </div>
              <div className="text-[9px] text-muted-foreground truncate">{f.name} · imported</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1 border border-border rounded bg-slate-900 text-[10px]">{children}</kbd>
  );
}
