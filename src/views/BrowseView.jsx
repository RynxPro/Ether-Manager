import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  Monitor,
  Box,
  LayoutGrid,
  Rocket,
  Download,
  Bookmark,
} from "lucide-react";
import GbModCard from "../components/GbModCard";
import ModDetailModal from "../components/ModDetailModal";
import CreatorProfileModal from "../components/CreatorProfileModal";
import { getAllCharacterNames } from "../lib/portraits";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import SearchableDropdown from "../components/SearchableDropdown";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useDebounce } from "../hooks/useDebounce";
import { useFetchCache } from "../hooks/useFetchCache";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import PageHeader from "../components/layout/PageHeader";
import {
  createUnavailableBookmarkPlaceholder,
  normalizeBookmarkConfig,
} from "../lib/bookmarks";
import { StateGridSkeleton, StatePanel } from "../components/ui/StatePanel";

const TABS = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "characters", label: "Characters", icon: User },
  { id: "ui", label: "User Interface", icon: Monitor },
  { id: "misc", label: "Miscellaneous", icon: Box },
  { id: "saved", label: "Saved", icon: Bookmark },
];

const SORT_OPTIONS = [
  { label: "Latest", value: "" },
  { label: "Most Liked", value: "likes" },
  { label: "Most Downloaded", value: "downloads" },
  { label: "Most Viewed", value: "views" },
];

const PER_PAGE = 20;

