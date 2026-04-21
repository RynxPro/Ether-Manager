import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Search } from "lucide-react";
import ModDetailModal from "../components/ModDetailModal";
import CharacterDetailHeader from "../components/CharacterDetailHeader";
import CharacterDetailGrid from "../components/CharacterDetailGrid";
import ConfirmDialog from "../components/ConfirmDialog";
import { useFetchCache } from "../hooks/useFetchCache";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { cn } from "../lib/utils";
import { isModInCollection } from "../lib/modClassification";
import { useCharacterPortrait } from "../hooks/useCharacterPortrait";
import { Input } from "../components/ui/Input";

export default function CharacterDetail({
  character,
  onBack,
  hideHeader = false,
  searchQuery = "",
}) {
  const game = useAppStore((state) => state.activeGame);
  const addDownload = useAppStore((state) => state.addDownload);
  const completeDownload = useAppStore((state) => state.completeDownload);
  const portraitUrl = useCharacterPortrait(character.name, game.id);
  // Removed old useState for mods
  const [imgLoaded, setImgLoaded] = useState(false);
  const [gbDataMap, setGbDataMap] = useState({});
  const [selectedMod, setSelectedMod] = useState(null);
  const [installedModsInfo, setInstalledModsInfo] = useState({});
  const [modToDelete, setModToDelete] = useState(null);
  const [disablingAll, setDisablingAll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState("");

  // Use fetch cache hook to avoid redundant GameBanana API calls
  const { fetchMod } = useFetchCache();

  // Use standard hook but keep local mods state for the filtered character
  const { mods: allMods, loadMods: reloadAllMods } = useLoadGameMods(
    game.id,
    true,
  );
  const [mods, setMods] = useState([]);

  const loadMods = useCallback(async () => {
    if (allMods && allMods.length > 0) {
      const charMods = allMods.filter((m) =>
        isModInCollection(m, character.name),
      );
      charMods.sort((a, b) => {
        if (a.isEnabled === b.isEnabled) return a.name.localeCompare(b.name);
        return a.isEnabled ? -1 : 1;
      });
      setMods(charMods);

      // Fetch GameBanana data for mods that have a gamebananaId
      const gbIds = [
        ...new Set(
          charMods.filter((m) => m.gamebananaId).map((m) => m.gamebananaId),
        ),
      ];
      if (gbIds.length > 0) {
        const results = await Promise.allSettled(
          gbIds.map((id) => fetchMod(id)),
        );
        const map = {};
        results.forEach((res, i) => {
          if (res.status === "fulfilled" && res.value.success) {
            const gbMod = res.value.data;
            const gbId = gbIds[i];
            map[gbId] = {
              thumbnailUrl: gbMod.thumbnailUrl,
              fullData: gbMod,
            };
          }
        });
        setGbDataMap(map);
      }

      // Build installedModsInfo
      const infoMap = {};
      charMods.forEach((m) => {
        if (m.gamebananaId != null) {
          if (!infoMap[m.gamebananaId]) {
            infoMap[m.gamebananaId] = { installedFiles: [] };
          }
          if (m.installedFile) {
            const exists = infoMap[m.gamebananaId].installedFiles.find(
              (f) => f.fileName === m.installedFile,
            );
            if (!exists) {
              infoMap[m.gamebananaId].installedFiles.push({
                fileName: m.installedFile,
                installedAt: m.installedAt,
              });
            }
          }
        }
      });
      setInstalledModsInfo(infoMap);
    } else {
      setMods([]);
    }
  }, [allMods, character.name, fetchMod]);

  useEffect(() => {
    loadMods();
  }, [loadMods]);

  const handleToggle = useCallback(
    async (mod, enable) => {
      if (window.electronConfig && window.electronMods) {
        // Optimistically update local state first
        setMods((prevMods) =>
          prevMods.map((m) =>
            m.originalFolderName === mod.originalFolderName
              ? { ...m, isEnabled: enable }
              : m,
          ),
        );

        try {
          const config = await window.electronConfig.getConfig();
          const importerPath = config[game.id];

          const result = await window.electronMods.toggleMod({
            importerPath,
            originalFolderName: mod.originalFolderName,
            enable,
          });

          if (result.success) {
            // Update with the actual result from server
            setMods((prevMods) =>
              prevMods.map((m) =>
                m.originalFolderName === mod.originalFolderName
                  ? {
                      ...m,
                      isEnabled: enable,
                      originalFolderName:
                        result.newFolderName || mod.originalFolderName,
                    }
                  : m,
              ),
            );
            // Flush global cache to ensure other views see this toggle
            await reloadAllMods(true);
          } else {
            // Revert optimistic update on failure
            setMods((prevMods) =>
              prevMods.map((m) =>
                m.originalFolderName === mod.originalFolderName
                  ? { ...m, isEnabled: !enable }
                  : m,
              ),
            );
            console.error("Failed to toggle mod:", result.error);
            alert(`Failed to toggle mod: ${result.error}`);
          }
        } catch (error) {
          // Revert optimistic update on error
          setMods((prevMods) =>
            prevMods.map((m) =>
              m.originalFolderName === mod.originalFolderName
                ? { ...m, isEnabled: !enable }
                : m,
            ),
          );
          console.error("Failed to toggle mod:", error);
          alert(`Failed to toggle mod: ${error.message}`);
        }
      }
    },
    [game.id, reloadAllMods],
  );

  const handleDisableAll = useCallback(async () => {
    const enabledMods = mods.filter((m) => m.isEnabled);
    if (enabledMods.length === 0) return;
    setDisablingAll(true);
    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      const results = await Promise.all(
        enabledMods.map((mod) =>
          window.electronMods.toggleMod({
            importerPath,
            originalFolderName: mod.originalFolderName,
            enable: false,
          }),
        ),
      );

      const failures = results.filter((r) => !r.success);
      if (failures.length > 0) {
        alert(
          `Failed to disable ${failures.length} mod(s).\n\n` +
            `This usually happens if the game is currently open and locking the files. ` +
            `Please close the game and try again.`,
        );
      }

      await reloadAllMods(true);
    } finally {
      setDisablingAll(false);
    }
  }, [game.id, mods, reloadAllMods]);

  const handleOpenFolder = useCallback(async (mod) => {
    if (window.electronMods) {
      await window.electronMods.openFolder(mod.path);
    }
  }, []);

  const handleImport = async () => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];

      const result = await window.electronMods.importMod({
        importerPath,
        characterName: character.name,
        gameId: game.id,
      });

      if (result && result.success) {
        await reloadAllMods(true);
      } else if (result && !result.canceled) {
        alert(result.error || "Failed to import mod.");
      }
    }
  };

  const handleInstallUpdate = async ({
    characterName,
    gbModId,
    fileUrl,
    fileName,
    modName,
  }) => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (!importerPath) throw new Error("No importer path configured.");

      addDownload({ id: gbModId, title: modName || fileName });

      void (async () => {
        try {
          const result = await window.electronMods.installGbMod({
            importerPath,
            characterName,
            gbModId,
            fileUrl,
            fileName,
            gameId: game.id,
          });

          completeDownload(gbModId, result.success, result.error);

          if (!result.success) {
            return;
          }

          // Update local state so badge shows immediately
          setInstalledModsInfo((prev) => {
            const current = prev[gbModId] || { installedFiles: [] };
            if (current.installedFiles.find((f) => f.fileName === fileName)) {
              return prev;
            }
            return {
              ...prev,
              [gbModId]: {
                ...current,
                installedFiles: [
                  ...current.installedFiles,
                  { fileName, installedAt: new Date().toISOString() },
                ],
              },
            };
          });

          // Reload the global cache so the library sees the new files
          await reloadAllMods(true);
        } catch (err) {
          completeDownload(
            gbModId,
            false,
            err.message || "Installation failed",
          );
        }
      })();
    }
  };

  const handleAssign = useCallback(
    async (mod, newCharacterName) => {
      if (window.electronConfig && window.electronMods) {
        const config = await window.electronConfig.getConfig();
        const importerPath = config[game.id];

        const result = await window.electronMods.assignMod({
          importerPath,
          originalFolderName: mod.originalFolderName,
          newCharacterName,
        });

        if (result.success) {
          await reloadAllMods(true);
        } else {
          alert(result.error || "Failed to assign mod.");
        }
      }
    },
    [game.id, reloadAllMods],
  );

  const handleDelete = useCallback((mod) => {
    setModToDelete(mod);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!modToDelete) return;

    setShowDeleteConfirm(false);
    const mod = modToDelete;
    setModToDelete(null);

    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];

      const result = await window.electronMods.deleteMod({
        importerPath,
        originalFolderName: mod.originalFolderName,
      });

      if (result && result.success) {
        await reloadAllMods(true);
      } else {
        alert(result?.error || "Failed to delete mod.");
      }
    }
  }, [game.id, modToDelete, reloadAllMods]);

  if (!character) return null;
  const enabledCount = mods.filter((m) => m.isEnabled).length;
  const disabledCount = mods.length - enabledCount;
  const effectiveSearchQuery = hideHeader ? searchQuery : localSearchQuery;

  return (
    <div
      className={cn(
        "flex flex-col h-full",
        !hideHeader && "animate-in fade-in duration-700",
      )}
    >
      {!hideHeader && (
        <section className="mb-6 z-10 relative">
          <div className="flex flex-wrap items-center gap-2 px-2 pb-4 text-[11px] font-black uppercase tracking-[0.2em]">
            <button
              onClick={onBack}
              className="ui-focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-text-muted transition-colors hover:text-white hover:bg-white/5"
            >
              <ArrowLeft size={12} />
              {game.name}
            </button>
            <span className="text-white/20">/</span>
            <span className="text-white">{character.name}</span>
          </div>

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
        onSelectMod={setSelectedMod}
        onToggle={handleToggle}
        onOpenFolder={handleOpenFolder}
        onAssign={handleAssign}
        onDelete={handleDelete}
      />

      {/* Mod Detail Modal */}
      {selectedMod && (
        <ModDetailModal
          mod={selectedMod}
          game={game}
          installedFileInfo={installedModsInfo[selectedMod._idRow]}
          preSelectedCharacter={
            character.name !== "Unassigned" ? character.name : ""
          }
          isUpdating={selectedMod.isUpdating}
          isLibraryContext={true}
          onClose={() => setSelectedMod(null)}
          onInstall={handleInstallUpdate}
          onThumbnailChange={() => reloadAllMods(true)}
        />
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Mod"
        message={`Are you sure you want to delete "${modToDelete?.name}"? This will move the mod folder to your computer's Recycle Bin.`}
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setModToDelete(null);
        }}
      />
    </div>
  );
}
