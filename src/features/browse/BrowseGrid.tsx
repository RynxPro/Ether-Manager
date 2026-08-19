import { useEffect, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstalledFromGameBanana } from "@/features/library/hooks";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { CARD_GRID } from "@/lib/layout";
import { shouldBlur } from "@/lib/mature";
import { findScrollParent } from "@/lib/scroll";
import type { GbMod, ModSort } from "@/lib/tauri-commands";
import { GameBananaModCard } from "./GameBananaModCard";
import { SORT_OPTIONS } from "./sortOptions";
import { useAddBookmark, useBookmarks, useInfiniteGamebananaMods, useRemoveBookmark } from "./hooks";

interface BrowseGridProps {
  query: string;
  categoryId: number | null;
  sort: ModSort;
  onSelectMod: (mod: GbMod) => void;
}

/** How far below the last row the loader starts fetching — about a row and a half of lead time.
 *
 * This has a ceiling, and it is not a matter of taste: it must stay under the height one batch
 * adds. Thirty cards is five rows at six columns, roughly 1300px, and as few as three rows on a
 * very wide window. If the margin exceeds that, then coming to rest at the bottom leaves the
 * sentinel still inside the margin after the batch lands, so it fetches again, and again — an
 * earlier 1500px value pulled 270 mods with nobody touching the scroll wheel. */
const PREFETCH_MARGIN = "400px";

function thumbnailUrlFor(mod: GbMod): string | null {
  const image = mod.preview_media.images[0];
  return image ? `${image.base_url}/${image.file}` : null;
}

// Module scope on purpose: leaving Browse — for a mod's page, or the sidebar — unmounts this
// component, so anything in state or a ref dies with it.
//
// Keyed by the filters in force, which is what separates "I went to look at something and came
// back" from "I changed the sort". The first should return you to where you were reading; the
// second is a new list and belongs at the top.
let savedScrollTop = 0;
let savedScrollKey = "";

function feedKey(query: string, categoryId: number | null, sort: ModSort): string {
  return `${query.trim()}|${categoryId ?? "all"}|${sort}`;
}

