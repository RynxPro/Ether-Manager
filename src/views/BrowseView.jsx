import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import GbModCard from '../components/mod-card/GbModCard';

import { getAllCharacterNames } from "../lib/portraits";
import { motion, AnimatePresence } from "framer-motion";
import { useDebounce } from "../hooks/useDebounce";
import { useFetchCache } from "../hooks/useFetchCache";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useBrowseListing } from "../hooks/useBrowseListing";
import { useAppStore } from "../store/useAppStore";
import { useApiStatus } from "../store/useApiStore";

import {
  createUnavailableBookmarkPlaceholder,
  normalizeBookmarkConfig,
} from "../lib/bookmarks";
import { StateGridSkeleton, StatePanel } from "../components/ui/StatePanel";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { getInstalledModUpdateState } from "../lib/modUpdateState";
import {
  createGbInstallPayload,
  runGbInstallJob,
} from "../lib/installFlow";
import { getBrowseViewModel } from "../lib/browseState";
import BrowseControls from "../components/browse/BrowseControls";
import BrowseFeaturedHero from "../components/browse/BrowseFeaturedHero";
import SavedCreatorsStrip from "../components/browse/SavedCreatorsStrip";

function RateLimitBanner() {
  const apiStatus = useApiStatus();
  
  if (!apiStatus.isCoolingDown) return null;

  return (
    <div className="mb-3 rounded-xl border border-orange-500/35 bg-orange-500/10 px-4 py-3 flex items-center gap-3 text-orange-200/95 text-[11px] font-semibold">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>
        GameBanana is rate-limiting requests. Retrying automatically in about{" "}
        <span className="font-black text-orange-300">
          {apiStatus.cooldownSecondsRemaining}s
        </span>
        ...
      </span>
    </div>
  );
}

const TABS = [
  { id: "all", label: "All" },
  { id: "characters", label: "Characters" },
  { id: "ui", label: "User Interface" },
  { id: "misc", label: "Miscellaneous" },
  { id: "saved", label: "Saved" },
];

// Full list of sort options from /Mod/ListFilterConfig
const SORT_OPTIONS = [
  { label: "Default", value: "" },
  { label: "Newest", value: "Generic_Newest" },
  { label: "Latest Updated", value: "Generic_LatestUpdated" },
  { label: "New & Updated", value: "Generic_NewAndUpdated" },
  { label: "Most Liked", value: "Generic_MostLiked" },
  { label: "Most Downloaded", value: "Generic_MostDownloaded" },
  { label: "Most Viewed", value: "Generic_MostViewed" },
  { label: "Most Commented", value: "Generic_MostCommented" },
  { label: "Latest Comment", value: "Generic_LatestComment" },
  { label: "Latest Modified", value: "Generic_LatestModified" },
  { label: "A → Z", value: "Generic_Alphabetically" },
  { label: "Z → A", value: "Generic_ReverseAlphabetically" },
  { label: "Oldest", value: "Generic_Oldest" },
];

const PER_PAGE = 25;
/** Defer hero carousel fetch so the main grid request wins the API queue first */
const FEATURED_FETCH_DELAY_MS = 160;
const CREATOR_HYDRATION_BATCH_SIZE = 3;

function formatGbApiError(errorLike, fallback = "Request failed.") {
  const code = errorLike?.code;
  const retryAfterMs = Number(errorLike?.retryAfterMs);
  if (code === "RATE_LIMITED") {
    const seconds = Math.max(
      1,
      Math.ceil((Number.isFinite(retryAfterMs) ? retryAfterMs : 5000) / 1000),
    );
    return `GameBanana is rate-limiting requests. Cooling down for about ${seconds}s before retrying.`;
  }
  return errorLike?.error || errorLike?.message || fallback;
}

