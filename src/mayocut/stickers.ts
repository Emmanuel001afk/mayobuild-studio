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
  // --- reactions, second wave (the ones that trend) -----------------------
  ["🥰", "love adore smile hearts"],
  ["😘", "kiss love blow"],
  ["😎", "cool sunglasses chill swag"],
  ["🤩", "star struck amazed wow"],
  ["🥳", "party celebrate birthday horn"],
  ["😤", "huff determined triumph steam"],
  ["😱", "scream fear shock home alone"],
  ["🤣", "rofl laugh hard rolling"],
  ["🙃", "silly upside down sarcasm"],
  ["😴", "sleep tired zzz"],
  ["🫠", "melt melting overwhelmed"],
  ["🥺", "plead puppy eyes please"],
  ["🙄", "eye roll whatever"],
  ["😏", "smirk sly"],
  ["🤫", "shush quiet secret"],
  ["🤌", "chef kiss perfect italian"],
  ["🫶", "heart hands love"],
  ["✌️", "peace two victory"],
  ["🤞", "fingers crossed luck hope"],
  ["👊", "fist bump punch"],
  ["🫡", "salute respect yes sir"],
  ["👋", "wave hello bye"],
  ["💅", "nails sassy diva"],
  ["🧿", "evil eye nazar protection"],
  // --- hype, money and status --------------------------------------------
  ["💎", "diamond gem rich luxury"],
  ["🥇", "gold medal first win"],
  ["📉", "chart down loss drop"],
  ["💳", "card payment pay"],
  ["🤑", "money mouth rich greedy"],
  ["🏦", "bank money save"],
  ["⚖️", "balance justice law"],
  ["🔑", "key unlock access"],
  ["🛡️", "shield protect defend"],
  ["🪄", "wand magic spell"],
  ["🔮", "crystal ball future magic"],
  // --- content creator kit -----------------------------------------------
  ["🎥", "movie camera film shoot"],
  ["🎙️", "microphone podcast studio"],
  ["🎧", "headphones music listen"],
  ["📹", "video camera record"],
  ["💡", "idea light bulb tip"],
  ["📝", "note write memo"],
  ["📢", "megaphone announce"],
  ["🔗", "link chain url"],
  ["📲", "phone download install"],
  ["🖥️", "computer desktop screen"],
  ["⌨️", "keyboard typing code"],
  ["🕹️", "joystick game arcade"],
  // --- time, place and occasion ------------------------------------------
  ["⏰", "clock alarm time"],
  ["📅", "calendar date schedule"],
  ["🌍", "earth world globe travel"],
  ["✈️", "plane flight travel"],
  ["🚗", "car drive road"],
  ["🏝️", "island vacation tropical"],
  ["🏙️", "city skyline urban"],
  ["🌆", "dusk city sunset"],
  ["🌈", "rainbow colours gay pride"],
  ["🌸", "flower cherry blossom spring"],
  ["🍀", "clover luck irish"],
  ["🌻", "sunflower summer"],
  ["🍂", "leaves autumn fall"],
  ["❄️", "snowflake cold winter"],
  ["🌪️", "tornado storm chaos"],
  ["💧", "water drop tear"],
  // --- food and drink -----------------------------------------------------
  ["🍔", "burger food fast"],
  ["🍟", "fries chips food"],
  ["🍩", "donut sweet"],
  ["🧋", "bubble tea boba"],
  ["🍺", "beer drink pub"],
  ["🍷", "wine glass drink"],
  ["🍫", "chocolate sweet"],
  ["🍓", "strawberry fruit"],
  ["🥑", "avocado healthy"],
  ["🍜", "noodles ramen soup"],
  // --- feelings and ideas -------------------------------------------------
  ["💭", "thought bubble think"],
  ["💤", "sleep zzz tired"],
  ["💔", "broken heart sad breakup"],
  ["💕", "hearts love two"],
  ["💖", "sparkle heart love shine"],
  ["🖤", "black heart dark"],
  ["💀", "skull dead dead laughing"],
  ["👻", "ghost spooky boo"],
  ["👽", "alien ufo space"],
  ["🤖", "robot ai bot"],
  ["🫀", "heart organ real"],
  ["🎭", "theatre masks drama"],
  ["🎨", "art palette paint"],
  ["📖", "book read story"],
  ["✍️", "writing hand sign"],
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
  // --- second wave: the marks that carry meaning on their own ------------
  ["◎", "target focus ring aim", "#ef4444"],
  ["◉", "record target dot", "#ef4444"],
  ["✓", "check simple tick", "#22c55e"],
  ["✗", "cross simple x", "#ef4444"],
  ["➤", "send forward play", "#38bdf8"],
  ["➔", "arrow heavy right", "#f43f5e"],
  ["↻", "refresh clockwise", "#38bdf8"],
  ["⇄", "swap exchange both", "#a78bfa"],
  ["⇅", "vertical both swap", "#a78bfa"],
  ["＋", "plus add new", "#22c55e"],
  ["－", "minus remove", "#ef4444"],
  ["＝", "equals same", "#e5e7eb"],
  ["％", "percent discount sale", "#fbbf24"],
  ["＃", "hash tag number", "#38bdf8"],
  ["＠", "at mention user", "#38bdf8"],
  ["♡", "heart outline like", "#ec4899"],
  ["☑", "checkbox checked done", "#22c55e"],
  ["☐", "checkbox empty todo", "#94a3b8"],
  ["⚠", "warning triangle alert", "#fbbf24"],
  ["⛔", "no entry stop", "#ef4444"],
  ["✚", "plus heavy medical add", "#22c55e"],
  ["❄", "snowflake cold", "#7dd3fc"],
  ["☀", "sun bright day", "#fbbf24"],
  ["☁", "cloud overcast", "#cbd5e1"],
  ["♬", "music notes melody", "#a78bfa"],
  ["♪", "single note music", "#38bdf8"],
  ["⚡", "bolt fast power", "#fbbf24"],
  ["💲", "dollar money cost", "#22c55e"],
  ["⭐", "star filled rating", "#fbbf24"],
  ["❤", "heart filled love", "#ef4444"],
  ["◐", "half circle contrast", "#e5e7eb"],
  ["◇", "diamond outline", "#7dd3fc"],
  ["◆", "diamond filled", "#7dd3fc"],
  ["□", "square outline box", "#e5e7eb"],
  ["○", "circle outline", "#e5e7eb"],
  ["▼", "triangle down", "#ef4444"],
  ["◀", "triangle left", "#94a3b8"],
  ["▶", "triangle right play", "#94a3b8"],
  ["✶", "star six point sparkle", "#fbbf24"],
  ["❋", "flower burst", "#f472b6"],
  ["⟐", "frame corner marker", "#38bdf8"],
  ["⌁", "zigzag energy", "#a78bfa"],
  ["⊙", "dot in circle focus", "#f43f5e"],
  ["∞", "infinity loop forever", "#a78bfa"],
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
  // --- second wave: social, hype and meme words --------------------------
  ["SLAY", "slay iconic queen", "#f472b6"],
  ["YASS", "yass hype yes", "#f472b6"],
  ["GOOD VIBES", "good vibes positive", "#22c55e"],
  ["NO CAP", "no cap truth real", "#38bdf8"],
  ["BET", "bet agree ok", "#a78bfa"],
  ["FIRE", "fire hot lit", "#f97316"],
  ["GOATED", "goated best legend", "#fbbf24"],
  ["THE END", "the end finish closing", "#e5e7eb"],
  ["TO BE CONTINUED", "continued next episode", "#38bdf8"],
  ["BREAKING", "breaking news alert", "#ef4444"],
  ["SUBSCRIBE", "subscribe channel follow", "#ef4444"],
  ["FOLLOW ME", "follow social", "#38bdf8"],
  ["LINK IN BIO", "link bio cta", "#22c55e"],
  ["NEW DROP", "new drop launch", "#f43f5e"],
  ["SALE", "sale discount buy", "#fbbf24"],
  ["FREE", "free giveaway", "#22c55e"],
  ["SHHH", "shhh quiet secret", "#94a3b8"],
  ["PLOT TWIST", "plot twist surprise", "#a78bfa"],
  ["MOOD", "mood feeling vibe", "#f472b6"],
  ["LIT", "lit fire amazing", "#f97316"],
  ["ICONIC", "iconic legendary", "#fbbf24"],
  ["REAL", "real genuine", "#e5e7eb"],
  ["W", "win victory dub", "#22c55e"],
  ["L", "loss lose", "#ef4444"],
  ["U WON", "you won prize", "#fbbf24"],
  ["POV", "pov point of view", "#e5e7eb"],
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
