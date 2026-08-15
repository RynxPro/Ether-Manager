import { Bookmark, Download, Eye, ThumbsUp } from "lucide-react";
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

/** A search result, in the same language as the library cards: art on top, a meta strip below,
 * cut corner, yellow on hover. It carries what you need to judge a mod you do not own yet —
 * popularity, whether it is bookmarked, whether it is mature — where the library's own cards
 * carry what you need to manage one you do. */
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
  // `file_220` is 220px on its long edge. That was adequate when these cards were 190px wide;
  // they are now wider than the image itself, so it was being upscaled and arrived soft. The
  // 530px rendering covers the card at 2x and still costs a fraction of the original upload,
  // which on GameBanana is routinely a multi-megabyte screenshot.
  const thumbnailUrl = thumbnail
    ? `${thumbnail.base_url}/${thumbnail.file_530 ?? thumbnail.file_220 ?? thumbnail.file}`
    : null;

  return (
    <div
      // The cut corner is Eridu's signature and cannot come from a border-radius.
      style={{
        clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)",
      }}
      className="group relative flex flex-col border-2 border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary"
    >
      {/* 4:3, not the roster's 3:4. GameBanana previews are landscape without exception, and a
          portrait frame was discarding most of every one of them — on the surface where the
          picture is the entire pitch, because you are judging a mod you have never seen. Still
          taller than the library card's 16:10, so Browse stays denser and the two surfaces do
          not collapse into the same shape. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
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
          {/* Controlled, because this card also needs to know: `showingBlur` drives the
              wrapper's tabIndex, so an uncontrolled shield would reveal visually while leaving
              the card permanently out of the tab order. */}
          <MatureContentShield
            isBlurred={isBlurred}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            className="h-full w-full"
          >
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-secondary font-heading text-3xl font-semibold text-muted-foreground/50">
                {mod.name.charAt(0)}
              </div>
            )}
          </MatureContentShield>
        </div>

        {/* Sits on the card rather than inside the shield, so it survives the reveal — once the
            blur is gone this is the only thing still marking the mod as mature. z-30 matches the
            bookmark button, above the shield's own z-20 overlay. */}
        {mod.is_mature && (
          <span className="pointer-events-none absolute top-1.5 left-1.5 z-30 border border-destructive/70 bg-background/80 px-1.5 py-px font-heading text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive">
            NSFW
          </span>
        )}

        <Button
          type="button"
          variant={isBookmarked ? "default" : "secondary"}
          size="icon-sm"
          // z-30: above MatureContentShield's z-20 reveal overlay, so bookmarking a blurred
          // card never requires revealing it first.
          className="absolute top-1.5 right-1.5 z-30"
          onClick={onToggleBookmark}
          aria-label={isBookmarked ? `Remove ${mod.name} from bookmarks` : `Bookmark ${mod.name}`}
        >
          <Bookmark className="h-3.5 w-3.5" fill={isBookmarked ? "currentColor" : "none"} />
        </Button>
      </div>

      {/* Below the art rather than overlaid on a gradient: the name stays readable whatever the
          thumbnail happens to be, and the stats form a scannable column down the grid. */}
      <div className="border-t-2 border-t-border bg-background px-2.5 pb-2 pt-1.5 group-hover:border-t-primary">
        <p
          className="truncate font-heading text-[13px] font-semibold uppercase tracking-wide text-foreground"
          title={mod.name}
        >
          {mod.name}
        </p>
        <div className="flex items-center gap-2.5 text-[11px] tabular-nums text-muted-foreground/70">
          {/* Downloads lead: on a mod manager it is the one count that says how many people
              actually installed this, which is the question you are asking of a card. Rendered
              only when known — GameBanana's list endpoints do not carry it, so a failed
              enrichment call leaves it null and the stat drops out rather than reading `0`. */}
          {mod.download_count !== null && (
            <span className="flex items-center gap-1" title="Downloads">
              <Download className="h-3 w-3" />
              {mod.download_count.toLocaleString()}
            </span>
          )}
          <span className="flex items-center gap-1" title="Likes">
            <ThumbsUp className="h-3 w-3" />
            {mod.like_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-1" title="Views">
            <Eye className="h-3 w-3" />
            {mod.view_count.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
