import { useState, useEffect } from "react";
import { ArrowLeft, User, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ModCard from "../components/ModCard";
import ModDetailModal from "../components/ModDetailModal";
import { getCharacterPortrait, getAllCharacterNames, GLOBAL_CATEGORIES } from "../lib/portraits";
import { cn } from "../lib/utils";

export default function ModDetail({ game, character, onBack, hideHeader = false, searchQuery = "" }) {
  const portraitUrl = getCharacterPortrait(character.name, game.id);
  const [mods, setMods] = useState([]);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [gbDataMap, setGbDataMap] = useState({}); // { [gamebananaId]: { thumbnailUrl, hasUpdate, fullData } }
  const [selectedMod, setSelectedMod] = useState(null); // Full GB data of clicked mod
  const [installedModsInfo, setInstalledModsInfo] = useState({}); // gbId -> { installedFiles: string[] }
  const [modToDelete, setModToDelete] = useState(null);

  const loadMods = async () => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (importerPath) {
        const knownCharacters = getAllCharacterNames(game.id);
        const allParseableNames = [...knownCharacters, ...GLOBAL_CATEGORIES];
        const loadedMods = await window.electronMods.getMods(importerPath, allParseableNames, game.id);
        const charMods = loadedMods.filter((m) => m.character === character.name);
        charMods.sort((a, b) => {
          if (a.isEnabled === b.isEnabled) return a.name.localeCompare(b.name);
          return a.isEnabled ? -1 : 1;
        });
        setMods(charMods);

          // Fetch GameBanana data for mods that have a gamebananaId
          const gbIds = [...new Set(charMods.filter((m) => m.gamebananaId).map((m) => m.gamebananaId))];
          if (gbIds.length > 0 && window.electronMods.fetchGbMod) {
            const results = await Promise.allSettled(
              gbIds.map((id) => window.electronMods.fetchGbMod(id))
            );
            const map = {};
            results.forEach((res, i) => {
              if (res.status === "fulfilled" && res.value.success) {
                const gbMod = res.value.data;
                const gbId = gbIds[i];
                
                map[gbId] = {
                  thumbnailUrl: gbMod.thumbnailUrl,
                  fullData: gbMod, // Store full data for modal
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
                // Check if we already added this file name to avoid duplicates
                const exists = infoMap[m.gamebananaId].installedFiles.find(f => f.fileName === m.installedFile);
                if (!exists) {
                  infoMap[m.gamebananaId].installedFiles.push({
                    fileName: m.installedFile,
                    installedAt: m.installedAt
                  });
                }
              }
            }
          });
          setInstalledModsInfo(infoMap);
        }
      }
    };

  useEffect(() => {
    loadMods();
  }, [game.id, character.name]);

  const handleToggle = async (mod, enable) => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];

      const result = await window.electronMods.toggleMod({
        importerPath,
        originalFolderName: mod.originalFolderName,
        enable,
      });

      if (result.success) {
        // Reload mods to get updated state
        loadMods();
      } else {
        console.error("Failed to toggle mod:", result.error);
        alert(`Failed to toggle mod: ${result.error}`);
      }
    }
  };

  const handleOpenFolder = async (path) => {
    if (window.electronMods) {
      await window.electronMods.openFolder(path);
    }
  };

  const handleImport = async () => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];

      const result = await window.electronMods.importMod({
        importerPath,
        characterName: character.name,
        gameId: game.id
      });

      if (result && result.success) {
        loadMods();
      } else if (result && !result.canceled) {
        alert(result.error || "Failed to import mod.");
      }
    }
  };

  const handleInstallUpdate = async ({ characterName, gbModId, fileUrl, fileName }) => {
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

      if (!result.success) throw new Error(result.error || "Installation failed.");
      
      // Update local state so badge shows immediately
      setInstalledModsInfo((prev) => {
        const current = prev[gbModId] || { installedFiles: [] };
        if (current.installedFiles.find(f => f.fileName === fileName)) return prev;
        return {
          ...prev,
          [gbModId]: { 
            ...current,
            installedFiles: [...current.installedFiles, { fileName, installedAt: new Date().toISOString() }] 
          }
        };
      });
      
      // Reload the library view behind the modal
      loadMods();
    }
  };

  const handleAssign = async (mod, newCharacterName) => {
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
  };

  const handleDelete = async (mod) => {
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
  };

  if (!character) return null;
  const enabledCount = mods.filter((m) => m.isEnabled).length;
  const disabledCount = mods.length - enabledCount;

  return (
    <div className={cn("flex flex-col h-full", !hideHeader && "animate-in fade-in duration-700")}>
      {!hideHeader && (
        <div className="relative mb-12 group">
          {/* Breadcrumb row - Floats over banner */}
          <div className="absolute top-0 left-0 z-30 flex items-center gap-2 text-sm text-(--active-accent)/80 drop-shadow-md">
            <button
              onClick={onBack}
              className="flex items-center hover:text-(--active-accent) transition-colors focus:outline-none"
            >
              <ArrowLeft size={16} className="mr-1" />
              {game.name}
            </button>
            <span className="text-white/20">/</span>
            <span className="text-white/60 font-medium">{character.name}</span>
          </div>

          {/* Premium Hero Banner */}
          <div className="relative h-64 md:h-80 w-full rounded-4xl overflow-hidden bg-(--bg-card) border border-white/5 shadow-2xl mt-8">
            {/* Background Glow/Mesh */}
            <div 
              className="absolute inset-0 opacity-20 transition-opacity duration-1000 group-hover:opacity-30"
              style={{
                background: `radial-gradient(circle at 30% 50%, var(--active-accent) 0%, transparent 70%), 
                             linear-gradient(to right, rgba(0,0,0,0.8) 0%, transparent 100%)`
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
                    className={cn(
                      "h-full w-auto object-contain object-left scale-150 md:scale-125 translate-x-4 md:translate-x-12 translate-y-6 transition-all duration-700",
                      imgLoaded ? "opacity-100 blur-0" : "opacity-0 blur-xl"
                    )}
                  />
                  {/* Bottom Vignette for text legibility */}
                  <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute inset-0 bg-linear-to-r from-black/60 via-transparent to-transparent" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Banner Content */}
            <div className="absolute inset-0 z-20 p-8 md:p-12 flex flex-col justify-end items-start">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <div className="flex items-center gap-3 mb-2">
                   <div className="w-1.5 h-6 bg-(--active-accent) rounded-full shadow-[0_0_12px_var(--active-accent)]" />
                   <span className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Character Library</span>
                </div>
                <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-4 drop-shadow-2xl">
                  {character.name}
                </h1>
                
                <div className="flex items-center gap-6 text-sm font-bold">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                    <span className="text-(--active-accent)">{mods.length}</span>
                    <span className="text-white/40 uppercase tracking-widest text-[10px]">Total Mods</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-(--active-accent) animate-pulse shadow-[0_0_8px_var(--active-accent)]" />
                    <span className="text-white/80">{enabledCount} Active</span>
                  </div>
                  
                  {disabledCount > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-white/20" />
                      <span className="text-white/40">{disabledCount} Stashed</span>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Action Button */}
              <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleImport}
                className="absolute right-8 md:right-12 bottom-8 md:bottom-12 flex items-center gap-3 px-8 py-4 bg-(--active-accent) text-black font-black rounded-2xl hover:brightness-110 transition-all shadow-xl shadow-(--active-accent)/20 uppercase tracking-wider text-sm"
              >
                <Plus size={20} strokeWidth={3} />
                Import Mod
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {/* Mods Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-12">
        {mods.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())).map((mod) => {
          const gbData = mod.gamebananaId ? gbDataMap[mod.gamebananaId] : undefined;
          let hasUpdate = false;
          
          if (gbData?.fullData && mod.installedAt) {
            const installedDate = new Date(mod.installedAt).getTime() / 1000;
            if (gbData.fullData._tsDateUpdated > installedDate + 60) {
              hasUpdate = true;
            }
          }
          
          const cardGbData = gbData ? { ...gbData, hasUpdate } : undefined;

          return (
            <ModCard
              key={mod.originalFolderName}
              mod={mod}
              gbData={cardGbData}
              isUnassignedMode={character.name === "Unassigned"}
              characters={getAllCharacterNames(game.id)}
              gameId={game.id}
              onClick={() => {
                if (gbData?.fullData) {
                  setSelectedMod({ 
                    ...gbData.fullData,
                    isUpdating: hasUpdate,
                    localMod: mod
                  });
                }
              }}
              onToggle={(enable) => handleToggle(mod, enable)}
              onOpenFolder={() => handleOpenFolder(mod.path)}
              onAssign={(newCharName) => handleAssign(mod, newCharName)}
              onDelete={setModToDelete}
              hideCategoryTag={hideHeader}
            />
          );
        })}
      </div>

      {/* Mod Detail Modal */}
      {selectedMod && (
        <ModDetailModal
          mod={selectedMod}
          game={game}
          installedFileInfo={installedModsInfo[selectedMod._idRow]}
          preSelectedCharacter={character.name !== "Unassigned" ? character.name : ""}
          isUpdating={selectedMod.isUpdating}
          isLibraryContext={true}
          onClose={() => setSelectedMod(null)}
          onInstall={handleInstallUpdate}
          onThumbnailChange={() => loadMods()}
        />
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {modToDelete && (
          <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setModToDelete(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="w-full max-w-sm bg-(--bg-overlay) border border-red-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-500 shadow-inner shadow-red-500/20">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Delete Mod?</h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                Are you sure you want to delete <strong className="text-white">{modToDelete.name}</strong>?<br/>
                This will move the folder to your computer's Recycle Bin.
              </p>
              
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => setModToDelete(null)}
                  className="flex-1 py-2.5 rounded-lg font-bold text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await handleDelete(modToDelete);
                    setModToDelete(null);
                  }}
                  className="flex-1 py-2.5 rounded-lg font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all shadow-[0_0_15px_rgba(239,68,68,0)] hover:shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
