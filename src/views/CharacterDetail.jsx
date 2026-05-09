import { useState } from "react";
import { ArrowLeft, Search } from "lucide-react";

import CharacterDetailHeader from '../components/character/CharacterDetailHeader';
import CharacterDetailGrid from '../components/character/CharacterDetailGrid';
import ConfirmDialog from '../components/modals/ConfirmDialog';
import { useAppStore } from "../store/useAppStore";
import { cn } from "../lib/utils";
import { useCharacterPortrait } from "../hooks/useCharacterPortrait";
import { Input } from "../components/ui/Input";
import { useCharacterDetailController } from "../hooks/useCharacterDetailController";

export default function CharacterDetail({
  character,
  onBack,
  hideHeader = false,
  searchQuery = "",
}) {
  const pushPage = useAppStore((state) => state.pushPage);
  const {
    game,
    mods,
    gbDataMap,
    installedModsInfo,
    disablingAll,
    modToDelete,
    showDeleteConfirm,
    localSearchQuery,
    setLocalSearchQuery,
    enabledCount,
    disabledCount,
    effectiveSearchQuery,
    handleToggle,
    handleDisableAll,
    handleOpenFolder,
    handleImport,
    handleInstallUpdate,
    handleAssign,
    handleDelete,
    confirmDelete,
    closeDeleteConfirm,
    reloadAllMods,
  } = useCharacterDetailController({
    character,
    hideHeader,
    searchQuery,
  });
  const portraitUrl = useCharacterPortrait(character.name, game.id);
  const [imgLoaded, setImgLoaded] = useState(false);
  if (!character) return null;

  return (
    <div
      className={cn(
        "flex flex-col h-full",
        !hideHeader && "animate-in fade-in duration-700",
      )}
    >
      {!hideHeader && (
        <section className="mb-6 z-10 relative">

          <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] shadow-[0_0_80px_rgba(0,0,0,0.5)]">
            {/* Character Portrait Background Fade */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[65%] overflow-hidden hidden md:flex select-none">
              {portraitUrl && (
                <img
                  src={portraitUrl}
                  alt={character.name}
                  onLoad={() => setImgLoaded(true)}
                  loading="lazy"
                  decoding="async"
                  className={cn(
                    "absolute right-12 top-0 h-full w-auto object-contain object-right transition-all duration-1000 ease-out z-0",
                    imgLoaded ? "opacity-60 blur-0" : "opacity-0 blur-xl",
                  )}
                />
              )}
              {/* Smooth left fade to blend into the dark background */}
              <div className="absolute inset-0 bg-linear-to-r from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent z-10" />
              {/* Bottom fade */}
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-[#0a0a0a] to-transparent z-10" />
            </div>

            <div className="relative z-20 px-8 py-10 md:p-14 md:w-3/4 lg:w-2/3">
              <CharacterDetailHeader
                game={game}
                character={character}
                mods={mods}
                disablingAll={disablingAll}
                enabledCount={enabledCount}
                disabledCount={disabledCount}
                onImport={handleImport}
                onDisableAll={handleDisableAll}
              />
            </div>
          </div>

          <section className="ui-panel mt-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="w-full xl:max-w-xl 2xl:max-w-2xl">
                <Input
                  icon={Search}
                  placeholder="Search this collection..."
                  value={localSearchQuery}
                  onChange={(e) => setLocalSearchQuery(e.target.value)}
                  className="rounded-2xl shadow-inner"
                />
              </div>
            </div>

            {localSearchQuery && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/6 pt-3">
                <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                  {localSearchQuery}
                </div>
              </div>
            )}
          </section>
        </section>
      )}

      {/* Mods Grid */}
      <CharacterDetailGrid
        mods={mods}
        searchQuery={effectiveSearchQuery}
        gbDataMap={gbDataMap}
        character={character}
        game={game}
        hideHeader={hideHeader}
        onSelectMod={(mod) => {
          pushPage({
            id: `mod-${mod._idRow || mod.id}`, // fallback to id if _idRow is undefined (local mod vs GB mod)
            component: 'ModDetail',
            props: {
              mod: mod,
              game,
              installedFileInfo: installedModsInfo[mod._idRow],
              preSelectedCharacter: character.name !== "Unassigned" ? character.name : "",
              isUpdating: mod.isUpdating,
              isLibraryContext: true,
              onInstall: handleInstallUpdate,
              onThumbnailChange: () => reloadAllMods(true)
            }
          });
        }}
        onToggle={handleToggle}
        onOpenFolder={handleOpenFolder}
        onAssign={handleAssign}
        onDelete={handleDelete}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Mod"
        message={`Are you sure you want to delete "${modToDelete?.name}"? This will move the mod folder to your computer's Recycle Bin.`}
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={closeDeleteConfirm}
      />
    </div>
  );
}
