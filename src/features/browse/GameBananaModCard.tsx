import { Bookmark, Download, Eye, ThumbsUp } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { tiltFor } from "@/lib/tilt";
import type { GbMod } from "@/lib/tauri-commands";

interface GameBananaModCardProps {
  mod: GbMod;
  isBookmarked: boolean;
  isBlurred: boolean;
  /** How many library entries came from this GameBanana mod. 0 hides the tag entirely. */
  installedCount: number;
  onSelect: () => void;
  onToggleBookmark: () => void;
}

/** A mod you do not own yet, as a print on the wall.
 *
 * Built from the library card's parts — the 2px edge, the 5px print margin, the recessed `bg-art`
 * well, the id-derived tilt — but it answers a different question, and that difference is the
 * whole design. A library card says *what you own*; this one has to say *whether an unfamiliar
 * mod is worth installing*, and that is carried by its numbers and by who made it.
 *
 * Two rules it follows that the library's cards do not need:
 *
 * **Nothing sits on the picture.** The mature tag, the installed tag and the bookmark all used to
 * float on the art. On the one surface where the picture is the entire pitch — you are judging
 * something you have never seen — covering it to say "NSFW" spends the thing you came for. The
 * tags hang off the card's top corners onto the wall; the bookmark moved down beside the name.
 * The shield's blur is the one exception, because obscuring the picture is its whole job.
 *
 * **The name box is exactly two lines tall, filled or not.** `line-clamp` alone caps the maximum
 * without reserving the space, so a one-line name pulled the rule and the figures up by 19px and
 * no two neighbouring cards agreed on where their numbers were. Reserving the second line puts
 * every stat at the same offset on every card, which is what makes a column of them scannable
 * rather than merely present.
 *
 * The stats themselves are icon-led, at a size meant to be read: the glyph does the labelling a
 * 9px caption cannot, downloads leads at 25px because on a mod manager it is the count that says
 * how many people actually installed this, and likes and views follow at 15px with grey glyphs.
 */
