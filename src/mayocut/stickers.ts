// MayoCut — the sticker catalogue.
//
// Organised the way CapCut organises it (see sticker-kinds.ts for why the three
// kinds are separate objects): Emoji, Graphics, Shapes, Text, and Animated.
//
// Everything here is either a Unicode character or drawn from primitives, so
// the whole catalogue is free, offline and portable. There is no bundled art to
// license and no CDN to reach.

import {
  defaultAnimFor,
  defaultSizeFor,
  type StickerAsset,
  type StickerKind,
} from "./sticker-kinds";

/** Emoji, grouped so search and the category chips both have something to say. */
const EMOJI: [string, string][] = [
  // reactions
  ["🔥", "fire hot flame lit trend"],
  ["❤️", "heart love red like"],
  ["😂", "laugh cry funny lol joy"],
  ["😮", "wow surprised shock gasp"],
  ["😍", "love eyes hearts adore"],
  ["🤯", "mind blown explode shock"],
  ["🥶", "cold freeze frozen ice"],
  ["👀", "eyes look watch see"],
  ["👏", "clap applause hands bravo"],
  ["🙌", "raise hands praise celebrate"],
  ["💪", "strong flex muscle power"],
  ["🤝", "handshake deal agree"],
  ["👍", "thumbs up yes like good"],
  ["👎", "thumbs down no bad"],
  ["🙏", "pray thanks please"],
  ["😭", "sob crying sad tears"],
  ["😡", "angry mad red rage"],
  ["🤔", "think hmm question"],
  // symbols and hype
  ["💯", "hundred perfect points score"],
  ["✨", "sparkle stars magic shine glitter"],
  ["⚡", "lightning bolt energy fast power"],
  ["🎉", "party confetti celebrate tada"],
  ["🚀", "rocket launch fast space growth"],
  ["💰", "money bag cash rich"],
  ["💸", "money fly spend cash"],
  ["📈", "chart up growth graph trending"],
  ["🏆", "trophy win award champion"],
  ["🎯", "target goal bullseye aim"],
  ["✅", "check tick done yes correct"],
  ["❌", "cross no wrong x fail"],
  ["⭐", "star favourite rating"],
  ["💥", "boom explosion impact"],
  ["🆕", "new fresh badge"],
  ["🆗", "ok okay badge"],
  ["‼️", "exclamation urgent important"],
  ["❓", "question doubt"],
  // objects and lifestyle
  ["🍿", "popcorn movie snack"],
  ["🍕", "pizza food eat"],
  ["☕", "coffee cup drink morning"],
  ["🎵", "music note sound audio"],
  ["🎬", "clapper film movie action"],
  ["📱", "phone mobile app"],
  ["💬", "speech bubble chat comment"],
  ["📸", "camera photo shoot"],
  ["🎮", "game controller play"],
  ["🛹", "skateboard board"],
  ["👑", "crown king queen best"],
  ["🧠", "brain smart think idea"],
  ["🌊", "wave water ocean"],
  ["🌙", "moon night sleep"],
  ["☀️", "sun day bright"],
  ["🏖️", "beach holiday sand summer"],
  ["🎂", "cake birthday celebrate"],
  ["🎁", "gift present box"],
  ["🔔", "bell notification alert"],
  ["📌", "pin location mark"],
  ["⚠️", "warning caution"],
  ["🔴", "red circle record dot"],
  ["🟢", "green circle go live"],
];

/** Pure symbols drawn as text: sharp at any size, and they take a colour. */
const GRAPHIC: [string, string, string][] = [
  // [glyph, tags, colour]
  ["➜", "arrow right next forward", "#f43f5e"],
  ["⬅", "arrow left back", "#38bdf8"],
  ["⬆", "arrow up rise", "#22c55e"],
  ["⬇", "arrow down drop", "#f97316"],
  ["★", "star favourite rating", "#fbbf24"],
  ["☆", "star empty outline", "#fbbf24"],
  ["✔", "check tick correct done", "#22c55e"],
  ["✘", "cross wrong no fail", "#ef4444"],
  ["✧", "sparkle shine magic", "#a78bfa"],
  ["✦", "sparkle four point", "#a78bfa"],
  ["♥", "heart love", "#ec4899"],
  ["♪", "note music sound", "#38bdf8"],
  ["♫", "notes music double", "#38bdf8"],
  ["⚑", "flag mark", "#f97316"],
  ["✱", "burst impact star", "#fbbf24"],
  ["●", "dot circle bullet", "#e5e7eb"],
  ["■", "square box block", "#e5e7eb"],
  ["▲", "triangle up", "#22c55e"],
  ["✂", "scissors cut", "#94a3b8"],
  ["⟳", "loop reload repeat", "#38bdf8"],
  ["∞", "infinity forever loop", "#a78bfa"],
  ["№1", "number one best first", "#fbbf24"],
  ["HD", "hd badge quality", "#e5e7eb"],
  ["NEW", "new badge label", "#f43f5e"],
];