export function BrowseGrid({ query, categoryId, sort, onSelectMod }: BrowseGridProps) {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteGamebananaMods(query.trim() || null, categoryId, sort);
  const { data: bookmarks } = useBookmarks();
  const { data: visibility } = useMatureContentVisibility();
  const installed = useInstalledFromGameBanana();
  const addBookmark = useAddBookmark();
  const removeBookmark = useRemoveBookmark();

  const bookmarkedIds = new Set((bookmarks ?? []).map((bookmark) => bookmark.gamebanana_mod_id));

  const handleToggleBookmark = (mod: GbMod) => {
    if (bookmarkedIds.has(mod.id)) {
      removeBookmark.mutate(mod.id);
    } else {
      addBookmark.mutate({
        gamebananaModId: mod.id,
        name: mod.name,
        thumbnailUrl: thumbnailUrlFor(mod),
        // Most specific first: a skin's sub-category is the character's own name, which is what
        // resolves to a shelf. The root is only reached for UI and Other/Misc, which have none.
        categoryName: mod.sub_category?.name ?? mod.root_category.name,
      });
    }
  };

  const pages = data?.pages ?? [];
  const records = pages.flatMap((result) => result.records);
  const hiddenCount = pages.reduce((sum, result) => sum + result.hidden_count, 0);

  const isSearching = query.trim().length > 0;
  // `record_count` is GameBanana's own total for the query, but only on the browse-by-category
  // path — the text-search endpoint has no metadata envelope, so the backend fills it with this
  // page's length (see gamebanana.rs). Showing that as a total would be a lie, so while
  // searching the band reports no count at all.
  const totalCount = !isSearching && pages.length > 0 ? pages[0].record_count : null;
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";

  // The sentinel sits below the last row; when it comes within PREFETCH_MARGIN of the viewport
  // the next page is requested. An observer rather than a scroll handler because the scrolling
  // element here is an ancestor panel rather than the window, and the observer finds it without
  // being told which one it is.
  const rootRef = useRef<HTMLDivElement>(null);
  const key = feedKey(query, categoryId, sort);
  const hasRestored = useRef(false);
  // Snapshot what the previous instance left behind, taken during the first render — before the
  // listener below can overwrite it with this instance's own key. Reading the module values
  // later instead made every mount look like a match, so changing a filter re-applied the offset
  // from the list you had just left.
  const incoming = useRef({ key: savedScrollKey, top: savedScrollTop });

  // Remember where you were, continuously — reading it on unmount is too late for the detail
  // page, which is short enough that the shared scroll panel clamps the offset away before this
  // component is torn down. That clamping is why the position looked lost in the first place.
  useEffect(() => {
    const scroller = findScrollParent(rootRef.current);
    if (!scroller) return;
    const remember = () => {
      savedScrollTop = scroller.scrollTop;
      savedScrollKey = key;
      // Also the gate on auto-loading — see `canAutoFetch`.
      canAutoFetch.current = true;
    };
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => scroller.removeEventListener("scroll", remember);
  }, [key, records.length]);

  // `useLayoutEffect`, not `useEffect`: the cached rows are already rendered by the time this
  // runs, so setting the offset before the browser paints means the top of the feed never
  // flashes past. The 4:3 frames reserve their height, so rows are the right size before any
  // preview has loaded and the offset lands where it was taken from.
  useLayoutEffect(() => {
    if (hasRestored.current || records.length === 0) return;
    hasRestored.current = true;

    // A different key means the filters changed, so this is a new list and the saved offset
    // belongs to a different one. Declining to restore is not enough on its own: the scroll
    // panel is shared and simply keeps whatever offset it had, so a search run from deep in the
    // feed dropped you into the middle of its own results. Take the new list from its top.
    // A different key means the filters changed, so the saved offset belongs to a different
    // list. Browse handles where a changed filter lands you; this only declines to restore.
    if (incoming.current.key !== key) return;

    const scroller = findScrollParent(rootRef.current);
    if (scroller) scroller.scrollTop = incoming.current.top;
  }, [records.length, key]);

  // One auto-load per scroll. Without this the feed can run away on its own: a batch has to add
  // more height than the prefetch margin to push the sentinel back out of range, and there is no
  // margin small enough to guarantee that. Browsing returns thirty mods a page — five rows —
  // but text search hits a different endpoint that returns about six, a single row, so it never
  // escaped and loaded continuously while nobody touched anything.
  //
  // Continuous scrolling fires scroll events throughout, so reading down a long feed keeps
  // loading normally; it is only coming to rest that stops it.
  const canAutoFetch = useRef(true);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || !canAutoFetch.current) return;
        canAutoFetch.current = false;
        fetchNextPage();
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, records.length]);

  const band = (
    // Gives the grid a top edge. Without it the results simply began, and the sort in force was
    // only discoverable by looking back up at the control that set it.
    <div className="flex items-baseline justify-between border-b-2 border-primary pb-2.5 font-heading text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      <span>
        Results
        {totalCount !== null && (
          <span className="ml-2 text-foreground">{totalCount.toLocaleString()}</span>
        )}
      </span>
      <span>{isSearching ? "Best match" : sortLabel}</span>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {band}
        <div className={CARD_GRID}>
          {/* Matches the card it stands in for: same 4:3 frame, and square-cornered, since
              nothing in this app has had a border radius since the Eridu pass. */}
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3]" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load GameBanana mods: {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }

  if (records.length === 0) {
    return (
      <div className="space-y-4">
        {band}
        <p className="text-sm text-muted-foreground">
          {hiddenCount > 0
            ? `All ${hiddenCount} mods loaded so far are hidden by your mature-content setting.`
            : "No mods found."}
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="space-y-4">
      {band}
      <div className={CARD_GRID}>
        {records.map((mod) => (
          <GameBananaModCard
            key={mod.id}
            mod={mod}
            isBookmarked={bookmarkedIds.has(mod.id)}
            isBlurred={shouldBlur(visibility, mod.is_mature)}
            installedCount={installed.countByModId.get(mod.id) ?? 0}
            onSelect={() => onSelectMod(mod)}
            onToggleBookmark={() => handleToggleBookmark(mod)}
          />
        ))}

        {/* Placeholders in the grid itself rather than a spinner beneath it, so the page grows
            by whole rows and nothing under the cursor jumps when the batch lands. */}
        {isFetchingNextPage &&
          Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`pending-${index}`} className="aspect-[4/3]" />
          ))}
      </div>

      {hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {hiddenCount} mod{hiddenCount === 1 ? "" : "s"} hidden by your mature-content setting.
        </p>
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {/* The observer does the work, but it cannot be the only way to continue: a reader who
          reaches the end while a fetch is still pending, or whose scrolling never trips the
          margin, needs something to press. It also gives the feed a real bottom edge. */}
      <div className="flex items-center justify-center border-t-2 border-border pt-5 pb-1">
        {hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        ) : (
          <span className="font-heading text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            End of results · {records.length.toLocaleString()} shown
          </span>
        )}
      </div>
    </div>
  );
}
