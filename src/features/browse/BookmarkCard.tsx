import { Bookmark as BookmarkIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updatedLabel } from "@/lib/time";
import type { Bookmark } from "@/lib/tauri-commands";

interface BookmarkCardProps {
  bookmark: Bookmark;
  onSelect: () => void;
  onRemove: () => void;
}

/** A saved mod, in the same language as the Browse card it was saved from: 4:3 art, a meta
 * strip below, cut corner, yellow on hover. It deliberately does not reuse `GameBananaModCard`
 * — that card needs a whole `GbMod`, and a bookmark row stores only an id, a name, a thumbnail
 * URL and when it was saved. Rendering it through that card would print `0 likes, 0 views`
 * under every saved mod, which is not a fact about the mod.
 *
 * So the strip carries the one other thing a bookmark genuinely knows: how long ago you saved
 * it. The list arrives newest-first, so that reads as an ordering rather than as trivia.
 *
 * No `MatureContentShield` here, matching the existing decision recorded in `BookmarksView`:
 * saving a mod is an active, already-informed choice, so re-blurring it adds nothing. */
export function BookmarkCard({ bookmark, onSelect, onRemove }: BookmarkCardProps) {
  return (
    <div
      // The cut corner is Eridu's signature and cannot come from a border-radius.
      style={{
        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
      }}
      className="group relative flex flex-col border-2 border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
        <button
          type="button"
          onClick={onSelect}
          className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`View ${bookmark.name}`}
        >
          {bookmark.thumbnail_url ? (
            <img src={bookmark.thumbnail_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-secondary font-heading text-3xl font-semibold text-muted-foreground/50">
              {bookmark.name.charAt(0)}
            </span>
          )}
        </button>

        {/* Filled, and sitting where Browse's bookmark control sits, so the same button in the
            same corner means the same thing on both surfaces — here it can only ever unsave. */}
        <Button
          type="button"
          variant="default"
          size="icon-sm"
          className="absolute top-1.5 right-1.5 z-30"
          onClick={onRemove}
          aria-label={`Remove ${bookmark.name} from bookmarks`}
        >
          <BookmarkIcon className="h-3.5 w-3.5" fill="currentColor" />
        </Button>
      </div>

      <div className="border-t-2 border-t-border bg-background px-2.5 pt-1.5 pb-2 group-hover:border-t-primary">
        <p
          className="truncate font-heading text-[13px] font-semibold uppercase tracking-wide text-foreground"
          title={bookmark.name}
        >
          {bookmark.name}
        </p>
        <span className="flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground/70">
          <Clock className="h-3 w-3" />
          Saved {updatedLabel(bookmark.added_at).toLowerCase()}
        </span>
      </div>
    </div>
  );
}
