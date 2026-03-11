import { useState, useEffect } from "react";
import { ArrowLeft, User, Plus } from "lucide-react";
import ModCard from "../components/ModCard";
import { getCharacterPortrait, getAllCharacterNames } from "../lib/portraits";

export default function ModDetail({ game, character, onBack }) {
  const portraitUrl = getCharacterPortrait(character.name);
  const [mods, setMods] = useState([]);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [gbDataMap, setGbDataMap] = useState({}); // { [gamebananaId]: { thumbnailUrl, hasUpdate } }

  const loadMods = async () => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (importerPath) {
        const knownCharacters = getAllCharacterNames();
        const loadedMods = await window.electronMods.getMods(importerPath, knownCharacters);
        const charMods = loadedMods.filter((m) => m.character === character.name);
        charMods.sort((a, b) => {
          if (a.isEnabled === b.isEnabled) return a.name.localeCompare(b.name);
          return a.isEnabled ? -1 : 1;
        });
        setMods(charMods);

        // Fetch GameBanana data for mods that have a gamebananaId
        const gbIds = charMods.filter((m) => m.gamebananaId).map((m) => m.gamebananaId);
        if (gbIds.length > 0 && window.electronMods.fetchGbMod) {
          const results = await Promise.allSettled(
            gbIds.map((id) => window.electronMods.fetchGbMod(id))
          );
          const map = {};
          results.forEach((res, i) => {
            if (res.status === "fulfilled" && res.value.success) {
              const gbMod = res.value.data;
              const localMod = charMods.find(m => m.gamebananaId === gbIds[i]);
              
              let hasUpdate = false;
              if (localMod && localMod.installedAt && gbMod._tsDateUpdated) {
                const installedDate = new Date(localMod.installedAt).getTime() / 1000;
                // If the update date from GameBanana is newer than our installation date
                if (gbMod._tsDateUpdated > installedDate + 60) { // +60s buffer for safety
                  hasUpdate = true;
                }
              }

              map[gbIds[i]] = {
                thumbnailUrl: gbMod.thumbnailUrl,
                hasUpdate: hasUpdate,
              };
            }
          });
          setGbDataMap(map);
        }
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
        characterName: character.name
      });

      if (result && result.success) {
        loadMods();
      } else if (result && !result.canceled) {
        alert(result.error || "Failed to import mod.");
      }
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

  const enabledCount = mods.filter((m) => m.isEnabled).length;
  const disabledCount = mods.length - enabledCount;

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-8 duration-300">
      {/* Breadcrumb row */}
      <div className="flex items-center gap-2 text-sm text-[var(--active-accent)] mb-6">
        <button
          onClick={onBack}
          className="flex items-center hover:underline focus:outline-none"
        >
          <ArrowLeft size={16} className="mr-1" />
          {game.name}
        </button>
        <span className="text-gray-600">/</span>
        <span className="text-gray-400">{character.name}</span>
      </div>

      {/* Header section */}
      <div className="flex items-end justify-between mb-8 pb-6 border-b border-white/5 relative">
        <div className="flex items-center gap-6">
          <div
            className="w-24 h-24 shrink-0 rounded-full bg-gradient-to-tr from-[var(--active-accent)] to-black flex items-center justify-center shadow-lg shadow-[var(--active-accent)]/20 border-2 border-[var(--active-accent)]/50 overflow-hidden relative"
          >
            {portraitUrl ? (
              <img 
                src={portraitUrl} 
                alt={character.name}
                onLoad={() => setImgLoaded(true)}
                className={`absolute inset-0 w-full h-full object-cover object-top scale-125 translate-y-3 transition-opacity duration-700 ease-out ${
                  imgLoaded ? "opacity-100" : "opacity-0"
                }`}
              />
            ) : (
              <User size={32} className="text-white/30" />
            )}
          </div>
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
              {character.name}
            </h1>
            <p className="text-gray-400 font-medium">
              {mods.length} mods <span className="mx-1.5">•</span>
              <span className="text-white relative z-10">
                {enabledCount} enabled
              </span>{" "}
              <span className="mx-1.5">•</span>
              {disabledCount} disabled
            </p>
          </div>
        </div>

        <button 
          onClick={handleImport}
          className="flex items-center gap-2 px-5 py-2.5 bg-[var(--active-accent)] text-black font-semibold rounded-lg hover:brightness-110 active:brightness-90 transition-all shadow-lg shadow-[var(--active-accent)]/20"
        >
          <Plus size={18} />
          Add Mod
        </button>
      </div>

      {/* Mods Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-12">
        {mods.map((mod) => (
          <ModCard
            key={mod.originalFolderName}
            mod={mod}
            gbData={mod.gamebananaId ? gbDataMap[mod.gamebananaId] : undefined}
            isUnassignedMode={character.name === "Unassigned"}
            characters={getAllCharacterNames()}
            onToggle={(enable) => handleToggle(mod, enable)}
            onOpenFolder={() => handleOpenFolder(mod.path)}
            onAssign={(newCharName) => handleAssign(mod, newCharName)}
          />
        ))}
      </div>
    </div>
  );
}
