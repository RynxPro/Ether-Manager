/** Shared grid for the poster-shaped cards: character portraits, and the bookmark tiles that
 * still follow them.
 *
 * Uses `auto-fill` + `minmax` rather than fixed breakpoint column counts on purpose: this is a
 * resizable desktop window, not a set of phone/tablet/desktop sizes. Columns are derived from
 * whatever width the user has dragged the window to, so maximizing fits more cards instead of
 * stretching the same six. The floor keeps a portrait readable; `1fr` lets the last row's cards
 * match the rest. */
export const POSTER_GRID = "grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4";

/** Every mod card, browsed or installed. Wider than `POSTER_GRID` because a mod preview is a
 * landscape screenshot rather than a single standing figure, and because the installed cards
 * carry enable/update/delete beneath the art — controls need more width than a picture does.
 *
 * Browse and the library share this deliberately: the two surfaces differ in what the card
 * holds and in its art ratio (4:3 browsing, 16:10 installed), not in how much room it takes.
 * Same `auto-fill` reasoning as `POSTER_GRID`: columns follow the window rather than a fixed
 * set of breakpoints. */
export const CARD_GRID = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4";
