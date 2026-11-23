// MayoCut — the colour-look catalogue.
//
// The old list was 42 CSS recipes with names like "Moody" and "Clarity". Two
// problems: the names said nothing a person searching would type, and the tiles
// that showed them were blank (the CSS filter was applied to an empty overlay
// div, never to the artwork), so the whole grid read as grey squares.
//
// This catalogue is built around what people actually search for — film stocks
// by name, the trending social presets, and the genre looks (teal & orange,
// bleach bypass, K-drama, VHS, "clean girl") that dominate CapCut's own picks.
//
// A look is more than a CSS filter. The ones that read as *finished* also carry a
// finish layer:
//
//   css       the colour transform, applied by the canvas (ctx.filter)
//   tint      an optional blend colour, for looks a filter stack cannot reach
//   grain     0..1 monochrome noise — what makes "vintage" read as vintage
//   vignette  0..1 corner falloff
//   fade      0..1 black lift, the matte film curve
//   label     a burnt-in caption some presets have ("1998 PLAY")
//
// The preview tile renders this same data, so the card shows what the clip gets.
// That equality is enforced by a test.

export interface LookFinish {
  /** semi-transparent colour blended over the picture, and how */
  tint?: { color: string; mode: "overlay" | "soft-light" | "screen" | "multiply"; alpha: number };
  /** monochrome grain strength, 0..1 */
  grain?: number;
  /** black lift, 0..1 (matte curve) */
  fade?: number;
  /** burnt-in caption drawn in the corner */
  label?: string;
  /** vignette strength, 0..1 */
  vignette?: number;
}

export type LookFamily = "trending" | "film" | "social" | "mood" | "mono" | "vivid" | "retro";

export interface Look extends LookFinish {
  id: string;
  name: string;
  /** which chip it lives under in the picker */
  family: LookFamily;
  css: string;
  /** search terms, including the names people actually type */
  tags: string;
}

export const LOOK_FAMILIES: LookFamily[] = [
  "trending",
  "film",
  "social",
  "mood",
  "mono",
  "vivid",
  "retro",
];

/**
 * The catalogue.
 *
 * Ids are frozen — they are written into saved projects, so a rename must keep
 * the id. The first tile in each family is the one most people want.
 */