export function GameBananaModCard({
  mod,
  isBookmarked,
  isBlurred,
  installedCount,
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
  // Who the mod is for. GameBanana files character skins under the character's own name as the
  // sub-category and leaves UI and Other/Misc at the root — so the fallback is not a guess, it is
  // the same name the category filter uses.
  const filedUnder = mod.sub_category?.name ?? mod.root_category.name;

  return (
    <div
      style={{ "--tilt": `${tiltFor(mod.id)}deg` } as CSSProperties}
      // Rotated whole rather than on a paper layer beneath. `PaperTilt` exists for objects that
      // are mostly type and buys them crisp glyphs; a card that is mostly picture cannot use it,
      // because a photograph sitting square inside a slanted mount reads as a mistake. Same trade
      // `ModCard` and `CharacterCard` already make.
      className="group relative flex rotate-[var(--tilt)] flex-col border-2 border-border bg-card p-[5px] pb-0 text-left shadow-slap-lift transition-[rotate,translate,border-color] duration-200 hover:-translate-y-0.5 hover:rotate-0 hover:border-primary"
    >
      {/* Both tags hang off the card's top corners onto the wall — `bottom-full` rather than a
          pixel offset, so they clear the art whatever size the type is. An inset value cannot
          work here: the print margin is 5px and the tag is 20px tall, so anything tucked inside
          still crosses the picture. See `BROWSE_GRID`, whose row gap exists to hold them. */}
      {mod.is_mature && (
        <span className="pointer-events-none absolute -left-[9px] bottom-full mb-[3px] -rotate-[3.5deg] bg-destructive px-2 py-px font-sign text-[15px] uppercase tracking-[0.09em] text-white shadow-slap">
          NSFW
        </span>
      )}
      {/* Green rather than the accent: this is "you already have this", a fact about your
          library, not something asking to be acted on — and the accent is reserved for what
          wants a click. */}
      {installedCount > 0 && (
        <span className="pointer-events-none absolute -right-[9px] bottom-full mb-[3px] rotate-[3deg] bg-success px-2 py-px font-sign text-[14px] uppercase tracking-[0.09em] text-card shadow-slap">
          {installedCount > 1 ? `Installed ×${installedCount}` : "Installed"}
        </span>
      )}

      {/* 4:3, not the roster's 3:4. GameBanana previews are landscape without exception, and a
          portrait frame was discarding most of every one of them. Still taller than the library
          card's 16:10, so Browse stays denser and the two surfaces do not collapse into the same
          shape. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-art">
        {/* A `div[role=button]`, not a real `<button>`: MatureContentShield renders its own real
            `<button>` reveal overlay inside this, and a `<button>` cannot validly nest inside
            another `<button>` — the browser would silently break the DOM apart. While still
            blurred, this wrapper is excluded from the tab order (`tabIndex={-1}`) and its own
            keyboard activation is disabled, so the shield's reveal button is the only
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
          className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`View ${mod.name}`}
        >
          {/* Controlled, because this card also needs to know: `showingBlur` drives the wrapper's
              tabIndex, so an uncontrolled shield would reveal visually while leaving the card
              permanently out of the tab order. */}
          <MatureContentShield
            isBlurred={isBlurred}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            className="h-full w-full"
          >
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-art font-heading text-3xl text-muted-foreground/40">
                {mod.name.charAt(0)}
              </div>
            )}
          </MatureContentShield>
        </div>
      </div>

      <div className="px-1 pb-3 pt-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {/* `h-[39px]` is two lines at 19px/1.02, and it is a height rather than a max: see
                the note on this component. Reserved whether the name fills it or not. */}
            <p
              className="line-clamp-2 h-[39px] break-words font-heading text-[19px] uppercase leading-[1.02] tracking-[0.005em] text-foreground"
              title={mod.name}
            >
              {mod.name}
            </p>
            {/* The maker, with their face on it. Two facts the card used to hold and never
                showed: who it is for, and who made it. */}
            <div className="mt-1.5 flex items-center gap-1.5">
              {mod.submitter.avatar_url ? (
                <img
                  src={mod.submitter.avatar_url}
                  alt=""
                  className="h-[22px] w-[22px] shrink-0 border-2 border-border object-cover"
                />
              ) : (
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center border-2 border-border bg-art font-heading text-[11px] text-muted-foreground">
                  {(mod.submitter.name || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 truncate font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                <span className="text-card-foreground">{filedUnder}</span> · by{" "}
                {mod.submitter.name}
              </span>
            </div>
          </div>
          {/* Off the art and onto the stock, as a slap. It is the only control on the card
              besides the picture itself. */}
          <button
            type="button"
            onClick={onToggleBookmark}
            aria-label={
              isBookmarked ? `Remove ${mod.name} from bookmarks` : `Bookmark ${mod.name}`
            }
            className={`flex h-[26px] w-[26px] shrink-0 rotate-[2deg] items-center justify-center shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:ring-2 focus-visible:ring-primary ${
              isBookmarked
                ? "bg-primary text-primary-foreground"
                : "bg-background text-card-foreground"
            }`}
          >
            <Bookmark
              className="h-3.5 w-3.5"
              fill={isBookmarked ? "currentColor" : "none"}
            />
          </button>
        </div>

        {/* Full-bleed to the card's inner edges (`-mx-[9px]` cancels this block's 4px and the
            card's 5px), because a rule that reaches the edge divides the object while one that
            stops short is just an underline on some text. Tabular figures so the numbers line up
            in a column down the grid. */}
        <div className="-mx-[9px] mt-3 flex items-center gap-4 border-t-2 border-border px-[9px] pt-2.5">
          {/* Downloads leads. Rendered only when known — GameBanana's list endpoints do not carry
              it, so a failed enrichment call leaves it null and the stat drops out rather than
              reading `0`. */}
          {mod.download_count !== null && (
            <span className="flex items-center gap-1.5" title="Downloads">
              <Download className="h-[17px] w-[17px] shrink-0 text-primary" />
              <span className="font-heading text-[25px] leading-none tabular-nums tracking-[0.01em] text-foreground">
                {mod.download_count.toLocaleString()}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1.5" title="Likes">
            <ThumbsUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-heading text-[15px] leading-none tabular-nums tracking-[0.01em] text-foreground">
              {mod.like_count.toLocaleString()}
            </span>
          </span>
          <span className="flex items-center gap-1.5" title="Views">
            <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-heading text-[15px] leading-none tabular-nums tracking-[0.01em] text-foreground">
              {mod.view_count.toLocaleString()}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
