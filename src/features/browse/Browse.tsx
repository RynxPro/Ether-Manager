import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  /** A GameBanana category to open on, when you arrived from a character page. Overrides the
   * remembered filters, including the remembered search text: asking for more Nicole mods and
   * landing on last week's search for "dress", narrowed to Nicole, is not what was asked for. */
  seedCategoryId?: number | null;
  /** Called once the seed has been applied, so it is spent rather than standing. Browse is
   * unmounted every time a result is opened and remounted on the way back; without this, that
   * return trip would re-apply the character and undo any filter changed since. */
  onSeedConsumed?: () => void;
}

export function Browse({
  onSelectMod,
  seedCategoryId = null,
  onSeedConsumed,
}: BrowseProps) {
  const isSeeded = seedCategoryId !== null;
  const [query, setQuery] = useState(isSeeded ? "" : lastFilters.query);
  const searchRef = useSearchHotkey(() => setQuery(""));
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const [categoryId, setCategoryId] = useState<number | null>(
    isSeeded ? seedCategoryId : lastFilters.categoryId,
  );
  const [sort, setSort] = useState<ModSort>(lastFilters.sort);

  // Spent on mount, not on every render — the state above already carries it, and leaving it
  // standing would make it fire again on the way back from a mod's page. Running twice under
  // StrictMode is harmless: clearing an already-cleared seed is the same as clearing it once.
  useEffect(() => {
    if (isSeeded) onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only, by design
  }, []);

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
    const observer = new IntersectionObserver(([entry]) =>
      setIsHeaderOnScreen(entry.isIntersecting),
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const scrollToTop = () => {
    findScrollParent(headerRef.current)?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
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
          {/* Wall, not paper. It was `bg-card`, which is exactly what the controls standing on
              it are made of — so the search field had no edge against its own container and
              read as loose text with a magnifier next to it. A strip pinned across the whole
              window is not a slap anyway; it is a piece of wall that stays put while the feed
              moves behind it, and the 2px rule is what stops it dissolving into the cards
              scrolling underneath. */}
          <div className="-mx-6 flex animate-in items-center gap-2.5 border-b-2 border-border bg-background px-6 py-3 duration-200 slide-in-from-top-4">
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
            <button
              type="button"
              onClick={scrollToTop}
              aria-label="Back to top"
              className="flex h-9 shrink-0 items-center gap-1.5 bg-primary px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-primary-foreground shadow-slap transition-[translate] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowUp className="h-3.5 w-3.5" />
              Top
            </button>
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
        <PageHeader
          title="Browse"
          // The app's own word for what kind of page this is, sprayed on the wall behind the
          // title. Browse was the last page without one.
          tag="Browse"
          subtitle="GameBanana · Zenless Zone Zero"
          pinned={false}
        />

        {/* No container. The banner and the controls were sealed inside one bordered box, which
            was the last thing in the app holding two unrelated objects together in a frame —
            what is shown off, and how you narrow it, are not the same thought. They are two
            things on the wall now, and the gap between them says so. */}
        <FeaturedBanner onSelectMod={onSelectMod} />

        <div>
          <SearchBar
            // Only one of the two search inputs may hold the hotkey ref, or the second to
            // mount silently steals it — Ctrl+F would then focus whichever is off screen.
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
