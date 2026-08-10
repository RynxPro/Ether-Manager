/** Shared grid for the poster-shaped cards (characters, browse results, bookmarks).
 *
 * Uses `auto-fill` + `minmax` rather than fixed breakpoint column counts on purpose: this is a
 * resizable desktop window, not a set of phone/tablet/desktop sizes. Columns are derived from
 * whatever width the user has dragged the window to, so maximizing fits more cards instead of
 * stretching the same six. The floor keeps a portrait readable; `1fr` lets the last row's cards
 * match the rest. */
export const POSTER_GRID = "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4";
