// MayoCut — the media/asset library panel.
//
// This is the panel CapCut puts top-left: a row of asset-category tabs over a
// scrollable grid, where every card is *actionable* (hover it and the effect is
// applied / previewed on the selected clip, click it to add). That organisation
// is the point: before this pass, transitions, filters and effects were buried
// inside the inspector's scroll, and text looks/animations had no browser at
// all — so a third of the editor's capability was undiscoverable.
//
// Cards intentionally show a *real* miniature of the effect (a CSS filter for a
// look, an animated thumbnail for a movement, a gradient swatch for a
// transition) instead of a uniform placeholder square.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { encodeWavMono } from "../denoise";
import { BACKGROUNDS, type BackgroundId } from "../visual-library";
import { FEATURED_STICKERS } from "../stickers";
import { SOUND_LIBRARY, synthesizeSound, type SoundId } from "../sound-library";
import {
  Aperture,
  Captions,
  Film,
  Image as ImageIcon,
  Music,
  Palette,
  Sparkles,
  Spline,
  Sticker,
  Type,
  Upload,
  Wand2,
} from "lucide-react";
import type {
  EffectId,
  MainClip,
  MediaItem,
  OverlayClip,
  Project,
  TextAnim,
  TransitionKind,
} from "../types";
import {
  EFFECTS,
  EFFECT_FAMILY,
  FONTS,
  TEXT_ANIMS,
  TEXT_ANIM_FAMILY,
  TEXT_PRESETS,
  TRANSITIONS,
  TRANSITION_FAMILY,
} from "../types";
import { FILTER_PRESETS } from "../engine";

/** Every asset category CapCut's desktop library ships with. */
export type LibraryTab =
  | "media"
  | "audio"
  | "text"
  | "stickers"
  | "effects"
  | "transitions"
  | "filters"
  | "adjust"
  | "captions";

const TABS: { id: LibraryTab; label: string; icon: typeof Film }[] = [
  { id: "media", label: "Media", icon: Film },
  { id: "audio", label: "Audio", icon: Music },
  { id: "text", label: "Text", icon: Type },
  { id: "stickers", label: "Stickers", icon: Sticker },
  { id: "effects", label: "Effects", icon: Aperture },
  { id: "transitions", label: "Transitions", icon: Spline },
  { id: "filters", label: "Filters", icon: Palette },
  { id: "adjust", label: "Adjust", icon: Wand2 },
  { id: "captions", label: "Captions", icon: Captions },
];

/** Emoji sticker set — instant, offline, no downloads. */
export const STICKERS = [
  "🔥",
  "❤️",
  "😂",
  "😮",
  "👀",
  "👏",
  "💯",
  "✨",
  "⚡",
  "🎉",
  "🚀",
  "💰",
  "📈",
  "🏆",
  "🎯",
  "🍿",
  "🥶",
  "😍",
  "🤯",
  "👉",
  "👆",
  "✅",
  "❌",
  "⭐",
  "🌊",
  "🌙",
  "☀️",
  "🎵",
  "🎬",
  "📱",
  "💬",
  "🙌",
  "💪",
  "🧠",
  "👑",
  "🍕",
  "🏖️",
  "🎮",
  "🛹",
  "📸",
];

/** CapCut-style shape/label stickers drawn as text so they scale cleanly. */
export const SHAPE_STICKERS: { id: string; label: string; patch: Partial<OverlayClip> }[] = [
  {
    id: "arrow",
    label: "➜",
    patch: { size: 200, color: "#f43f5e", anim: "bounce" },
  },
  { id: "star", label: "★", patch: { size: 190, color: "#fbbf24", anim: "pop" } },
  { id: "check", label: "✔", patch: { size: 170, color: "#22c55e", anim: "zoom-in" } },
  { id: "cross", label: "✘", patch: { size: 170, color: "#ef4444", anim: "zoom-in" } },
  { id: "sparkle", label: "✧", patch: { size: 210, color: "#a78bfa", anim: "neon" } },
  { id: "heart", label: "♥", patch: { size: 200, color: "#ec4899", anim: "bounce" } },
  { id: "note", label: "♪", patch: { size: 190, color: "#38bdf8", anim: "swing" } },
  { id: "flag", label: "⚑", patch: { size: 170, color: "#f97316", anim: "pop" } },
];

