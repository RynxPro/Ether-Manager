import { useState } from "react";
import { useDebounce } from "@/lib/useDebounce";
import { useSearchHotkey } from "@/lib/useSearchHotkey";
import type { GbMod, ModSort } from "@/lib/tauri-commands";
import { BrowseGrid } from "./BrowseGrid";
import { FeaturedBanner } from "./FeaturedBanner";
import { SearchBar } from "./SearchBar";

const SEARCH_DEBOUNCE_MS = 300;

interface BrowseProps {
  /** Selecting a mod navigates to its detail page, owned by App — Browse no longer hosts a
   * detail dialog of its own. */
  onSelectMod: (mod: GbMod) => void;
}

export function Browse({ onSelectMod }: BrowseProps) {
  const [query, setQuery] = useState("");
  const searchRef = useSearchHotkey(() => setQuery(""));
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sort, setSort] = useState<ModSort>("LatestUpdated");

  return (
    <div className="space-y-6">
      {/* The title, the featured band and the controls are one bordered header rather than three
          blocks stacked with air between them. They belong together — what is being shown off
          and how you narrow it — and closing the block with the accent rule makes that rule a
          real division between the header and the results rather than a stray underline. */}
      <div className="border-2 border-border border-b-primary">
        <div className="flex items-baseline gap-3 border-b border-border px-4 py-3">
          <h2 className="font-heading text-2xl uppercase tracking-[0.06em] text-foreground">
            Browse
          </h2>
          <span className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
            GameBanana · Zenless Zone Zero
          </span>
        </div>

        <FeaturedBanner onSelectMod={onSelectMod} />

        <div className="border-t border-border px-4 py-3">
          <SearchBar
            inputRef={searchRef}
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
        key={`${debouncedQuery.trim()}-${categoryId ?? "all"}-${sort}`}
        query={debouncedQuery}
        categoryId={categoryId}
        sort={sort}
        onSelectMod={onSelectMod}
      />
    </div>
  );
}
