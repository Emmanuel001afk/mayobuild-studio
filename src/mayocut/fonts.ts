// MayoCut — the font catalogue.
//
// Why this is its own module: the picker, the canvas and the export all have to
// agree on what a font id means, and an imported font has to resolve the same
// way a built-in one does. Previously `fontCss()` only searched the ten built-in
// stacks, so picking an imported font silently rendered the default family on
// the canvas — the label said "Inter" and the pixels said "system-ui".
//
// The built-ins are deliberately NOT web fonts. Downloading a font on first use
// is exactly the sort of network dependency this app refuses: it would fail
// offline, flash the fallback, and make an export differ from the preview. Each
// entry is a stack whose first name is a real font on at least one major
// platform and whose last name is a generic that always exists, so text is
// always legible and only the styling varies by device.
//
// Nothing here fetches anything. `IMPORTED_FONTS` are FontFace loads of a file
// the user chose, already in memory.

export interface FontDef {
  id: string;
  name: string;
  /** CSS font-family stack; always ends in a generic family */
  css: string;
  /** what this face is for, shown as the chip subtitle */
  note: string;
  /** the style `fontCss` should fall back to when this family is missing */
  kind: "sans" | "serif" | "mono" | "display" | "script";
  /** sample string for the picker — tuned to show the face's character */
  sample?: string;
}

/**
 * Built-in faces.
 *
 * Ordered by how often they are reached for in short-form video: bold display
 * for hooks, clean sans for captions, then the characterful ones. Every entry
 * has at least one iOS/macOS name and one Android/Windows name where those
 * differ, so the same project looks intentional on every device.
 */
