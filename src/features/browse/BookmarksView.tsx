import { Bookmark as BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { POSTER_GRID } from "@/lib/layout";
import { useBookmarks, useRemoveBookmark } from "./hooks";
import type { Bookmark, GbMod } from "@/lib/tauri-commands";

/** `ModDetailPage` expects a full `GbMod` (list-record shape), but a bookmark only ever
 * stores id/name/thumbnail — GameBanana's single-mod endpoint has no way to supply the rest
 * (tags, subcategory, live counts) by id alone (confirmed live: `_aTags` and `_aSubCategory`
 * are rejected as `UNKNOWN_PROPERTY` on `Mod/:id`). This placeholder only needs to be good
 * enough for `ModDetailPage` to fetch the real detail and render — the install flow itself
 * reads from that live-fetched `GbModDetail` instead, not from this placeholder, so its
 * category-guessing isn't affected by any of this being empty.
 * `is_mature` is forced `false` deliberately: bookmarking is an active, already-informed choice,
 * so re-blurring something the user already chose to save adds nothing. */
function bookmarkToPlaceholderGbMod(bookmark: Bookmark): GbMod {
  return {
    id: bookmark.gamebanana_mod_id,
    name: bookmark.name,
    profile_url: "",
    date_modified: bookmark.added_at,
    has_files: true,
    tags: [],
    preview_media: { images: [] },
    submitter: { id: 0, name: "", profile_url: "", avatar_url: null },
    game: { id: 0, name: "" },
    root_category: { name: "", profile_url: "" },
    sub_category: null,
    like_count: 0,
    view_count: 0,
    post_count: 0,
    has_content_ratings: false,
    initial_visibility: "show",
    is_mature: false,
  };
}

interface BookmarksViewProps {
  /** Selecting a bookmark navigates to the shared mod detail page, owned by App. */
  onSelectMod: (mod: GbMod) => void;
}

export function BookmarksView({ onSelectMod }: BookmarksViewProps) {
  const { data: bookmarks, isLoading } = useBookmarks();
  const removeBookmark = useRemoveBookmark();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">Bookmarks</h2>
        <div className={POSTER_GRID}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-foreground">Bookmarks</h2>

      {!bookmarks || bookmarks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bookmarks yet. Save mods from Browse to find them here.
        </p>
      ) : (
        <div className={POSTER_GRID}>
          {bookmarks.map((bookmark) => (
            <div
              key={bookmark.gamebanana_mod_id}
              className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-xl border border-border text-left transition-all hover:border-primary/60 hover:shadow-lg"
            >
              <button
                type="button"
                onClick={() => onSelectMod(bookmarkToPlaceholderGbMod(bookmark))}
                className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`View ${bookmark.name}`}
              >
                {bookmark.thumbnail_url ? (
                  <img
                    src={bookmark.thumbnail_url}
                    alt={bookmark.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground">
                    {bookmark.name.charAt(0)}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
              </button>

              <Button
                type="button"
                variant="default"
                size="icon-sm"
                className="absolute top-2 right-2 z-10"
                onClick={() => removeBookmark.mutate(bookmark.gamebanana_mod_id)}
                aria-label={`Remove ${bookmark.name} from bookmarks`}
              >
                <BookmarkIcon className="h-4 w-4" fill="currentColor" />
              </Button>

              <div className="relative z-0 p-3">
                <p className="truncate text-sm font-semibold text-white drop-shadow">
                  {bookmark.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
