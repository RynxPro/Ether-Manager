import { WallTag } from "@/components/WallTag";

interface PageHeaderProps {
  /** Placed before the title — in practice a back button, on the pages you arrive at from
   * somewhere else rather than from the sidebar. It belongs inside the band rather than above
   * it: a detail page's way out is part of its heading, not a separate row of chrome. */
  leading?: React.ReactNode;
  title: string;
  /** A short line of context beside the title. Optional, but most pages have something worth
   * saying that the title alone cannot carry. */
  subtitle?: string;
  /** Pushed to the right of the rule — a search box, a count, a page-level action. */
  children?: React.ReactNode;
  /** A single word sprayed on the wall behind the title — the section's own name, never user
   * content. Optional: pages that are a drill-down rather than a place say nothing here. */
  tag?: string;
  /** Whether the band pins to the top of the window as the page scrolls. On by default: it is
   * what says which page you are on, and on a sixty-card roster or a long feed that answer
   * scrolled away immediately.
   *
   * Browse opts out. Its header sits inside the wrapper an IntersectionObserver watches, so a
   * sticky band there would unpin the moment that wrapper left — and it already replaces itself
   * with a compact bar carrying the search and filters, which is worth more on that page than a
   * pinned title. Two pinned bars fighting over the same strip would be worse than either. */
  pinned?: boolean;
}

/** The band every top-level page starts with: the name in the display face, a quiet line of
 * context, and the accent rule that separates the page from its chrome.
 *
 * Extracted because it had drifted. Browse, Bookmarks and Downloads each carried their own copy
 * of it while Library, All Mods and Settings still had the plain sentence-case heading from
 * before the Eridu pass — so which page you were on changed how the app looked, for no reason
 * anyone chose. One definition means the next page cannot start out different either. */
export function PageHeader({
  leading,
  title,
  subtitle,
  children,
  tag,
  pinned = true,
}: PageHeaderProps) {
  // `-mt-6 pt-6` so the band paints right up to the top of the window while its contents keep
  // the same 24px gutter the page has everywhere else — without it the title's caps sit against
  // the window edge the moment it pins. Paired with `-top-6` (sticky measures from the scrolling
  // element's content box, and the page's scroller carries `p-6`) the pinned position is
  // pixel-for-pixel where the band already was, so it never appears to move at all. The
  // background is what the content passing underneath is hidden behind.
  //
  // `z-40` rather than `z-30`, and the gap matters: the mod gallery's arrows are `z-30` so they
  // can clear the mature shield, and at an equal z-index the winner is whichever comes later in
  // the DOM — which is the arrows. They rode over this bar on the way past. It has to outrank
  // everything it is meant to hide, not merely tie with it.
  // The band needs a visible bottom edge, and only when it is pinned.
  //
  // It used to get one for free from the full-width `border-b-2 border-primary` under the title.
  // That border was doing two jobs at once and only one of them was the tag: it also drew the
  // line the page scrolls beneath. Once the stroke moved to sit under the word alone, the band
  // and the page were the same colour with nothing between them — so cards slid under it and
  // were cut in half at an invisible boundary, which reads as broken rendering rather than as
  // content passing behind a bar.
  //
  // Deliberately `--border` and not the accent: the accent now means one thing in this app, and
  // a red line across the window is the exact element that was asked to go away. This is
  // structure, not emphasis.
  // `overflow-hidden` only matters once the band is pinned, and only because of the tag: it is
  // taller than the band it lives in, deliberately, so unpinned it spills past the bottom and gets
  // cut by whatever the page puts there. Pinned, that same overflow would ride over the scrolling
  // grid as a permanent red smear across the cards. Clipping at the band edge keeps the cut-off
  // look and confines it to the bar. Safe for the sprayed stroke, which sits inside `pb-5`.
  // `-mx-6 px-6` for the same reason as `-mt-6 pt-6`: the band has to paint the full width of the
  // scroller, not just its content box. The page's 24px gutters are outside that box, and cards
  // are wider than they look — an enabled one carries a 3px accent ring that sits *outside* its
  // border box. Scrolling past a band that stopped at the content edge, every ringed card drew a
  // red sliver down both sides of the bar. The contents keep the gutter they had.
  const pin = pinned
    ? "sticky -top-6 z-40 -mx-6 -mt-6 overflow-hidden border-b border-border bg-background px-6 pt-6"
    : "";

  return (
    // `relative` anchors the tag; the band is the only thing it is ever positioned against.
    <div className={`relative ${pin}`}>
      {/* Behind the title, and inside the pinned band on purpose.

          It used to sit in the page body, where two things went wrong at once: it scrolled away
          while the header stayed, and this band's opaque `bg-background` painted over it on the
          way past. Moving it in here fixes both — the tag now holds still with the title it
          belongs to, and the bar can no longer cover something it contains. */}
      {tag && <WallTag word={tag} />}
      {/* No minimum height. It briefly had one, to hold the tag and the title apart — but they are
          supposed to overlap, so all the extra height bought was a band of empty wall above the
          title. The band is exactly as tall as its own content now; the tag is free to run past
          the bottom of it and be clipped by whatever the page puts underneath, which is the
          effect it exists for. */}
      <div className="relative flex flex-wrap items-baseline gap-x-3 gap-y-2 pb-5">
        {/* `self-center` because the row aligns on the text baseline, which a control with no text
          of its own has no useful answer for. */}
        {leading && <div className="self-center">{leading}</div>}
        {/* The stroke belongs to the word, not to the window.

            Spanning the full width made it a divider with a jagged edge — which is what the
            border it replaced already was. Spray goes *under the name*: it starts where the word
            starts and stops where it stops, so it marks the title rather than separating two
            regions. That is the only reason this wrapper exists.

            Deliberately not rotated, unlike the mockup. Tilt reads as hand-placed at card width;
            across a page-wide element it just drops one end below the other and looks broken. */}
        <div className="relative min-w-0">
          {/* `break-words` for the titles that are not page names: a mod's is whatever its author
            typed, and GameBanana names are comma-joined runs the line breaker treats as one
            token — the same trap the featured panel's title hit. */}
          <h2 className="break-words font-heading text-[48px] uppercase leading-[0.9] tracking-[0.005em] text-foreground">
            {title}
          </h2>
          <span
            aria-hidden
            className="absolute inset-x-0 -bottom-2 h-2.5 bg-primary"
            style={{
              clipPath:
                "polygon(0 42%, 9% 8%, 26% 62%, 44% 12%, 63% 66%, 81% 16%, 100% 54%, 97% 100%, 3% 96%)",
            }}
          />
        </div>
        {subtitle && (
          <span className="font-heading text-[14px] uppercase tracking-[0.12em] text-muted-foreground/70">
            {subtitle}
          </span>
        )}
        {/* `ml-auto` on the wrapper rather than on each caller's control, so a page only has to
          say what goes on the right, not how to get it there. */}
        {children && (
          <div className="ml-auto flex items-center gap-3">{children}</div>
        )}
      </div>
    </div>
  );
}
