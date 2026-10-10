import type { LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

/** A verb on an empty state. Callers add the fill: accent for the way out of the emptiness,
 * `bg-background` for the second-best thing to do. */
export const EMPTY_SLAB =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 px-4 font-sign text-[18px] uppercase tracking-[0.1em] shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** One sentence saying how the emptiness ends. Not a description of the emptiness — that is
   * the title's job, and saying it twice is how these turn into paragraphs nobody reads. */
  say: string;
  /** The way out, as one or two slabs. Omitted where there is genuinely nothing to press: an
   * idle download queue is the normal condition of that page, not a problem to solve. */
  action?: React.ReactNode;
  /** `page` when the whole page is empty: centred in the space it owns, which is the fix for
   * what these used to do — sit in the top-left corner of seventeen hundred pixels of nothing.
   *
   * `section` when a part of a populated page is empty, such as one slot on a character page.
   * The same object laid on its side, because a section that is empty inside a page that is
   * not should not shout as loud as a whole empty page. */
  density?: "page" | "section";
  /** A line in the hand, under the verb. For the one or two places where the app has something
   * to say rather than something to report. */
  note?: string;
}

/** What a surface shows when it has nothing to show.
 *
 * There were three unrelated answers to this before: a board on four pages, a full-width dashed
 * strip on the character page, and a bare grey sentence in Browse — plus drift inside the board
 * family, which had two title sizes, two different muted greys and a border on four of its six
 * uses. One object now, in two sizes.
 *
 * Two faults they all shared, fixed here. They were pinned to the top-left of whatever space
 * they were given, which on a wide window reads as a layout that lost its contents rather than
 * as an answer — so this centres. And every one of them described the way out in words while
 * giving you nothing to press, so this takes a verb. */
export function EmptyState({
  icon: Icon,
  title,
  say,
  action,
  density = "page",
  note,
}: EmptyStateProps) {
  const box = useRef<HTMLDivElement>(null);
  /** How far left to slide the sheet so its middle is the window’s middle rather than its
   * container’s. Measured rather than hard-coded: the number is the sidebar’s width minus the
   * page’s right gutter, and neither of those belongs to this component. */
  const [nudge, setNudge] = useState(0);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    function measure() {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setNudge(Math.round(window.innerWidth / 2 - (rect.x + rect.width / 2)));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (density === "section") {
    return (
      <div className="flex w-full justify-center py-1">
        <div className="flex w-full max-w-[640px] -rotate-[0.35deg] items-center gap-4 border-2 border-border bg-card px-4 py-3.5 shadow-slap-lift">
          <span className="flex h-10 w-10 shrink-0 -rotate-[3deg] items-center justify-center border-2 border-border bg-background shadow-slap">
            <Icon className="h-[19px] w-[19px] text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[21px] uppercase leading-none tracking-[0.005em] text-card-foreground">
              {title}
            </p>
            <p className="mt-1.5 font-mono text-[10.5px] font-bold uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
              {say}
            </p>
          </div>
          {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    );
  }

  return (
    // Tall enough to be the middle of something rather than a block near the top, capped so it
    // does not push itself off a short window. The top padding is what the pinned tile hangs
    // into; without it the tile is the first thing clipped by a scroll container.
    <div
      ref={box}
      className="flex min-h-[clamp(340px,64vh,760px)] w-full items-center justify-center px-6 py-10"
    >
      <div
        // Centred on the window, not on the column. The sidebar shares the content’s ground
        // — no panel, no border, no background — so there is no edge for the eye to measure
        // from, and the whole window reads as one surface. Centring inside the content column
        // put this a hundred pixels right of where it looks like the middle.
        style={nudge ? { translate: `${nudge}px` } : undefined}
        className="relative w-full max-w-[400px] -rotate-[0.5deg] border-2 border-border bg-card px-7 pt-9 pb-7 text-center shadow-slap-lift">
        {/* The icon on its own square of paper, pinned over the top edge — the one thing on this
            object that is not flat against it. A glyph sitting loose on the card was the old
            version, and it read as decoration rather than as a label for what is missing. */}
        <span className="absolute -top-6 left-1/2 flex h-[52px] w-[52px] -translate-x-1/2 rotate-[3.5deg] items-center justify-center border-2 border-border bg-background shadow-slap">
          <Icon className="h-6 w-6 text-primary" />
        </span>

        <p className="font-heading text-[30px] uppercase leading-[0.95] tracking-[0.005em] text-card-foreground">
          {title}
        </p>
        <p className="mx-auto mt-3 max-w-[34ch] font-mono text-[11px] font-bold uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
          {say}
        </p>
        {action && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>
        )}
        {note && (
          <p className="mt-3.5 -rotate-[1.4deg] font-hand text-[14px] text-primary">{note}</p>
        )}
      </div>
    </div>
  );
}