export default function BrowseView() {
  const game = useAppStore((state) => state.activeGame);
  const configVersion = useAppStore((state) => state.configVersion);
  const [activeTab, setActiveTab] = useState("all");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [mods, setMods] = useState([]);
  const [installedModsInfo, setInstalledModsInfo] = useState({}); // gbId -> { installedFile }
  const [installTarget, setInstallTarget] = useState(null);
  const [activeCreatorProfile, setActiveCreatorProfile] = useState(null);
  const [importerPath, setImporterPath] = useState(null);
  const [characterFilter, setCharacterFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300); // Reduced from 400ms for better responsiveness

  const [bookmarkIdsByGame, setBookmarkIdsByGame] = useState({});
  const [bookmarkedCreators, setBookmarkedCreators] = useState([]);
  const [savedModsCatalog, setSavedModsCatalog] = useState({});

  const [featuredMods, setFeaturedMods] = useState([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  // Use fetch cache for individual mod details
  const { fetchMod } = useFetchCache();
  const currentBookmarkIds = useMemo(
    () => bookmarkIdsByGame[game.id] || [],
    [bookmarkIdsByGame, game.id],
  );
  const bookmarkSignature = currentBookmarkIds.join(",");
  const currentBookmarkIdSet = useMemo(
    () => new Set(currentBookmarkIds),
    [currentBookmarkIds],
  );

  // Fetch Featured Mods (Randomized popular mods per session)
  useEffect(() => {
    const fetchFeatured = async () => {
      if (!game.gbGameId || !window.electronMods?.browseGbMods) return;
      setLoadingFeatured(true);
      try {
        // Randomly grab page 1, 2, or 3 of the most liked mods
        const randomPage = Math.floor(Math.random() * 3) + 1;
        const result = await window.electronMods.browseGbMods({
          gbGameId: game.gbGameId,
          page: randomPage,
          perPage: 15,
          sort: "likes",
          context: "",
          search: "",
        });
        if (result.success && result.records) {
          // Shuffle the large pool and take 5 to ensure fresh variety
          const shuffled = [...result.records].sort(() => 0.5 - Math.random());
          setFeaturedMods(shuffled.slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to fetch featured mods:", err);
      } finally {
        setLoadingFeatured(false);
      }
    };
    fetchFeatured();
  }, [game.gbGameId]);

  // Load importer path and bookmarks once
  useEffect(() => {
    const loadConfigAndPath = async () => {
      if (window.electronConfig) {
        const config = await window.electronConfig.getConfig();
        const normalizedBookmarks = normalizeBookmarkConfig(config.bookmarks);
        setImporterPath(config[game.id] || null);
        setBookmarkIdsByGame(normalizedBookmarks.bookmarks);
        setBookmarkedCreators(config.bookmarkedCreators || []);
        if (normalizedBookmarks.migrated) {
          window.electronConfig.setConfig({
            bookmarks: normalizedBookmarks.bookmarks,
          });
        }
      }
    };
    loadConfigAndPath();
  }, [game.id, configVersion]);

  const handleToggleBookmark = useCallback(
    (mod) => {
      setBookmarkIdsByGame((prev) => {
        const gameBookmarks = prev[game.id] || [];
        const modId = mod?._idRow;
        if (!Number.isInteger(modId)) {
          return prev;
        }
        const index = gameBookmarks.indexOf(modId);
        let newGameBookmarks;
        if (index >= 0) {
          newGameBookmarks = [
            ...gameBookmarks.slice(0, index),
            ...gameBookmarks.slice(index + 1),
          ];
        } else {
          newGameBookmarks = [modId, ...gameBookmarks];
        }
        const newBookmarks = { ...prev, [game.id]: newGameBookmarks };
        if (window.electronConfig) {
          window.electronConfig.setConfig({ bookmarks: newBookmarks });
        }

        setSavedModsCatalog((current) => {
          const currentSaved = current[game.id] || [];
          if (index >= 0) {
            return {
              ...current,
              [game.id]: currentSaved.filter((entry) => entry._idRow !== modId),
            };
          }

          if (currentSaved.some((entry) => entry._idRow === modId)) {
            return current;
          }

          return {
            ...current,
            [game.id]: [mod, ...currentSaved],
          };
        });

        return newBookmarks;
      });
    },
    [game.id],
  );

  const handleToggleCreatorBookmark = useCallback((creator) => {
    setBookmarkedCreators((prev) => {
      const index = prev.findIndex((c) => c._idRow === creator._idRow);
      let newList;
      if (index >= 0) {
        newList = [...prev.slice(0, index), ...prev.slice(index + 1)];
      } else {
        newList = [creator, ...prev];
      }
      if (window.electronConfig) {
        window.electronConfig.setConfig({ bookmarkedCreators: newList });
      }
      return newList;
    });
  }, []);

  const { mods: allMods, loadMods: refreshInstalledModsInfo } = useLoadGameMods(game.id, true);

  useEffect(() => {
    if (!allMods) return;
    const infoMap = {};
    allMods.forEach((m) => {
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
  }, [allMods]);


  // Fetch mods from GameBanana when params change (API Tabs ONLY)
  const fetchMods = useCallback(async () => {
    if (activeTab === "saved") return;

    if (!window.electronMods?.browseGbMods) {
      setLoading(false);
      setError(
        "GameBanana browser is unavailable because the Electron bridge failed to load.",
      );
      return;
    }

    if (!game.gbGameId) {
      setError("GameBanana integration is not yet available for this game.");
      return;
    }
    setLoading(true);
    setError(null);

    const categoryTarget =
      activeTab === "all"
        ? ""
        : activeTab === "ui"
          ? "UI"
          : activeTab === "misc"
            ? "Misc"
            : characterFilter;

    try {
      const result = await window.electronMods.browseGbMods({
        gbGameId: game.gbGameId,
        page,
        perPage: PER_PAGE,
        sort,
        context: categoryTarget,
        search: debouncedSearchQuery,
      });
      if (result.success) {
        setMods(result.records);
        setTotal(result.total);
      } else {
        setError(result.error || "Failed to load mods from GameBanana.");
      }
    } catch (err) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, [
    game.gbGameId,
    page,
    sort,
    characterFilter,
    activeTab,
    debouncedSearchQuery,
  ]);

  // Trigger API fetch for non-saved tabs
  useEffect(() => {
    if (activeTab !== "saved") {
      fetchMods();
    } else {
      setError(null);
    }
  }, [fetchMods, activeTab, debouncedSearchQuery]);

  useEffect(() => {
    if (activeTab !== "saved") return;

    if (currentBookmarkIds.length === 0) {
      setSavedModsCatalog((prev) => ({ ...prev, [game.id]: [] }));
      setMods([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }

    if (!window.electronMods?.fetchGbModsSummaries) {
      setError(
        "Saved bookmarks are unavailable because the Electron bridge failed to load.",
      );
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    window.electronMods
      .fetchGbModsSummaries(currentBookmarkIds)
      .then((result) => {
        if (cancelled) return;

        if (!result.success) {
          setError(result.error || "Failed to load saved bookmarks.");
          return;
        }

        const summaryMap = new Map(
          (result.data || []).map((mod) => [mod._idRow, mod]),
        );
        const orderedMods = currentBookmarkIds.map(
          (id) => summaryMap.get(id) || createUnavailableBookmarkPlaceholder(id),
        );
        setSavedModsCatalog((prev) => ({ ...prev, [game.id]: orderedMods }));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Failed to load saved bookmarks.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, currentBookmarkIds, bookmarkSignature, game.id]);

  useEffect(() => {
    if (activeTab !== "saved" || loading) return;

    const savedMods = savedModsCatalog[game.id] || [];
    const searchTarget = debouncedSearchQuery.toLowerCase();
    const filtered = searchTarget
      ? savedMods.filter((m) => (m._sName || "").toLowerCase().includes(searchTarget))
      : savedMods;

    setTotal(filtered.length);
    setMods(filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE));
  }, [activeTab, savedModsCatalog, game.id, debouncedSearchQuery, page, loading]);

  const handleInstall = useCallback(
    async ({ characterName, gbModId, fileUrl, fileName, category }) => {
      if (!importerPath)
        throw new Error("No importer path configured. Go to Settings first.");
      const result = await window.electronMods.installGbMod({
        importerPath,
        characterName,
        gbModId,
        fileUrl,
        fileName,
        category,
        gameId: game.id,
      });
      if (!result.success)
        throw new Error(result.error || "Installation failed.");
      await refreshInstalledModsInfo(true);
    },
    [importerPath, game.id, refreshInstalledModsInfo],
  );

  const handleCreatorClick = useCallback((submitter) => {
    setActiveCreatorProfile(submitter);
    setInstallTarget(null); // Close the mod detail modal if it's currently open
  }, []);

  const handleCardInstallClick = useCallback(
    async (mod) => {
      try {
        const result = await fetchMod(mod._idRow);
        if (result.success && result.data) {
          setInstallTarget(result.data);
        } else {
          setError("Failed to fetch mod details.");
        }
      } catch {
        setError("Failed to fetch mod details.");
      }
    },
    [fetchMod],
  );

  const totalPages = Math.ceil(total / PER_PAGE);
  const isSavedView = activeTab === "saved";
  const isFiltering = activeTab !== "all" || !!debouncedSearchQuery || !!sort;
  const showFeaturedHero = activeTab === "all" && !debouncedSearchQuery;
  const showCharacterFilter = activeTab === "characters";
  const showSortControl = activeTab !== "saved";
  const hasActiveRefinements =
    !!searchQuery || !!characterFilter || !!sort || activeTab !== "all";
  const activeSearchLabel = [
    activeTab === "ui"
      ? "User Interface"
      : activeTab === "misc"
        ? "Miscellaneous"
        : characterFilter,
    debouncedSearchQuery,
  ]
    .filter(Boolean)
    .join(" + ");
  const title =
    activeTab === "all"
      ? "Discover Mods"
      : activeTab === "characters"
        ? characterFilter
          ? `${characterFilter} Mods`
          : "Browse Character Mods"
        : activeTab === "ui"
          ? "User Interface Mods"
          : activeTab === "saved"
            ? "Saved Mods"
            : "Miscellaneous Mods";
  const description = loading
    ? "Loading the latest listings and saved items."
    : activeTab === "saved"
      ? `${Math.max(0, total).toLocaleString()} mod${total !== 1 ? "s" : ""} in your personal saved collection for ${game.name}.`
      : isFiltering
        ? `${Math.max(0, total).toLocaleString()} result${total !== 1 ? "s" : ""} from GameBanana for ${activeSearchLabel || game.name}.`
        : `${Math.max(0, total).toLocaleString()} mods currently available on GameBanana for ${game.name}.`;
  const searchPlaceholder = isSavedView
    ? "Search saved mods..."
    : activeTab === "characters"
      ? "Search character mods..."
      : activeTab === "ui"
        ? "Search UI mods..."
        : activeTab === "misc"
          ? "Search miscellaneous mods..."
          : "Search GameBanana...";

  const handleResetFilters = () => {
    setActiveTab("all");
    setCharacterFilter("");
    setSearchQuery("");
    setSort("");
    setPage(1);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        eyebrow="Browse"
        title={title}
        description={description}
      />

      {/* Featured Hero Loading Skeleton to strictly prevent layout shifting & bouncing frames */}
      {showFeaturedHero && loadingFeatured && (
        <div className="mb-4 w-full">
          <div className="flex items-center gap-2 mb-4 px-2 opacity-50">
            <Rocket className="text-text-muted" size={20} />
            <div className="w-32 h-6 bg-white/10 rounded-xl animate-pulse" />
          </div>
          <div className="w-full h-[400px] rounded-2xl bg-surface border border-border overflow-hidden relative group">
            {/* Simple structural hints */}
            <div className="absolute left-12 top-1/2 -translate-y-1/2 flex flex-col gap-4">
              <div className="w-24 h-5 bg-white/5 rounded-full animate-pulse" />
              <div className="w-80 h-16 bg-white/10 rounded-2xl animate-pulse" />
              <div className="w-64 h-8 bg-white/5 rounded-xl animate-pulse" />
            </div>
            <div className="absolute right-12 top-1/2 -translate-y-1/2 w-[45%] aspect-video rounded-3xl bg-white/5 shadow-2xl animate-pulse border border-white/10" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/50 to-transparent opacity-50" />
          </div>
        </div>
      )}

      {/* Featured Hero Carousel (Now spans full width) */}
      {!loadingFeatured &&
        featuredMods.length > 0 &&
        showFeaturedHero &&
        (() => {
          const timeframes = [
            {
              label: "Mod of All Time",
              color: "from-amber-500 to-orange-600",
              shadow: "shadow-amber-500/50",
            },
            {
              label: "Mod of the Year",
              color: "from-purple-500 to-pink-600",
              shadow: "shadow-purple-500/50",
            },
            {
              label: "Mod of the Month",
              color: "from-blue-500 to-cyan-500",
              shadow: "shadow-blue-500/50",
            },
            {
              label: "Mod of the Week",
              color: "from-green-400 to-emerald-600",
              shadow: "shadow-green-500/50",
            },
            {
              label: "Trending Today",
              color: "from-red-500 to-rose-600",
              shadow: "shadow-red-500/50",
            },
          ];

          const mod = featuredMods[currentHeroIndex];
          const tf =
            timeframes[currentHeroIndex] || timeframes[timeframes.length - 1];

          return (
            <div className="mb-4 w-full">
              <div className="flex items-center gap-2 mb-4 px-2">
                <Rocket className="text-primary" size={20} />
                <h2 className="text-xl font-bold text-text-primary uppercase tracking-widest">
                  Hall of Fame
                </h2>
              </div>

              <div className="relative w-full h-[400px] rounded-2xl bg-surface border border-border shadow-surface overflow-hidden flex group">
                {/* High-Tech Grid Pattern */}
                <div
                  className="absolute inset-0 opacity-[0.03] pointer-events-none"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
                    backgroundSize: "32px 32px",
                  }}
                />

                {/* Epic Ambient Glow */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary rounded-full blur-[150px] opacity-10 pointer-events-none transition-colors duration-1000" />

                <AnimatePresence initial={false}>
                  <motion.div
                    key={mod._idRow}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                    className="absolute inset-0 flex items-stretch w-full h-full"
                  >
                    {/* LEFT: Editorial Content */}
                    <div className="w-[55%] h-full p-12 flex flex-col relative z-20">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-black uppercase tracking-widest mb-6 w-max shadow-lg">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_10px_var(--color-primary)]" />
                        {tf.label}
                      </div>

                      <div className="flex-1 flex flex-col justify-center">
                        <h2 className="text-3xl md:text-[3.5rem] font-bold text-text-primary tracking-tighter drop-shadow-2xl leading-[1.05] line-clamp-3">
                          {mod._sName}
                        </h2>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap mt-6">
                        <button
                          onClick={() => handleCreatorClick(mod._aSubmitter)}
                          className="flex items-center gap-4 text-text-primary text-sm font-bold bg-surface border border-border hover:bg-white/5 hover:border-white/20 transition-all px-6 py-3.5 rounded-xl group/creator shadow-card"
                        >
                          {mod._aSubmitter?._sAvatarUrl ? (
                            <img
                              src={mod._aSubmitter._sAvatarUrl}
                              alt={mod._aSubmitter._sName}
                              className="w-10 h-10 rounded-full object-cover shadow-xl border-2 border-border group-hover/creator:border-primary/50 transition-all"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border-2 border-border group-hover/creator:border-primary/50 transition-all">
                              <User size={24} className="text-primary" />
                            </div>
                          )}
                          <span className="tracking-tight group-hover/creator:text-primary transition-colors">
                            {mod._aSubmitter?._sName}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* RIGHT: Image Showcase Card */}
                    <div className="w-[45%] relative z-20 flex items-center justify-center pr-12 pl-4">
                      <div
                        className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] cursor-pointer group/card"
                        onClick={() => {
                          window.electronMods
                            .fetchGbMod(mod._idRow)
                            .then((res) => {
                              if (res.success) setInstallTarget(res.data);
                            });
                        }}
                      >
                        {mod.thumbnailUrl ? (
                          <img
                            src={mod.thumbnailUrl}
                            className="w-full h-full object-cover scale-100 group-hover/card:scale-105 transition-transform duration-700 ease-out"
                            alt={mod._sName}
                          />
                        ) : (
                          <div className="w-full h-full bg-white/5 flex items-center justify-center">
                            <Box size={40} className="text-white/20" />
                          </div>
                        )}

                        {/* Glass Glare */}
                        <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/5 to-white/20 pointer-events-none mix-blend-overlay" />
                        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none" />

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-black shadow-primary/20 scale-90 group-hover/card:scale-100 transition-transform duration-300 ease-out">
                            <Download
                              size={24}
                              strokeWidth={3}
                              className="ml-0.5"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Bottom Right Pill Navigator */}
                <div className="absolute bottom-6 right-12 z-30 flex items-center gap-5 bg-surface backdrop-blur-xl border border-border px-5 py-2.5 rounded-full shadow-surface">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentHeroIndex((prev) =>
                        prev > 0 ? prev - 1 : featuredMods.length - 1,
                      );
                    }}
                    className="text-text-muted hover:text-text-primary hover:-translate-x-0.5 transition-all outline-none"
                  >
                    <ChevronLeft size={20} strokeWidth={3} />
                  </button>
                  <div className="text-[11px] font-black text-text-muted tracking-[0.2em] uppercase select-none">
                    <span className="text-text-primary mx-1">
                      {currentHeroIndex + 1}
                    </span>{" "}
                    / <span className="mx-1">{featuredMods.length}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentHeroIndex((prev) =>
                        prev < featuredMods.length - 1 ? prev + 1 : 0,
                      );
                    }}
                    className="text-text-muted hover:text-text-primary hover:translate-x-0.5 transition-all outline-none"
                  >
                    <ChevronRight size={20} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Secondary navigation */}
      <section className="ui-panel mb-4 p-3">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-text-muted">
          <SlidersHorizontal size={14} />
          Browse Sections
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPage(1);
                }}
                className={cn(
                  "ui-focus-ring group relative inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 transition-all",
                  isActive
                    ? "border-primary/30 bg-primary/10 text-primary shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary),transparent_75%)]"
                    : "border-transparent bg-transparent text-text-muted hover:border-border hover:bg-white/4 hover:text-text-primary",
                )}
              >
                <Icon
                  size={16}
                  className={cn(
                    isActive && "drop-shadow-[0_0_8px_var(--color-primary)]",
                  )}
                />
                <span className="text-[12px] font-black uppercase tracking-[0.15em]">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      {/* Action Toolbar */}
      <section className="ui-panel mb-8 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ui-eyebrow">Refine Results</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-text-primary">
              {isSavedView ? "Your saved collection" : "GameBanana listings"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">
              {isSavedView
                ? "Search the mods you bookmarked and jump directly into creator pages."
                : "Use search and filters to narrow the remote catalog before installing."}
            </p>
          </div>
          {hasActiveRefinements && (
            <Button variant="ghost" onClick={handleResetFilters}>
              Reset Filters
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="w-full xl:max-w-xl 2xl:max-w-2xl">
            <Input
              icon={Search}
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="rounded-2xl shadow-inner"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            {showCharacterFilter && (
              <div className="w-full sm:w-64 shrink-0">
                <SearchableDropdown
                  items={["All Characters", ...getAllCharacterNames(game.id)]}
                  value={characterFilter || "All Characters"}
                  onChange={(val) => {
                    setCharacterFilter(val === "All Characters" ? "" : val);
                    setPage(1);
                  }}
                  placeholder="All Characters"
                  gameId={game.id}
                />
              </div>
            )}

            {showSortControl && (
              <div className="w-full sm:w-48 shrink-0">
                <SearchableDropdown
                  items={SORT_OPTIONS}
                  value={sort}
                  onChange={(val) => {
                    setSort(val);
                    setPage(1);
                  }}
                  placeholder="Sort by..."
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
            Source: {isSavedView ? "Bookmarks" : "GameBanana"}
          </div>
          <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
            Scope: {activeTab === "all" ? game.name : title}
          </div>
          {showSortControl && sort && (
            <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
              Sorted by {SORT_OPTIONS.find((option) => option.value === sort)?.label || "Latest"}
            </div>
          )}
        </div>
      </section>

      {/* Content wrapper with guaranteed min-height to prevent layout jumping */}
      <div className="min-h-[60vh] relative w-full flex flex-col">
        {/* Error state */}
        {error && !loading && (
          <StatePanel
            title="Could not load mods"
            message={error}
            tone="danger"
            actionLabel="Retry"
            onAction={fetchMods}
          />
        )}

        {/* Loading skeleton */}
        {loading && (
          <StateGridSkeleton count={PER_PAGE} />
        )}

        {/* Mod grid */}
        {!loading && !error && (
          <>
            {/* Saved Creators Section */}
            {activeTab === "saved" && bookmarkedCreators.length > 0 && (
              <section className="ui-panel mb-8 p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="ui-eyebrow">Quick Access</p>
                    <h3 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-text-primary">
                      <Bookmark className="text-primary" size={18} /> Saved Creators
                    </h3>
                    <p className="mt-2 text-sm text-text-secondary">
                      Keep your favorite creators close without mixing them into the main results grid.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 overflow-x-auto scroller-hidden pb-4">
                  {bookmarkedCreators.map((creator) => (
                    <button
                      key={creator._idRow}
                      onClick={() => handleCreatorClick(creator)}
                      className="ui-focus-ring group/savedcreator min-w-[140px] shrink-0 rounded-[var(--radius-md)] border border-border bg-background px-4 py-4 text-left shadow-card transition-all hover:border-primary/20 hover:bg-white/4"
                    >
                      <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-border bg-surface shadow-surface transition-all group-hover/savedcreator:shadow-[0_0_20px_var(--color-primary)]/20">
                        {creator._sAvatarUrl ? (
                          <img
                            src={creator._sAvatarUrl}
                            alt={creator._sName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User
                            size={24}
                            className="text-text-muted group-hover/savedcreator:text-text-secondary transition-colors"
                          />
                        )}
                      </div>
                      <span className="block w-full truncate pt-3 text-center text-sm font-bold text-text-primary transition-colors group-hover/savedcreator:text-primary">
                        {creator._sName}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {mods.map((mod) => {
                const installedInfo = installedModsInfo[mod._idRow];
                const isInstalled = !!installedInfo;
                let hasUpdate = false;

                if (isInstalled && installedInfo.installedFiles.length > 0) {
                  // If ANY installed file from this mod is older than the GB record's last update
                  hasUpdate = installedInfo.installedFiles.some((f) => {
                    if (!f.installedAt) return false;
                    const installedDate =
                      new Date(f.installedAt).getTime() / 1000;
                    return mod._tsDateUpdated > installedDate + 300;
                  });
                }
                const isBookmarked = currentBookmarkIdSet.has(mod._idRow);

                return (
                  <GbModCard
                    key={mod._idRow}
                    mod={mod}
                    gameId={game.id}
                    isInstalled={isInstalled}
                    installedFiles={installedInfo?.installedFiles}
                    hasUpdate={hasUpdate}
                    isBookmarked={isBookmarked}
                    onClick={handleCardInstallClick}
                    onInstall={handleCardInstallClick}
                    onToggleBookmark={() => handleToggleBookmark(mod)}
                    onCreatorClick={handleCreatorClick}
                  />
                );
              })}
              {mods.length === 0 && (
                <div className="col-span-full">
                  <StatePanel
                    title={
                      isFiltering
                        ? `No results for "${activeSearchLabel}"`
                        : "No mods found"
                    }
                    message={
                      isFiltering
                        ? "Try a broader search, reset your filters, or switch categories."
                        : "No listings matched this section right now."
                    }
                    className="min-h-[14rem]"
                  />
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8 pb-8">
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  icon={ChevronLeft}
                  className="w-10 h-10 p-0"
                />
                <span className="text-sm text-text-muted">
                  Page{" "}
                  <span className="text-text-primary font-medium">{page}</span>{" "}
                  of{" "}
                  <span className="text-text-primary font-medium">
                    {totalPages}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  icon={ChevronRight}
                  className="w-10 h-10 p-0"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Creator Profile Modal */}
      {activeCreatorProfile && (
        <CreatorProfileModal
          creator={activeCreatorProfile}
          game={game}
          installedModsInfo={installedModsInfo}
          bookmarkIds={currentBookmarkIds}
          onToggleBookmark={handleToggleBookmark}
          isCreatorBookmarked={bookmarkedCreators.some(
            (c) => c._idRow === activeCreatorProfile._idRow,
          )}
          onToggleCreatorBookmark={handleToggleCreatorBookmark}
          onModClick={handleCardInstallClick}
          onClose={() => setActiveCreatorProfile(null)}
        />
      )}

      {/* Mod detail modal */}
      {installTarget && (
        <ModDetailModal
          mod={installTarget}
          game={game}
          installedFileInfo={installedModsInfo[installTarget._idRow]}
          onClose={() => setInstallTarget(null)}
          onInstall={handleInstall}
          isBookmarked={currentBookmarkIdSet.has(installTarget._idRow)}
          onToggleBookmark={() => handleToggleBookmark(installTarget)}
          onCreatorClick={handleCreatorClick}
        />
      )}
    </div>
  );
}
