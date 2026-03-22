import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, User, Plus, Trash2, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ModDetailModal from "../components/ModDetailModal";
import CharacterDetailHeader from "../components/CharacterDetailHeader";
import CharacterDetailStats from "../components/CharacterDetailStats";
import CharacterDetailGrid from "../components/CharacterDetailGrid";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  getCharacterPortrait,
  getAllCharacterNames,
  GLOBAL_CATEGORIES,
} from "../lib/portraits";
import { useFetchCache } from "../hooks/useFetchCache";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { cn } from "../lib/utils";

export default function CharacterDetail({
  character,
  onBack,
  hideHeader = false,
  searchQuery = "",
}) {
  const game = useAppStore((state) => state.activeGame);
  const portraitUrl = getCharacterPortrait(character.name, game.id);
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
  const { mods: allMods, loadMods: reloadAllMods } = useLoadGameMods(game.id, true);
  const [mods, setMods] = useState([]);

  const loadMods = useCallback(async () => {
    if (allMods && allMods.length > 0) {
      const charMods = allMods.filter((m) => m.character === character.name);
      charMods.sort((a, b) => {
        if (a.isEnabled === b.isEnabled) return a.name.localeCompare(b.name);
        return a.isEnabled ? -1 : 1;
      });
      setMods(charMods);

      // Fetch GameBanana data for mods that have a gamebananaId
      const gbIds = [
        ...new Set(charMods.filter((m) => m.gamebananaId).map((m) => m.gamebananaId)),
      ];
      if (gbIds.length > 0) {
        const results = await Promise.allSettled(gbIds.map((id) => fetchMod(id)));
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
  }, [allMods, character.name]);

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
    [game.id, loadMods],
  );

  const handleDisableAll = useCallback(async () => {
    const enabledMods = mods.filter((m) => m.isEnabled);
    if (enabledMods.length === 0) return;
    setDisablingAll(true);
    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      await Promise.all(
        enabledMods.map((mod) =>
          window.electronMods.toggleMod({
            importerPath,
            originalFolderName: mod.originalFolderName,
            enable: false,
          }),
        ),
      );
      await loadMods();
    } finally {
      setDisablingAll(false);
    }
  }, [mods, game.id, loadMods]);

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
        loadMods();
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

      // Reload the library view behind the modal
      loadMods();
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
          loadMods();
        } else {
          alert(result.error || "Failed to assign mod.");
        }
      }
    },
    [game.id, loadMods],
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
        loadMods();
      } else {
        alert(result?.error || "Failed to delete mod.");
      }
    }
  }, [modToDelete, game.id, loadMods]);

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
        <div className="relative mb-12 group">
          {/* Breadcrumb row - Floats over banner */}
          <div className="absolute top-0 left-0 z-30 flex items-center gap-2 text-sm text-primary/80 drop-shadow-md">
            <button
              onClick={onBack}
              className="flex items-center hover:text-primary transition-colors focus:outline-none"
            >
              <ArrowLeft size={16} className="mr-1" />
              {game.name}
            </button>
            <span className="text-white/20">/</span>
            <span className="text-white/60 font-medium">{character.name}</span>
          </div>

          {/* Premium Hero Banner */}
          <div className="relative h-72 md:h-[340px] w-full rounded-4xl overflow-hidden bg-card border border-white/10 shadow-2xl mt-8">
            {/* Massive Background Text Watermark */}
            <div className="absolute -right-12 -bottom-20 text-[180px] md:text-[320px] font-black italic text-white/5 leading-none tracking-tighter pointer-events-none select-none z-0 whitespace-nowrap overflow-hidden">
              {character.name.toUpperCase()}
            </div>

            {/* High-Tech Grid Pattern */}
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
                backgroundSize: "32px 32px",
              }}
            />

            {/* Background Glow */}
            <div
              className="absolute inset-0 transition-opacity duration-1000 z-0 opacity-20"
              style={{
                background: `radial-gradient(circle at 20% 50%, var(--color-primary) 0%, transparent 60%), 
                             linear-gradient(to right, rgba(0,0,0,0.8) 0%, transparent 100%)`,
              }}
            />

            {/* The Artwork */}
            <AnimatePresence>
              {portraitUrl && (
                <motion.div
                  initial={{ opacity: 0, x: -40, scale: 1.05 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="absolute inset-0 z-10 pointer-events-none"
                >
                  <img
                    src={portraitUrl}
                    alt={character.name}
                    onLoad={() => setImgLoaded(true)}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "h-full w-auto object-contain object-left scale-[1.8] md:scale-[1.6] translate-x-12 md:translate-x-32 translate-y-24 md:translate-y-36 transition-all duration-700",
                      imgLoaded ? "opacity-100 blur-0" : "opacity-0 blur-xl",
                    )}
                  />
                  {/* Bottom Vignette for text legibility */}
                  <div className="absolute inset-0 bg-linear-to-t from-[#09090b]/90 via-[#09090b]/20 to-transparent" />
                  <div className="absolute inset-0 bg-linear-to-r from-[#09090b]/80 via-transparent to-transparent" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Banner Content Layout */}
            <div className="absolute inset-0 z-20 p-8 md:p-12 flex flex-col md:flex-row md:items-end justify-between">
              {/* Left: Title & Action */}
              <CharacterDetailHeader
                 game={game}
                 character={character}
                 mods={mods}
                 disablingAll={disablingAll}
                 onImport={handleImport}
                 onDisableAll={handleDisableAll}
              />
              
              {/* Right: Glassmorphic Stats Dashboard */}
              <CharacterDetailStats
                 enabledCount={enabledCount}
                 disabledCount={disabledCount}
                 totalCount={mods.length}
              />
            </div>
          </div>
        </div>
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
          onThumbnailChange={() => loadMods()}
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
