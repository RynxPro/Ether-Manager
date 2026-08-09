import { useState } from "react";
import { useDebounce } from "@/lib/useDebounce";
import type { GbFile, GbMod, GbModDetail, ModSort } from "@/lib/tauri-commands";
import { BrowseGrid } from "./BrowseGrid";
import { FeaturedBanner } from "./FeaturedBanner";
import { InstallConfirmDialog } from "./InstallConfirmDialog";
import { ModDetailDialog } from "./ModDetailDialog";
import { SearchBar } from "./SearchBar";

const SEARCH_DEBOUNCE_MS = 300;

export function Browse() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sort, setSort] = useState<ModSort>("LatestUpdated");
  const [selectedMod, setSelectedMod] = useState<GbMod | null>(null);
  const [installFile, setInstallFile] = useState<GbFile | null>(null);
  const [installDetail, setInstallDetail] = useState<GbModDetail | null>(null);

  return (
    <div className="space-y-6">
      <FeaturedBanner onSelectMod={setSelectedMod} />

      <SearchBar
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
        onSelectMod={setSelectedMod}
      />

      <ModDetailDialog
        // Keyed by mod id so React remounts (and resets local state — `revealed`,
        // `activeImageIndex`) on every mod change, regardless of which path closed the
        // previous dialog. `onInstalled` below closes it via `setSelectedMod(null)` directly
        // rather than through Radix's `onOpenChange`, so relying on the dialog's own
        // close-handler reset alone let a mature-content reveal leak across mods.
        key={selectedMod?.id ?? "none"}
        mod={selectedMod}
        onOpenChange={(open) => {
          if (!open) setSelectedMod(null);
        }}
        onInstall={(file, detail) => {
          setInstallFile(file);
          setInstallDetail(detail);
        }}
      />

      {installFile && installDetail && (
        <InstallConfirmDialog
          key={`${installDetail.id}-${installFile.id}`}
          detail={installDetail}
          file={installFile}
          onOpenChange={(open) => {
            if (!open) {
              setInstallFile(null);
              setInstallDetail(null);
            }
          }}
          onInstalled={() => {
            setInstallFile(null);
            setInstallDetail(null);
            setSelectedMod(null);
          }}
        />
      )}
    </div>
  );
}
