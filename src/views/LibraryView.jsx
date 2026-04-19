import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  Suspense,
  lazy,
} from "react";
import { Search, User, Monitor, Box, EyeOff } from "lucide-react";
import CharacterCard from "../components/CharacterCard";
import ConfirmDialog from "../components/ConfirmDialog";
import { getAllCharacterNames } from "../lib/portraits";
import { useFetchCache } from "../hooks/useFetchCache";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { Input } from "../components/ui/Input";
import { getModClassification } from "../lib/modClassification";
import PageHeader from "../components/layout/PageHeader";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { StatePanel, StatusBanner } from "../components/ui/StatePanel";
import { Button } from "../components/ui/Button";
import { VISIBLE_GAMES } from "../gameConfig";

function normalizeImporterPath(pathValue) {
  return String(pathValue || "")
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

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
  const [sharedImporterGames, setSharedImporterGames] = useState([]);
  const [apiNotice, setApiNotice] = useState("");

  // Use fetch cache hook for update checks
  const { fetchModsBatch } = useFetchCache();

  // Standardized Mod Loading
  const { mods, loadMods } = useLoadGameMods(game.id, isActive !== false);
  const isOnline = useNetworkStatus();

  useEffect(() => {
    const checkUpdates = async () => {
      // Library is always mounted but often hidden; do not compete with Browse/Presets on startup.
      if (!isActive) return;
      if (!isOnline || !mods || mods.length === 0) return;

      const modsWithId = mods.filter((m) => m.gamebananaId);
      const gbIds = [...new Set(modsWithId.map((m) => m.gamebananaId))];
      if (gbIds.length === 0) return;

      try {
        const result = await fetchModsBatch(gbIds, {
          priority: "low",
          concurrency: 2,
        });
        if (!result.success) {
          if (result.code === "RATE_LIMITED") {
            const retryInSeconds = Math.max(
              1,
              Math.ceil((Number(result.retryAfterMs) || 5000) / 1000),
            );
            setApiNotice(
              `GameBanana update checks are temporarily paused due to rate limits. Retrying in about ${retryInSeconds}s.`,
            );
          }
          return;
        }

        setApiNotice("");
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
  }, [isActive, fetchModsBatch, mods, isOnline, game.id]);

  useEffect(() => {
    let cancelled = false;

    const loadSharedImporterGames = async () => {
      if (!window.electronConfig?.getConfig) {
        setSharedImporterGames([]);
        return;
      }

      try {
        const config = await window.electronConfig.getConfig();
        if (cancelled) return;

        const currentPath = normalizeImporterPath(config[game.id]);
        if (!currentPath) {
          setSharedImporterGames([]);
          return;
        }

        const sharedGames = VISIBLE_GAMES.filter(
          (candidate) =>
            candidate.id !== game.id &&
            normalizeImporterPath(config[candidate.id]) === currentPath,
        );

        setSharedImporterGames(sharedGames);
      } catch {
        if (!cancelled) {
          setSharedImporterGames([]);
        }
      }
    };

    loadSharedImporterGames();
    return () => {
      cancelled = true;
    };
  }, [game.id]);

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

      const failures = results.filter((r) => !r.success);
      if (failures.length > 0) {
        alert(
          `Failed to disable ${failures.length} mod(s).\n\n` +
            `This usually happens if the game is currently open and locking the files. ` +
            `Please close the game and try again.`,
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
  const totalUpdateGroups = useMemo(
    () => Object.keys(updatesMap).length,
    [updatesMap],
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
      <PageHeader title="Library" />

      <section className="ui-panel mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          {sharedImporterGames.length > 0 && (
            <StatusBanner tone="warning">
              This library shares its mods path with {sharedImporterGames.map((sharedGame) => sharedGame.name).join(", ")}.
              Untagged legacy mods may be hidden or scoped away until they are re-tagged for a specific game.
            </StatusBanner>
          )}
          {apiNotice && <StatusBanner tone="warning">{apiNotice}</StatusBanner>}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex flex-wrap items-center gap-2">
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
                      "ui-focus-ring group relative flex items-center gap-2 rounded-md border px-4 py-2.5 transition-all",
                      isActive
                        ? "border-primary/30 bg-primary/10 text-primary shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary),transparent_75%)]"
                        : "border-transparent bg-transparent text-text-muted hover:border-border hover:bg-white/4 hover:text-text-primary",
                    )}
                  >
                    <Icon size={16} />
                    <span className="text-xs font-bold uppercase tracking-[0.16em]">
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
                  </button>
                );
              })}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                >
                  Clear
                </Button>
              )}
              {totalEnabledMods > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDisableAllGame}
                  disabled={disablingAll}
                  title={`Disable all ${totalEnabledMods} active mod${totalEnabledMods !== 1 ? "s" : ""} for ${game.name}`}
                  icon={EyeOff}
                >
                  {disablingAll ? "Disabling…" : "Disable All"}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="w-full xl:max-w-xl 2xl:max-w-2xl">
              <Input
                icon={Search}
                placeholder={
                  activeTab === "characters"
                    ? "Search collections..."
                    : "Search this section..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-2xl shadow-inner"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/6 pt-3">
            <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
              {mods.length} Installed
            </div>
            <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
              {totalEnabledMods} Enabled
            </div>
            {totalUpdateGroups > 0 && (
              <div className="rounded-full border border-update/20 bg-update/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-update">
                {totalUpdateGroups} Update{totalUpdateGroups === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </div>
      </section>

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
            <>
              <div className="mb-4 flex items-center justify-between gap-3 px-1">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                  {displayItems.length} collection
                  {displayItems.length !== 1 ? "s" : ""}
                </div>
                {searchQuery && (
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                    Filtered by {searchQuery}
                  </div>
                )}
              </div>

              {displayItems.length === 0 ? (
                <StatePanel
                  title="No collections found"
                  message={
                    searchQuery
                      ? `No collections match "${searchQuery}".`
                      : "No installed character collections yet."
                  }
                  className="p-24"
                />
              ) : (
                <motion.div
                  className="grid grid-cols-2 gap-4 pb-12 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
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
              )}
            </>
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
