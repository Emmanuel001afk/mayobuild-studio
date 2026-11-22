// MayoCut — the three things that look like "stickers", kept apart.
//
// CapCut does not have one sticker list. It has three different objects, and
// the difference is not cosmetic — each one travels through the project
// differently, and mixing them up is why a "sticker" can behave in ways the
// user never asked for:
//
//   EMOJI    a Unicode character. Text, not an image. Renders from whatever
//            emoji font the device has, so it is infinitely sharp and costs
//            nothing, but its appearance is the platform's choice and it
//            carries no animation or transparency of its own.
//
//   STICKER  a graphic asset — shape, icon, reaction — with its own entrance
//            animation and alpha. Not text, not part of Unicode, does not
//            travel between apps.
//
//   VIDEO    an animated sticker (CapCut's "animated stickers", Telegram's
//            WEBM stickers). A real clip: it has a duration, it loops, and it
//            can carry what a still cannot.
//
// The app previously called all three "stickers" and inserted every one of them
// as a text overlay. That made an emoji editable as text (nice) but also made a
// shape appear with a text look, and gave an animated asset no honest type at
// all. This module is the single place that decides which is which.

import type { OverlayClip, TextAnim } from "./types";

/** What kind of asset the user actually picked. */
export type StickerKind = "emoji" | "graphic" | "video";

export interface StickerAsset {
  id: string;
  kind: StickerKind;
  /** the glyph for an emoji, or the label for a graphic */
  glyph?: string;
  /** searchable words */
  tags: string[];
  /** families shown as the filter chips, matching CapCut's categories */
  category: StickerCategory;
  /** the animation this asset is designed around */
  anim: TextAnim;
  /** sticker/graphic colour */
  color?: string;
  /** reference size at 1080p (em 化) so the object arrives at a sane scale */
  size: number;
}

/**
 * The categories CapCut's panel actually exposes, not one undifferentiated
 * grid: Trending, Emoji, Graphics, Shapes, Text, plus ours for generated video.
 */
export type StickerCategory = "emoji" | "graphic" | "shape" | "text" | "video";

export const STICKER_CATEGORIES: { id: StickerCategory; name: string; hint: string }[] = [
  { id: "emoji", name: "Emoji", hint: "Unicode characters — razor-sharp at any size" },
  { id: "graphic", name: "Graphics", hint: "Symbols and reactions with their own animation" },
  { id: "shape", name: "Shapes", hint: "Arrows, ticks, crosses, bursts" },
  { id: "text", name: "Text", hint: "Word stickers — short punchy labels" },
  { id: "video", name: "Animated", hint: "Generated clips that move" },
];

/**
 * The animation each category defaults to.
 *
 * This is the part that makes the kinds real rather than a label: an emoji is
 * still by default (it is a character, and characters do not wobble), a graphic
 * pops in because a sticker with no entrance looks like a mistake, and a video
 * sticker has no text animation at all because its movement is its own footage.
 */
export function defaultAnimFor(kind: StickerKind): TextAnim {
  switch (kind) {
    case "emoji":
      return "none";
    case "graphic":
      return "pop";
    case "video":
      return "none";
  }
}

/** Default size at 1080p reference height, by kind. */
export function defaultSizeFor(kind: StickerKind): number {
  switch (kind) {
    case "emoji":
      return 170;
    case "graphic":
      return 200;
    case "video":
      return 260;
  }
}

/**
 * Is this overlay an emoji in the CapCut sense — a single character that the
 * user expects to be able to edit as text?
 *
 * Cheap and pure: one grapheme check plus the clip's own kind, with no DOM.
 */
/**
 * Code points that decorate a cluster without being pictographs themselves:
 * zero-width joiner, the variation selectors, skin-tone modifiers, and the
 * regional indicators that pair up into flag emoji.
 */
function isDecorator(cp: number): boolean {
  return (
    cp === 0x200d ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || // VS1..VS16
    (cp >= 0x1f3fb && cp <= 0x1f3ff) || // fitzpatrick skin tones
    (cp >= 0x1f1e6 && cp <= 0x1f1ff) || // regional indicators (flags)
    cp === 0x20e3 // combining enclosing keycap
  );
}

function dropJoiners(text: string): string {
  let out = "";
  for (const ch of text) {
    if (!isDecorator(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out;
}

export function isEmojiOverlay(clip: OverlayClip): boolean {
  if (clip.kind !== "text" || !clip.text) return false;
  if (clip.mediaId) return false; // it is backed by an image/video asset
  // An emoji cluster is short and made of symbols/astral-plane code points.
  const text = clip.text.trim();
  if (!text || text.length > 8) return false;
  // Test the *base* characters, not the joiners: a ZWJ sequence such as
  // "👨‍👩‍👧" is several pictographs stitched together with U+200D, so stripping
  // the joiners and variation selectors first is the honest way to ask "is this
  // an emoji?" without a character class that mixes control and symbol ranges
  // (which is unreadable and easy to get wrong).
  // Two regional indicators make a flag. Neither half is pictographic on its
  // own, so the flag has to be recognised from the raw text — and before the
  // decorators are stripped, since those indicators ARE what gets stripped.
  try {
    if (/^\p{Regional_Indicator}{2}$/u.test(text)) return true;
  } catch {
    /* engine without the property: fall through to the glyph test */
  }
  const base = dropJoiners(text);
  if (!base) return false;
  try {
    return /^\p{Extended_Pictographic}+$/u.test(base);
  } catch {
    // Older engines without the property escapes: fall back to a range check.
    return /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(base);
  }
}

/**
 * What the inspector should call the selected thing.
 *
 * Users were being told "Text" for a shape and "Sticker" for an emoji. Naming
 * it correctly is most of the fix — the panels then follow the label.
 */
export function overlayLabel(clip: OverlayClip): string {
  if (clip.kind === "text") {
    // The picker's own record wins: a shape glyph and an emoji are both
    // pictographic, so guessing from the character alone would rename a
    // "★" shape to an emoji. Only fall back to the glyph when no kind was
    // recorded (older projects, or text typed by hand).
    if (clip.sticker === "graphic") return "Sticker";
    if (clip.sticker === "emoji") return "Emoji";
    if (clip.sticker === "video") return "Video sticker";
    return isEmojiOverlay(clip) ? "Emoji" : "Text";
  }
  if (clip.kind === "image") return "Image";
  if (clip.kind === "video") return "Video sticker";
  if (clip.kind === "audio") return "Audio";
  return "Clip";
}

/** The patch that turns an asset into a correctly-typed overlay. */
export function patchFor(asset: StickerAsset): Partial<OverlayClip> {
  return {
    text: asset.glyph,
    size: asset.size,
    anim: asset.anim,
    ...(asset.color ? { color: asset.color } : {}),
    // Record the kind so the inspector can name the object honestly later.
    sticker: asset.kind,
    bg: "",
    pos: "mc",
  };
}
