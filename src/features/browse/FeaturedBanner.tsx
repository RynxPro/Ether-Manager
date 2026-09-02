import { Bookmark, ChevronLeft, ChevronRight, Clock, Eye, ThumbsUp } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { MatureContentShield } from "@/components/MatureContentShield";
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

/** How far off true each cell of the picker sits. A short repeating set rather than `tiltFor`,
 * which is keyed on an id: the six cells sit side by side in one row, so "hand-placed" needs the
 * angles to alternate rather than land wherever two mod ids happen to hash. */
const RAIL_TILT = [-0.6, 0.5, -0.4, 0.55, -0.5, 0.4];

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
        categoryName: mod.sub_category?.name ?? mod.root_category.name,
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[572px] w-full" />
        <div className="grid grid-cols-6 gap-4 pt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[142px]" />
          ))}
        </div>
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
    <div
      // Held while the pointer is over the band, and while anything inside it has keyboard
      // focus. Without this the slide can change out from under a click — you reach for
      // "View mod" on the mod you were reading about and open a different one. Focus is
      // captured too so tabbing to Bookmark does not start a race against the clock.
      onMouseEnter={() => setIsHeld(true)}
      onMouseLeave={() => setIsHeld(false)}
      onFocusCapture={() => setIsHeld(true)}
      onBlurCapture={() => setIsHeld(false)}
    >
      {/* The hero, built from the character page's band part for part: a well with a blurred
          copy of the art behind the sharp one, a two-axis scrim running to the well's own
          colour rather than to black, and the words laid straight on the picture.

          That last part is the whole reason this looks different from a card. "Nothing on the
          picture" is a rule for cards in a grid, where the thumbnail is what you are judging
          and a badge over it costs you the judgement. A 380px hero is not judged from a
          thumbnail, and the app's other hero has always put the name on the art. */}
      <div className="relative border-2 border-border bg-card p-[5px] shadow-slap-lift [rotate:-0.2deg]">
        {/* 560, not 380. A mod preview is a 16:9 screenshot; this well is the full content
            width, so at 380px it was a 4.3:1 letterbox and `object-cover` kept 42% of the
            picture's height and binned the rest — measured on a 2560×1440 upload. The old
            two-column band cropped less precisely because its art pane was narrower, which is
            the trade a full-bleed hero gives up. Height is the only lever left, and it takes
            the survival rate from 42% to about 61%. */}
        <div className="relative h-[560px] overflow-hidden bg-art">
          {/* Behind the picture rather than beside it: a mod preview is a screenshot of
              whatever shape its author took, and a blurred blow-up of itself fills the well
              without cropping the subject or letting the art end against bare board. */}
          {heroUrl && (
            <img
              src={heroUrl}
              alt=""
              aria-hidden
              // Only ever visible where the picture does not reach, which with `cover` is
              // nowhere — the safety net for an upload narrower than the well, not a
              // design element. Back to the character page's values for that reason.
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-3xl brightness-[.5] saturate-50"
            />
          )}

          {/* The art opens the mod. It is the largest thing on the page and it was inert once,
              which left an 80px button as the only way in to something being sold by a 380px
              picture — and the picture is what you point at.

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
            className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {/* Controlled, because the wrapper above needs the same answer: an uncontrolled
                shield would reveal visually while leaving the art permanently untabbable. It
                also replaces an older `key={mod.id}` remount, which re-blurred a slide every
                time the band came back round to it — the band cycles all six in about forty
                seconds, so that quietly undid the reader's choice on every lap. */}
            <MatureContentShield
              isBlurred={isBlurred}
              revealed={revealedIds.has(mod.id)}
              onReveal={() => reveal(mod.id)}
              className="h-full w-full"
            >
              {heroUrl ? (
                // `cover`, and the geometry leaves no third option. At the full content width
                // this well is 2.9:1 and a mod preview is 16:9, so the picture either fills
                // the band and loses some height, or keeps every pixel and leaves half the
                // band as blurred filler. Both were tried against the real feed and the empty
                // side is worse: a hero whose left half is out-of-focus nothing reads as an
                // image that failed to load, where a cropped hero just reads as a hero.
                //
                // 560px is what makes the crop bearable — about 61% of a 16:9 upload
                // survives, against 42% at the 380px this started at. Framed above centre
                // because these are character renders and the head is the part worth keeping
                // when something has to go.
                <img
                  src={heroUrl}
                  alt=""
                  className="h-full w-full object-cover object-[50%_32%]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-art font-heading text-6xl text-muted-foreground/30">
                  {mod.name.charAt(0)}
                </div>
              )}
            </MatureContentShield>
          </div>

          {/* One axis, not two. The character page's hero ramps horizontally as well because
              its text sits mid-height against a wide banner; here every word is stacked at the
              foot of the well, so the vertical ramp already covers all of it and the horizontal
              one was doing nothing but staining a third of the picture — darker in Night,
              paler in Daylight, and obvious either way.

              It runs to the well's own colour rather than to black, which is what keeps this
              reading as a recess in board instead of a gradient laid over a photograph, and is
              why it works in Daylight where a black scrim would be a bruise.
              `pointer-events-none` so the art underneath stays the click target. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{
              background:
                "linear-gradient(transparent 40%, color-mix(in srgb, var(--art) 55%, transparent) 68%, color-mix(in srgb, var(--art) 88%, transparent))",
            }}
          />

          {/* Siblings of the clickable art rather than children of it: nested inside, every
              chevron press would also open the mod, and stopping propagation on each is a rule
              that has to be remembered next time one is added. Above the shield's own overlay,
              so the band stays navigable without revealing anything. */}
          {/* Both arrows together in the top-right corner rather than one down each side.
              Centred on the edges they sat at the same height as the claim, and the left one
              overlapped it by 20px — measured, not guessed — clipping "TOP THIS WEEK" to "OP
              THIS WEEK". The text block owns the bottom-left of this well, so the opposite
              corner is the one place a control can go without negotiating with it. */}
          {hasSlidesToPick && (
            <div className="absolute right-3 top-3 z-30 flex gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous featured mod"
                className="flex h-10 w-10 rotate-[-1.5deg] items-center justify-center bg-card text-card-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next featured mod"
                className="flex h-10 w-10 rotate-[1.5deg] items-center justify-center bg-card text-card-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* The words hang off the bottom edge, which is what stops a 380px band reading as a
              caption floating in the middle of a picture. `pointer-events-none` on the block so
              the art behind it stays clickable; the two controls take their events back. */}
          <div className="pointer-events-none absolute inset-0 z-[3] flex flex-col justify-end p-6">
            {/* The claim, made the way the page's own title is made: the display face with the
                accent sprayed under the word rather than ruled across it. Six windows that all
                just said "popular" would leave no idea why the same mod is not on every slide,
                so the band states which window this is. */}
            <span className="relative inline-block self-start">
              <span
                aria-hidden
                className="absolute right-[-9px] bottom-[-6px] left-[-5px] z-[1] h-3 bg-primary/90"
                style={{
                  clipPath:
                    "polygon(0 42%, 9% 8%, 26% 62%, 44% 12%, 63% 66%, 81% 16%, 100% 54%, 97% 100%, 3% 96%)",
                }}
              />
              <span className="relative z-[2] font-heading text-[34px] uppercase leading-[0.9] tracking-[0.005em] text-foreground">
                {periodLabel.headline}
              </span>
            </span>

            {/* Clamped because GameBanana names run long, and broken because those names are
                comma-joined runs the line breaker treats as one token. */}
            <h3 className="mt-4 line-clamp-2 max-w-[680px] break-words font-heading text-[32px] uppercase leading-[0.98] tracking-[0.005em] text-foreground">
              {mod.name}
            </h3>

            <div className="mt-3 flex items-center gap-2.5">
              {mod.submitter.avatar_url ? (
                <img
                  src={mod.submitter.avatar_url}
                  alt=""
                  className="h-7 w-7 shrink-0 border-2 border-border object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-border bg-art font-heading text-[12px] text-muted-foreground">
                  {(mod.submitter.name || "?").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate font-mono text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
                by <span className="text-foreground">{mod.submitter.name}</span>
                {category ? ` · ${category}` : ""}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              {/* Icon-led and at a size meant to be read, matching the browse card below: the
                  glyph does the labelling that a 9px caption cannot. */}
              <span className="flex items-center gap-6">
                <span className="flex items-center gap-2" title="Likes">
                  <ThumbsUp className="h-[19px] w-[19px] shrink-0 text-primary" />
                  <span className="font-heading text-[24px] leading-none tabular-nums text-foreground">
                    {mod.like_count.toLocaleString()}
                  </span>
                </span>
                <span className="flex items-center gap-2" title="Views">
                  <Eye className="h-[19px] w-[19px] shrink-0 text-primary" />
                  <span className="font-heading text-[24px] leading-none tabular-nums text-foreground">
                    {mod.view_count.toLocaleString()}
                  </span>
                </span>
                <span className="flex items-center gap-2" title="Updated">
                  <Clock className="h-[19px] w-[19px] shrink-0 text-primary" />
                  <span className="font-heading text-[24px] leading-none text-foreground">
                    {updatedLabel(mod.date_modified)}
                  </span>
                </span>
              </span>

              <span className="pointer-events-auto flex gap-2.5">
                <button
                  type="button"
                  onClick={() => onSelectMod(mod)}
                  className="flex h-[42px] rotate-[-0.6deg] items-center bg-primary px-6 font-sign text-[20px] uppercase tracking-[0.1em] text-primary-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  View mod
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleBookmark(mod)}
                  aria-label={
                    isBookmarked ? `Remove ${mod.name} from bookmarks` : `Bookmark ${mod.name}`
                  }
                  className={`flex h-[42px] rotate-[0.5deg] items-center gap-2 px-5 font-sign text-[20px] uppercase tracking-[0.1em] shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 focus-visible:ring-2 focus-visible:ring-primary ${
                    isBookmarked
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-card-foreground"
                  }`}
                >
                  <Bookmark className="h-4 w-4" fill={isBookmarked ? "currentColor" : "none"} />
                  {isBookmarked ? "Bookmarked" : "Bookmark"}
                </button>
              </span>
            </div>
          </div>
        </div>

        {/* The slide clock, inside the print's own margin so it reads as part of the object
            rather than a bar under it. Keyed on the slide so choosing a window by hand restarts
            it. The row stays even with nothing to count down — the other half of its job is
            closing the picture off, and art ending in bare board looks broken either way. */}
        <div className="mt-[5px] h-[3px] bg-primary/20">
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

      {/* The picker: the same print the grid below is made of, at a smaller size. A rail of
          unlabelled thumbnails said how many there were and where you were; these say what you
          would be switching to *and* which window it won, which is the only reason these six
          mods are together at all.

          `pt-7` because each print's period tag hangs off its top corner onto the wall — the
          browse card's rule, and the same reason `BROWSE_GRID` has a taller row gap. */}
      {hasSlidesToPick && (
        <div className="grid grid-cols-6 gap-4 pt-7">
          {slides.map((slide, i) => {
            const record = slide.record;
            const railUrl = railUrlFor(record);
            // Reveals count here too, or uncovering the hero would leave that same mod blurred
            // in the rail directly beneath it — one picture uncovered, its own thumbnail not,
            // which reads as the reveal having half-failed.
            const isRecordBlurred =
              shouldBlur(visibility, record.is_mature) && !revealedIds.has(record.id);
            const isActive = i === activeIndex;
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${PERIOD_LABELS[slide.period].headline}: ${record.name}`}
                aria-current={isActive}
                style={{ "--tilt": `${RAIL_TILT[i % RAIL_TILT.length]}deg` } as CSSProperties}
                className={`group/rail relative flex rotate-[var(--tilt)] flex-col border-2 bg-card p-1 pb-0 text-left shadow-slap-lift transition-[rotate,translate,border-color] duration-200 hover:-translate-y-0.5 hover:rotate-0 ${
                  isActive ? "border-primary" : "border-border hover:border-primary"
                }`}
              >
                {/* Off the picture and onto the wall, like the browse card's NSFW tag — and
                    filled with the accent when live, which is how "chosen" is said everywhere
                    else in this app. */}
                <span
                  // Same 200ms as the cell's border, or the two disagree for a fifth of a
                  // second on every slide change: the tag would snap to the accent while the
                  // outgoing cell's border was still fading out of it, painting two live cells
                  // at once. Caught in a screenshot, not in a measurement — a single DOM read
                  // samples one instant and never sees a transition.
                  className={`pointer-events-none absolute -left-[9px] bottom-full mb-[3px] -rotate-[3deg] px-2 py-px font-sign text-[14px] uppercase tracking-[0.09em] shadow-slap transition-colors duration-200 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-card-foreground"
                  }`}
                >
                  {PERIOD_LABELS[slide.period].headline.replace(/^Top /, "")}
                </span>
                <span className="relative block aspect-[5/3] w-full overflow-hidden bg-art">
                  {railUrl ? (
                    <img
                      src={railUrl}
                      alt=""
                      className={`h-full w-full object-cover transition ${
                        isActive ? "" : "brightness-[.55] group-hover/rail:brightness-100"
                      } ${isRecordBlurred ? "blur-[5px]" : ""}`}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-art font-heading text-lg text-muted-foreground/40">
                      {record.name.charAt(0)}
                    </span>
                  )}
                </span>
                {/* Two lines reserved whether the name fills them or not, so every cell is the
                    same height and the rail cannot go ragged — the same fix the browse card
                    needed. */}
                <span className="line-clamp-2 h-[30px] px-0.5 py-1.5 font-heading text-[13px] uppercase leading-[1.04] tracking-[0.005em] text-foreground">
                  {record.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