export const FONT_CATALOGUE: FontDef[] = [
  // ---- clean / captions -----------------------------------------------------
  {
    id: "system",
    name: "Modern (default)",
    css: '"Inter", "Segoe UI", system-ui, sans-serif',
    note: "Clean UI sans — the safe default",
    kind: "sans",
  },
  {
    id: "helvetica",
    name: "Helvetica / Nimbus",
    css: '"Helvetica Neue", Helvetica, "Nimbus Sans", Arial, sans-serif',
    note: "Neutral Swiss sans, slightly tighter than Modern",
    kind: "sans",
  },
  {
    id: "grotesk",
    name: "Grotesk",
    css: '"Arial", "Liberation Sans", "Helvetica Neue", sans-serif',
    note: "Plain, wide, extremely legible at small sizes",
    kind: "sans",
  },
  {
    id: "geometric",
    name: "Geometric",
    css: '"Futura", "Century Gothic", "Avenir Next", "Trebuchet MS", sans-serif',
    note: "Round geometry — good for titles, weak for body",
    kind: "sans",
  },
  {
    id: "humanist",
    name: "Humanist",
    css: '"Optima", "Candara", "Gill Sans", "Segoe UI", sans-serif',
    note: "Softer strokes, reads well over busy footage",
    kind: "sans",
  },
  {
    id: "book",
    name: "Book",
    css: '"Verdana", "DejaVu Sans", "Segoe UI", sans-serif',
    note: "Wide and heavy — the most readable over video",
    kind: "sans",
  },
  {
    id: "condensed",
    name: "Condensed",
    css: '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif',
    note: "Narrow — fits long lines and stacked captions",
    kind: "sans",
  },

  // ---- loud / display -------------------------------------------------------
  {
    id: "impact",
    name: "Impact (loud)",
    css: 'Impact, "Arial Black", "Haettenschweiler", sans-serif',
    note: "Meme/poster weight; pairs with a thick stroke",
    kind: "display",
  },
  {
    id: "black",
    name: "Black",
    css: '"Arial Black", "Segoe UI Black", "Impact", sans-serif',
    note: "Very heavy sans for hook text",
    kind: "display",
  },
  {
    id: "poster",
    name: "Poster",
    css: '"Trebuchet MS", "Tahoma", "DejaVu Sans", sans-serif',
    note: "Friendly and slightly condensed",
    kind: "display",
  },

  // ---- serif ---------------------------------------------------------------
  {
    id: "serif",
    name: "Classic serif",
    css: 'Georgia, "Times New Roman", "Liberation Serif", serif',
    note: "Editorial serif; the default for quotes",
    kind: "serif",
  },
  {
    id: "garamond",
    name: "Garamond",
    css: '"EB Garamond", Garamond, "Apple Garamond", "Georgia", serif',
    note: "Bookish and elegant — small caps look great",
    kind: "serif",
  },
  {
    id: "slab",
    name: "Slab",
    css: 'Rockwell, "Roboto Slab", "DejaVu Serif", serif',
    note: "Blocky serif; strong over footage",
    kind: "serif",
  },
  {
    id: "elegant",
    name: "Elegant",
    css: '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", serif',
    note: "Warm old-style; wedding and travel edits",
    kind: "serif",
  },
  {
    id: "didone",
    name: "Didone",
    css: '"Didot", "Bodoni MT", "Baskerville", "Playfair Display", serif',
    note: "High-contrast fashion type — large sizes only",
    kind: "serif",
  },

  // ---- mono / typewriter ----------------------------------------------------
  {
    id: "mono",
    name: "Typewriter mono",
    css: '"SF Mono", ui-monospace, "Roboto Mono", "DejaVu Sans Mono", monospace',
    note: "Code/terminal feel; good for data and jokes",
    kind: "mono",
  },
  {
    id: "courier",
    name: "Courier",
    css: '"Courier New", Courier, "Nimbus Mono PS", monospace',
    note: "Script/typewriter look with a thin weight",
    kind: "mono",
  },

  // ---- script / casual ------------------------------------------------------
  {
    id: "script",
    name: "Script (handwritten)",
    css: '"Brush Script MT", "Segoe Script", "Bradley Hand", cursive',
    note: "Handwritten — use sparingly and large",
    kind: "script",
  },
  {
    id: "rounded",
    name: "Rounded (casual)",
    css: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive',
    note: "Informal and warm",
    kind: "script",
  },
  {
    id: "marker",
    name: "Marker",
    css: '"Marker Felt", "Comic Sans MS", "Segoe Print", cursive',
    note: "Notebook/marker annotation style",
    kind: "script",
  },
  {
    id: "fancy",
    name: "Fancy (blackletter)",
    css: '"Old English Text MT", "UnifrakturMaguntia", "Cinzel Decorative", serif',
    note: "Blackletter; decorative only, never body text",
    kind: "display",
  },
];

/** Fast id → face lookup. */
const BY_ID = new Map(FONT_CATALOGUE.map((f) => [f.id, f]));

/**
 * The font-family stack for an id, including imported fonts.
 *
 * Imported fonts are stored on the project as `{ id, family, name }`, where the
 * `family` is the name registered with `document.fonts`. Resolving through the
 * project is what makes an imported font actually apply — before this, the id
 * was unknown to the catalogue and every imported font rendered as the default.
 */
export function resolveFontCss(
  id: string | undefined,
  imported?: { id: string; family: string }[],
): string {
  if (!id) return FONT_CATALOGUE[0].css;
  const built = BY_ID.get(id);
  if (built) return built.css;
  const imp = imported?.find((f) => f.id === id || f.family === id);
  if (imp?.family) {
    // Quote the family so names with spaces/Dashes resolve as one family, and
    // keep a generic fallback so a failed FontFace load is still legible.
    return `"${imp.family}", ${FONT_CATALOGUE[0].css}`;
  }
  return FONT_CATALOGUE[0].css;
}

/** Display name for an id, for chips and the inspector header. */
export function fontName(
  id: string | undefined,
  imported?: { id: string; name: string }[],
): string {
  if (!id) return FONT_CATALOGUE[0].name;
  const built = BY_ID.get(id);
  if (built) return built.name;
  return imported?.find((f) => f.id === id)?.name ?? id;
}

/** Grouping for the picker. */
export function fontsByKind(kind: FontDef["kind"]): FontDef[] {
  return FONT_CATALOGUE.filter((f) => f.kind === kind);
}
