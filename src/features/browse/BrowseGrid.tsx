import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import type { GbMod } from "@/lib/tauri-commands";
import { GameBananaModCard } from "./GameBananaModCard";
import { useAddBookmark, useBookmarks, useRemoveBookmark, useSearchGamebananaMods } from "./hooks";

interface BrowseGridProps {
  query: string;
  categoryId: number | null;
  onSelectMod: (mod: GbMod) => void;
}

function thumbnailUrlFor(mod: GbMod): string | null {
  const image = mod.preview_media.images[0];
  return image ? `${image.base_url}/${image.file}` : null;
}

export function BrowseGrid({ query, categoryId, onSelectMod }: BrowseGridProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useSearchGamebananaMods(
    query.trim() || null,
    categoryId,
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

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[3/4] rounded-xl" />
        ))}
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
      <p className="text-sm text-muted-foreground">
        {hiddenCount > 0
          ? `All ${hiddenCount} mods on this page are hidden by your mature-content setting.`
          : "No mods found."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {page}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={data?.is_complete ?? true}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
