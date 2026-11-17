import { useState } from "react";
import { Copy, Diamond, Scissors, SlidersHorizontal, Trash2 } from "lucide-react";
import type {
  AnimValues,
  AspectId,
  Keyframe,
  MainClip,
  MediaItem,
  OverlayClip,
  Project,
  TextAnim,
  TextPos,
  TransitionKind,
} from "../types";

interface Props {
  selection:
    | { lane: "main"; id: string }
    | { lane: "overlay"; trackId: string; id: string }
    | null;
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
          Select a clip on the timeline to edit its filters, motion, keyframes, text, position and audio.
        </p>
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-xs font-medium">Canvas format</div>
          <select
            className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs"
            value={p.project.aspect}
            onChange={(e) => p.onSetAspect(e.target.value as AspectId)}
          >
            <option value="9:16">9:16 · Reels / Shorts / TikTok</option>
            <option value="1:1">1:1 · Square (Instagram)</option>
            <option value="4:5">4:5 · Feed</option>
            <option value="16:9">16:9 · YouTube / Desktop</option>
          </select>
        </div>
        <div className="border-t border-border pt-3">
          <div className="text-xs font-medium mb-2">Shortcuts</div>
          <ul className="text-[11px] text-muted-foreground space-y-1">
            <li><Kbd>Space</Kbd> play / pause</li>
            <li><Kbd>S</Kbd> or double-click — split at playhead</li>
            <li><Kbd>←</Kbd> <Kbd>→</Kbd> step one frame</li>
            <li><Kbd>Del</Kbd> delete selected clip</li>
            <li><Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> undo</li>
            <li>Drag clip edges to trim</li>
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
  const clipId = p.clip.id;
  const localT = p.playheadLocal ?? 0;
  const setAnim = (patch: Partial<AnimValues>) => p.onAnimChange(clipId, localT, patch);

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">
          {main ? "Clip" : over?.kind === "text" ? "Text" : over?.kind === "image" ? "Image overlay" : over?.kind === "video" ? "Video overlay" : "Audio"}
        </h3>
        {main?.reverse && (
          <span className="text-[10px] text-fuchsia-300 border border-fuchsia-400/40 rounded px-1">reverse</span>
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
          <button className="mb-btn-ghost h-7 px-2 hover:text-destructive" title="Delete" onClick={p.onDelete}>
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

          <Section label="Speed & direction">
            <Slider
              label="Speed"
              min={0.25}
              max={4}
              step={0.05}
              value={main.speed}
              onChange={(v) => p.onPatchMain({ speed: v })}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground -mt-1">
              {[0.5, 1, 1.5, 2, 3, 4].map((s) => (
                <button key={s} className={main.speed === s ? "text-cyan-300" : ""} onClick={() => p.onPatchMain({ speed: s })}>
                  {s}×
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs mt-2">
              <input
                type="checkbox"
                className="accent-fuchsia-400"
                checked={main.reverse}
                onChange={(e) => p.onPatchMain({ reverse: e.target.checked })}
              />
              <span>
                Play backwards <span className="text-muted-foreground text-[10px]">(audio muted, frame-stepped)</span>
              </span>
            </label>
          </Section>

          <Section label="Motion & keyframes">
            <p className="text-[10px] text-muted-foreground mb-2 leading-snug">
              Move the playhead, then drag a value — a keyframe is written where a ◆ already sits nearby, otherwise the
              clip starts a new animation from here.
            </p>
            <Slider label="X position" min={-1} max={1} step={0.01} value={p.anim.x} onChange={(v) => setAnim({ x: v })} />
            <Slider label="Y position" min={-1} max={1} step={0.01} value={p.anim.y} onChange={(v) => setAnim({ y: v })} />
            <Slider label="Scale (zoom)" min={0.4} max={2.2} step={0.01} value={p.anim.scale} onChange={(v) => setAnim({ scale: v })} />
            <Slider label="Rotation" min={-180} max={180} step={1} value={p.anim.rotation} onChange={(v) => setAnim({ rotation: v })} />
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
          </Section>

          <Section label="Filter">
            <div className="grid grid-cols-2 gap-1.5">
              {p.filters.map((f) => (
                <button
                  key={f.id}
                  className={`text-[11px] border rounded px-2 py-1 text-left ${
                    main.filter === f.id ? "border-cyan-400 bg-cyan-400/10" : "border-border hover:border-white/40"
                  }`}
                  onClick={() => p.onPatchMain({ filter: f.id })}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </Section>

          <Section label="Adjust">
            <Slider label="Brightness" min={50} max={160} value={main.adjust.brightness} onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, brightness: v } })} />
            <Slider label="Contrast" min={50} max={160} value={main.adjust.contrast} onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, contrast: v } })} />
            <Slider label="Saturation" min={0} max={200} value={main.adjust.saturation} onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, saturation: v } })} />
            <Slider label="Hue" min={-180} max={180} value={main.adjust.hue} onChange={(v) => p.onPatchMain({ adjust: { ...main.adjust, hue: v } })} />
          </Section>

          <Section label="Transition in">
            <select
              className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs"
              value={main.transitionIn}
              onChange={(e) => p.onPatchMain({ transitionIn: e.target.value as TransitionKind })}
            >
              <option value="none">None</option>
              <option value="crossfade">Crossfade</option>
              <option value="fadeblack">Dip to black</option>
            </select>
            {main.transitionIn !== "none" && (
              <Slider label="Duration" min={0.1} max={1.5} step={0.1} value={main.transitionDur} onChange={(v) => p.onPatchMain({ transitionDur: v })} />
            )}
          </Section>

          <Section label="Audio">
            <Slider label="Volume" min={0} max={1} step={0.05} value={main.volume} onChange={(v) => p.onPatchMain({ volume: v })} />
            <label className="flex items-center gap-2 text-xs mt-1">
              <input type="checkbox" className="accent-cyan-400" checked={main.muted} onChange={(e) => p.onPatchMain({ muted: e.target.checked })} />
              Mute original sound
            </label>
          </Section>

          <Section label="Replace media">
            <button className="mb-btn-ghost w-full text-xs h-7" onClick={() => setReplaceOpen((v) => !v)}>
              Swap in a different file…
            </button>
            {replaceOpen && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {p.media
                  .filter((m) => m.kind === (p.media.find((x) => x.id === main.mediaId)?.kind ?? "video"))
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
      {over?.kind === "text" && (
        <>
          <Section label="Text">
            <textarea
              className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs h-16 resize-none"
              value={over.text ?? ""}
              onChange={(e) => p.onPatchOverlay(trackId, { text: e.target.value })}
            />
          </Section>
          <Section label="Style">
            <Slider label="Size" min={24} max={220} value={over.size ?? 72} onChange={(v) => p.onPatchOverlay(trackId, { size: v })} />
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs flex items-center gap-1">
                Color
                <input type="color" value={over.color ?? "#ffffff"} onChange={(e) => p.onPatchOverlay(trackId, { color: e.target.value })} />
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
                <input type="checkbox" className="accent-cyan-400" checked={over.bold ?? false} onChange={(e) => p.onPatchOverlay(trackId, { bold: e.target.checked })} />
                B
              </label>
            </div>
            <div className="text-xs mt-2 mb-1">Position</div>
            <div className="grid grid-cols-3 gap-1 w-24">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  className={`h-6 border text-[10px] ${
                    (over.pos ?? "mc") === pos ? "border-cyan-400 bg-cyan-400/20" : "border-border hover:border-white/40"
                  }`}
                  onClick={() => p.onPatchOverlay(trackId, { pos })}
                  title={pos}
                >
                  {pos}
                </button>
              ))}
            </div>
          </Section>
          <Section label="Animation">
            <select
              className="w-full bg-slate-900 border border-border rounded px-2 py-1.5 text-xs"
              value={over.anim ?? "none"}
              onChange={(e) => p.onPatchOverlay(trackId, { anim: e.target.value as TextAnim })}
            >
              <option value="none">None</option>
              <option value="fade">Fade in + out</option>
              <option value="slideup">Slide up + fade</option>
            </select>
            <Slider label="Opacity (keyframable)" min={0} max={1} step={0.01} value={p.anim.opacity} onChange={(v) => setAnim({ opacity: v })} />
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
          <Section label="Transform & keyframes">
            <Slider label="Scale" min={0.05} max={1.2} step={0.01} value={p.anim.scale} onChange={(v) => setAnim({ scale: v })} />
            <Slider label="X" min={-1} max={1} step={0.01} value={p.anim.x} onChange={(v) => setAnim({ x: v })} />
            <Slider label="Y" min={-1} max={1} step={0.01} value={p.anim.y} onChange={(v) => setAnim({ y: v })} />
            <Slider label="Rotation" min={-180} max={180} step={1} value={p.anim.rotation} onChange={(v) => setAnim({ rotation: v })} />
            <Slider label="Opacity (keyframable)" min={0} max={1} step={0.01} value={p.anim.opacity} onChange={(v) => setAnim({ opacity: v })} />
            <KeyframeSection
              clip={over}
              clipStart={p.clipStart}
              playheadLocal={p.playheadLocal}
              onAdd={() => p.onKeyframeAdd(clipId)}
              onDelete={(at) => p.onKeyframeDelete(clipId, at)}
              onSeek={p.onSeek}
            />
          </Section>
          <Section label="Green screen">
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
                <Slider label="Tolerance" min={10} max={200} step={5} value={over.chromaTol ?? 90} onChange={(v) => p.onPatchOverlay(trackId, { chromaTol: v })} />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  The key color is sampled from the corners of the footage. Works on green, blue or any solid backdrop.
                </p>
              </div>
            )}
          </Section>
          <TimingSection over={over} onPatch={(patch) => p.onPatchOverlay(trackId, patch)} />
        </>
      )}

      {/* ---------------- audio ---------------- */}
      {over?.kind === "audio" && (
        <>
          <Section label="Audio">
            <Slider label="Volume" min={0} max={1} step={0.05} value={over.volume ?? 1} onChange={(v) => p.onPatchOverlay(trackId, { volume: v })} />
            <Slider label="Fade in" min={0} max={3} step={0.05} value={over.fadeIn ?? 0.15} onChange={(v) => p.onPatchOverlay(trackId, { fadeIn: v })} />
            <Slider label="Fade out" min={0} max={3} step={0.05} value={over.fadeOut ?? 0.15} onChange={(v) => p.onPatchOverlay(trackId, { fadeOut: v })} />
          </Section>
          <TimingSection over={over} onPatch={(patch) => p.onPatchOverlay(trackId, patch)} />
        </>
      )}
    </div>
  );
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
        title={playheadLocal == null ? "Put the playhead inside this clip first" : "Write all motion values at the playhead"}
      >
        <Diamond className="h-3 w-3 inline -mt-0.5" /> Add keyframe at playhead
        {playheadLocal != null && <span className="text-muted-foreground">({playheadLocal.toFixed(2)}s in)</span>}
      </button>
      {kfs.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {kfs.map((k) => (
            <div key={k.at} className="flex items-center gap-1.5 text-[10px] bg-slate-900/70 border border-border rounded px-1.5 py-1">
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
              <button className="text-muted-foreground hover:text-destructive" title="Delete keyframe" onClick={() => onDelete(k.at)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
          No keyframes yet — motion holds its current values. Add one, then keep adjusting to shape the animation.
        </p>
      )}
    </div>
  );
}

function TimingSection({ over, onPatch }: { over: OverlayClip; onPatch: (p: Partial<OverlayClip>) => void }) {
  return (
    <Section label="Timing">
      <Slider label="Start" min={0} max={Math.max(1, over.start + over.duration)} step={0.1} value={over.start} onChange={(v) => onPatch({ start: v })} />
      <Slider label="Duration" min={0.2} max={60} step={0.1} value={over.duration} onChange={(v) => onPatch({ duration: v })} />
    </Section>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3">
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
  const shown = step < 1 ? (value >= 10 && step >= 0.5 ? Math.round(value).toString() : value.toFixed(2)) : Math.round(value).toString();
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

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="px-1 border border-border rounded bg-slate-900 text-[10px]">{children}</kbd>;
}
