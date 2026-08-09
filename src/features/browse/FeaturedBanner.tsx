import { Skeleton } from "@/components/ui/skeleton";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import type { GbMod } from "@/lib/tauri-commands";
import { GameBananaModCard } from "./GameBananaModCard";
import { useAddBookmark, useBookmarks, useRemoveBookmark, useSearchGamebananaMods } from "./hooks";

interface FeaturedBannerProps {
  onSelectMod: (mod: GbMod) => void;
}

function thumbnailUrlFor(mod: GbMod): string | null {
  const image = mod.preview_media.images[0];
  return image ? `${image.base_url}/${image.file}` : null;
}

/** A fixed "Most Liked" strip above the search bar — GameBanana-homepage-style, not
 * affected by the search/filter/sort controls below it. */
export function FeaturedBanner({ onSelectMod }: FeaturedBannerProps) {
  const { data, isLoading } = useSearchGamebananaMods(null, null, "MostLiked", 1);
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

  const records = data?.records ?? [];
  if (!isLoading && records.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Popular right now</p>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[3/4] w-40 shrink-0 rounded-xl" />
            ))
          : records.map((mod) => (
              <div key={mod.id} className="w-40 shrink-0">
                <GameBananaModCard
                  mod={mod}
                  isBookmarked={bookmarkedIds.has(mod.id)}
                  isBlurred={(visibility ?? "Blur") === "Blur" && mod.is_mature}
                  onSelect={() => onSelectMod(mod)}
                  onToggleBookmark={() => handleToggleBookmark(mod)}
                />
              </div>
            ))}
      </div>
    </div>
  );
}
