import { Bookmark as BookmarkIcon, Clock } from "lucide-react";
import type { CSSProperties } from "react";
import { tiltFor } from "@/lib/tilt";
import { updatedLabel } from "@/lib/time";
import type { Bookmark } from "@/lib/tauri-commands";

interface BookmarkCardProps {
  bookmark: Bookmark;
  /** How many library entries came from this GameBanana mod. A count rather than a flag because
   * one page can honestly be installed more than once — different files, or the same file filed
   * under two characters. */
  installedCount: number;
  /** Who the mod is for, in the roster's own words. The row stores a `character_id`; only the
   * page above has the roster to turn that into a name, and it already does exactly that for
   * the filter rail — so the label comes down rather than being looked up twice. */
  characterLabel?: string | null;
  onSelect: () => void;
  onRemove: () => void;
}

/** A saved mod, as a print on the wall.
 *
 * Built from `GameBananaModCard`'s parts — 2px edge, 5px print margin, recessed `bg-art` well,
 * id-derived tilt, and the rule that nothing is ever laid over the picture — but deliberately
 * not that component. It needs a whole `GbMod`; a bookmark row stores an id, a name, a
 * thumbnail, a character and when it was saved. Rendering one through the other would print
 * `0 likes, 0 views` under every saved mod, which is not a fact about the mod.
 *
 * It also stops short of the browse card's stats rule, and that is the point rather than an
 * omission. That card gives downloads the display face at 25px because there is a number worth
 * judging by; here the only figure is how long ago you saved it, and setting *that* at 25px
 * would be inventing an importance it does not have. So the footer is a name and one machine
 * line, and the line finally says which character the mod is for — something every bookmark has
 * known all along and no card has ever shown.
 *
 * No `MatureContentShield`, matching the decision recorded in `BookmarksView`: saving a mod is
 * an active, already-informed choice, so re-blurring it adds nothing.
 */
export function BookmarkCard({
  bookmark,
  installedCount,
  characterLabel,
  onSelect,
  onRemove,
}: BookmarkCardProps) {
  const saved = `Saved ${updatedLabel(bookmark.added_at).toLowerCase()}`;

  return (
    <div
      style={{ "--tilt": `${tiltFor(bookmark.gamebanana_mod_id)}deg` } as CSSProperties}
      className="group relative flex rotate-[var(--tilt)] flex-col border-2 border-border bg-card p-[5px] pb-0 text-left shadow-slap-lift transition-[rotate,translate,border-color] duration-200 hover:-translate-y-0.5 hover:rotate-0 hover:border-primary"
    >
      {/* Off the picture and onto the wall, the same place and the same green as the browse
          card's — a shortlist is mostly things you have not got yet, so the ones you already
          have are worth striking off at a glance. Green rather than the accent: this is a fact
          about your library, not something asking to be clicked. */}
      {installedCount > 0 && (
        <span className="pointer-events-none absolute -right-[9px] bottom-full mb-[3px] rotate-[3deg] bg-success px-2 py-px font-sign text-[14px] uppercase tracking-[0.09em] text-card shadow-slap">
          {installedCount > 1 ? `Installed ×${installedCount}` : "Installed"}
        </span>
      )}

      <button
        type="button"
        onClick={onSelect}
        aria-label={`View ${bookmark.name}`}
        className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-art outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {bookmark.thumbnail_url ? (
          <img
            src={bookmark.thumbnail_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-art font-heading text-3xl text-muted-foreground/40">
            {bookmark.name.charAt(0)}
          </span>
        )}
      </button>

      <div className="px-1 pb-3 pt-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {/* Two lines whether the name fills them or not: `line-clamp` caps the maximum
                without reserving the space, so a one-line name pulls everything under it up and
                no two cards in a row agree on where their footers sit. */}
            <p
              className="line-clamp-2 h-[39px] break-words font-heading text-[19px] uppercase leading-[1.02] tracking-[0.005em] text-foreground"
              title={bookmark.name}
            >
              {bookmark.name}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 truncate font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
              {characterLabel && (
                <>
                  <span className="truncate text-card-foreground">{characterLabel}</span>
                  <span className="text-border">·</span>
                </>
              )}
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">{saved}</span>
            </p>
          </div>

          {/* Filled, and in the corner Browse puts its bookmark control, so the same mark in the
              same place means the same thing on both surfaces — here it can only ever unsave. */}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${bookmark.name} from bookmarks`}
            className="flex h-[26px] w-[26px] shrink-0 rotate-[2deg] items-center justify-center bg-primary text-primary-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <BookmarkIcon className="h-3.5 w-3.5" fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}
