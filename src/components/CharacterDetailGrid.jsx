import LibraryModCard from "./LibraryModCard";
import { getAllCharacterNames } from "../lib/portraits";
import { StatePanel } from "./ui/StatePanel";

export default function CharacterDetailGrid({
  mods,
  searchQuery,
  gbDataMap,
  character,
  game,
  hideHeader,
  onSelectMod,
  onToggle,
  onOpenFolder,
  onAssign,
  onDelete,
}) {
  const filteredMods = mods.filter(
    (m) =>
      !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const activeMods = filteredMods.filter((mod) => mod.isEnabled);
  const disabledMods = filteredMods.filter((mod) => !mod.isEnabled);

  const renderModCard = (mod) => {
    const gbData = mod.gamebananaId ? gbDataMap[mod.gamebananaId] : undefined;
    let hasUpdate = false;

    if (gbData?.fullData && mod.installedAt) {
      const installedDate = new Date(mod.installedAt).getTime() / 1000;
      if (gbData.fullData._tsDateUpdated > installedDate + 300) {
        hasUpdate = true;
      }
    }

    const cardGbData = gbData ? { ...gbData, hasUpdate } : undefined;

    return (
      <LibraryModCard
        key={mod.originalFolderName}
        mod={mod}
        gbData={cardGbData}
        isUnassignedMode={character.name === "Unassigned"}
        characters={getAllCharacterNames(game.id)}
        gameId={game.id}
        onClick={() => {
          if (gbData?.fullData) {
            onSelectMod({
              ...gbData.fullData,
              isUpdating: hasUpdate,
              localMod: mod,
            });
          }
        }}
        onToggle={onToggle}
        onOpenFolder={onOpenFolder}
        onAssign={onAssign}
        onDelete={onDelete}
        hideCategoryTag={hideHeader}
      />
    );
  };

  const renderSection = (title, count, sectionMods) => {
    if (sectionMods.length === 0) return null;

    return (
      <section className="mb-8 last:mb-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-text-primary">
            {title}
          </h2>
          <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
            {count}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          {sectionMods.map(renderModCard)}
        </div>
      </section>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
          {filteredMods.length} visible
        </div>
        {searchQuery && (
          <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
            {searchQuery}
          </div>
        )}
      </div>

      {filteredMods.length === 0 ? (
        <StatePanel
          title={searchQuery ? "No matching mods" : "No mods in this collection"}
          message={
            searchQuery
              ? "Try a broader search or clear the filter."
              : "Import a mod or move one into this collection."
          }
          className="mb-12"
        />
      ) : (
        <div className="pb-12">
          {renderSection("Active Mods", activeMods.length, activeMods)}
          {renderSection("Disabled Mods", disabledMods.length, disabledMods)}
        </div>
      )}
    </>
  );
}