export const LOOKS: Look[] = [
  // ---------------------------------------------------------------- trending
  {
    id: "matcha",
    name: "Matcha",
    family: "trending",
    css: "saturate(1.25) hue-rotate(-12deg) brightness(1.04) contrast(1.05)",
    tint: { color: "#4b6b3a", mode: "soft-light", alpha: 0.22 },
    fade: 0.12,
    tags: "matcha green tea viral trend oil painting aesthetic",
  },
  {
    id: "dune",
    name: "Dune Light",
    family: "trending",
    css: "sepia(0.3) saturate(1.15) contrast(1.1) brightness(1.03)",
    tint: { color: "#c29a63", mode: "soft-light", alpha: 0.28 },
    grain: 0.1,
    tags: "dune light sand desert beige viral trending warm",
  },
  {
    id: "2016",
    name: "2016 Filter",
    family: "trending",
    css: "saturate(0.9) contrast(0.95) brightness(1.1) sepia(0.12)",
    fade: 0.3,
    grain: 0.06,
    tags: "2016 filter throwback tumblr soft nostalgic trend",
  },
  {
    id: "glow",
    name: "Dreamy Glow",
    family: "trending",
    css: "brightness(1.12) saturate(1.2) contrast(0.95) blur(0.4px)",
    tint: { color: "#ffd6e7", mode: "screen", alpha: 0.12 },
    tags: "dreamy glow bloom soft skin beauty trend",
  },
  {
    id: "velocity",
    name: "Velocity",
    family: "trending",
    css: "contrast(1.35) saturate(1.4) brightness(0.96)",
    tint: { color: "#0e2233", mode: "multiply", alpha: 0.18 },
    tags: "velocity edit dark contrast hype beat drop trend",
  },
  {
    id: "greennoise",
    name: "Green x Noise",
    family: "trending",
    css: "hue-rotate(-20deg) saturate(1.3) contrast(1.12) brightness(0.98)",
    grain: 0.24,
    tags: "green filter noise grain viral tiktok trend",
  },
  {
    id: "neonphoto",
    name: "Neon Photo",
    family: "trending",
    css: "hue-rotate(200deg) saturate(2.1) contrast(1.25) brightness(0.94)",
    tint: { color: "#7c3aed", mode: "screen", alpha: 0.16 },
    tags: "neon photo purple pfp trend cyber glow",
  },
  {
    id: "aestheticpink",
    name: "Aesthetic Love",
    family: "trending",
    css: "saturate(1.2) brightness(1.1) contrast(0.92) hue-rotate(-8deg)",
    tint: { color: "#ff9ec7", mode: "soft-light", alpha: 0.24 },
    fade: 0.2,
    tags: "aesthetic love pink cute soft girl trend",
  },

  // -------------------------------------------------------------------- film
  {
    id: "tealorange",
    name: "Teal & Orange",
    family: "film",
    css: "contrast(1.14) saturate(1.35) sepia(0.14) hue-rotate(-14deg)",
    tint: { color: "#0d5a6b", mode: "soft-light", alpha: 0.18 },
    tags: "teal orange blockbuster hollywood cinematic colour grade",
  },
  {
    id: "kodachrome",
    name: "Kodachrome",
    family: "film",
    css: "saturate(1.3) contrast(1.12) sepia(0.1) brightness(1.03)",
    grain: 0.08,
    tags: "kodachrome kodak film stock slide 1960s",
  },
  {
    id: "portra",
    name: "Portra 400",
    family: "film",
    css: "saturate(0.95) contrast(0.96) brightness(1.06) sepia(0.12)",
    tint: { color: "#f6d7b8", mode: "soft-light", alpha: 0.16 },
    grain: 0.1,
    tags: "portra 400 kodak portrait skin wedding film stock",
  },
  {
    id: "fuji",
    name: "Fuji 400H",
    family: "film",
    css: "saturate(0.92) contrast(0.98) brightness(1.05) hue-rotate(6deg)",
    tint: { color: "#bcd9c9", mode: "soft-light", alpha: 0.18 },
    grain: 0.09,
    tags: "fuji superia 400h green pastel japanese film stock",
  },
  {
    id: "cinestill",
    name: "Cinestill 800T",
    family: "film",
    css: "contrast(1.08) saturate(1.15) brightness(0.98) hue-rotate(14deg)",
    tint: { color: "#1b4f8a", mode: "screen", alpha: 0.14 },
    grain: 0.12,
    tags: "cinestill 800t tungsten night blue halation film",
  },
  {
    id: "bleach",
    name: "Bleach Bypass",
    family: "film",
    css: "saturate(0.45) contrast(1.42) brightness(1.05)",
    tags: "bleach bypass silver retention war desaturated",
  },
  {
    id: "technicolor",
    name: "Technicolor",
    family: "film",
    css: "saturate(1.6) contrast(1.2) hue-rotate(-4deg)",
    tags: "technicolor three strip saturated musical classic",
  },
  {
    id: "cinema",
    name: "Cinema",
    family: "film",
    css: "contrast(1.18) saturate(1.12) brightness(0.97)",
    tags: "cinema cinematic movie film neutral",
  },
  {
    id: "dramatic",
    name: "Dramatic",
    family: "film",
    css: "contrast(1.38) saturate(1.22) brightness(0.94)",
    tags: "dramatic high contrast strong punch",
  },
  {
    id: "fifties",
    name: "Fifties",
    family: "film",
    css: "sepia(0.3) saturate(0.9) contrast(0.95) brightness(1.08) hue-rotate(-10deg)",
    grain: 0.12,
    tags: "fifties 50s nostalgic old hollywood",
  },

  // ------------------------------------------------------------------ social
  {
    id: "cleangirl",
    name: "Clean Girl",
    family: "social",
    css: "brightness(1.08) saturate(1.02) contrast(0.98)",
    tint: { color: "#fff4e8", mode: "soft-light", alpha: 0.14 },
    tags: "clean girl minimal bright skin skincare beige",
  },
  {
    id: "kdrama",
    name: "K-Drama",
    family: "social",
    css: "brightness(1.1) contrast(0.94) saturate(1.08) hue-rotate(-4deg)",
    tint: { color: "#ffe6ef", mode: "screen", alpha: 0.1 },
    fade: 0.16,
    tags: "kdrama korean bright soft pastel romance drama",
  },
  {
    id: "goldenhour",
    name: "Golden Hour",
    family: "social",
    css: "sepia(0.32) saturate(1.4) brightness(1.06) contrast(1.03)",
    tags: "golden hour sunset warm glow travel portrait",
  },
  {
    id: "sunset",
    name: "Sunset",
    family: "social",
    css: "sepia(0.3) saturate(1.5) hue-rotate(-18deg) brightness(1.06)",
    tags: "sunset orange pink sky summer",
  },
  {
    id: "pastel",
    name: "Pastel",
    family: "social",
    css: "brightness(1.09) saturate(1.25) contrast(0.88) hue-rotate(6deg)",
    fade: 0.18,
    tags: "pastel soft light cute cutesy",
  },
  {
    id: "summer",
    name: "Summer",
    family: "social",
    css: "saturate(1.35) brightness(1.07) contrast(1.02) hue-rotate(-6deg)",
    tags: "summer beach holiday sun bright vacation",
  },
  {
    id: "vivid",
    name: "Vivid",
    family: "social",
    css: "saturate(1.4) contrast(1.1)",
    tags: "vivid pop punchy bright colours",
  },
  {
    id: "punch",
    name: "Punch",
    family: "social",
    css: "contrast(1.28) saturate(1.45)",
    tags: "punch strong bold social feed",
  },
  {
    id: "clean",
    name: "Clean",
    family: "social",
    css: "brightness(1.04) contrast(1.04) saturate(1.05)",
    tags: "clean natural neutral true to life",
  },

  // -------------------------------------------------------------------- mood
  {
    id: "moody",
    name: "Moody",
    family: "mood",
    css: "contrast(1.26) brightness(0.88) saturate(0.82)",
    tags: "moody dark desaturated sad cinematic",
  },
  {
    id: "darkmood",
    name: "Dark & Moody",
    family: "mood",
    css: "brightness(0.82) contrast(1.3) saturate(0.85)",
    vignette: 0.3,
    tags: "dark moody low key shadow thriller",
  },
  {
    id: "night",
    name: "Night",
    family: "mood",
    css: "hue-rotate(12deg) saturate(1.08) brightness(0.9) contrast(1.12)",
    tint: { color: "#12224a", mode: "multiply", alpha: 0.2 },
    tags: "night blue dark city evening",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    family: "mood",
    css: "contrast(1.3) saturate(1.6) hue-rotate(-25deg) brightness(0.95)",
    tint: { color: "#ff2e88", mode: "screen", alpha: 0.14 },
    tags: "cyberpunk neon magenta future sci fi",
  },
  {
    id: "arctic",
    name: "Arctic",
    family: "mood",
    css: "hue-rotate(-18deg) saturate(1.2) brightness(1.08) contrast(1.05)",
    tint: { color: "#cfe8ff", mode: "soft-light", alpha: 0.2 },
    tags: "arctic cold blue ice winter cool",
  },
  {
    id: "winter",
    name: "Winter",
    family: "mood",
    css: "hue-rotate(8deg) saturate(0.88) brightness(1.06) contrast(1.05)",
    tags: "winter snow pale cool frost",
  },
  {
    id: "autumn",
    name: "Autumn",
    family: "mood",
    css: "sepia(0.22) saturate(1.35) hue-rotate(-12deg) brightness(1.02)",
    tags: "autumn fall leaves orange warm",
  },
  {
    id: "infrared",
    name: "Infrared",
    family: "mood",
    css: "hue-rotate(155deg) saturate(1.7) contrast(1.15)",
    tags: "infrared false colour surreal aerochrome",
  },
  {
    id: "duotone",
    name: "Duotone",
    family: "mood",
    css: "grayscale(1) contrast(1.25) sepia(0.4) hue-rotate(180deg) saturate(1.6)",
    tags: "duotone two colour poster graphic",
  },

  // -------------------------------------------------------------------- mono
  {
    id: "bw",
    name: "B&W",
    family: "mono",
    css: "grayscale(1)",
    tags: "black white mono grey grayscale",
  },
  {
    id: "noir",
    name: "Noir",
    family: "mono",
    css: "grayscale(1) contrast(1.35) brightness(0.95)",
    vignette: 0.35,
    grain: 0.1,
    tags: "noir black white hard shadow detective",
  },
  {
    id: "monohigh",
    name: "Mono High",
    family: "mono",
    css: "grayscale(1) contrast(1.55) brightness(1.08)",
    tags: "mono high contrast punchy black white",
  },
  {
    id: "silver",
    name: "Silver",
    family: "mono",
    css: "grayscale(0.85) contrast(1.2) brightness(1.04)",
    tags: "silver desaturated subtle metallic",
  },
  {
    id: "cyanotype",
    name: "Cyanotype",
    family: "mono",
    css: "grayscale(1) sepia(1) hue-rotate(160deg) saturate(1.8) contrast(1.1)",
    tags: "cyanotype blue print photographic",
  },

  // ------------------------------------------------------------------- vivid
  {
    id: "warm",
    name: "Warm",
    family: "vivid",
    css: "sepia(0.25) saturate(1.25) brightness(1.05)",
    tags: "warm cozy orange heat",
  },
  {
    id: "cool",
    name: "Cool",
    family: "vivid",
    css: "hue-rotate(-8deg) saturate(1.15) brightness(1.02)",
    tags: "cool blue cold calm",
  },
  {
    id: "clarity",
    name: "Clarity",
    family: "vivid",
    css: "contrast(1.14) saturate(1.1) brightness(1.02)",
    tags: "clarity sharp crisp detail",
  },
  {
    id: "soft",
    name: "Soft",
    family: "vivid",
    css: "brightness(1.08) saturate(1.06) blur(0.4px)",
    tags: "soft gentle blur dreamy",
  },
  {
    id: "dreamy",
    name: "Dreamy",
    family: "vivid",
    css: "brightness(1.12) saturate(1.18) blur(0.6px)",
    tags: "dreamy hazy blur soft focus",
  },

  // ------------------------------------------------------------------- retro
  {
    id: "vintage",
    name: "Vintage",
    family: "retro",
    css: "sepia(0.4) contrast(1.05) brightness(1.06) saturate(0.85)",
    grain: 0.16,
    fade: 0.14,
    tags: "vintage old retro faded antique",
  },
  {
    id: "retro",
    name: "Retro Film",
    family: "retro",
    css: "sepia(0.45) contrast(1.1) saturate(1.25) brightness(1.02) hue-rotate(-6deg)",
    grain: 0.14,
    tags: "retro film 70s 80s analog",
  },
  {
    id: "faded",
    name: "Faded",
    family: "retro",
    css: "contrast(0.9) brightness(1.07) saturate(0.72) sepia(0.16)",
    fade: 0.34,
    tags: "faded matte washed out low contrast",
  },
  {
    id: "grunge",
    name: "Grunge",
    family: "retro",
    css: "contrast(1.35) saturate(0.7) brightness(0.92) sepia(0.2)",
    grain: 0.22,
    vignette: 0.3,
    tags: "grunge dirty gritty texture rock",
  },
  {
    id: "sepia",
    name: "Sepia",
    family: "retro",
    css: "sepia(0.85) contrast(1.05) brightness(1.02)",
    tags: "sepia brown old photo",
  },
  {
    id: "vhs",
    name: "VHS 1998",
    family: "retro",
    css: "saturate(1.2) contrast(1.12) brightness(1.02) hue-rotate(-4deg)",
    grain: 0.3,
    tint: { color: "#2bd1c4", mode: "screen", alpha: 0.08 },
    label: "1998 PLAY",
    tags: "vhs 90s video tape camcorder retro glitch",
  },
  {
    id: "polaroid",
    name: "Polaroid",
    family: "retro",
    css: "saturate(0.9) contrast(1.08) brightness(1.08) sepia(0.2)",
    grain: 0.14,
    fade: 0.22,
    label: "SX-70",
    tags: "polaroid instant photo print square white border",
  },
  {
    id: "super8",
    name: "Super 8",
    family: "retro",
    css: "sepia(0.28) saturate(1.1) contrast(1.12) brightness(1.02)",
    grain: 0.26,
    vignette: 0.4,
    tags: "super 8 home movie 8mm grain nostalgic",
  },
];

