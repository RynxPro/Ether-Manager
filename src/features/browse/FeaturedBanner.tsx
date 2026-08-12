import { Bookmark, ChevronLeft, ChevronRight, Eye, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import type { GbMod } from "@/lib/tauri-commands";
import { useAddBookmark, useBookmarks, useRemoveBookmark, useSearchGamebananaMods } from "./hooks";

interface FeaturedBannerProps {
  onSelectMod: (mod: GbMod) => void;
}

/** How many of the Most Liked results the carousel cycles through. Six fills the thumbnail
 * strip at the widths this window is ever dragged to without the strip wrapping. */
const FEATURED_COUNT = 6;

function thumbnailUrlFor(mod: GbMod): string | null {
  const image = mod.preview_media.images[0];
  return image ? `${image.base_url}/${image.file}` : null;
}

/** The original upload, for the hero. The pre-rendered sizes are grid thumbnails — `file_530`
 * is 530px wide and the band is roughly three times that, so it arrived visibly upscaled. */
function heroUrlFor(mod: GbMod): string | null {
  const image = mod.preview_media.images[0];
  return image ? `${image.base_url}/${image.file}` : null;
}

/** A fixed "Most Liked" carousel above the search bar — not affected by the search/filter/sort
 * controls below it. One large preview at a time, with arrows and a thumbnail strip to jump
 * straight to any of the six. */
export function FeaturedBanner({ onSelectMod }: FeaturedBannerProps) {
  const { data, isLoading } = useSearchGamebananaMods(null, null, "MostLiked", 1);
  const { data: bookmarks } = useBookmarks();
  const { data: visibility } = useMatureContentVisibility();
  const addBookmark = useAddBookmark();
  const removeBookmark = useRemoveBookmark();
  const [index, setIndex] = useState(0);

  const records = (data?.records ?? []).slice(0, FEATURED_COUNT);

  // Results arrive after the first render, and can shrink when the API returns fewer than
  // expected — clamp rather than letting the index point past the end at nothing.
  useEffect(() => {
    if (records.length > 0 && index >= records.length) setIndex(0);
  }, [records.length, index]);

  const bookmarkedIds = new Set((bookmarks ?? []).map((bookmark) => bookmark.gamebanana_mod_id));

  function handleToggleBookmark(mod: GbMod) {
    if (bookmarkedIds.has(mod.id)) {
      removeBookmark.mutate(mod.id);
    } else {
      addBookmark.mutate({
        gamebananaModId: mod.id,
        name: mod.name,
        thumbnailUrl: thumbnailUrlFor(mod),
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  if (records.length === 0) return null;

  const mod = records[Math.min(index, records.length - 1)];
  const heroUrl = heroUrlFor(mod);
  const isBlurred = (visibility ?? "Blur") === "Blur" && mod.is_mature;
  const isBookmarked = bookmarkedIds.has(mod.id);
  const step = (delta: number) =>
    setIndex((current) => (current + delta + records.length) % records.length);

  return (
    // Art and text in separate columns rather than text laid over the picture. Overlaying meant
    // the band had to be tall enough to hold both, which is what made a full-bleed hero enormous
    // — here the art pane is narrower, so its shape is closer to a preview's and it crops less
    // at a fraction of the height.
    <div className="grid h-[420px] grid-cols-[1.9fr_1fr] border-2 border-border">
      <div className="relative overflow-hidden bg-secondary">
        {/* Keyed on the mod so switching slides remounts the shield — otherwise revealing one
            mature preview would leave the next one revealed too. */}
        <MatureContentShield key={mod.id} isBlurred={isBlurred} className="h-full w-full">
          {heroUrl ? (
            <img src={heroUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-secondary font-heading text-6xl text-muted-foreground/30">
              {mod.name.charAt(0)}
            </div>
          )}
        </MatureContentShield>

        {/* z-30 clears the shield's own reveal overlay, so the carousel stays navigable without
            revealing anything. */}
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous featured mod"
          className="absolute top-1/2 left-0 z-30 flex h-14 w-9 -translate-y-1/2 items-center justify-center border border-white/15 bg-background/60 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next featured mod"
          className="absolute top-1/2 right-0 z-30 flex h-14 w-9 -translate-y-1/2 items-center justify-center border border-white/15 bg-background/60 text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col justify-center border-l-2 border-border bg-card p-6">
        <p className="font-heading text-[10px] uppercase tracking-[0.16em] text-primary">
          Popular right now
        </p>
        {/* h3 is deliberately outside the `h1, h2` base rule, so the heading face is applied
            here rather than inherited. Clamped because GameBanana names run long. */}
        <h3 className="mt-2 line-clamp-3 font-heading text-2xl uppercase leading-[1.05] tracking-[0.03em]">
          {mod.name}
        </h3>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">by {mod.submitter.name}</p>

        <div className="mt-4 flex gap-6">
          <span className="text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5 font-heading text-lg tabular-nums text-foreground">
              <ThumbsUp className="h-3.5 w-3.5" />
              {mod.like_count.toLocaleString()}
            </span>
            likes
          </span>
          <span className="text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5 font-heading text-lg tabular-nums text-foreground">
              <Eye className="h-3.5 w-3.5" />
              {mod.view_count.toLocaleString()}
            </span>
            views
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => onSelectMod(mod)}>
            View mod
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleToggleBookmark(mod)}
            aria-label={isBookmarked ? `Remove ${mod.name} from bookmarks` : `Bookmark ${mod.name}`}
          >
            <Bookmark className="h-3.5 w-3.5" fill={isBookmarked ? "currentColor" : "none"} />
            {isBookmarked ? "Bookmarked" : "Bookmark"}
          </Button>
        </div>

        {/* Position markers: how many there are and where you are, without a second row of
            artwork competing with the one being featured. */}
        <div className="mt-6 flex gap-1.5">
          {records.map((record, i) => (
            <button
              key={record.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${record.name}`}
              aria-current={i === index}
              className={`h-[3px] w-6 transition-colors ${
                i === index ? "bg-primary" : "bg-border hover:bg-muted-foreground"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