/** Word stickers: short punchy labels, the ones people actually put on video. */
const TEXT: [string, string, string][] = [
  ["WOW", "wow surprise", "#fbbf24"],
  ["LOL", "lol funny laugh", "#fbbf24"],
  ["OMG", "omg shock surprise", "#f43f5e"],
  ["EPIC", "epic great win", "#a78bfa"],
  ["NO WAY", "no way disbelief", "#38bdf8"],
  ["LET'S GO", "lets go hype start", "#22c55e"],
  ["WAIT", "wait stop hold", "#f97316"],
  ["GOAL", "goal score win", "#22c55e"],
  ["100%", "hundred percent true", "#e5e7eb"],
  ["SOLD", "sold sale", "#fbbf24"],
  ["CHECK IT", "check it look here", "#38bdf8"],
  ["WARNING", "warning caution", "#ef4444"],
  ["LOADING", "loading wait", "#94a3b8"],
  ["TRY AGAIN", "try again retry", "#f97316"],
];

/**
 * Shapes: drawn glyphs, not emoji and not words. They pop in like a graphic
 * because a shape that simply appears reads as a rendering bug.
 */
const SHAPES: [string, string, string][] = [
  ["★", "star rating favourite", "#fbbf24"],
  ["➜", "arrow right next forward", "#38bdf8"],
  ["⬅", "arrow left back", "#38bdf8"],
  ["⬆", "arrow up increase", "#38bdf8"],
  ["⬇", "arrow down decrease", "#38bdf8"],
  ["✔", "tick check correct done", "#22c55e"],
  ["✘", "cross wrong no cancel", "#ef4444"],
  ["●", "circle dot bullet point", "#f472b6"],
  ["▲", "triangle up triangle", "#a78bfa"],
  ["◆", "diamond rhombus", "#22d3ee"],
  ["✳", "burst spark mark", "#fde047"],
  ["〰", "wave squiggle underline", "#f9a8d4"],
];

function emojiAssets(): StickerAsset[] {
  return EMOJI.map(([glyph, tags], i) => ({
    id: `emoji-${i}`,
    kind: "emoji" as StickerKind,
    glyph,
    tags: tags.split(" "),
    category: "emoji" as const,
    anim: defaultAnimFor("emoji"),
    size: defaultSizeFor("emoji"),
  }));
}

function graphicAssets(): StickerAsset[] {
  return GRAPHIC.map(([glyph, tags, color], i) => ({
    id: `graphic-${i}`,
    kind: "graphic" as StickerKind,
    glyph,
    tags: tags.split(" "),
    category: "graphic" as const,
    anim: defaultAnimFor("graphic"),
    color,
    size: defaultSizeFor("graphic"),
  }));
}

function textAssets(): StickerAsset[] {
  return TEXT.map(([glyph, tags, color], i) => ({
    id: `word-${i}`,
    kind: "graphic" as StickerKind,
    glyph,
    tags: [...tags.split(" "), "text", "word"],
    category: "text" as const,
    anim: "pop" as const,
    color,
    size: 120,
  }));
}

export const EMOJI_ASSETS = emojiAssets();
export const GRAPHIC_ASSETS = graphicAssets();
export const WORD_ASSETS = textAssets();

function shapeAssets(): StickerAsset[] {
  return SHAPES.map(([glyph, tags, color], i) => ({
    id: `shape-${i}`,
    kind: "graphic" as StickerKind,
    glyph,
    tags: [...tags.split(" "), "shape"],
    category: "shape" as const,
    anim: defaultAnimFor("graphic"),
    color,
    size: defaultSizeFor("graphic"),
  }));
}

export const SHAPE_ASSETS = shapeAssets();

/**
 * Animated stickers are the generated stock clips (light leak, bokeh, dust,
 * countdown). They are registered in `stock.ts`; these ids are the pointer, so
 * the Animated chip can offer them without a circular import.
 */
export const ANIMATED_STICKER_IDS = ["light-leak", "bokeh", "snow-drift", "countdown"] as const;

/** Everything except the animated ones, which the stock module owns. */
export const STATIC_STICKERS: StickerAsset[] = [
  ...EMOJI_ASSETS,
  ...GRAPHIC_ASSETS,
  ...SHAPE_ASSETS,
  ...WORD_ASSETS,
];

/** Search across the static catalogue. */
export function searchStickers(query: string): StickerAsset[] {
  const q = query.trim().toLowerCase();
  if (!q) return STATIC_STICKERS;
  return STATIC_STICKERS.filter(
    (s) =>
      s.tags.some((t) => t.includes(q)) ||
      (s.glyph ?? "").toLowerCase().includes(q) ||
      s.category.includes(q),
  );
}

/** Assets for one category chip. */
export function stickersIn(category: string): StickerAsset[] {
  if (category === "all") return STATIC_STICKERS;
  return STATIC_STICKERS.filter((s) => s.category === category);
}
