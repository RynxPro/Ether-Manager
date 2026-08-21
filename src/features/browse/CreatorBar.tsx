import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CreatorBookmark } from "@/lib/tauri-commands";

interface CreatorBarProps {
  creators: CreatorBookmark[];
  onSelectCreator: (id: number, name: string) => void;
}

/** The creators you follow, across the top of Bookmarks.
 *
 * A single fixed-height row rather than a grid or a tab, and the measurement is why: main
 * content is 1696px, a cell is 132px, so eleven creators fit before anything scrolls at all.
 * For a realistic follow list this is simply a row — the horizontal scroll is an escape hatch
 * for the rare large collection, not the everyday mechanic. It also never grows, so the mod
 * grid below (the reason the page is open) is never pushed down as the list gets longer.
 *
 * Renders nothing at all when you follow nobody. An empty labelled band on every visit is worse
 * than no band. */
export function CreatorBar({ creators, onSelectCreator }: CreatorBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Whether anything is hidden past the right edge, and whether the track has been scrolled off
  // its left. Both drive an affordance that must not appear when it would be a lie — a permanent
  // arrow on a four-creator bar claims there is more to see.
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      // A pixel of slack: fractional widths mean scrollLeft never quite reaches the exact
      // maximum, which would leave the arrow showing at the true end of the list.
      const maxScroll = track.scrollWidth - track.clientWidth;
      setCanScrollRight(track.scrollLeft < maxScroll - 1);
      setCanScrollLeft(track.scrollLeft > 1);
    };

    measure();
    track.addEventListener("scroll", measure, { passive: true });
    // The window is resizable, and going narrow can turn a bar that fitted into one that does
    // not. ResizeObserver rather than a window listener: the sidebar and page padding mean the
    // track's own width is what matters, not the window's.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [creators.length]);

  // A wheel mouse has no horizontal axis, and this is a desktop app — without this the creators
  // past the edge are unreachable except by dragging, which is how horizontal rails usually fail
  // on Windows. Trackpads send `deltaX` themselves and are left alone.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaX !== 0) return;
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll <= 0) return;
      // Only claim the wheel when this bar can actually act on it. At either end the page
      // should keep scrolling underneath rather than the gesture dying here.
      const atStart = track.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = track.scrollLeft >= maxScroll - 1 && event.deltaY > 0;
      if (atStart || atEnd) return;
      event.preventDefault();
      track.scrollLeft += event.deltaY;
    };

    // Not passive: this one deliberately calls `preventDefault`, and a passive listener may not.
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, [creators.length]);

  const scrollByPage = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    // Just under a full width, so the cell at the edge stays on screen as an anchor rather than
    // the view jumping to a stretch you have not seen any of.
    track.scrollBy({ left: direction * (track.clientWidth - 140), behavior: "smooth" });
  };

  if (creators.length === 0) return null;

  return (
    <div className="relative border-2 border-border bg-card">
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="font-heading text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
          Creators
        </span>
        <span className="border border-border px-1.5 text-[10px] tabular-nums text-muted-foreground">
          {creators.length}
        </span>
      </div>

      <div
        ref={trackRef}
        // The scrollbar is hidden through `.creator-track` in global.css, alongside the app's
        // other scrollbar rules. The row is ~100px tall and a 10px bar beneath it would spend a
        // tenth of the band reporting what the fade already reports.
        className="creator-track flex overflow-x-auto overflow-y-hidden px-3 pt-2 pb-3"
      >
        {creators.map((creator) => (
          <button
            key={creator.gamebanana_member_id}
            type="button"
            onClick={() =>
              onSelectCreator(creator.gamebanana_member_id, creator.name)
            }
            title={`${creator.name} — ${creator.mod_count} ${
              creator.mod_count === 1 ? "mod" : "mods"
            }`}
            className="group flex w-[132px] shrink-0 flex-col items-center gap-1.5 border-r border-border px-1.5 py-2 last:border-r-0"
          >
            {creator.avatar_url ? (
              <img
                src={creator.avatar_url}
                alt=""
                className="h-14 w-14 border-2 border-border object-cover group-hover:border-primary"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center border-2 border-border bg-secondary font-heading text-xl text-muted-foreground group-hover:border-primary">
                {(creator.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="max-w-[116px] truncate font-heading text-[11px] tracking-[0.02em] group-hover:text-primary">
              {creator.name}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {creator.mod_count} {creator.mod_count === 1 ? "mod" : "mods"}
            </span>
          </button>
        ))}
      </div>

      {/* Both edges are marked only while something is actually hidden that way. The fade sits
          below the header row so it never washes over the "Creators" label. */}
      {canScrollLeft && (
        <>
          <div className="pointer-events-none absolute bottom-0.5 left-0.5 top-7 w-16 bg-gradient-to-r from-card to-transparent" />
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label="Show earlier creators"
            className="absolute left-2 top-[58%] flex h-7 w-7 -translate-y-1/2 items-center justify-center border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
        </>
      )}
      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute bottom-0.5 right-0.5 top-7 w-16 bg-gradient-to-l from-card to-transparent" />
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label="Show more creators"
            className="absolute right-2 top-[58%] flex h-7 w-7 -translate-y-1/2 items-center justify-center border border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
