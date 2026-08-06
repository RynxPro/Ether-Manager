import { useState } from "react";
import type { GbFile, GbMod } from "@/lib/tauri-commands";
import { BrowseGrid } from "./BrowseGrid";
import { InstallConfirmDialog } from "./InstallConfirmDialog";
import { ModDetailDialog } from "./ModDetailDialog";
import { SearchBar } from "./SearchBar";

export function Browse() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [selectedMod, setSelectedMod] = useState<GbMod | null>(null);
  const [installFile, setInstallFile] = useState<GbFile | null>(null);

  return (
    <div className="space-y-6">
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
      />

      <BrowseGrid
        key={`${query.trim()}-${categoryId ?? "all"}`}
        query={query}
        categoryId={categoryId}
        onSelectMod={setSelectedMod}
      />

      <ModDetailDialog
        mod={selectedMod}
        onOpenChange={(open) => {
          if (!open) setSelectedMod(null);
        }}
        onInstall={setInstallFile}
      />

      {selectedMod && installFile && (
        <InstallConfirmDialog
          key={`${selectedMod.id}-${installFile.id}`}
          mod={selectedMod}
          file={installFile}
          onOpenChange={(open) => {
            if (!open) setInstallFile(null);
          }}
          onInstalled={() => {
            setInstallFile(null);
            setSelectedMod(null);
          }}
        />
      )}
    </div>
  );
}
