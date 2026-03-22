import LibraryModCard from "./LibraryModCard";
import { getAllCharacterNames } from "../lib/portraits";

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
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-12">
      {mods
        .filter(
          (m) =>
            !searchQuery ||
            m.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
        .map((mod) => {
          const gbData = mod.gamebananaId
            ? gbDataMap[mod.gamebananaId]
            : undefined;
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
        })}
    </div>
  );
}
