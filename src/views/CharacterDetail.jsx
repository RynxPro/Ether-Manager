import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, User, Plus, Trash2, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import LibraryModCard from "../components/LibraryModCard";
import ModDetailModal from "../components/ModDetailModal";
import { getCharacterPortrait, getAllCharacterNames, GLOBAL_CATEGORIES } from "../lib/portraits";
import { cn } from "../lib/utils";

export default function CharacterDetail({ game, character, onBack, hideHeader = false, searchQuery = "" }) {
  const portraitUrl = getCharacterPortrait(character.name, game.id);
  const [mods, setMods] = useState([]);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [gbDataMap, setGbDataMap] = useState({});
  const [selectedMod, setSelectedMod] = useState(null);
  const [installedModsInfo, setInstalledModsInfo] = useState({});
  const [modToDelete, setModToDelete] = useState(null);
  const [disablingAll, setDisablingAll] = useState(false);

  const loadMods = useCallback(async () => {
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
  }, [game.id, character.name]); // Include essential deps here if needed in the future

  useEffect(() => {
    loadMods();
  }, [loadMods]);

  const handleToggle = useCallback(async (mod, enable) => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];

      const result = await window.electronMods.toggleMod({
        importerPath,
        originalFolderName: mod.originalFolderName,
        enable,
      });

      if (result.success) {
        loadMods();
      } else {
        console.error("Failed to toggle mod:", result.error);
        alert(`Failed to toggle mod: ${result.error}`);
      }
    }
  }, [game.id, loadMods]);

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
          })
        )
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

  const handleAssign = useCallback(async (mod, newCharacterName) => {
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
  }, [game.id, loadMods]);

  const handleDelete = useCallback(async (mod) => {
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
  }, [game.id, loadMods]);

  if (!character) return null;
  const enabledCount = mods.filter((m) => m.isEnabled).length;
  const disabledCount = mods.length - enabledCount;

  return (
    <div className={cn("flex flex-col h-full", !hideHeader && "animate-in fade-in duration-700")}>
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
            <div className="absolute -right-8 -bottom-12 text-[140px] md:text-[200px] font-black text-white/2 leading-none tracking-tighter pointer-events-none select-none z-0 whitespace-nowrap truncate max-w-full">
              {character.name.toUpperCase()}
            </div>

            {/* High-Tech Grid Pattern */}
            <div 
              className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" 
              style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} 
            />

            {/* Background Glow */}
            <div 
              className="absolute inset-0 transition-opacity duration-1000 z-0 opacity-20"
              style={{
                background: `radial-gradient(circle at 20% 50%, var(--color-primary) 0%, transparent 60%), 
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
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "h-full w-auto object-contain object-left scale-150 md:scale-125 translate-x-4 md:translate-x-12 translate-y-6 transition-all duration-700",
                      imgLoaded ? "opacity-100 blur-0" : "opacity-0 blur-xl"
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
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="flex flex-col justify-end h-full md:h-auto"
              >
                <div className="flex items-center gap-3 mb-3">
                   <div className="w-1.5 h-6 bg-primary rounded-full shadow-[0_0_12px_var(--color-primary)]" />
                   <span className="text-xs font-black uppercase tracking-[0.3em] text-white/50">{game.name}</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-8 drop-shadow-2xl">
                  {character.name}
                </h1>
                
                {/* Button Row */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Import Button */}
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleImport}
                    className="flex w-max items-center gap-3 px-8 py-3.5 bg-primary text-black font-black rounded-2xl hover:brightness-110 transition-all shadow-[0_0_20px_var(--color-primary)]/20 uppercase tracking-widest text-xs border border-transparent hover:border-white/50"
                  >
                    <Plus size={18} strokeWidth={3} />
                    Import Mod
                  </motion.button>

                  {/* Disable All Button — only shown when there are active mods */}
                  {mods.some((m) => m.isEnabled) && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleDisableAll}
                      disabled={disablingAll}
                      className="flex w-max items-center gap-3 px-6 py-3.5 bg-white/5 text-white/70 hover:text-white font-black rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest text-xs border border-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {disablingAll ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                      ) : (
                        <EyeOff size={16} />
                      )}
                      {disablingAll ? "Disabling…" : "Disable All"}
                    </motion.button>
                  )}
                </div>
              </motion.div>

              {/* Right: Glassmorphic Stats Dashboard */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="hidden md:flex items-stretch gap-4"
              >
                {/* Stat Box 1: Status (Now on the left) */}
                <div className="flex flex-col gap-2 p-4 bg-black/40 backdrop-blur-xl rounded-4xl border border-white/10 shadow-2xl min-w-[180px]">
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]" />
                      <span className="text-xs font-bold text-white tracking-widest uppercase">Active</span>
                    </div>
                    <span className="text-sm font-black text-white">{enabledCount}</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-white/20" />
                      <span className="text-xs font-bold text-text-muted tracking-widest uppercase">Stashed</span>
                    </div>
                    <span className="text-sm font-black text-white/60">{disabledCount}</span>
                  </div>
                </div>

                {/* Stat Box 2: Total (Now on the right) */}
                <div className="flex flex-col items-center justify-center px-8 bg-black/40 backdrop-blur-xl rounded-4xl border border-white/10 shadow-2xl min-w-[160px]">
                   <span className="text-[10px] font-black tracking-[0.2em] text-text-muted uppercase mb-1">Total Mods</span>
                   <div className="flex items-baseline gap-2">
                     <span className="text-5xl font-black text-white leading-none tracking-tighter">{mods.length}</span>
                     <span className="text-xs font-bold text-white/20 uppercase tracking-[0.2em]">Installed</span>
                   </div>
                </div>
              </motion.div>
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
            <LibraryModCard
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
              onToggle={handleToggle}
              onOpenFolder={handleOpenFolder}
              onAssign={handleAssign}
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
              className="w-full max-w-sm bg-surface border border-red-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-500 shadow-inner shadow-red-500/20">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Delete Mod?</h3>
              <p className="text-text-secondary text-sm mb-6 leading-relaxed">
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
                  className="flex-1 py-2.5 rounded-lg font-bold text-red-500 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all shadow-[0_0_15px_rgba(255,68,85,0)] hover:shadow-[0_0_15px_rgba(255,68,85,0.15)]"
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
