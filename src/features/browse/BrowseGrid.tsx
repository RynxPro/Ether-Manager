import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { CARD_GRID } from "@/lib/layout";
import type { GbMod, ModSort } from "@/lib/tauri-commands";
import { GameBananaModCard } from "./GameBananaModCard";
import { SORT_OPTIONS } from "./sortOptions";
import { useAddBookmark, useBookmarks, useRemoveBookmark, useSearchGamebananaMods } from "./hooks";

interface BrowseGridProps {
  query: string;
  categoryId: number | null;
  sort: ModSort;
  onSelectMod: (mod: GbMod) => void;
}

function thumbnailUrlFor(mod: GbMod): string | null {
  const image = mod.preview_media.images[0];
  return image ? `${image.base_url}/${image.file}` : null;
}

export function BrowseGrid({ query, categoryId, sort, onSelectMod }: BrowseGridProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useSearchGamebananaMods(
    query.trim() || null,
    categoryId,
    sort,
    page,
  );
  const { data: bookmarks } = useBookmarks();
  const { data: visibility } = useMatureContentVisibility();
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
      });
    }
  };

  const isSearching = query.trim().length > 0;
  const isLastPage = data?.is_complete ?? true;
  // `record_count` is GameBanana's own total for the query, but only on the browse-by-category
  // path — the text-search endpoint has no metadata envelope, so the backend fills it with this
  // page's length (see gamebanana.rs). Showing that as a total would be a lie, so while
  // searching the band reports no count at all.
  const totalCount = !isSearching && data ? data.record_count : null;
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";

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

  const records = data?.records ?? [];
  const hiddenCount = data?.hidden_count ?? 0;

  if (records.length === 0) {
    return (
      <div className="space-y-4">
        {band}
        <p className="text-sm text-muted-foreground">
          {hiddenCount > 0
            ? `All ${hiddenCount} mods on this page are hidden by your mature-content setting.`
            : "No mods found."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {band}
      <div className={CARD_GRID}>
        {records.map((mod) => (
          <GameBananaModCard
            key={mod.id}
            mod={mod}
            isBookmarked={bookmarkedIds.has(mod.id)}
            // Fail closed while the preference is still loading or its query errored —
            // `visibility` is `undefined` in both cases, which must never mean "treat as
            // Show" given DEFAULT is Blur everywhere else in this app.
            isBlurred={(visibility ?? "Blur") === "Blur" && mod.is_mature}
            onSelect={() => onSelectMod(mod)}
            onToggleBookmark={() => handleToggleBookmark(mod)}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {hiddenCount} mod{hiddenCount === 1 ? "" : "s"} hidden by your mature-content setting.
        </p>
      )}

      {/* A footer band rather than three stock buttons adrift under the last row. There is no
          page total to show — GameBanana reports only whether this page is the last one — so
          the middle states the page you are on and says when you have reached the end. */}
      <div className="flex items-center justify-between border-t-2 border-border pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Button>
        <span className="font-heading text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Page <span className="ml-1 text-lg tabular-nums text-foreground">{page}</span>
          {isLastPage && <span className="ml-2">· last</span>}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={isLastPage}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
