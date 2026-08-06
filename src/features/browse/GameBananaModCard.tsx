import { Bookmark, Eye, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GbMod } from "@/lib/tauri-commands";

interface GameBananaModCardProps {
  mod: GbMod;
  isBookmarked: boolean;
  onSelect: () => void;
  onToggleBookmark: () => void;
}

export function GameBananaModCard({
  mod,
  isBookmarked,
  onSelect,
  onToggleBookmark,
}: GameBananaModCardProps) {
  const thumbnail = mod.preview_media.images[0];
  const thumbnailUrl = thumbnail
    ? `${thumbnail.base_url}/${thumbnail.file_220 ?? thumbnail.file}`
    : null;

  return (
    <div className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-xl border border-border text-left transition-all hover:border-primary/60 hover:shadow-lg">
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0"
        aria-label={`View ${mod.name}`}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={mod.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground">
            {mod.name.charAt(0)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      </button>

      <Button
        type="button"
        variant={isBookmarked ? "default" : "secondary"}
        size="icon-sm"
        className="absolute top-2 right-2 z-10"
        onClick={onToggleBookmark}
        aria-label={isBookmarked ? `Remove ${mod.name} from bookmarks` : `Bookmark ${mod.name}`}
      >
        <Bookmark className="h-4 w-4" fill={isBookmarked ? "currentColor" : "none"} />
      </Button>

      <div className="relative z-0 space-y-1 p-3">
        <p className="truncate text-sm font-semibold text-white drop-shadow">{mod.name}</p>
        <div className="flex items-center gap-3 text-xs text-white/70">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {mod.like_count}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {mod.view_count}
          </span>
        </div>
      </div>
    </div>
  );
}
