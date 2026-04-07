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
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { WifiOff } from "lucide-react";

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
  const addDownload = useAppStore((state) => state.addDownload);
  const completeDownload = useAppStore((state) => state.completeDownload);
  
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

  const isOnline = useNetworkStatus();

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
      if (!isOnline || !game.gbGameId || !window.electronMods?.browseGbMods) return;
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
  }, [game.gbGameId, isOnline]);

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

    if (!isOnline) {
      setLoading(false);
      return;
    }

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
    isOnline,
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

      if (!window.electronMods?.installGbMod) {
        throw new Error("Mod installation is unavailable right now.");
      }

      addDownload({ id: gbModId, title: fileName || "Mod Library" });

      void (async () => {
        try {
          const result = await window.electronMods.installGbMod({
            importerPath,
            characterName,
            gbModId,
            fileUrl,
            fileName,
            category,
            gameId: game.id,
          });

          completeDownload(gbModId, result.success, result.error);

          if (!result.success) {
            return;
          }

          await refreshInstalledModsInfo(true);
        } catch (err) {
          completeDownload(gbModId, false, err.message || "Installation failed");
        }
      })();
    },
    [
      importerPath,
      game.id,
      refreshInstalledModsInfo,
      addDownload,
      completeDownload,
    ],
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

      {/* ── SECTION: Page Header ─────────────────────────────────────────── */}

      {/* ── SECTION: Browse Tabs (All / Characters / UI / Misc / Saved) ──── */}
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

      {/* ── SECTION: Search, Filters & Sort Toolbar ──────────────────────── */}
      <section className="ui-panel mb-4 p-4 sm:p-5">
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

      {/* ── SECTION: Hero Loading Skeleton ───────────────────────────────── */}
      {showFeaturedHero && loadingFeatured && (
        <div className="mb-4 w-full">
          <div className="flex items-center gap-2 mb-4 px-2 opacity-50">
            <Rocket className="text-text-muted" size={20} />
            <div className="w-32 h-6 bg-white/10 rounded-xl animate-pulse" />
          </div>
          <div className="w-full h-[360px] rounded-3xl bg-[#0a0a0a] border border-white/10 overflow-hidden relative">
            <div className="absolute left-12 top-1/2 -translate-y-1/2 flex flex-col gap-4">
              <div className="w-24 h-5 bg-white/5 rounded-full animate-pulse" />
              <div className="w-80 h-16 bg-white/10 rounded-2xl animate-pulse" />
              <div className="w-64 h-8 bg-white/5 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION: Hall of Fame Hero Carousel ──────────────────────────── */}
      {!loadingFeatured &&
        featuredMods.length > 0 &&
        showFeaturedHero &&
        (() => {
          const timeframes = [
            { label: "Mod of All Time", color: "from-amber-500 to-orange-600", shadow: "shadow-amber-500/50" },
            { label: "Mod of the Year", color: "from-purple-500 to-pink-600", shadow: "shadow-purple-500/50" },
            { label: "Mod of the Month", color: "from-blue-500 to-cyan-500", shadow: "shadow-blue-500/50" },
            { label: "Mod of the Week", color: "from-green-400 to-emerald-600", shadow: "shadow-green-500/50" },
            { label: "Trending Today", color: "from-red-500 to-rose-600", shadow: "shadow-red-500/50" },
          ];

          const mod = featuredMods[currentHeroIndex];
          const tf = timeframes[currentHeroIndex] || timeframes[timeframes.length - 1];

          return (
            <div className="mb-4 w-full">

              <div
                className="relative w-full h-[360px] rounded-3xl overflow-hidden border border-white/10 group cursor-pointer bg-[#0a0a0a]"
                onClick={() => {
                  window.electronMods
                    ?.fetchGbMod(mod._idRow)
                    .then((res) => { if (res.success) setInstallTarget(res.data); });
                }}
              >
                {/* Blurred atmospheric backdrop */}
                <AnimatePresence initial={false}>
                  <motion.div
                    key={mod._idRow + "-bg"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    className="absolute inset-0 z-0"
                  >
                    {mod.thumbnailUrl && (
                      <img
                        src={mod.thumbnailUrl}
                        className="w-full h-full object-cover scale-110 blur-2xl opacity-30 saturate-150"
                        alt=""
                        aria-hidden="true"
                      />
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Dark overlay */}
                <div className="absolute inset-0 z-10 bg-linear-to-r from-black/90 via-black/60 to-black/20" />
                <div className="absolute inset-0 z-10 bg-linear-to-t from-black/60 to-transparent" />

                {/* LEFT: Text content */}
                <AnimatePresence initial={false}>
                  <motion.div
                    key={mod._idRow}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="absolute inset-0 z-20 flex items-center"
                  >
                    <div className="flex flex-col justify-between h-full px-10 py-10 w-[52%]">
                      <div className="inline-flex items-center gap-1.5 w-max px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-[0.25em]">
                        <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                        {tf.label}
                      </div>
                      <h2 className="text-3xl md:text-[2.6rem] font-black text-white tracking-tighter leading-[1.05] drop-shadow-2xl line-clamp-3">
                        {mod._sName}
                      </h2>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCreatorClick(mod._aSubmitter); }}
                        className="flex items-center gap-3 group/creator w-max"
                      >
                        {mod._aSubmitter?._sAvatarUrl ? (
                          <img src={mod._aSubmitter._sAvatarUrl} alt={mod._aSubmitter._sName} className="w-8 h-8 rounded-full object-cover border border-white/20 group-hover/creator:border-primary/60 transition-all" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                            <User size={12} className="text-white/60" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-[0.2em] font-black text-white/40">Creator</span>
                          <span className="text-sm font-bold text-white group-hover/creator:text-primary transition-colors leading-tight">
                            {mod._aSubmitter?._sName || "Unknown"}
                          </span>
                        </div>
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* RIGHT: Diagonal image bleed */}
                <AnimatePresence initial={false}>
                  <motion.div
                    key={mod._idRow + "-img"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: "easeInOut" }}
                    className="absolute inset-y-0 right-0 w-[58%] z-10"
                    style={{ clipPath: "polygon(12% 0%, 100% 0%, 100% 100%, 0% 100%)" }}
                  >
                    {mod.thumbnailUrl ? (
                      <img
                        src={mod.thumbnailUrl}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                        style={{ imageRendering: "high-quality", filter: "contrast(1.08) saturate(1.15) brightness(1.05)", willChange: "transform" }}
                        alt={mod._sName}
                        decoding="async"
                        fetchPriority="high"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5" />
                    )}
                    <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/20 to-transparent pointer-events-none" />
                  </motion.div>
                </AnimatePresence>

                {/* Dot Navigator */}
                <div className="absolute bottom-5 right-8 z-30 flex items-center gap-3 bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full">
                  <button onClick={(e) => { e.stopPropagation(); setCurrentHeroIndex((prev) => prev > 0 ? prev - 1 : featuredMods.length - 1); }} className="text-white/50 hover:text-white transition-colors">
                    <ChevronLeft size={14} strokeWidth={3} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {featuredMods.map((_, i) => (
                      <button key={i} onClick={(e) => { e.stopPropagation(); setCurrentHeroIndex(i); }}
                        className={cn("rounded-full transition-all duration-300", i === currentHeroIndex ? "w-4 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60")}
                      />
                    ))}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setCurrentHeroIndex((prev) => prev < featuredMods.length - 1 ? prev + 1 : 0); }} className="text-white/50 hover:text-white transition-colors">
                    <ChevronRight size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── SECTION: Mod Cards Grid ───────────────────────────────────────── */}
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
                    description={
                      isFiltering
                        ? "Try a broader search, reset your filters, or switch categories."
                        : "No listings matched this section right now."
                    }
                    className="min-h-56"
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
