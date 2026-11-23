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
import { useId, useMemo, useState } from "react";
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
import {
  LOOK_BY_ID,
  LOOK_FAMILIES,
  looksIn,
  searchLooks,
  type Look,
  type LookFamily,
} from "../looks";
import { AUDIO_FX, AUDIO_FX_MAP, type AudioFxId } from "../audio-fx";
import { STOCK_ASSETS, stockThumb } from "../stock";
import { STATIC_STICKERS, searchStickers, stickersIn } from "../stickers";
import {
  STICKER_CATEGORIES,
  patchFor,
  type StickerAsset,
  type StickerCategory,
} from "../sticker-kinds";

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

// The emoji and shape lists that used to live here are gone: they were a second,
// smaller catalogue that had drifted from stickers.ts (40 emoji vs 147, no
// graphics, no words). Two lists meant the Library and the editor disagreed
// about what a sticker even was. Both read stickers.ts now.

/**
 * Stock thumbnails are drawn once and kept in a module-level cache.
 *
 * They used to be generated on every render of the library, which meant a few
 * dozen `toDataURL()` calls per keystroke elsewhere in the editor. Generating
 * them lazily and keeping them is the difference between a smooth panel and a
 * stuttering one on a phone.
 */
const stockThumbCache = new Map<string, string>();
function stockThumbCached(id: string): string {
  const hit = stockThumbCache.get(id);
  if (hit !== undefined) return hit;
  const asset = STOCK_ASSETS.find((a) => a.id === id);
  const url = asset ? stockThumb(asset, 96) : "";
  stockThumbCache.set(id, url);
  return url;
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
  onAddText: () => void;
  onAddSticker: (label: string, patch?: Partial<OverlayClip>) => void;
  onApplyTextPreset: (patch: Partial<OverlayClip>) => void;
  onSetTextAnim: (anim: TextAnim) => void;
  onPatchMain: (patch: Partial<MainClip>) => void;
  onSetTransition: (kind: TransitionKind) => void;
  onApplyTransitionAll: (kind: TransitionKind) => void;
  onApplyFilter: (id: string) => void;
  /** apply a one-tap audio effect to the selected clip (audio overlay or main) */
  onApplyAudioFx: (id: AudioFxId) => void;
  /** add a generated stock asset (green screen, light leak…) to the library */
  onAddStock: (assetId: string) => void;
  /** id of the stock asset currently being generated, for progress */
  stockBusy?: string | null;
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
  onAddText,
  onAddSticker,
  onApplyTextPreset,
  onSetTextAnim,
  onPatchMain,
  onSetTransition,
  onApplyTransitionAll,
  onApplyFilter,
  onApplyAudioFx,
  onAddStock,
  stockBusy,
  onSwitchToAdjust,
  onOpenCaptions,
  onRecord,
  onAddAtPlayhead,
  recording,
  compact,
}: Props) {
  const [tab, setTab] = useState<LibraryTab>("media");
  const [effectFam, setEffectFam] = useState<string>("all");
  const [filterFam, setFilterFam] = useState<LookFamily | "all">("all");
  const [stickerFam, setStickerFam] = useState<StickerCategory>("emoji");
  const [stickerQuery, setStickerQuery] = useState("");

  /**
   * The sticker grid, from the real catalogue.
   *
   * This panel used to render a local 40-emoji array while the editor's own
   * sticker panel rendered the 260-asset catalogue — two lists, one of which was
   * a third the size and had no graphics or words in it at all. There is one
   * catalogue now, and both panels read it.
   */
  const stickerHits = useMemo(() => {
    if (stickerQuery.trim()) return searchStickers(stickerQuery).slice(0, 96);
    return stickersIn(stickerFam);
  }, [stickerFam, stickerQuery]);
  const [filterQuery, setFilterQuery] = useState("");
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

  /**
   * Filters grouped by the catalogue's own families.
   *
   * This used to be a hand-written id allowlist duplicated in two places, so any
   * look added to FILTER_PRESETS without also being added here fell into "clean"
   * — the new film stocks would all have appeared as social presets. The
   * catalogue owns the grouping now.
   */
  const filterFamilies = useMemo(() => ["all", ...LOOK_FAMILIES] as (LookFamily | "all")[], []);

  const filters = useMemo(() => {
    const pool = filterQuery.trim() ? searchLooks(filterQuery) : looksIn(filterFam);
    return pool.filter((l) => l.id !== "none");
  }, [filterFam, filterQuery]);

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
            <Label>Built-in stock</Label>
            <div className="text-[10px] text-muted-foreground leading-snug -mt-1">
              Generated on this device — a green screen to key, a backdrop for text, a light leak to
              overlay. Nothing is downloaded.
            </div>
            <Grid cols={3}>
              {STOCK_ASSETS.map((a) => {
                const busy = stockBusy === a.id;
                const thumb = stockThumbCached(a.id);
                return (
                  <Tile
                    key={a.id}
                    title={`${a.hint}${a.kind === "video" ? " (renders a short clip)" : ""}`}
                    onClick={() => {
                      if (!busy) onAddStock(a.id);
                    }}
                  >
                    <div className="h-full flex flex-col items-center gap-1">
                      <div className="relative w-full aspect-square rounded overflow-hidden bg-black/40">
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : null}
                        {a.kind === "video" && (
                          <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/70 rounded px-1">
                            clip
                          </span>
                        )}
                        {busy && (
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] bg-black/70">
                            rendering…
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] leading-tight text-center truncate w-full">
                        {a.name}
                      </span>
                    </div>
                  </Tile>
                );
              })}
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
            <Label>Audio effects</Label>
            <div className="text-[10px] text-muted-foreground leading-snug -mt-1">
              Applied to the selected clip and rendered into the export, not just the preview.
            </div>
            <Grid cols={3}>
              {AUDIO_FX.map((f) => {
                const active = selectedOverlay?.audioFx === f.id || mainClip?.audioFx === f.id;
                const isAudioTarget = selectedOverlay?.kind === "audio" || !!mainClip;
                return (
                  <Tile
                    key={f.id}
                    title={isAudioTarget ? f.hint : "Select an audio or video clip first"}
                    onClick={() => onApplyAudioFx(f.id)}
                  >
                    <div
                      className={`h-full rounded px-1 py-1.5 flex flex-col items-center justify-center gap-1 border ${
                        active ? "border-cyan-400 bg-cyan-400/10" : "border-transparent"
                      } ${isAudioTarget ? "" : "opacity-40"}`}
                    >
                      <span className="text-[10px] font-medium leading-none text-center">
                        {f.name}
                      </span>
                      <span className="text-[8px] text-muted-foreground leading-none text-center">
                        {AUDIO_FX_MAP[f.id].id === "none" ? "dry" : f.hint.split(" ")[0]}
                      </span>
                    </div>
                  </Tile>
                );
              })}
            </Grid>
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
            <input
              value={stickerQuery}
              onChange={(e) => setStickerQuery(e.target.value)}
              placeholder="Search stickers — fire, crown, arrow, wow…"
              aria-label="Search stickers"
              className="w-full h-7 rounded border border-border bg-card px-2 text-[11px] placeholder:text-muted-foreground/70"
            />
            {!stickerQuery.trim() && (
              <Pills
                options={STICKER_CATEGORIES.map((c: { id: string; name: string }) => ({
                  id: c.id,
                  label: c.name,
                }))}
                value={stickerFam}
                onChange={(v) => setStickerFam(v as StickerCategory)}
              />
            )}
            {stickerQuery.trim() && (
              <div className="text-[10px] text-muted-foreground">
                {stickerHits.length} result{stickerHits.length === 1 ? "" : "s"} for “
                {stickerQuery.trim()}”
              </div>
            )}
            <div className="grid grid-cols-8 gap-0.5">
              {stickerHits.map((asset) => (
                <button
                  key={asset.id}
                  className="h-8 rounded hover:bg-slate-700 flex items-center justify-center leading-none overflow-hidden"
                  title={`${asset.glyph ?? ""} — ${asset.category}`}
                  style={{
                    color: asset.color,
                    fontSize: asset.category === "text" ? 8 : 17,
                    fontWeight: asset.category === "text" ? 800 : undefined,
                  }}
                  onClick={() => onAddSticker(asset.glyph ?? "", stickerPatch(asset))}
                >
                  {asset.glyph}
                </button>
              ))}
            </div>
            {stickerHits.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                Nothing matches “{stickerQuery}”. Try “fire”, “arrow”, “wow” or “heart”.
              </p>
            )}
            <div className="text-[10px] text-muted-foreground leading-snug">
              {STATIC_STICKERS.length} stickers, all drawn on your device — sharp at any size, no
              downloads. Drop a PNG here to use it as an image overlay instead.
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
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search looks — portra, teal, kdrama, vhs…"
              aria-label="Search filters"
              className="w-full h-7 rounded border border-border bg-card px-2 text-[11px] placeholder:text-muted-foreground/70"
            />
            {!filterQuery.trim() && (
              <Pills
                options={filterFamilies.map((f) => ({
                  id: f,
                  label:
                    f === "all" ? "All" : f === "mono" ? "B&W" : f[0].toUpperCase() + f.slice(1),
                }))}
                value={filterFam}
                onChange={(v) => setFilterFam(v as LookFamily | "all")}
              />
            )}
            {!mainClip && hint}
            {filterQuery.trim() && (
              <div className="text-[10px] text-muted-foreground">
                {filters.length} look{filters.length === 1 ? "" : "s"} for “{filterQuery.trim()}”
                {filters.length === 0 && " — try “film”, “warm”, “vintage” or “neon”"}
              </div>
            )}
            <div className={mainClip ? "" : "opacity-55 pointer-events-none"}>
              <Grid cols={2}>
                {filters.map((f) => (
                  <Tile
                    key={f.id}
                    active={activeFilter === f.id}
                    title={`Apply the ${f.name} look`}
                    onClick={() => onApplyFilter(f.id)}
                  >
                    <FilterPreview css={f.css} look={f} />
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

/** How a sticker should land when tapped from this panel. */
function stickerPatch(asset: StickerAsset): Partial<OverlayClip> {
  const base = patchFor(asset);
  return { ...base, color: asset.color ?? base.color };
}

/**
 * A real miniature of a colour look.
 *
 * This used to be blank. The CSS filter was applied to an empty absolutely
 * positioned div layered over the artwork, so every tile in the grid rendered as
 * an unmodified grey square — the whole Filters tab looked like placeholders.
 * The filter now wraps the picture itself.
 *
 * The finish (tint, grain, vignette, caption) is drawn from the SAME catalogue
 * data the canvas uses, so the card is an honest preview rather than a hint.
 */
export function FilterPreview({ css, look }: { css: string; look?: Look }) {
  const uid = useId().replace(/[:]/g, "");
  const grain = look?.grain ? Math.min(0.55, look.grain) : 0;
  return (
    <div className="h-12 relative overflow-hidden bg-slate-900">
      <div className="absolute inset-0" style={{ filter: css || undefined }}>
        <svg viewBox="0 0 40 30" className="w-full h-full" aria-hidden preserveAspectRatio="none">
          <defs>
            <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>
          <rect width="40" height="30" fill={`url(#sky-${uid})`} />
          <circle cx="30" cy="8" r="4" fill="#fff7ed" />
          {/* skin-tone and green foliage: the two things a colour look most
              obviously changes, so the tile shows what the look does to them */}
          <circle cx="13" cy="17" r="4.2" fill="#d9a07a" />
          <rect x="13" y="21" width="9" height="9" rx="3" fill="#b06a4a" />
          <path d="M0 22 L10 14 L18 21 L26 12 L40 22 L40 30 L0 30 Z" fill="#166534" />
          <path d="M0 26 L12 20 L24 26 L40 19 L40 30 L0 30 Z" fill="#14532d" />
        </svg>
      </div>
      {look?.tint && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: look.tint.color,
            opacity: look.tint.alpha,
            mixBlendMode: look.tint.mode,
          }}
        />
      )}
      {grain > 0 && (
        <div
          className="absolute inset-0 pointer-events-none opacity-70"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/></filter><rect width='64' height='64' filter='url(%23n)' opacity='" +
              grain.toFixed(2) +
              "'/></svg>\")",
            mixBlendMode: "overlay",
          }}
        />
      )}
      {look?.vignette ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${(0.6 * look.vignette).toFixed(2)}) 100%)`,
          }}
        />
      ) : null}
      {look?.label && (
        <div className="absolute bottom-0.5 right-1 text-[7px] font-semibold text-white/90 drop-shadow">
          {look.label}
        </div>
      )}
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
  // The trending family each got a card that moves the way the engine moves,
  // named after it, rather than falling through to the generic fade.
  const trendAnim: Partial<Record<TransitionKind, string>> = {
    flash: "mc-flash 1.3s ease-in-out infinite",
    spin: "mc-spin 1.3s ease-in-out infinite",
    glitch: "mc-glitch 0.9s steps(3, end) infinite",
    lightleak: "mc-leak 1.5s ease-in-out infinite",
    luma: "mc-luma 1.3s ease-in-out infinite",
    zoomblur: "mc-zoomblur 1.3s ease-in-out infinite",
    whipl: "mc-whip-x 1.1s ease-in-out infinite",
    whipr: "mc-whip-x 1.1s ease-in-out infinite",
  };
  const anim =
    kind === "none"
      ? ""
      : fam === "trend"
        ? (trendAnim[kind] ?? "mc-fade 1.4s ease-in-out infinite")
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