/**
 * Ids that have been renamed.
 *
 * Filter ids are written into saved projects, so removing one silently drops a
 * user's colour grade — the clip keeps its `filter` string, finds no look, and
 * renders as Original. That is a data loss bug dressed as a cosmetic one.
 *
 * Every rename goes here instead. `resolveLookId` is applied when a look is
 * looked up, so old projects keep their grade and new ones use the new id.
 */
export const LEGACY_LOOK_IDS: Record<string, string> = {
  "mono-high": "monohigh",
  silvertone: "silver",
  "neon-night": "neonphoto",
  golden: "goldenhour",
  // shipped in the first catalogue, superseded by the film stock it imitated
  kodak: "kodachrome",
  orange_teal: "tealorange",
  "orange-teal": "tealorange",
};

/** Map a stored filter id onto a look that exists today. */
export function resolveLookId(id: string): string {
  return LEGACY_LOOK_IDS[id] ?? id;
}

export const LOOK_BY_ID = new Map(LOOKS.map((l) => [l.id, l]));

export function lookCss(id: string): string {
  return LOOK_BY_ID.get(resolveLookId(id))?.css ?? "";
}

export function looksIn(family: LookFamily | "all"): Look[] {
  return family === "all" ? LOOKS : LOOKS.filter((l) => l.family === family);
}

/**
 * Search over name and tags.
 *
 * Substring rather than fuzzy on purpose: on a phone keyboard people type
 * "teal", "film", "kdrama" — and a fuzzy match on "warm" returning "War" looks
 * would be worse than no match at all.
 */
export function searchLooks(query: string): Look[] {
  const q = query.trim().toLowerCase();
  if (!q) return LOOKS;
  const words = q.split(/\s+/);
  return LOOKS.filter((l) => {
    const hay = `${l.name} ${l.family} ${l.tags}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Does this look need the finishing pass (extra canvas work)? */
export function lookFor(id: string): Look | undefined {
  return LOOK_BY_ID.get(resolveLookId(id));
}

export function lookHasFinish(look: Look | undefined): boolean {
  if (!look) return false;
  return !!(look.tint || look.grain || look.vignette);
}
