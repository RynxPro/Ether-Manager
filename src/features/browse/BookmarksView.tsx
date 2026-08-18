import { Bookmark as BookmarkIcon } from "lucide-react";
import { CARD_GRID } from "@/lib/layout";
import { placeholderGbMod } from "@/lib/placeholderGbMod";
import { BookmarkCard } from "./BookmarkCard";
import { useBookmarks, useRemoveBookmark } from "./hooks";
import type { GbMod } from "@/lib/tauri-commands";

interface BookmarksViewProps {
  /** Selecting a bookmark navigates to the shared mod detail page, owned by App. */
  onSelectMod: (mod: GbMod) => void;
}

/** The shortlist you build while browsing. It shares Browse's grid and card shape rather than
 * the roster's 3:4 posters it used to borrow — these are the same objects as Browse's results,
 * saved, so making them a different size and shape read as a different kind of thing. */
export function BookmarksView({ onSelectMod }: BookmarksViewProps) {
  const { data: bookmarks, isLoading } = useBookmarks();
  const removeBookmark = useRemoveBookmark();
  const count = bookmarks?.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3 border-b-2 border-primary pb-3.5">
        <h2 className="font-heading text-2xl uppercase tracking-[0.06em] text-foreground">
          Bookmarks
        </h2>
        <span className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
          Saved from Browse
        </span>
        {!isLoading && count > 0 && (
          <span className="ml-auto font-heading text-[11px] uppercase tracking-[0.12em] tabular-nums text-muted-foreground">
            {count} saved
          </span>
        )}
      </div>

      {isLoading ? (
        <div className={CARD_GRID}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="aspect-[4/3] animate-pulse border-2 border-border bg-card" />
          ))}
        </div>
      ) : count === 0 ? (
        // A designed state rather than a line of grey text: an empty shortlist is the normal
        // condition on a fresh install, not a failure.
        <div className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border bg-card px-6 py-16 text-center">
          <BookmarkIcon className="h-7 w-7 text-muted-foreground/40" />
          <p className="font-heading text-sm uppercase tracking-[0.1em] text-foreground">
            Nothing saved yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            The bookmark button on any mod in Browse keeps it here.
          </p>
        </div>
      ) : (
        <div className={CARD_GRID}>
          {bookmarks?.map((bookmark) => (
            <BookmarkCard
              key={bookmark.gamebanana_mod_id}
              bookmark={bookmark}
              onSelect={() =>
                onSelectMod(
                  placeholderGbMod({
                    gamebananaModId: bookmark.gamebanana_mod_id,
                    name: bookmark.name,
                    thumbnailUrl: bookmark.thumbnail_url,
                    dateModified: bookmark.added_at,
                  }),
                )
              }
              onRemove={() => removeBookmark.mutate(bookmark.gamebanana_mod_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
