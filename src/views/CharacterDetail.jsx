import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, FolderKanban } from "lucide-react";
import { motion } from "framer-motion";
import ModDetailModal from "../components/ModDetailModal";
import CharacterDetailHeader from "../components/CharacterDetailHeader";
import CharacterDetailStats from "../components/CharacterDetailStats";
import CharacterDetailGrid from "../components/CharacterDetailGrid";
import ConfirmDialog from "../components/ConfirmDialog";
import { useFetchCache } from "../hooks/useFetchCache";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { cn } from "../lib/utils";
import { isModInCollection } from "../lib/modClassification";
import { useCharacterPortrait } from "../hooks/useCharacterPortrait";
import { StatePanel } from "../components/ui/StatePanel";

export default function CharacterDetail({
  character,
  onBack,
  hideHeader = false,
  searchQuery = "",
}) {
  const game = useAppStore((state) => state.activeGame);
  const portraitUrl = useCharacterPortrait(character.name, game.id);
  // Removed old useState for mods
  const [imgLoaded, setImgLoaded] = useState(false);
  const [gbDataMap, setGbDataMap] = useState({});
  const [selectedMod, setSelectedMod] = useState(null);
  const [installedModsInfo, setInstalledModsInfo] = useState({});
  const [modToDelete, setModToDelete] = useState(null);
  const [disablingAll, setDisablingAll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
  }) => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (!importerPath) throw new Error("No importer path configured.");

      const result = await window.electronMods.installGbMod({
        importerPath,
        characterName,
        gbModId,
        fileUrl,
        fileName,
        gameId: game.id,
      });

      if (!result.success)
        throw new Error(result.error || "Installation failed.");

      // Update local state so badge shows immediately
      setInstalledModsInfo((prev) => {
        const current = prev[gbModId] || { installedFiles: [] };
        if (current.installedFiles.find((f) => f.fileName === fileName))
          return prev;
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

  return (
    <div
      className={cn(
        "flex flex-col h-full",
        !hideHeader && "animate-in fade-in duration-700",
      )}
    >
      {!hideHeader && (
        <section className="ui-panel mb-8 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-4 text-sm">
            <button
              onClick={onBack}
              className="ui-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-text-secondary transition-colors hover:text-primary"
            >
              <ArrowLeft size={16} />
              {game.name}
            </button>
            <span className="text-text-muted">/</span>
            <span className="font-medium text-text-primary">{character.name}</span>
            <div className="ml-auto rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
              <FolderKanban size={12} className="mr-1 inline-block" />
              Local Collection
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
            <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--color-primary),transparent_84%)_0%,transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-6 md:p-8">
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-72 overflow-hidden md:block">
                {portraitUrl ? (
                  <img
                    src={portraitUrl}
                    alt={character.name}
                    onLoad={() => setImgLoaded(true)}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "absolute right-[-3rem] top-6 h-[120%] w-auto object-contain opacity-30 transition-all duration-700",
                      imgLoaded ? "blur-0" : "blur-xl",
                    )}
                  />
                ) : null}
              </div>
              <CharacterDetailHeader
                game={game}
                character={character}
                mods={mods}
                disablingAll={disablingAll}
                onImport={handleImport}
                onDisableAll={handleDisableAll}
              />
            </div>

            <CharacterDetailStats
              enabledCount={enabledCount}
              disabledCount={disabledCount}
              totalCount={mods.length}
            />
          </div>
        </section>
      )}

      {/* Mods Grid */}
      <CharacterDetailGrid
        mods={mods}
        searchQuery={searchQuery}
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

      {!hideHeader && mods.length === 0 && (
        <StatePanel
          title="Nothing installed here yet"
          message="Import a mod into this collection to start managing it from the library."
          className="hidden"
        />
      )}

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
