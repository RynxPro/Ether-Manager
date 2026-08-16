import { Bookmark, ChevronLeft, ChevronRight, Clock, Eye, ThumbsUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatureContentVisibility } from "@/features/settings/hooks";
import { shouldBlur } from "@/lib/mature";
import { updatedLabel } from "@/lib/time";
import type { GbMod } from "@/lib/tauri-commands";
import { useAddBookmark, useBookmarks, useFeaturedMods, useRemoveBookmark } from "./hooks";
import type { FeaturedPeriod } from "@/lib/tauri-commands";

interface FeaturedBannerProps {
  onSelectMod: (mod: GbMod) => void;
}

/** How long a slide holds before the band moves on. Long enough to read the name, the author
 * and the three stats without hurrying — a banner that turns over faster than it can be read is
 * just movement. */
const SLIDE_DURATION_MS = 7000;

/** Two labels per window, because the two places they appear have very different room. The
 * header states the claim in full; the rail cell only has to be enough to pick by, sitting in a
 * ~110px column over artwork. */
const PERIOD_LABELS: Record<FeaturedPeriod, { headline: string; tag: string }> = {
  today: { headline: "Top today", tag: "1D" },
  week: { headline: "Top this week", tag: "1W" },
  month: { headline: "Top this month", tag: "1M" },
  "6month": { headline: "Top 6 months", tag: "6M" },
  year: { headline: "Top this year", tag: "1Y" },
  alltime: { headline: "Top all time", tag: "ALL" },
};

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

/** The rail cells are around 110px wide, so the smallest pre-rendered size is more than
 * enough — six original uploads would be megabytes of art nobody looks at closely. */
function railUrlFor(mod: GbMod): string | null {
  const image = mod.preview_media.images[0];
  if (!image) return null;
  return `${image.base_url}/${image.file_220 ?? image.file}`;
}

/** A fixed carousel above the search bar — not affected by the search/filter/sort controls
 * below it. Each slide is the mod that topped one of GameBanana's ranking windows, widening as
 * you go: today, this week, this month, six months, this year, all time.
 *
 * Six slots off a single "most liked" list was the previous version, and the problem with it
 * was that all-time popularity is nearly static — the same mods sat there for weeks, so the band
 * stopped being worth looking at. Ranking by window means the first slides turn over daily while
 * the last ones stay the classics. */
