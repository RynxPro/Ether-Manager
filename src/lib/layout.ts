/** Shared grid for the poster-shaped cards (characters, browse results, bookmarks).
 *
 * Uses `auto-fill` + `minmax` rather than fixed breakpoint column counts on purpose: this is a
 * resizable desktop window, not a set of phone/tablet/desktop sizes. Columns are derived from
 * whatever width the user has dragged the window to, so maximizing fits more cards instead of
 * stretching the same six. The floor keeps a portrait readable; `1fr` lets the last row's cards
 * match the rest. */
export const POSTER_GRID = "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4";

/** The same idea for the landscape 16:10 mod cards, which need more width before they stop
 * being readable — a mod preview is a screenshot, often with text baked into it, where a
 * character portrait is a single figure. Same `auto-fill` reasoning as `POSTER_GRID`: columns
 * follow the window rather than a fixed set of breakpoints. */
export const CARD_GRID = "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4";
