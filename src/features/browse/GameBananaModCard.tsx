import { Bookmark, Eye, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { Button } from "@/components/ui/button";
import type { GbMod } from "@/lib/tauri-commands";

interface GameBananaModCardProps {
  mod: GbMod;
  isBookmarked: boolean;
  isBlurred: boolean;
  onSelect: () => void;
  onToggleBookmark: () => void;
}

export function GameBananaModCard({
  mod,
  isBookmarked,
  isBlurred,
  onSelect,
  onToggleBookmark,
}: GameBananaModCardProps) {
  const [revealed, setRevealed] = useState(false);
  const showingBlur = isBlurred && !revealed;
  const thumbnail = mod.preview_media.images[0];
  const thumbnailUrl = thumbnail
    ? `${thumbnail.base_url}/${thumbnail.file_220 ?? thumbnail.file}`
    : null;

  return (
    <div className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-xl border border-border text-left transition-all hover:border-primary/60 hover:shadow-lg">
      {/* A `div[role=button]`, not a real `<button>`: MatureContentShield renders its own
          real `<button>` reveal overlay inside this, and a `<button>` cannot validly nest
          inside another `<button>` — the browser would silently break the DOM apart. While
          still blurred, this wrapper is excluded from the tab order (`tabIndex={-1}`) and its
          own keyboard activation is disabled, so the shield's reveal button is the only
          focusable/activatable control here — avoiding two overlapping interactive elements
          answering to the same keypress. Once revealed, normal button semantics resume. */}
      <div
        role="button"
        tabIndex={showingBlur ? -1 : 0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (showingBlur) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`View ${mod.name}`}
      >
        <MatureContentShield
          isBlurred={isBlurred}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          className="h-full w-full"
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
        </MatureContentShield>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      </div>

      {/* Sits on the card rather than inside the shield, so it survives the reveal — once the
          blur is gone this is the only thing still marking the mod as mature. z-30 matches the
          bookmark button, above the shield's own z-20 overlay. */}
      {mod.is_mature && (
        <span className="pointer-events-none absolute top-2 left-2 z-30 border border-white/20 bg-background/80 px-1.5 py-px font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          18+
        </span>
      )}

      <Button
        type="button"
        variant={isBookmarked ? "default" : "secondary"}
        size="icon-sm"
        // z-30: above MatureContentShield's z-20 reveal overlay, so bookmarking a blurred
        // card never requires revealing it first.
        className="absolute top-2 right-2 z-30"
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