export function FeaturedBanner({ onSelectMod }: FeaturedBannerProps) {
  const { data: featured, isLoading } = useFeaturedMods();
  const { data: bookmarks } = useBookmarks();
  const { data: visibility } = useMatureContentVisibility();
  const addBookmark = useAddBookmark();
  const removeBookmark = useRemoveBookmark();
  const [index, setIndex] = useState(0);
  const [isHeld, setIsHeld] = useState(false);
  // Every mod revealed so far, not just the last one. A single id looks sufficient because the
  // band shows one slide at a time, but the rail shows all six at once — and revealing a second
  // mod would then silently re-blur the first, undoing a choice the reader had already made.
  // Ids rather than indices: the list can come back shorter, and an index would then point at
  // a different mod than the one that was uncovered.
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<number>>(() => new Set());

  function reveal(modId: number) {
    setRevealedIds((current) => new Set(current).add(modId));
  }

  const slides = featured ?? [];
  const records = slides.map((slide) => slide.record);

  // Results arrive after the first render, and can shrink when the API returns fewer than
  // expected — clamp rather than letting the index point past the end at nothing.
  useEffect(() => {
    if (records.length > 0 && index >= records.length) setIndex(0);
  }, [records.length, index]);

  // No timer lives here: the progress bar below *is* the clock, and its `onAnimationEnd` is what
  // advances the band. A `setTimeout` running alongside an animated bar is two clocks that drift
  // apart the moment either is paused — this way pausing the bar pauses the band by definition,
  // and it resumes from exactly where the bar stopped rather than restarting a hidden countdown.

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

  const activeIndex = Math.min(index, records.length - 1);
  const mod = records[activeIndex];
  const periodLabel = PERIOD_LABELS[slides[activeIndex].period];
  const heroUrl = heroUrlFor(mod);
  const isBlurred = shouldBlur(visibility, mod.is_mature);
  // Still covered right now, as opposed to merely flagged: this is what decides whether a click
  // on the art reveals it or opens it, and the two must never both answer the same press.
  const showingBlur = isBlurred && !revealedIds.has(mod.id);
  const isBookmarked = bookmarkedIds.has(mod.id);
  // The sub-category is the character the mod is for, which is the more useful of the two;
  // the root category ("Skins", "Other/Misc") is the fallback when it has none.
  const category = mod.sub_category?.name ?? mod.root_category.name;
  const step = (delta: number) =>
    setIndex((current) => (current + delta + records.length) % records.length);
  // A band of one is not a carousel: the picker, the arrows and the clock all describe moving
  // between slides, and with nothing to move to they are furniture that implies a control.
  // Under Hide this is the normal case, not an edge one — GameBanana's ZZZ top charts are
  // almost entirely mature, so most windows have no eligible winner at all.
  const hasSlidesToPick = records.length > 1;

  return (
    // Art and text in separate columns rather than text laid over the picture. Overlaying meant
    // the band had to be tall enough to hold both, which is what made a full-bleed hero enormous
    // — here the art pane is narrower, so its shape is closer to a preview's and it crops less
    // at a fraction of the height. The third column is the picker: a fixed rail rather than a
    // fraction, because its cells only ever need to be recognisable, not readable.
    <div
      // The clock is a second row rather than a wrapper around the band, so the three columns
      // and the bar stay siblings in one grid.
      className={`grid grid-rows-[420px_2px] ${
        hasSlidesToPick ? "grid-cols-[1.35fr_1fr_118px]" : "grid-cols-[1.35fr_1fr]"
      }`}
      // Held while the pointer is over the band, and while anything inside it has keyboard
      // focus. Without this the slide can change out from under a click — you reach for
      // "View mod" on the mod you were reading about and open a different one. Focus is
      // captured too so tabbing to Bookmark does not start a race against the clock.
      onMouseEnter={() => setIsHeld(true)}
      onMouseLeave={() => setIsHeld(false)}
      onFocusCapture={() => setIsHeld(true)}
      onBlurCapture={() => setIsHeld(false)}
    >
      <div className="relative overflow-hidden bg-secondary">
        {/* The art opens the mod. It is the largest thing on the page and it was inert, which
            left an 80px button as the only way in to something being sold by a 420px picture —
            and the picture is what you point at.

            A `div[role=button]`, not a real `<button>`, for the same reason as
            GameBananaModCard: MatureContentShield renders its own `<button>` inside this, and
            buttons cannot validly nest. While blurred, this wrapper leaves the tab order and
            stops answering keys, so the reveal button is the only control here. */}
        <div
          role="button"
          tabIndex={showingBlur ? -1 : 0}
          onClick={() => {
            if (showingBlur) return;
            onSelectMod(mod);
          }}
          onKeyDown={(event) => {
            if (showingBlur) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectMod(mod);
            }
          }}
          aria-label={`View ${mod.name}`}
          className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* Controlled, because the wrapper above needs the same answer: an uncontrolled
              shield would reveal visually while leaving the art permanently untabbable. It also
              replaces the old `key={mod.id}` remount, which re-blurred a slide every time the
              band came back round to it — the band cycles all six in about forty seconds, so
              that quietly undid the reader's choice on every lap. Tracking ids reveals exactly
              the mods that were asked for and nothing else. */}
          <MatureContentShield
            isBlurred={isBlurred}
            revealed={revealedIds.has(mod.id)}
            onReveal={() => reveal(mod.id)}
            className="h-full w-full"
          >
            {heroUrl ? (
              <img src={heroUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-secondary font-heading text-6xl text-muted-foreground/30">
                {mod.name.charAt(0)}
              </div>
            )}
          </MatureContentShield>
        </div>

        {/* Siblings of the clickable art rather than children of it: nested inside, every
            chevron press would also open the mod, and stopping propagation on each is a rule
            that has to be remembered next time one is added. z-30 keeps them above both the
            art wrapper and the shield's reveal overlay, so the carousel stays navigable
            without revealing anything. */}
        {hasSlidesToPick && (
          <>
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
          </>
        )}
      </div>

      {/* The panel is banded rather than a single centred stack. A block of text floating in
          the middle of a large box was the whole problem — every band here spans the full
          width and is bounded by a rule, so the panel reads as built rather than as leftover
          space that text happens to sit in. */}
      <div className="flex flex-col overflow-hidden border-l-2 border-border bg-card">
        {/* The header is a solid accent bar rather than accent text on the card. It gives the
            panel a hard edge to start from, and it is the one place the accent can be filled
            without competing with the artwork beside it. */}
        <div className="flex items-center justify-between bg-primary px-6 py-3 text-primary-foreground">
          {/* The header now names the slide's claim rather than the band's. It has to: six
              windows that all just said "popular" would leave the reader with no idea why the
              same mod is not on every slide. */}
          <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.16em]">
            {periodLabel.headline}
          </p>
          <p className="font-heading text-[10px] font-semibold tabular-nums tracking-[0.16em]">
            {String(activeIndex + 1).padStart(2, "0")} / {String(records.length).padStart(2, "0")}
          </p>
        </div>

        {/* `z-2` makes this a stacking context so the outlined numeral's negative z-index stays
            inside it — painting above the panel's own background but behind this text. */}
        <div className="relative z-[2] flex flex-1 flex-col justify-center px-6">
          {/* The carousel position at display size, drawn as outline only. Kept fully inside
              the panel — bled off the edge it read as a clipping bug rather than a device.
              The stroke is neutral, not accent: a saturated yellow at low alpha composites to
              olive over this surface, and the accent is already spending itself on the header
              bar and the stat values. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-5 -z-10 -translate-y-1/2 font-heading text-[200px] leading-[0.8] tracking-[-0.05em] tabular-nums"
            style={{
              color: "transparent",
              WebkitTextStroke: "2px rgba(255,255,255,.10)",
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          {/* h3 is deliberately outside the `h1, h2` base rule, so the heading face is applied
              here rather than inherited. Clamped because GameBanana names run long, and broken
              because those names are comma-joined runs the line breaker treats as one token. */}
          <h3 className="line-clamp-3 break-words font-heading text-3xl uppercase leading-[1.05] tracking-[0.02em]">
            {mod.name}
          </h3>
          <div className="mt-3 flex items-center gap-2">
            {mod.submitter.avatar_url && (
              <img
                src={mod.submitter.avatar_url}
                alt=""
                className="h-5 w-5 shrink-0 object-cover"
              />
            )}
            <span className="truncate text-xs text-muted-foreground">by {mod.submitter.name}</span>
          </div>
          {category && (
            <span className="mt-4 self-start border border-border px-2 py-0.5 font-heading text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {category}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
          <Stat icon={ThumbsUp} value={mod.like_count.toLocaleString()} label="likes" />
          <Stat icon={Eye} value={mod.view_count.toLocaleString()} label="views" />
          <Stat icon={Clock} value={updatedLabel(mod.date_modified)} label="updated" />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">
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
      </div>

      {/* The picker. A row of dots said how many there were and where you were; the rail says
          the same thing and also shows what you would be switching to, which is the only
          question worth answering on a page made of pictures. Recessed surface so it reads as
          a control strip attached to the band rather than a third piece of content. */}
      <div
        className={`flex-col gap-1.5 overflow-hidden border-l-2 border-border bg-sidebar p-1.5 ${
          hasSlidesToPick ? "flex" : "hidden"
        }`}
      >
        {slides.map((slide, i) => {
          const record = slide.record;
          const railUrl = railUrlFor(record);
          // Reveals count here too, or uncovering the hero would leave that same mod blurred in
          // the rail directly beside it — one picture uncovered, its own thumbnail not, which
          // reads as the reveal having half-failed. Cells for mods that were never revealed
          // stay covered.
          const isRecordBlurred =
            shouldBlur(visibility, record.is_mature) && !revealedIds.has(record.id);
          const isActive = i === activeIndex;
          const tag = PERIOD_LABELS[slide.period].tag;
          return (
            <button
              key={record.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${PERIOD_LABELS[slide.period].headline}: ${record.name}`}
              aria-current={isActive}
              // A fixed shape rather than `flex-1`. Dividing the band's height between the
              // cells only looks right at the full six: at two it produced a pair of 200px
              // panels, and at one a single 420px column of stretched artwork that read as a
              // layout fault. 5/3 is what six cells work out to in this column anyway, so the
              // usual case is unchanged and a short rail simply ends early.
              className={`group/rail relative aspect-[5/3] flex-none overflow-hidden border-2 transition-colors ${
                isActive ? "border-primary" : "border-transparent hover:border-muted-foreground"
              }`}
            >
              {railUrl ? (
                <img
                  src={railUrl}
                  alt=""
                  // Everything but the current one is dimmed, so the rail reads as one lit cell
                  // in a column rather than six previews competing with the hero beside them.
                  className={`h-full w-full object-cover transition ${
                    isActive ? "" : "brightness-[.45] group-hover/rail:brightness-90"
                  } ${isRecordBlurred ? "blur-[5px]" : ""}`}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-secondary font-heading text-lg text-muted-foreground/40">
                  {record.name.charAt(0)}
                </span>
              )}
              {/* Without this the rail is six unexplained pictures. The window is the only
                  reason these six mods are together, so each cell has to say which one it is —
                  and that turns the rail from a position indicator into a period picker. */}
              <span
                className={`absolute top-0 left-0 px-1 py-px font-heading text-[9px] font-semibold uppercase tracking-[0.08em] tabular-nums ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/85 text-muted-foreground"
                }`}
              >
                {tag}
              </span>
            </button>
          );
        })}
      </div>

      {/* The slide clock, spanning the whole band rather than sitting inside the panel. At full
          width it doubles as the rule that closes the band off — art that ends in open space
          reads as broken, art cut by a line reads as framed — so the countdown and the boundary
          are the same 2px. Keyed on the slide so choosing a window by hand restarts it. */}
      {/* The row stays even with nothing to count down, because the other half of its job is
          closing the band off — a single slide ending in open space is the same broken-looking
          edge, clock or no clock. Only the moving fill is conditional. */}
      <div className={`bg-primary/20 ${hasSlidesToPick ? "col-span-3" : "col-span-2"}`}>
        {hasSlidesToPick && (
          <div
            key={activeIndex}
            className="h-full w-full origin-left bg-primary"
            style={{
              animation: `featured-progress ${SLIDE_DURATION_MS}ms linear`,
              animationPlayState: isHeld ? "paused" : "running",
            }}
            onAnimationEnd={() => setIndex((current) => (current + 1) % records.length)}
          />
        )}
      </div>
    </div>
  );
}

interface StatProps {
  icon: LucideIcon;
  value: string;
  label: string;
}

/** One cell of the panel's stats strip. The strip is a divided grid rather than a row of
 * gapped spans so the cells reach the panel's edges — the point of the band is that it is
 * bounded, and a gapped row leaves the last value stranded in open space. */
function Stat({ icon: Icon, value, label }: StatProps) {
  return (
    <div className="px-5 py-3 first:pl-6">
      <span className="flex items-center gap-1.5 font-heading text-lg tabular-nums text-primary">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{value}</span>
      </span>
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </div>
  );
}