export function BackgroundShelf({
  onAdd,
}: {
  onAdd: (id: BackgroundId, placement: "main" | "overlay") => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">Offline backgrounds</div>
      <p className="text-[10px] text-muted-foreground">
        Add a solid-color image as a main clip or an overlay.
      </p>
      {BACKGROUNDS.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5 border border-border rounded p-1.5">
          <span
            aria-hidden="true"
            className="h-6 w-6 shrink-0 rounded border border-border"
            style={{ backgroundColor: item.color }}
          />
          <span className="min-w-0 flex-1 text-[10px]">{item.name}</span>
          <button
            className="mb-btn-ghost h-8 px-1.5 text-[10px]"
            aria-label={`Add ${item.name} as main clip`}
            onClick={() => onAdd(item.id, "main")}
          >
            Main
          </button>
          <button
            className="mb-btn-ghost h-8 px-1.5 text-[10px]"
            aria-label={`Add ${item.name} as overlay`}
            onClick={() => onAdd(item.id, "overlay")}
          >
            Overlay
          </button>
        </div>
      ))}
    </div>
  );
}

export function FeaturedStickers({
  onAdd,
}: {
  onAdd: (label: string, patch: Partial<OverlayClip>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">Animated stickers</div>
      {FEATURED_STICKERS.map((sticker) => (
        <button
          key={sticker.id}
          className="w-full flex items-center gap-2 rounded border border-border p-2 text-left hover:border-cyan-400"
          aria-label={`Add ${sticker.name} sticker`}
          onClick={() => onAdd(sticker.label, sticker.patch)}
        >
          <span className="min-w-10 text-center text-base">{sticker.label}</span>
          <span>
            <span className="block text-xs">{sticker.name}</span>
            <span className="block text-[10px] text-muted-foreground">{sticker.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function SoundEffectsShelf({ onAddSound }: { onAddSound: (id: SoundId) => void }) {
  const soundPreview = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const visibleSounds = SOUND_LIBRARY.filter(
    (sound) =>
      (category === "All" || sound.category === category) &&
      `${sound.name} ${sound.description} ${sound.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const stopSoundPreview = () => {
    const current = soundPreview.current;
    if (!current) return;
    current.audio.pause();
    current.audio.removeAttribute("src");
    URL.revokeObjectURL(current.url);
    soundPreview.current = null;
  };
  useEffect(() => () => stopSoundPreview(), []);
  const previewSound = (id: SoundId) => {
    stopSoundPreview();
    setPreviewError("");
    const url = URL.createObjectURL(encodeWavMono(synthesizeSound(id), 44100));
    const audio = new Audio(url);
    soundPreview.current = { audio, url };
    audio.onended = () => {
      if (soundPreview.current?.audio === audio) stopSoundPreview();
    };
    void audio.play().catch(() => {
      if (soundPreview.current?.audio === audio) stopSoundPreview();
      setPreviewError("Could not play this sound on this device.");
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">Built-in sound effects</div>
      <p className="text-[10px] text-muted-foreground">
        Original sounds generated offline. Preview or add at the playhead.
      </p>
      <input
        aria-label="Search sound effects"
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        placeholder="Search sounds"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="flex gap-1 overflow-x-auto" aria-label="Sound categories">
        {["All", "Transitions", "Digital", "Impacts", "Everyday"].map((name) => (
          <button
            key={name}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
            className={`shrink-0 rounded border px-2 py-1 text-[10px] ${category === name ? "border-cyan-400 text-cyan-300" : "border-border"}`}
          >
            {name}
          </button>
        ))}
      </div>
      {previewError && (
        <p className="text-[10px] text-amber-300" role="alert">
          {previewError}
        </p>
      )}
      <div className="space-y-1">
        {visibleSounds.length === 0 && (
          <p className="text-[10px] text-muted-foreground">No matching sounds.</p>
        )}
        {visibleSounds.map((sound) => (
          <div key={sound.id} className="flex items-center gap-2 rounded border border-border p-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">{sound.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {sound.description} · {sound.duration}s
              </div>
            </div>
            <button
              className="mb-btn-ghost px-2 h-8 text-[11px]"
              onClick={() => previewSound(sound.id)}
              aria-label={`Preview ${sound.name}`}
            >
              Play
            </button>
            <button
              className="mb-btn px-2 h-8 text-[11px]"
              onClick={() => {
                stopSoundPreview();
                onAddSound(sound.id);
              }}
              aria-label={`Add ${sound.name} to timeline`}
            >
              Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  project: Project;
  media: MediaItem[];
  /** currently selected main clip (target of effects / transitions / filters) */
  mainClip: MainClip | null;
  selectedOverlay: OverlayClip | null;
  onImport: () => void;
  onAddMedia: (m: MediaItem) => void;
  onDeleteMedia: (m: MediaItem) => void;
  storedProxies: Record<string, boolean>;
  onRemoveProxy: (m: MediaItem) => void;
  onAddSound: (id: SoundId) => void;
  onAddBackground: (id: BackgroundId, placement: "main" | "overlay") => void;
  onAddText: () => void;
  onAddSticker: (label: string, patch?: Partial<OverlayClip>) => void;
  onApplyTextPreset: (patch: Partial<OverlayClip>) => void;
  onSetTextAnim: (anim: TextAnim) => void;
  onPatchMain: (patch: Partial<MainClip>) => void;
  onSetTransition: (kind: TransitionKind) => void;
  onApplyTransitionAll: (kind: TransitionKind) => void;
  onApplyFilter: (id: string) => void;
  onSwitchToAdjust: () => void;
  onOpenCaptions: () => void;
  onRecord: () => void;
  onAddAtPlayhead: () => void;
  recording: boolean;
  compact?: boolean;
}

export function Library({
  project,
  media,
  mainClip,
  selectedOverlay,
  onImport,
  onAddMedia,
  onDeleteMedia,
  storedProxies,
  onRemoveProxy,
  onAddSound,
  onAddBackground,
  onAddText,
  onAddSticker,
  onApplyTextPreset,
  onSetTextAnim,
  onPatchMain,
  onSetTransition,
  onApplyTransitionAll,
  onApplyFilter,
  onSwitchToAdjust,
  onOpenCaptions,
  onRecord,
  onAddAtPlayhead,
  recording,
  compact,
}: Props) {
  const [tab, setTab] = useState<LibraryTab>("media");
  const [effectFam, setEffectFam] = useState<string>("all");
  const [filterFam, setFilterFam] = useState<string>("all");
  const [animFam, setAnimFam] = useState<string>("all");
  const uid = useId();

  const audioMedia = useMemo(() => media.filter((m) => m.kind === "audio"), [media]);
  const visualMedia = useMemo(() => media.filter((m) => m.kind !== "audio"), [media]);

  const effects = useMemo(
    () =>
      effectFam === "all" ? EFFECTS : EFFECTS.filter((e) => EFFECT_FAMILY[e.id] === effectFam),
    [effectFam],
  );
  const anims = useMemo(
    () =>
      animFam === "all" ? TEXT_ANIMS : TEXT_ANIMS.filter((a) => TEXT_ANIM_FAMILY[a.id] === animFam),
    [animFam],
  );

  /** Filters grouped by the family they *look* like, for the tab strip. */
  const filterFamilies = useMemo(() => {
    const fam = (id: string) => {
      if (["bw", "noir", "silver", "mono-high", "cyanotype"].includes(id)) return "mono";
      if (["kodachrome", "portra", "vintage", "retro", "fifties", "sepia", "grunge"].includes(id))
        return "film";
      if (
        ["tealorange", "golden", "sunset", "autumn", "warm", "cool", "arctic", "winter"].includes(
          id,
        )
      )
        return "warm-cool";
      if (["cyberpunk", "neon-night", "infrared", "duotone", "night", "moody"].includes(id))
        return "neon";
      return "clean";
    };
    return ["all", "clean", "film", "warm-cool", "neon", "mono"].filter(
      (f) => f === "all" || FILTER_PRESETS.some((p) => p.id !== "none" && fam(p.id) === f),
    ) as string[];
  }, []);

  const filters = useMemo(() => {
    if (filterFam === "all") return FILTER_PRESETS.filter((p) => p.id !== "none");
    const fam = (id: string) => {
      if (["bw", "noir", "silver", "mono-high", "cyanotype"].includes(id)) return "mono";
      if (["kodachrome", "portra", "vintage", "retro", "fifties", "sepia", "grunge"].includes(id))
        return "film";
      if (
        ["tealorange", "golden", "sunset", "autumn", "warm", "cool", "arctic", "winter"].includes(
          id,
        )
      )
        return "warm-cool";
      if (["cyberpunk", "neon-night", "infrared", "duotone", "night", "moody"].includes(id))
        return "neon";
      return "clean";
    };
    return FILTER_PRESETS.filter((p) => p.id !== "none" && fam(p.id) === filterFam);
  }, [filterFam]);

  const activeFilter = mainClip?.filter ?? "none";
  const activeEffect = mainClip?.effect ?? "none";
  const activeAnim = selectedOverlay?.anim ?? "none";
  const transitionTarget = mainClip
    ? project.main.findIndex((c) => c.id === mainClip.id)
    : project.main.length - 1;
  const activeTransition =
    transitionTarget > 0 ? (project.main[transitionTarget]?.transitionIn ?? "none") : "none";

  // ------------------------------------------------------------ card atoms
  const Tile = ({
    active,
    onClick,
    children,
    title,
    wide,
  }: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title: string;
    wide?: boolean;
  }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`relative group overflow-hidden rounded-md border text-left transition-colors ${
        active
          ? "border-cyan-400 ring-1 ring-cyan-400/50"
          : "border-border hover:border-cyan-400/60"
      } ${wide ? "col-span-2" : ""}`}
    >
      {children}
    </button>
  );

  const Empty = ({ children }: { children: React.ReactNode }) => (
    <div className="col-span-full text-[11px] text-muted-foreground text-center py-6 leading-relaxed">
      {children}
    </div>
  );

  const mediaCard = (m: MediaItem) => (
    <div key={m.id} className="relative rounded overflow-hidden border border-border group">
      <button
        className="w-full block text-left"
        onClick={() => onAddMedia(m)}
        title={`Add ${m.name} at the playhead (${m.kind})`}
      >
        <div className="aspect-video bg-slate-900 flex items-center justify-center">
          {m.thumb ? (
            <img src={m.thumb} alt="" className="w-full h-full object-cover" />
          ) : m.kind === "audio" ? (
            <Music className="h-4 w-4 text-fuchsia-300" />
          ) : m.kind === "image" ? (
            <ImageIcon className="h-4 w-4 text-cyan-300" />
          ) : (
            <Film className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="px-1 py-0.5 text-[10px] truncate">{m.name}</div>
      </button>
      {m.kind === "video" && storedProxies[m.id] && (
        <div className="px-1 pb-1 text-[10px] text-amber-200">
          Stored proxy inactive ·{" "}
          <button
            className="underline"
            onClick={() => onRemoveProxy(m)}
            aria-label={`Remove stored proxy for ${m.name}`}
          >
            Remove
          </button>
        </div>
      )}
      {m.unplayable && (
        <div
          className="absolute top-1 left-1 text-[9px] leading-tight text-amber-300 bg-black/75 border border-amber-400/30 rounded px-1 max-w-[70%] truncate"
          title="Imported, but this device can't decode this codec (audio + captions still work)"
        >
          ⚠ won't play
        </div>
      )}
      <button
        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 border border-white/25 text-[11px] leading-none text-white/75 hover:text-white hover:border-red-400 flex items-center justify-center"
        title={`Delete ${m.name} from the library`}
        onClick={(e) => {
          e.stopPropagation();
          onDeleteMedia(m);
        }}
      >
        ×
      </button>
    </div>
  );

  /**
   * Browse-always hint. CapCut lets you scroll the whole effect/filter catalogue
   * with nothing selected; only *applying* needs a target. Hiding the grid
   * behind "select a clip first" turned the default state into a dead end.
   */
  const hint = (
    <div className="rounded border border-amber-400/30 bg-amber-400/5 px-2 py-1.5 text-[10px] text-amber-200 leading-snug">
      Select a clip on the timeline to apply — you can still browse everything.
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-card/40">
      {/* category tabs */}
      <div className="shrink-0 border-b border-border flex items-stretch overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.label}
              className={`relative shrink-0 px-2 py-1.5 flex flex-col items-center gap-0.5 text-[9px] leading-none transition-colors ${
                on ? "text-cyan-300" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              <span className={compact ? "hidden" : ""}>{t.label}</span>
              {on && (
                <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-cyan-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* panel body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {/* ---------------------------------------------------------- MEDIA */}
        {tab === "media" && (
          <>
            <p className="text-[10px] text-muted-foreground leading-snug" role="status">
              Preview proxies are temporarily disabled to protect audio and timing. Editing and
              exports use original media.
            </p>
            <div className="flex gap-1">
              <button className="mb-btn flex-1 h-8 text-[11px]" onClick={onImport}>
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              <button
                className={`mb-btn-ghost h-8 px-2 text-[11px] ${recording ? "text-red-400 border-red-400/50" : ""}`}
                onClick={onRecord}
                title="Record a voiceover or any audio from the microphone"
              >
                <Music className="h-3.5 w-3.5" />
              </button>
            </div>
            <button className="mb-btn-ghost w-full h-7 text-[11px]" onClick={onAddAtPlayhead}>
              + Add selected at playhead
            </button>
            <BackgroundShelf onAdd={onAddBackground} />
            <Label>Your media</Label>
            <Grid>
              {visualMedia.map(mediaCard)}
              {visualMedia.length === 0 && (
                <Empty>
                  Library empty.
                  <br />
                  Import video, photos or music — files stay on this device.
                </Empty>
              )}
            </Grid>
          </>
        )}

        {/* ---------------------------------------------------------- AUDIO */}
        {tab === "audio" && (
          <>
            <div className="flex gap-1">
              <button className="mb-btn flex-1 h-8 text-[11px]" onClick={onImport}>
                <Upload className="h-3.5 w-3.5" /> Import audio
              </button>
              <button
                className={`mb-btn-ghost h-8 px-2 text-[11px] ${recording ? "text-red-400 border-red-400/50" : ""}`}
                onClick={onRecord}
                title="Record a voiceover"
              >
                <Music className="h-3.5 w-3.5" />
              </button>
            </div>
            <SoundEffectsShelf onAddSound={onAddSound} />
            <Label>Your audio</Label>
            <Grid>
              {audioMedia.map(mediaCard)}
              {audioMedia.length === 0 && (
                <Empty>
                  No audio yet.
                  <br />
                  Import a track or record a voiceover — both stay offline.
                </Empty>
              )}
            </Grid>
            <div className="pt-1 border-t border-border">
              <button className="mb-btn-ghost w-full h-8 text-[11px]" onClick={onOpenCaptions}>
                <Captions className="h-3.5 w-3.5" /> Beat-sync & captions →
              </button>
            </div>
          </>
        )}

        {/* ----------------------------------------------------------- TEXT */}
        {tab === "text" && (
          <>
            <button className="mb-btn w-full h-8 text-[11px]" onClick={onAddText}>
              <Type className="h-3.5 w-3.5" /> Add a text box
            </button>
            <Label>Looks — one tap</Label>
            <Grid cols={2}>
              {TEXT_PRESETS.map((tpl) => (
                <Tile
                  key={tpl.name}
                  title={`Apply the “${tpl.name}” look`}
                  onClick={() => onApplyTextPreset(tpl.patch)}
                >
                  <div
                    className="h-11 flex items-center justify-center px-1 text-[10px] font-semibold truncate"
                    style={{
                      color: tpl.patch.color ?? "#fff",
                      background: tpl.patch.bg || "rgba(15,23,42,0.9)",
                      textTransform: tpl.patch.upper ? "uppercase" : undefined,
                      fontStyle: tpl.patch.italic ? "italic" : undefined,
                      textDecoration: tpl.patch.underline ? "underline" : undefined,
                      letterSpacing: tpl.patch.tracking ? "0.06em" : undefined,
                    }}
                  >
                    {tpl.name}
                  </div>
                </Tile>
              ))}
            </Grid>

            <Label>Animation</Label>
            <Pills
              options={[
                { id: "all", label: "All" },
                { id: "in", label: "In" },
                { id: "loop", label: "Loop" },
                { id: "kinetic", label: "Kinetic" },
              ]}
              value={animFam}
              onChange={setAnimFam}
            />
            {(!selectedOverlay || selectedOverlay.kind !== "text") && hint}
            <div
              className={
                selectedOverlay && selectedOverlay.kind === "text"
                  ? ""
                  : "opacity-55 pointer-events-none"
              }
            >
              <Grid cols={2}>
                {anims.map((a) => (
                  <Tile
                    key={a.id}
                    active={activeAnim === a.id}
                    title={`Animate the selected text: ${a.name}`}
                    onClick={() => onSetTextAnim(a.id)}
                  >
                    <div className="h-9 flex items-center justify-center text-[10px] px-1 truncate">
                      {a.name}
                    </div>
                  </Tile>
                ))}
              </Grid>
            </div>

            <Label>Font</Label>
            <div className="text-[10px] text-muted-foreground">
              {FONTS.length} system-safe stacks (identical on every device) plus your imported fonts
              — set the font in the inspector's Style section.
            </div>
          </>
        )}

        {/* ------------------------------------------------------- STICKERS */}
        {tab === "stickers" && (
          <>
            <FeaturedStickers onAdd={onAddSticker} />
            <Label>Emoji</Label>
            <div className="grid grid-cols-8 gap-0.5">
              {STICKERS.map((em) => (
                <button
                  key={em}
                  className="h-7 rounded hover:bg-slate-700 text-base leading-none"
                  title={`Add ${em} as a sticker`}
                  onClick={() => onAddSticker(em)}
                >
                  {em}
                </button>
              ))}
            </div>
            <Label>Shapes & labels</Label>
            <Grid cols={4}>
              {SHAPE_STICKERS.map((s) => (
                <Tile
                  key={s.id}
                  title={`Add the ${s.id} sticker`}
                  onClick={() => onAddSticker(s.label, s.patch)}
                >
                  <div
                    className="h-10 flex items-center justify-center text-xl"
                    style={{ color: s.patch.color }}
                  >
                    {s.label}
                  </div>
                </Tile>
              ))}
            </Grid>
            <div className="text-[10px] text-muted-foreground leading-snug">
              Stickers are text layers, so they stay razor-sharp at any size and cost nothing to
              render. Drop a PNG here to use it as an image overlay instead.
            </div>
          </>
        )}

        {/* -------------------------------------------------------- EFFECTS */}
        {tab === "effects" && (
          <>
            <Pills
              options={[
                { id: "all", label: "All" },
                { id: "camera", label: "Camera" },
                { id: "motion", label: "Motion" },
                { id: "impact", label: "Impact" },
                { id: "retro", label: "Retro" },
              ]}
              value={effectFam}
              onChange={setEffectFam}
            />
            {!mainClip && hint}
            <div className={mainClip ? "" : "opacity-55 pointer-events-none"}>
              <Grid cols={2}>
                {effects.map((e) => (
                  <Tile
                    key={e.id}
                    active={activeEffect === e.id}
                    title={`Apply the ${e.name} movement`}
                    onClick={() => onPatchMain({ effect: e.id as EffectId })}
                  >
                    <EffectPreview id={e.id} />
                    <div className="px-1 py-0.5 text-[10px] truncate">{e.name}</div>
                  </Tile>
                ))}
              </Grid>
            </div>
          </>
        )}

        {/* ---------------------------------------------------- TRANSITIONS */}
        {tab === "transitions" && (
          <>
            <div className="text-[10px] text-muted-foreground leading-snug">
              A transition plays where the selected clip meets the one before it.
            </div>
            {!mainClip
              ? hint
              : transitionTarget <= 0 && (
                  <div className="rounded border border-border px-2 py-1.5 text-[10px] text-muted-foreground">
                    This is the first clip — select the second (or later) clip to give it an
                    incoming transition.
                  </div>
                )}
            <div
              className={mainClip && transitionTarget > 0 ? "" : "opacity-55 pointer-events-none"}
            >
              <>
                <Grid cols={2}>
                  {TRANSITIONS.map((tr) => (
                    <Tile
                      key={tr.id}
                      active={activeTransition === tr.id}
                      title={`${tr.name} into the selected clip`}
                      onClick={() => onSetTransition(tr.id)}
                    >
                      <TransitionPreview kind={tr.id} seed={uid} />
                      <div className="px-1 py-0.5 text-[10px] truncate">{tr.name}</div>
                    </Tile>
                  ))}
                </Grid>
                <button
                  className="mb-btn-ghost w-full h-7 text-[10px]"
                  onClick={() => onApplyTransitionAll(activeTransition)}
                  disabled={activeTransition === "none"}
                  title="Give every cut in the project this transition"
                >
                  Apply “{TRANSITIONS.find((t) => t.id === activeTransition)?.name ?? "None"}” to
                  every cut
                </button>
              </>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {Object.keys(TRANSITION_FAMILY).length} transitions · duration is set in the
              inspector.
            </div>
          </>
        )}

        {/* -------------------------------------------------------- FILTERS */}
        {tab === "filters" && (
          <>
            <Pills
              options={filterFamilies.map((f) => ({ id: f, label: f === "all" ? "All" : f }))}
              value={filterFam}
              onChange={setFilterFam}
            />
            {!mainClip && hint}
            <div className={mainClip ? "" : "opacity-55 pointer-events-none"}>
              <Grid cols={2}>
                {filters.map((f) => (
                  <Tile
                    key={f.id}
                    active={activeFilter === f.id}
                    title={`Apply the ${f.name} look`}
                    onClick={() => onApplyFilter(f.id)}
                  >
                    <FilterPreview css={f.css} />
                    <div className="px-1 py-0.5 text-[10px] truncate">{f.name}</div>
                  </Tile>
                ))}
                <Tile
                  active={activeFilter === "none"}
                  title="Remove the colour look"
                  onClick={() => onApplyFilter("none")}
                >
                  <div className="h-12 flex items-center justify-center text-[10px] text-muted-foreground">
                    Original
                  </div>
                  <div className="px-1 py-0.5 text-[10px] truncate">Original</div>
                </Tile>
              </Grid>
            </div>
            {mainClip && (
              <button className="mb-btn-ghost w-full h-7 text-[10px]" onClick={onSwitchToAdjust}>
                Fine-tune in Adjust →
              </button>
            )}
          </>
        )}

        {/* --------------------------------------------------------- ADJUST */}
        {tab === "adjust" && (
          <>
            <div className="text-[10px] text-muted-foreground leading-snug">
              Brightness, contrast, saturation, hue, temperature, tint, fade, sharpen, vignette and
              split-tone live in the inspector so you can watch the picture while you drag.
            </div>
            {!mainClip && hint}
            <button
              className="mb-btn w-full h-8 text-[11px]"
              onClick={onSwitchToAdjust}
              disabled={!mainClip}
            >
              <Wand2 className="h-3.5 w-3.5" /> Open adjust controls
            </button>
          </>
        )}

        {/* ------------------------------------------------------- CAPTIONS */}
        {tab === "captions" && (
          <>
            <div className="text-[10px] text-muted-foreground leading-snug">
              Captions run on-device (Whisper, optional) and land as editable text clips. Word-level
              timing stays adjustable afterwards.
            </div>
            <button className="mb-btn w-full h-8 text-[11px]" onClick={onOpenCaptions}>
              <Captions className="h-3.5 w-3.5" /> Auto-caption this project
            </button>
            <button className="mb-btn-ghost w-full h-8 text-[11px]" onClick={onOpenCaptions}>
              <Sparkles className="h-3.5 w-3.5" /> Open Assist (beats, loudness, AI)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] uppercase tracking-wider text-muted-foreground pt-1">{children}</div>
  );
}

function Pills({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-1.5 py-0.5 rounded text-[10px] border capitalize ${
            value === o.id
              ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A real miniature of a colour look, so the grid reads like CapCut's. */
export function FilterPreview({ css }: { css: string }) {
  const uid = useId().replace(/[:]/g, "");
  return (
    <div className="h-12 relative overflow-hidden">
      <svg viewBox="0 0 40 30" className="w-full h-full" aria-hidden>
        <defs>
          <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <rect width="40" height="30" fill={`url(#sky-${uid})`} />
        <circle cx="30" cy="8" r="4" fill="#fff7ed" />
        <path d="M0 22 L10 14 L18 21 L26 12 L40 22 L40 30 L0 30 Z" fill="#166534" />
        <path d="M0 26 L12 20 L24 26 L40 19 L40 30 L0 30 Z" fill="#14532d" />
      </svg>
      <div className="absolute inset-0" style={{ filter: css || undefined }} />
    </div>
  );
}

/** A movement preview: the same arrow shape under the effect's own transform. */
export function EffectPreview({ id }: { id: EffectId }) {
  const anim =
    id === "none"
      ? ""
      : EFFECT_FAMILY[id] === "impact"
        ? "mc-shake 0.4s infinite"
        : EFFECT_FAMILY[id] === "retro"
          ? "mc-hue 1.2s linear infinite"
          : "mc-pulse 1.2s ease-in-out infinite";
  return (
    <div className="h-12 flex items-center justify-center bg-slate-900 overflow-hidden">
      <div
        className="text-cyan-300 text-lg"
        style={{ animation: anim || undefined, filter: id === "none" ? "none" : undefined }}
      >
        ▶
      </div>
    </div>
  );
}

/**
 * A transition preview whose motion matches what the engine actually does.
 *
 * "Push left" travels left, "wipe down" reveals downward, "diagonal push" moves
 * on both axes. Direction is derived rather than a generic spin, because the
 * card is the only thing telling a user which of the 8 wipes they want.
 */
export function TransitionPreview({ kind, seed }: { kind: TransitionKind; seed: string }) {
  const fam = TRANSITION_FAMILY[kind];
  const dir = kind.includes("left")
    ? "left"
    : kind.includes("right")
      ? "right"
      : kind.includes("up")
        ? "up"
        : kind.includes("down")
          ? "down"
          : null;
  const horizontal = dir === "left" || dir === "right" || kind === "slide";
  const vertical = dir === "up" || dir === "down";
  const anim =
    kind === "none"
      ? ""
      : fam === "slide"
        ? kind === "slide"
          ? "mc-diag 1.15s ease-in-out infinite"
          : horizontal
            ? "mc-slide-x 1.15s ease-in-out infinite"
            : "mc-slide-y 1.15s ease-in-out infinite"
        : fam === "wipe"
          ? horizontal
            ? "mc-wipe-x 1.2s ease-in-out infinite"
            : "mc-wipe-y 1.2s ease-in-out infinite"
          : fam === "zoom"
            ? "mc-punch 1.2s ease-in-out infinite"
            : "mc-fade 1.4s ease-in-out infinite";
  // which way the incoming panel should slide in from
  const origin =
    dir === "left"
      ? "from-right"
      : dir === "right"
        ? "from-left"
        : dir === "up"
          ? "from-bottom"
          : dir === "down"
            ? "from-top"
            : "";
  return (
    <div
      className="h-12 relative overflow-hidden bg-slate-800"
      data-seed={seed}
      data-from={origin}
      data-vertical={vertical ? "1" : undefined}
    >
      <div className="absolute inset-0 flex">
        <div className="flex-1 bg-gradient-to-br from-cyan-500/40 to-cyan-800/40" />
        <div className="flex-1 bg-gradient-to-br from-fuchsia-500/40 to-fuchsia-800/40" />
      </div>
      <div className={`absolute inset-0 ${anim}`}>
        <div
          className={`bg-fuchsia-400/70 ${vertical || kind === "slide" ? "h-1/2 w-full" : "h-full w-1/2"} ${
            dir === "left" ? "ml-auto" : ""
          } ${dir === "up" ? "mt-auto" : ""}`}
        />
      </div>
    </div>
  );
}

export default Library;
