import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { findScrollParent } from "@/lib/scroll";
import { useDebounce } from "@/lib/useDebounce";
import { useSearchHotkey } from "@/lib/useSearchHotkey";
import type { GbMod, ModSort } from "@/lib/tauri-commands";
import { BrowseGrid } from "./BrowseGrid";
import { FeaturedBanner } from "./FeaturedBanner";
import { PageHeader } from "@/components/PageHeader";
import { SearchBar } from "./SearchBar";

const SEARCH_DEBOUNCE_MS = 300;

// Module scope, like the feed's scroll offset in BrowseGrid: leaving Browse unmounts it, and
// state does not survive that. Deliberately not persisted to disk — this is "carry on where you
// were within a sitting", not a preference that should greet you a week later.
let lastFilters: { query: string; categoryId: number | null; sort: ModSort } = {
  query: "",
  categoryId: null,
  sort: "LatestUpdated",
};

interface BrowseProps {
  /** Selecting a mod navigates to its detail page, owned by App — Browse no longer hosts a
   * detail dialog of its own. */
  onSelectMod: (mod: GbMod) => void;
}

export function Browse({ onSelectMod }: BrowseProps) {
  const [query, setQuery] = useState(lastFilters.query);
  const searchRef = useSearchHotkey(() => setQuery(""));
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const [categoryId, setCategoryId] = useState<number | null>(lastFilters.categoryId);
  const [sort, setSort] = useState<ModSort>(lastFilters.sort);

  // Remembering the position is only half of coming back to where you were: with the filters
  // reset, the feed you return to is a different one, so the saved offset is correctly refused
  // and you land at the top of results you did not ask for.
  useEffect(() => {
    lastFilters = { query, categoryId, sort };
  }, [query, categoryId, sort]);

  // The controls live in the header, which scrolls away — and with an endless feed below it,
  // it scrolls away for good. A slim bar takes over once it goes, rather than pinning the
  // header itself: it is five hundred pixels tall and would leave nothing to read.
  // Identifies the feed being shown. Doubles as BrowseGrid's remount key, so the two can never
  // disagree about what counts as "a different list".
  const filterKey = `${debouncedQuery.trim()}-${categoryId ?? "all"}-${sort}`;

  const headerRef = useRef<HTMLDivElement>(null);
  const [isHeaderOnScreen, setIsHeaderOnScreen] = useState(true);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new IntersectionObserver(([entry]) => setIsHeaderOnScreen(entry.isIntersecting));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const scrollToTop = () => {
    findScrollParent(headerRef.current)?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Changing a filter deep in the feed used to leave you at the same depth in a different list —
  // the scroll panel is shared and simply keeps its offset — and the feed then loaded page after
  // page just to reach it. A new list starts at the top.
  //
  // Done here rather than in the grid because it depends only on the filters, not on when the
  // results arrive; the grid's own attempt raced the fetch and lost.
  // Compares the filters rather than counting runs. A "skip the first run" flag cannot work
  // here: StrictMode invokes effects twice in development, so the first pass spent the flag and
  // the second scrolled for real — undoing the position BrowseGrid had just restored, which is
  // exactly what returning to an active search looked like. Comparing values is idempotent, so
  // running twice is indistinguishable from running once.
  const appliedFilters = useRef(filterKey);
  useEffect(() => {
    if (appliedFilters.current === filterKey) return;
    appliedFilters.current = filterKey;
    findScrollParent(headerRef.current)?.scrollTo({ top: 0 });
  }, [filterKey]);

  return (
    <div className="space-y-6">
      {/* Zero-height so it costs no layout, with the bar overflowing out of it — a sticky element
          that reserved its own space would push the header down by that much at rest.
          `-top-6` rather than `top-0`, because sticky pins to the scrolling element's padding
          box and the page's scroller carries `p-6`: `top-0` parked the bar 24px down and left a
          strip of feed showing above it. */}
      {!isHeaderOnScreen && (
        <div className="sticky -top-6 z-30 h-0">
          <div className="-mx-6 flex animate-in items-center gap-2 border-b-2 border-primary bg-background px-6 py-2.5 duration-200 slide-in-from-top-4">
            <SearchBar
              compact
              inputRef={searchRef}
              query={query}
              onQueryChange={setQuery}
              categoryId={categoryId}
              onCategoryChange={setCategoryId}
              sort={sort}
              onSortChange={setSort}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={scrollToTop}
              aria-label="Back to top"
            >
              <ArrowUp className="h-3.5 w-3.5" />
              Top
            </Button>
          </div>
        </div>
      )}

      {/* The ref sits on an unstyled wrapper rather than on anything drawn. Its only job is to
          tell the observer when the header has scrolled away, so the compact bar above can take
          over — it needs an element that leaves the viewport, not a box. */}
      <div ref={headerRef} className="space-y-4">
        {/* The same header every other page uses. It used to be a row inside the panel below,
            which left Browse the one page whose title was indented inside a border and whose
            accent rule was three rows further down — the panel's bottom edge, close enough to
            the results rule to read as a mistake rather than a division.

            The panel keeps the featured band and the controls together, which is what it was
            for: what is being shown off, and how you narrow it. The title was never part of
            that pairing. */}
        <PageHeader title="Browse" subtitle="GameBanana · Zenless Zone Zero" />

        <div className="border-2 border-border">
          <FeaturedBanner onSelectMod={onSelectMod} />

          <div className="border-t border-border px-4 py-3">
            <SearchBar
              // Only one of the two search inputs may hold the hotkey ref, or the second to mount
              // silently steals it — Ctrl+F would then focus whichever is off screen.
              inputRef={isHeaderOnScreen ? searchRef : undefined}
              query={query}
              onQueryChange={setQuery}
              categoryId={categoryId}
              onCategoryChange={setCategoryId}
              sort={sort}
              onSortChange={setSort}
            />
          </div>
        </div>
      </div>

      <BrowseGrid
        key={filterKey}
        query={debouncedQuery}
        categoryId={categoryId}
        sort={sort}
        onSelectMod={onSelectMod}
      />
    </div>
  );
}
