import { useState, useEffect, useMemo, useCallback, Suspense, lazy } from "react";
import { Search, User, Monitor, Box, EyeOff } from "lucide-react";
import CharacterCard from "../components/CharacterCard";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  getAllCharacterNames,
} from "../lib/portraits";
import { useFetchCache } from "../hooks/useFetchCache";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { Input } from "../components/ui/Input";
import { getModClassification } from "../lib/modClassification";
import PageHeader from "../components/layout/PageHeader";
import { StatePanel } from "../components/ui/StatePanel";

const CharacterDetail = lazy(() => import("./CharacterDetail"));

const TABS = [
  { id: "characters", label: "Characters", icon: User },
  { id: "ui", label: "User Interface", icon: Monitor },
  { id: "misc", label: "Miscellaneous", icon: Box },
];

export default function LibraryView({ isActive }) {
  const game = useAppStore((state) => state.activeGame);
  const onSelectCharacter = useAppStore((state) => state.setSelectedCharacter);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("characters");
  const [disablingAll, setDisablingAll] = useState(false);
  const [updatesMap, setUpdatesMap] = useState({});
  const [showDisableAllConfirm, setShowDisableAllConfirm] = useState(false);

  // Use fetch cache hook for update checks
  const { fetchModsBatch } = useFetchCache();

  // Standardized Mod Loading
  const { mods, loadMods } = useLoadGameMods(game.id, isActive !== false);

  useEffect(() => {
    const checkUpdates = async () => {
      if (!mods || mods.length === 0) return;

      const modsWithId = mods.filter((m) => m.gamebananaId);
      const gbIds = [...new Set(modsWithId.map((m) => m.gamebananaId))];
      if (gbIds.length === 0) return;

      try {
        const result = await fetchModsBatch(gbIds);
        if (result.success && result.data) {
          const newUpdatesMap = {};

          // Map fetched data for quick lookup
          const latestDates = {};
          result.data.forEach((m) => {
            if (m._idRow) latestDates[String(m._idRow)] = m._tsDateUpdated;
          });

          // Check each mod
          mods.forEach((mod) => {
            const gbId = mod.gamebananaId ? String(mod.gamebananaId) : null;
            if (gbId && mod.installedAt && latestDates[gbId]) {
              const installedDate = new Date(mod.installedAt).getTime() / 1000;
              const gbDate = latestDates[gbId];

              // Use a 5-minute buffer (300s) to account for slight clock skews
              if (gbDate > installedDate + 300) {
                const classification = getModClassification(mod);
                newUpdatesMap[classification.label] = true;

                if (classification.bucket === "ui") newUpdatesMap["ui"] = true;
                else if (classification.bucket === "misc") {
                  newUpdatesMap["misc"] = true;
                } else {
                  newUpdatesMap["characters"] = true;
                }
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
  }, [fetchModsBatch, mods]);

  const handleDisableAllGame = useCallback(() => {
    const enabledMods = mods.filter((m) => m.isEnabled);
    if (enabledMods.length === 0) return;
    setShowDisableAllConfirm(true);
  }, [mods]);

  const confirmDisableAllGame = useCallback(async () => {
    setShowDisableAllConfirm(false);
    setDisablingAll(true);
    try {
      const config = await window.electronConfig.getConfig();
      const importerPath = config[game.id];
      const results = await Promise.all(
        mods
          .filter((m) => m.isEnabled)
          .map((mod) =>
            window.electronMods.toggleMod({
              importerPath,
              originalFolderName: mod.originalFolderName,
              enable: false,
            }),
          ),
      );

      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        alert(
          `Failed to disable ${failures.length} mod(s).\n\n` +
          `This usually happens if the game is currently open and locking the files. ` +
          `Please close the game and try again.`
        );
      }

      await loadMods(true);
    } finally {
      setDisablingAll(false);
    }
  }, [mods, game.id, loadMods]);

  const totalEnabledMods = useMemo(
    () => mods.filter((m) => m.isEnabled).length,
    [mods],
  );

  // Group and Filter logic
  const { displayItems, counts } = useMemo(() => {
    const charactersMap = new Map();
    const globalMods = {
      ui: { name: "User Interface", totalMods: 0, enabledMods: 0, mods: [] },
      misc: { name: "Miscellaneous", totalMods: 0, enabledMods: 0, mods: [] },
    };

    // Pre-populate characters only for the characters tab
    const currentChars = getAllCharacterNames(game.id);
    currentChars.forEach((name) => {
      charactersMap.set(name, {
        name,
        totalMods: 0,
        enabledMods: 0,
        mods: [],
      });
    });

    mods.forEach((mod) => {
      const classification = getModClassification(mod);

      if (classification.bucket === "ui") {
        globalMods.ui.totalMods++;
        globalMods.ui.mods.push(mod);
        if (mod.isEnabled) globalMods.ui.enabledMods++;
      } else if (classification.bucket === "misc") {
        globalMods.misc.totalMods++;
        globalMods.misc.mods.push(mod);
        if (mod.isEnabled) globalMods.misc.enabledMods++;
      } else {
        // Character Bound
        if (!charactersMap.has(classification.label)) {
          charactersMap.set(classification.label, {
            name: classification.label,
            totalMods: 0,
            enabledMods: 0,
            mods: [],
          });
        }
        const charData = charactersMap.get(classification.label);
        charData.totalMods++;
        charData.mods.push(mod);
        if (mod.isEnabled) charData.enabledMods++;
      }
    });

    let items = [];
    if (activeTab === "characters") {
      items = Array.from(charactersMap.values())
        .filter((c) => c.name !== "Unassigned" || c.totalMods > 0)
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

    const filteredItems = items.filter((item) => {
      return item.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return {
      displayItems: filteredItems,
      counts: {
        characters: Array.from(charactersMap.values()).reduce(
          (acc, c) => acc + c.totalMods,
          0,
        ),
        ui: globalMods.ui.totalMods,
        misc: globalMods.misc.totalMods,
      },
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
      <PageHeader
        eyebrow="Library"
        title={`${game.name} Library`}
        description={`${mods.length.toLocaleString()} installed mod${mods.length !== 1 ? "s" : ""} with ${totalEnabledMods.toLocaleString()} currently enabled.`}
        actions={
          <>
            {totalEnabledMods > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleDisableAllGame}
                disabled={disablingAll}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 text-xs font-black uppercase tracking-widest text-text-muted shadow-sm transition-all hover:bg-white/5 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                title={`Disable all ${totalEnabledMods} active mod${totalEnabledMods !== 1 ? "s" : ""} for ${game.name}`}
              >
                {disablingAll ? (
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                ) : (
                  <EyeOff size={15} />
                )}
                {disablingAll ? "Disabling…" : `Disable All (${totalEnabledMods})`}
              </motion.button>
            )}

            <div className="relative w-full sm:w-64 xl:w-72">
              <Input
                icon={Search}
                placeholder={
                  activeTab === "characters"
                    ? "Search characters..."
                    : "Search mods..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </>
        }
      >
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
                  "group relative flex items-center gap-2 pb-2 transition-all",
                  isActive
                    ? "text-primary"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                <Icon size={16} />
                <span className="text-sm font-bold uppercase tracking-widest">
                  {tab.label}
                </span>
                {hasUpdate && (
                  <div className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-update shadow-[0_0_8px_var(--color-update)]" />
                )}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-black",
                      isActive
                        ? "bg-primary text-black"
                        : "bg-white/10 text-text-muted group-hover:bg-white/20",
                    )}
                  >
                    {count}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </PageHeader>

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
              <StatePanel
                title={`No ${activeTab} mods found`}
                message={
                  searchQuery
                    ? `No results matching "${searchQuery}" in this category.`
                    : `You haven't installed any ${activeTab} mods yet.`
                }
                className="p-24"
              />
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
            <Suspense
              fallback={
                <StatePanel
                  title="Loading collection"
                  message="Pulling the latest local mod state for this section."
                  className="p-24"
                />
              }
            >
              <CharacterDetail
                game={game}
                character={{
                  name: activeTab === "ui" ? "User Interface" : "Miscellaneous",
                }}
                hideHeader={true}
                searchQuery={searchQuery}
                onBack={() => {}}
              />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>

      <ConfirmDialog
        isOpen={showDisableAllConfirm}
        title="Disable All Mods"
        message={`Are you sure you want to disable all ${totalEnabledMods} active mod${totalEnabledMods !== 1 ? "s" : ""} for ${game.name}? This will turn off all currently enabled modifications.`}
        confirmText="Disable All"
        onConfirm={confirmDisableAllGame}
        onCancel={() => setShowDisableAllConfirm(false)}
      />
    </div>
  );
}
