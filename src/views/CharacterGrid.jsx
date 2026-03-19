import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, User, Monitor, Box, EyeOff } from "lucide-react";
import CharacterCard from "../components/CharacterCard";
import ModDetail from "./ModDetail";
import { getAllCharacterNames, GLOBAL_CATEGORIES, isGlobalCategory } from "../lib/portraits";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";

const TABS = [
  { id: "characters", label: "Characters", icon: User },
  { id: "ui", label: "User Interface", icon: Monitor },
  { id: "misc", label: "Miscellaneous", icon: Box },
];

export default function CharacterGrid({ game, isActive, onSelectCharacter }) {
  const [mods, setMods] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("characters");
  const [disablingAll, setDisablingAll] = useState(false);
  const [updatesMap, setUpdatesMap] = useState({});

  const loadMods = useCallback(async () => {
    if (window.electronConfig && window.electronMods) {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      if (importerPath) {
        const knownCharacters = getAllCharacterNames(game.id);
        const allParseableNames = [...knownCharacters, ...GLOBAL_CATEGORIES];
        const loadedMods = await window.electronMods.getMods(importerPath, allParseableNames, game.id);
        setMods(loadedMods);
      } else {
        setMods([]);
      }
    }
  }, [game.id]);

  useEffect(() => {
    if (isActive !== false) {
      loadMods();
    }
  }, [loadMods, isActive]);

  useEffect(() => {
    const checkUpdates = async () => {
      if (!mods || mods.length === 0 || !window.electronMods?.fetchGbModsBatch) return;

      const modsWithId = mods.filter(m => m.gamebananaId);
      const gbIds = [...new Set(modsWithId.map(m => m.gamebananaId))];
      if (gbIds.length === 0) return;

      try {
        const result = await window.electronMods.fetchGbModsBatch(gbIds);
        if (result.success && result.data) {
          const newUpdatesMap = {};
          
          // Map fetched data for quick lookup
          const latestDates = {};
          result.data.forEach(m => {
            if (m._idRow) latestDates[String(m._idRow)] = m._tsDateUpdated;
          });

          // Check each mod
          mods.forEach(mod => {
            const gbId = mod.gamebananaId ? String(mod.gamebananaId) : null;
            if (gbId && mod.installedAt && latestDates[gbId]) {
              const installedDate = new Date(mod.installedAt).getTime() / 1000;
              const gbDate = latestDates[gbId];
              
              // Use a 5-minute buffer (300s) to account for slight clock skews
              if (gbDate > installedDate + 300) {
                newUpdatesMap[mod.character] = true;
                
                // Also handle cases where mod is assigned to a category but shows in a tab
                const isGlobalUI = mod.character === "User Interface" || (mod.character === "Unassigned" && mod.category === "User Interface");
                const isGlobalMisc = mod.character === "Miscellaneous" || (mod.character === "Unassigned" && (mod.category === "Other/Misc" || mod.category === "Audio" || mod.category === "Miscellaneous"));
                
                if (isGlobalUI) newUpdatesMap["ui"] = true;
                else if (isGlobalMisc) newUpdatesMap["misc"] = true;
                else newUpdatesMap["characters"] = true;
              }
            }
          });
          setUpdatesMap(newUpdatesMap);
        }
      } catch (err) {
        console.error("Failed to check character updates:", err);
      }
    };

    checkUpdates();
  }, [mods]);

  const handleDisableAllGame = useCallback(async () => {
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

  const totalEnabledMods = useMemo(() => mods.filter((m) => m.isEnabled).length, [mods]);

  // Group and Filter logic
  const { displayItems, counts } = useMemo(() => {
    const charactersMap = new Map();
    const globalMods = {
      ui: { name: "User Interface", totalMods: 0, enabledMods: 0, mods: [] },
      misc: { name: "Miscellaneous", totalMods: 0, enabledMods: 0, mods: [] }
    };

    // Pre-populate characters only for the characters tab
    const currentChars = getAllCharacterNames(game.id);
    currentChars.forEach(name => {
      charactersMap.set(name, {
        name,
        totalMods: 0,
        enabledMods: 0,
        mods: []
      });
    });

    mods.forEach(mod => {
      // Check if it's a global UI/Misc mod or a true character mod
      const isGlobalUI = mod.character === "User Interface" || (mod.character === "Unassigned" && mod.category === "User Interface");
      const isGlobalMisc = mod.character === "Miscellaneous" || (mod.character === "Unassigned" && (mod.category === "Other/Misc" || mod.category === "Audio" || mod.category === "Miscellaneous"));

      if (isGlobalUI) {
        globalMods.ui.totalMods++;
        globalMods.ui.mods.push(mod);
        if (mod.isEnabled) globalMods.ui.enabledMods++;
      } else if (isGlobalMisc) {
        globalMods.misc.totalMods++;
        globalMods.misc.mods.push(mod);
        if (mod.isEnabled) globalMods.misc.enabledMods++;
      } else {
        // Character Bound
        if (!charactersMap.has(mod.character)) {
          charactersMap.set(mod.character, { name: mod.character, totalMods: 0, enabledMods: 0, mods: [] });
        }
        const charData = charactersMap.get(mod.character);
        charData.totalMods++;
        charData.mods.push(mod);
        if (mod.isEnabled) charData.enabledMods++;
      }
    });

    let items = [];
    if (activeTab === "characters") {
       items = Array.from(charactersMap.values())
        .filter(c => c.name !== "Unassigned" || c.totalMods > 0)
        .sort((a, b) => {
          if (a.name === "Unassigned") return -1;
          if (b.name === "Unassigned") return 1;
          return a.name.localeCompare(b.name);
        });
    } else if (activeTab === "ui") {
      items = globalMods.ui.totalMods > 0 ? [globalMods.ui] : [];
    } else {
      items = globalMods.misc.totalMods > 0 ? [globalMods.misc] : [];
    }

    const filteredItems = items.filter(item => {
      return item.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return { 
      displayItems: filteredItems,
      counts: {
        characters: Array.from(charactersMap.values()).reduce((acc, c) => acc + c.totalMods, 0),
        ui: globalMods.ui.totalMods,
        misc: globalMods.misc.totalMods
      }
    };
  }, [mods, game.id, activeTab, searchQuery]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.04 },
    },
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">{game.name}</h1>
          <nav className="flex items-center gap-6 mt-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const count = counts[tab.id];
              const hasUpdate = updatesMap[tab.id];

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "group relative pb-2 flex items-center gap-2 transition-all",
                    isActive ? "text-(--active-accent)" : "text-(--text-muted) hover:text-white"
                  )}
                >
                  <Icon size={16} />
                  <span className="text-sm font-bold uppercase tracking-widest">{tab.label}</span>
                  {hasUpdate && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-(--color-update) shadow-[0_0_8px_var(--color-update)]" />
                  )}
                  {count > 0 && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-black",
                      isActive ? "bg-(--active-accent) text-black" : "bg-white/10 text-(--text-muted) group-hover:bg-white/20"
                    )}>
                      {count}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-(--active-accent)"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-end gap-3 mt-4 sm:mt-0 flex-wrap self-end justify-end">
          {/* Global Disable All Button */}
          {totalEnabledMods > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDisableAllGame}
              disabled={disablingAll}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-(--text-muted) hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Disable all ${totalEnabledMods} active mod${totalEnabledMods !== 1 ? "s" : ""} for ${game.name}`}
            >
              {disablingAll ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
              ) : (
                <EyeOff size={15} />
              )}
              {disablingAll ? "Disabling…" : `Disable All (${totalEnabledMods})`}
            </motion.button>
          )}

          {/* Search Bar */}
          <div className="relative w-full sm:w-64 xl:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-(--text-muted)" size={16} />
            <input
              type="text"
              placeholder={activeTab === "characters" ? "Search characters..." : "Search mods..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-(--active-accent)/50 focus:ring-1 focus:ring-(--active-accent)/30 transition-all shadow-inner hover:bg-black/60 placeholder:text-(--text-muted)"
            />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="flex-1"
        >
          {activeTab === "characters" ? (
            displayItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-24 bg-white/5 border border-white/5 rounded-3xl border-dashed">
                <h3 className="text-xl font-medium text-white mb-2">No {activeTab} mods found</h3>
                <p className="text-(--text-muted) max-w-sm">
                  {searchQuery 
                    ? `No results matching "${searchQuery}" in this category.`
                    : `You haven't installed any ${activeTab} mods yet.`}
                </p>
              </div>
            ) : (
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-12"
                variants={containerVariants}
                initial="hidden"
                animate="show"
              >
                {displayItems.map((item) => (
                  <CharacterCard
                    key={item.name}
                    character={item}
                    game={game}
                    hasUpdate={updatesMap[item.name]}
                    onClick={() => onSelectCharacter(item)}
                  />
                ))}
              </motion.div>
            )
          ) : (
             <ModDetail 
               game={game} 
               character={{ name: activeTab === "ui" ? "User Interface" : "Miscellaneous" }} 
               hideHeader={true} 
               searchQuery={searchQuery} 
               onBack={() => {}} 
             />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