export default function BrowseView({ isActive = false }) {
  const game = useAppStore((state) => state.activeGame);
  const configVersion = useAppStore((state) => state.configVersion);
  const addDownload = useAppStore((state) => state.addDownload);
  const completeDownload = useAppStore((state) => state.completeDownload);
  const nsfwMode = useAppStore((state) => state.nsfwMode);


  const gridTopRef = useRef(null);
  const [activeTab, setActiveTab] = useState("all");
  const [sort, setSort] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const installedModsMap = useAppStore(state => state.installedModsMap);
  const installedModsInfo = useMemo(
    () => installedModsMap[game.id] ?? {},
    [installedModsMap, game.id],
  );
  const pushPage = useAppStore(state => state.pushPage);
  const [importerPath, setImporterPath] = useState(null);
  const [characterFilter, setCharacterFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 150);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const searchContainerRef = useRef(null);

  const [bookmarkIdsByGame, setBookmarkIdsByGame] = useState({});
  const [bookmarkedCreatorsByGame, setBookmarkedCreatorsByGame] = useState({});
  const currentBookmarkedCreators = useMemo(
    () => bookmarkedCreatorsByGame[game.id] || [],
    [bookmarkedCreatorsByGame, game.id],
  );
  const [hydratedCreators, setHydratedCreators] = useState({});
  const [savedModsCatalog, setSavedModsCatalog] = useState({});

  const [featuredMods, setFeaturedMods] = useState([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  /** Gate hero API until the main browse row has finished for this game (avoids Subfeed + TopSubs + N×Profile burst on switch). */
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const heroIntervalRef = useRef(null);

  const {
    fetchMod,
    fetchModsSummaries,
    fetchFeaturedMods,
    fetchMemberProfile,
    searchModSuggestions,
  } = useFetchCache();
  const {
    mods,
    setMods,
    total,
    setTotal,
    loading,
    setLoading,
    error,
    setError,
    browseGridReadyForFeatured,
    fetchMods,
    perPage: perPage,
  } = useBrowseListing({
    game,
    isActive,
    activeTab,
    page,
    sort,
    featuredOnly,
    nsfwMode,
    characterFilter,
    submittedSearchQuery,
  });

  // Auto-advance the featured banner every 10 seconds.
  const resetHeroInterval = useCallback(() => {
    if (heroIntervalRef.current) clearInterval(heroIntervalRef.current);
    heroIntervalRef.current = setInterval(() => {
      setCurrentHeroIndex((prev) =>
        featuredMods.length > 1 ? (prev + 1) % featuredMods.length : prev,
      );
    }, 10_000);
  }, [featuredMods.length]);

  useEffect(() => {
    if (featuredMods.length > 1) {
      resetHeroInterval();
    }
    return () => {
      if (heroIntervalRef.current) clearInterval(heroIntervalRef.current);
    };
  }, [featuredMods.length, resetHeroInterval]);

  // Fetch autocomplete suggestions when the debounced query changes
  useEffect(() => {
    if (!isActive) {
      setSuggestions([]);
      setShowSuggestions(false);
      setActiveSuggestionIdx(-1);
      return;
    }

    const query = debouncedSearchQuery?.trim() || "";
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    searchModSuggestions({ query, gbGameId: game.gbGameId })
      .then((res) => {
        if (cancelled) return;
        const results = res?.data ?? res ?? [];
        setSuggestions(Array.isArray(results) ? results : []);
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQuery, game.gbGameId, isActive, searchModSuggestions]);

  // Close suggestion dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isOnline = useNetworkStatus();

  useEffect(() => {
    setFeaturedMods([]);
    setCurrentHeroIndex(0);
    setLoadingFeatured(false);
  }, [game.gbGameId]);

  useEffect(() => {
    if (searchQuery.trim() === "" && submittedSearchQuery !== "") {
      setSubmittedSearchQuery("");
      setPage(1);
    }
  }, [searchQuery, submittedSearchQuery]);

  const currentBookmarkIds = useMemo(
    () => bookmarkIdsByGame[game.id] || [],
    [bookmarkIdsByGame, game.id],
  );
  const bookmarkSignature = currentBookmarkIds.join(",");
  const currentBookmarkIdSet = useMemo(
    () => new Set(currentBookmarkIds),
    [currentBookmarkIds],
  );
  const visibleBookmarkIds = useMemo(() => {
    const start = Math.max(0, (page - 1) * PER_PAGE);
    return currentBookmarkIds.slice(start, start + PER_PAGE);
  }, [currentBookmarkIds, page]);

  // Featured hero: runs only after browse grid completes for this game (saved tab skips browse API — see effect above).
  useEffect(() => {
    if (!isActive) {
      setLoadingFeatured(false);
      return;
    }

    if (!isOnline || !game.gbGameId) {
      setFeaturedMods([]);
      setLoadingFeatured(false);
      return;
    }

    if (!browseGridReadyForFeatured) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setLoadingFeatured(true);
      try {
        const result = await fetchFeaturedMods(game.gbGameId);
        if (cancelled) return;
        if (result.success && Array.isArray(result.data)) {
          setFeaturedMods(result.data);
          setCurrentHeroIndex(0);
        } else {
          setFeaturedMods([]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch featured mods:", err);
          setFeaturedMods([]);
        }
      } finally {
        if (!cancelled) setLoadingFeatured(false);
      }
    }, FEATURED_FETCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    browseGridReadyForFeatured,
    fetchFeaturedMods,
    game.gbGameId,
    isActive,
    isOnline,
  ]);

  // Load importer path and bookmarks once
  useEffect(() => {
    const loadConfigAndPath = async () => {
      if (window.electronConfig) {
        const config = await window.electronConfig.getConfig();
        const normalizedBookmarks = normalizeBookmarkConfig(config.bookmarks);
        setImporterPath(config[game.id] || null);
        setBookmarkIdsByGame(normalizedBookmarks.bookmarks);
        const rawCreators = config.bookmarkedCreators;
        if (Array.isArray(rawCreators)) {
          // Migration: Move existing global list to current game
          const migrated = { [game.id]: rawCreators };
          setBookmarkedCreatorsByGame(migrated);
          window.electronConfig.setConfig({ bookmarkedCreators: migrated });
        } else {
          setBookmarkedCreatorsByGame(rawCreators || {});
        }
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

  const handleToggleCreatorBookmark = useCallback(
    (creator) => {
      setBookmarkedCreatorsByGame((prev) => {
        const gameList = prev[game.id] || [];
        const index = gameList.findIndex((c) => c._idRow === creator._idRow);
        let newList;
        if (index >= 0) {
          newList = [...gameList.slice(0, index), ...gameList.slice(index + 1)];
        } else {
          newList = [creator, ...gameList];
        }
        const newMap = { ...prev, [game.id]: newList };
        if (window.electronConfig) {
          window.electronConfig.setConfig({ bookmarkedCreators: newMap });
        }
        return newMap;
      });
    },
    [game.id],
  );

  const { loadMods: refreshInstalledModsInfo } = useLoadGameMods(
    game.id,
    true,
  );
  useEffect(() => {
    if (!isActive || activeTab !== "saved") return;

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

    const mergeBookmarkSummaries = (
      orderedIds,
      existingCatalog,
      fetchedMods,
    ) => {
      const summaryMap = new Map(
        (fetchedMods || []).map((mod) => [mod._idRow, mod]),
      );
      return orderedIds.map(
        (id) =>
          summaryMap.get(id) ||
          existingCatalog.find((entry) => entry._idRow === id) ||
          createUnavailableBookmarkPlaceholder(id),
      );
    };

    const activePageIds = visibleBookmarkIds.filter((id) =>
      currentBookmarkIds.includes(id),
    );
    const deferredIds = currentBookmarkIds.filter(
      (id) => !activePageIds.includes(id),
    );

    // Provide initial placeholders immediately
    setSavedModsCatalog((prev) => {
      const existingCatalog = prev[game.id] || [];
      const seeded = mergeBookmarkSummaries(currentBookmarkIds, existingCatalog, []);
      return { ...prev, [game.id]: seeded };
    });

    // Stream the active page mods into the UI as they arrive
    let activeFinishedCount = 0;
    
    // We fetch them individually but throttle them through the cache
    Promise.all(
      activePageIds.map((id) =>
        fetchMod(id, { priority: "high" }).then((result) => {
          if (cancelled) return;
          if (result.success && result.data) {
            setSavedModsCatalog((prev) => {
              const current = prev[game.id] || [];
              const idx = current.findIndex((entry) => entry._idRow === id);
              if (idx < 0) return prev;
              const next = [...current];
              next[idx] = result.data;
              return { ...prev, [game.id]: next };
            });
          }
        }).finally(() => {
          activeFinishedCount++;
          if (activeFinishedCount >= activePageIds.length && !cancelled) {
            setLoading(false);
          }
        })
      )
    ).then(async () => {
        if (cancelled) return;

        if (deferredIds.length === 0) return;

        const deferredResult = await fetchModsSummaries(deferredIds, {
          priority: "low",
          concurrency: 4,
        });
        if (cancelled || !deferredResult.success) return;

        setSavedModsCatalog((prev) => {
          const current = prev[game.id] || [];
          return {
            ...prev,
            [game.id]: mergeBookmarkSummaries(
              currentBookmarkIds,
              current,
              deferredResult.data || [],
            ),
          };
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatGbApiError(err, "Failed to load saved bookmarks."));
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
  }, [
    activeTab,
    bookmarkSignature,
    currentBookmarkIds,
    fetchMod,
    fetchModsSummaries,
    game.id,
    isActive,
    perPage,
    setError,
    setLoading,
    setMods,
    setTotal,
    visibleBookmarkIds,
  ]);

  // Sync Saved tab mods from the catalog dynamically so streaming updates appear instantly
  useEffect(() => {
    if (activeTab === "saved" && isActive) {
      const current = savedModsCatalog[game.id] || [];
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const activeIds = currentBookmarkIds.slice(startIndex, endIndex);
      
      const nextMods = activeIds.map((id) => 
        current.find(m => m._idRow === id) || createUnavailableBookmarkPlaceholder(id)
      );
      setMods(nextMods);
      setTotal(currentBookmarkIds.length);
    }
  }, [activeTab, page, game.id, currentBookmarkIds, savedModsCatalog, isActive, perPage, setMods, setTotal]);

  // Hydrate bookmarked creators with fresh v11 profile data when on Saved tab
  useEffect(() => {
    if (!isActive || activeTab !== "saved" || currentBookmarkedCreators.length === 0) {
      return;
    }

    let cancelled = false;
    const unhydratedCreators = currentBookmarkedCreators.filter(
      (c) => c._idRow && !hydratedCreators[c._idRow],
    );
    if (unhydratedCreators.length === 0) return;

    void (async () => {
      const allResults = [];

      for (let index = 0; index < unhydratedCreators.length; index += CREATOR_HYDRATION_BATCH_SIZE) {
        if (cancelled) return;

        const chunk = unhydratedCreators.slice(
          index,
          index + CREATOR_HYDRATION_BATCH_SIZE,
        );

        const chunkResults = await Promise.all(
          chunk.map((creator) =>
            fetchMemberProfile(creator._idRow)
              .then((res) => ({
                id: creator._idRow,
                profile: res?.success ? (res.data ?? null) : null,
              }))
              .catch(() => ({ id: creator._idRow, profile: null })),
          ),
        );

        allResults.push(...chunkResults);
      }

      if (cancelled) return;

      setHydratedCreators((prev) => {
        const next = { ...prev };
        for (const { id, profile } of allResults) {
          if (profile) next[id] = profile;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    currentBookmarkedCreators,
    fetchMemberProfile,
    hydratedCreators,
    isActive,
  ]);

  useEffect(() => {
    if (activeTab !== "saved" || loading) return;

    const savedMods = savedModsCatalog[game.id] || [];
    const searchTarget = submittedSearchQuery.toLowerCase();
    const filtered = searchTarget
      ? savedMods.filter((m) =>
          (m._sName || "").toLowerCase().includes(searchTarget),
        )
      : savedMods;

    setTotal(filtered.length);
    setMods(filtered.slice((page - 1) * perPage, page * perPage));
  }, [
    activeTab,
    savedModsCatalog,
    game.id,
    submittedSearchQuery,
    page,
    loading,
    perPage,
    setMods,
    setTotal,
  ]);

  const handleInstall = useCallback(
    async ({
      characterName,
      gbModId,
      fileUrl,
      fileName,
      gbFileId,
      fileAddedAt,
      modVersion,
      category,
    }) => {
      if (!importerPath)
        throw new Error("No importer path configured. Go to Settings first.");

      if (!window.electronMods?.installGbMod) {
        throw new Error("Mod installation is unavailable right now.");
      }

      const selection = {
        characterName,
        gbModId,
        fileUrl,
        fileName,
        gbFileId,
        fileAddedAt,
        modVersion,
        category,
      };

      runGbInstallJob({
        electronMods: window.electronMods,
        selection,
        payload: createGbInstallPayload({
          importerPath,
          gameId: game.id,
          selection,
        }),
        addDownload,
        completeDownload,
        onInstalled: async () => {
          await refreshInstalledModsInfo(true);
        },
      });
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
    pushPage({
      id: `creator-${submitter._idRow}`,
      component: 'CreatorProfile',
      props: {
        creator: submitter,
        game,
        bookmarkIds: currentBookmarkIds,
        onToggleBookmark: handleToggleBookmark,
        onInstall: handleInstall,
        isCreatorBookmarked: currentBookmarkedCreators.some(
          (c) => c._idRow === submitter._idRow,
        ),
        onToggleCreatorBookmark: handleToggleCreatorBookmark,
      }
    });
  }, [pushPage, game, currentBookmarkIds, handleToggleBookmark, handleInstall, currentBookmarkedCreators, handleToggleCreatorBookmark]);

  const handleCardInstallClick = useCallback(
    async (mod) => {
      try {
        const result = await fetchMod(mod._idRow);
        if (result.success && result.data) {
          pushPage({
            id: `mod-${result.data._idRow}`,
            component: 'ModDetail',
            props: {
              mod: result.data,
              game,
              installedFileInfo: installedModsInfo[result.data._idRow],
              onInstall: handleInstall,
              isBookmarked: currentBookmarkIdSet.has(result.data._idRow),
              onToggleBookmark: () => handleToggleBookmark(result.data),
              onCreatorClick: handleCreatorClick,
            }
          });
        } else {
          setError("Failed to fetch mod details.");
        }
      } catch {
        setError("Failed to fetch mod details.");
      }
    },
    [fetchMod, pushPage, game, installedModsInfo, handleInstall, currentBookmarkIdSet, handleToggleBookmark, handleCreatorClick, setError],
  );

  const totalPages = Math.ceil(total / perPage);

  // Scroll the actual scroll container (AppViewShell) to the top whenever the page changes
  useEffect(() => {
    if (!gridTopRef.current) return;
    // Walk up the DOM to find the first scrollable ancestor (the AppViewShell overflow-y-auto div)
    let el = gridTopRef.current.parentElement;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if (overflowY === "auto" || overflowY === "scroll") {
        el.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      el = el.parentElement;
    }
    // Fallback: scroll window
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  const PaginationBar =
    totalPages > 1 ? (
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="ui-focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm text-text-muted px-2">
          Page <span className="text-text-primary font-bold">{page}</span> of{" "}
          <span className="text-text-primary font-bold">{totalPages}</span>
        </div>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="ui-focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    ) : null;
  const {
    isFiltering,
    showFeaturedHero,
    showCharacterFilter,
    showSortControl,
    showFeaturedToggle,
    hasActiveRefinements,
    activeSearchLabel,
    title,
    searchPlaceholder,
  } = useMemo(
    () =>
      getBrowseViewModel({
        activeTab,
        submittedSearchQuery,
        searchQuery,
        characterFilter,
        featuredOnly,
        sort,
        total,
        loading,
        gameName: game.name,
      }),
    [
      activeTab,
      submittedSearchQuery,
      searchQuery,
      characterFilter,
      featuredOnly,
      sort,
      total,
      loading,
      game.name,
    ],
  );

  const handleResetFilters = () => {
    setActiveTab("all");
    setCharacterFilter("");
    setSearchQuery("");
    setSubmittedSearchQuery("");
    setSort("");
    setFeaturedOnly(false);
    setPage(1);
  };

  const commitSearch = useCallback((value) => {
    const nextQuery = String(value ?? "").trim();
    setSearchQuery(value ?? "");
    setSubmittedSearchQuery(nextQuery);
    setPage(1);
    setShowSuggestions(false);
    setActiveSuggestionIdx(-1);
  }, []);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="mt-4" />
      <BrowseControls
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(tabId) => {
          setActiveTab(tabId);
          setPage(1);
        }}
        hasActiveRefinements={hasActiveRefinements}
        onResetFilters={handleResetFilters}
        searchContainerRef={searchContainerRef}
        searchPlaceholder={searchPlaceholder}
        searchQuery={searchQuery}
        onSearchChange={(e) => {
          setSearchQuery(e.target.value);
          setShowSuggestions(e.target.value.trim().length >= 2);
          setActiveSuggestionIdx(-1);
        }}
        onSearchFocus={() =>
          suggestions.length > 0 && setShowSuggestions(true)
        }
        onSearchKeyDown={(e) => {
          if (!showSuggestions || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveSuggestionIdx((i) =>
              Math.min(i + 1, suggestions.length - 1),
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveSuggestionIdx((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter" && activeSuggestionIdx >= 0) {
            e.preventDefault();
            const picked = suggestions[activeSuggestionIdx];
            commitSearch(picked);
          } else if (e.key === "Enter") {
            e.preventDefault();
            commitSearch(searchQuery);
          } else if (e.key === "Escape") {
            setShowSuggestions(false);
          }
        }}
        showSuggestions={showSuggestions}
        suggestions={suggestions}
        activeSuggestionIdx={activeSuggestionIdx}
        onSuggestionHover={setActiveSuggestionIdx}
        onSuggestionPick={commitSearch}
        showCharacterFilter={showCharacterFilter}
        characterFilter={characterFilter}
        characterItems={["All Characters", ...getAllCharacterNames(game.id)]}
        onCharacterChange={(val) => {
          setCharacterFilter(val === "All Characters" ? "" : val);
          setPage(1);
        }}
        gameId={game.id}
        showSortControl={showSortControl}
        sort={sort}
        sortOptions={SORT_OPTIONS}
        onSortChange={(val) => {
          setSort(val);
          setPage(1);
        }}
        showFeaturedToggle={showFeaturedToggle}
        featuredOnly={featuredOnly}
        onFeaturedToggle={() => {
          setFeaturedOnly((v) => !v);
          setPage(1);
        }}
        showSavedIndicator={activeTab === "saved"}
        showCharacterIndicator={showCharacterFilter && Boolean(characterFilter)}
        showSortIndicator={showSortControl && Boolean(sort)}
      />

      <BrowseFeaturedHero
        show={showFeaturedHero}
        loading={loadingFeatured}
        featuredMods={featuredMods}
        currentHeroIndex={currentHeroIndex}
        onPrevious={() => {
          setCurrentHeroIndex((prev) =>
            prev > 0 ? prev - 1 : featuredMods.length - 1,
          );
          resetHeroInterval();
        }}
        onNext={() => {
          setCurrentHeroIndex((prev) =>
            prev < featuredMods.length - 1 ? prev + 1 : 0,
          );
          resetHeroInterval();
        }}
        onSelectIndex={(index) => {
          setCurrentHeroIndex(index);
          resetHeroInterval();
        }}
        onOpenMod={handleCardInstallClick}
        onOpenCreator={handleCreatorClick}
      />

      {/* ── SECTION: Mod Cards Grid ───────────────────────────────────────── */}
      <div
        ref={gridTopRef}
        className="min-h-[60vh] relative w-full flex flex-col"
      >
        <RateLimitBanner />

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

        {/* Full skeleton only when there is nothing to show yet (avoids blanking the grid on page/sort changes) */}
        {loading && mods.length === 0 && <StateGridSkeleton count={PER_PAGE} />}

        {/* Mod grid */}
        {!error && (!loading || mods.length > 0) && (
          <>
            {loading && activeTab !== "saved" && mods.length > 0 && (
              <div className="mb-3 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-[11px] font-semibold text-text-secondary">
                Updating results…
              </div>
            )}
            {loading && activeTab === "saved" && mods.length > 0 && (
              <div className="mb-3">
                <StatePanel
                  title="Refreshing saved mods"
                  description="Showing cached results while updating metadata in the background."
                  className="min-h-0"
                />
              </div>
            )}
            {/* Saved Creators Section */}
            {activeTab === "saved" && (
              <SavedCreatorsStrip
                creators={currentBookmarkedCreators}
                hydratedCreators={hydratedCreators}
                onCreatorClick={handleCreatorClick}
              />
            )}

            <div className="mb-4 flex items-center justify-between gap-3 px-1 flex-wrap">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                {loading
                  ? "Loading"
                  : `${total.toLocaleString()} result${total !== 1 ? "s" : ""}`}
              </div>
              {PaginationBar}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {mods.map((mod) => {
                const installedInfo = installedModsInfo[mod._idRow];
                const { isInstalled, hasUpdate } = getInstalledModUpdateState(
                  mod,
                  installedInfo,
                );
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
                    onToggleBookmark={handleToggleBookmark}
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

            {/* Pagination – bottom */}
            {PaginationBar && <div className="mt-8 pb-8">{PaginationBar}</div>}
          </>
        )}
      </div>

    </div>
  );
}
