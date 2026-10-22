/** The shared look of one card on the Settings page.
 *
 * Lifted out of `SettingsPage` when the app-update sheet became a file of its own: two sheets
 * drawn from two copies of these strings would drift the first time one of them was tweaked,
 * and "every setting is the same piece of paper" is the whole idea behind them.
 */

/** One setting, on its own piece of paper. Sections used to be separated by a hairline rule and
 * nothing else, which made the page one long document rather than a set of switches. */
export const SHEET = "bg-card p-[18px] shadow-slap-lift";
/** What a setting is called. The display face, because these are the names of things — the
 * controls inside them wear the sign face. */
export const SECTION_TITLE =
  "font-heading text-[24px] uppercase leading-none tracking-[0.02em] text-card-foreground";
/** The one place on this page that is genuinely prose: what a setting does and what it costs you.
 * Geist, because body copy is the one job Geist has in this app. */
export const SECTION_COPY = "mt-1.5 text-[13px] leading-relaxed text-muted-foreground";
/** Something gone wrong, in the machine's voice because it is the machine reporting. */
export const ERROR_LINE =
  "mt-3 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-destructive";

/** The press-me button these sheets use: the mods folder's picker, the update's Install, the
 * log's reveal. Shared once there were three of them — two could each keep their own copy, three
 * is where copies start disagreeing about a padding. */
export const PRESS =
  "inline-flex h-9 shrink-0 items-center px-5 font-sign text-[18px] uppercase tracking-[0.1em] shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none";
