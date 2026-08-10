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
      <h2 className="text-2xl font-semibold text-foreground">Browse</h2>

      <FeaturedBanner onSelectMod={onSelectMod} />

      <SearchBar
        inputRef={searchRef}
        query={query}
        onQueryChange={setQuery}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        sort={sort}
        onSortChange={setSort}
      />

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
