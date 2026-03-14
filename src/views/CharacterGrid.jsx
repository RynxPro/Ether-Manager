import { useState, useEffect, useMemo } from "react";
import { Search, User, Monitor, Box } from "lucide-react";
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

export default function CharacterGrid({ game, onSelectCharacter }) {
  const [mods, setMods] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("characters");

  useEffect(() => {
    async function loadMods() {
      if (window.electronConfig && window.electronMods) {
        const config = await window.electronConfig.getConfig();
        const importerPath = config[game.id];
        if (importerPath) {
          const knownCharacters = getAllCharacterNames(game.id);
          const allParseableNames = [...knownCharacters, ...GLOBAL_CATEGORIES];
          const loadedMods = await window.electronMods.getMods(importerPath, allParseableNames);
          setMods(loadedMods);
        } else {
          setMods([]);
        }
      }
    }
    loadMods();
  }, [game.id]);

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">{game.name}</h1>
          <nav className="flex items-center gap-6 mt-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const count = counts[tab.id];

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "group relative pb-2 flex items-center gap-2 transition-all",
                    isActive ? "text-(--active-accent)" : "text-gray-500 hover:text-white"
                  )}
                >
                  <Icon size={16} />
                  <span className="text-sm font-bold uppercase tracking-widest">{tab.label}</span>
                  {count > 0 && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-black",
                      isActive ? "bg-(--active-accent) text-black" : "bg-white/10 text-gray-400 group-hover:bg-white/20"
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

        <div className="relative self-end mb-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder={activeTab === "characters" ? "Search characters..." : "Search mods..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-(--active-accent) focus:bg-white/10 transition-all w-64"
          />
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
                <p className="text-gray-400 max-w-sm">
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
