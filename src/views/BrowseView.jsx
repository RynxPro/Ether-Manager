import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  Monitor,
  Box,
  LayoutGrid,
  Rocket,
  Bookmark,
  Sparkles,
  Star,
  AlertCircle,
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
import { useApiStatus } from "../store/useApiStore";
import PageHeader from "../components/layout/PageHeader";
import {
  createUnavailableBookmarkPlaceholder,
  normalizeBookmarkConfig,
} from "../lib/bookmarks";
import { StateGridSkeleton, StatePanel } from "../components/ui/StatePanel";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

const TABS = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "characters", label: "Characters", icon: User },
  { id: "ui", label: "User Interface", icon: Monitor },
  { id: "misc", label: "Miscellaneous", icon: Box },
  { id: "saved", label: "Saved", icon: Bookmark },
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

const PER_PAGE = 20;
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

  // Real-time API status (cooldown, queue depths, etc.)
  const apiStatus = useApiStatus();

  const gridTopRef = useRef(null);
  const [activeTab, setActiveTab] = useState("all");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [mods, setMods] = useState([]);
  const [installedModsInfo, setInstalledModsInfo] = useState({}); // gbId -> { installedFile }
  const [installTarget, setInstallTarget] = useState(null);
  const [activeCreatorProfile, setActiveCreatorProfile] = useState(null);
  const [importerPath, setImporterPath] = useState(null);
  const [characterFilter, setCharacterFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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
  const [browseGridReadyForFeatured, setBrowseGridReadyForFeatured] =
    useState(false);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const heroIntervalRef = useRef(null);
  /** Identity of the browse query excluding page — stale-while-revalidate for same query */
  const browseIdentityRef = useRef(null);
  const browseFetchIdRef = useRef(0);
  const prevBrowseTabRef = useRef(null);

  const browseIdentityKey = useMemo(
    () =>
      [
        game.gbGameId,
        activeTab,
        debouncedSearchQuery,
        characterFilter,
        String(featuredOnly),
        nsfwMode,
        sort,
      ].join("|"),
    [
      game.gbGameId,
      activeTab,
      debouncedSearchQuery,
      characterFilter,
      featuredOnly,
      nsfwMode,
      sort,
    ],
  );

  const {
    fetchMod,
    fetchModsSummaries,
    browseMods,
    fetchFeaturedMods,
    fetchMemberProfile,
    searchModSuggestions,
  } = useFetchCache();

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
    setBrowseGridReadyForFeatured(false);
    setFeaturedMods([]);
    setCurrentHeroIndex(0);
    setLoadingFeatured(false);
  }, [game.gbGameId]);

  useEffect(() => {
    setMods([]);
    setTotal(0);
  }, [game.gbGameId]);

  useEffect(() => {
    const prev = prevBrowseTabRef.current;
    prevBrowseTabRef.current = activeTab;
    if (prev === null || prev === activeTab) return;
    setMods([]);
    setTotal(0);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "saved" && game.gbGameId) {
      setBrowseGridReadyForFeatured(true);
    }
  }, [activeTab, game.gbGameId]);

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

  const { mods: allMods, loadMods: refreshInstalledModsInfo } = useLoadGameMods(
    game.id,
    true,
  );

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
              gbFileId: m.gbFileId ?? null,
              fileAddedAt: m.fileAddedAt ?? null,
              modVersion: m.modVersion ?? null,
            });
          }
        }
      }
    });
    setInstalledModsInfo(infoMap);
  }, [allMods]);

  // Fetch mods from GameBanana when params change (API Tabs ONLY)
  const fetchMods = useCallback(async () => {
    if (!isActive) {
      setLoading(false);
      return;
    }

    if (activeTab === "saved") return;

    if (!isOnline) {
      setLoading(false);
      return;
    }

    if (!game.gbGameId) {
      setError("GameBanana integration is not yet available for this game.");
      return;
    }

    browseIdentityRef.current = browseIdentityKey;

    const fetchId = ++browseFetchIdRef.current;
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
      const result = await browseMods({
        gbGameId: game.gbGameId,
        page,
        perPage: PER_PAGE,
        sort,
        context: categoryTarget,
        search: debouncedSearchQuery,
        featuredOnly,
        characterSkins: activeTab === "characters",
        hideNsfw: nsfwMode === "hide",
        // Skip extra ProfilePage batch when Index returns all-zero downloads — main list loads much faster.
        hydrateZeroDownloadCounts: false,
      });
      if (fetchId !== browseFetchIdRef.current) return;
      if (result.success) {
        setMods(result.records);
        setTotal(result.total);
      } else {
        setError(
          formatGbApiError(result, "Failed to load mods from GameBanana."),
        );
      }
    } catch (err) {
      if (fetchId !== browseFetchIdRef.current) return;
      setError(formatGbApiError(err, "Network error."));
    } finally {
      if (fetchId === browseFetchIdRef.current) {
        setLoading(false);
        setBrowseGridReadyForFeatured(true);
      }
    }
  }, [
    browseMods,
    isOnline,
    isActive,
    game.gbGameId,
    page,
    sort,
    featuredOnly,
    nsfwMode,
    characterFilter,
    activeTab,
    debouncedSearchQuery,
    browseIdentityKey,
  ]);

  // Trigger API fetch for non-saved tabs
  useEffect(() => {
    if (!isActive) {
      browseFetchIdRef.current += 1;
      setLoading(false);
      return;
    }

    if (activeTab !== "saved") {
      fetchMods();
    } else {
      setError(null);
    }
  }, [activeTab, debouncedSearchQuery, fetchMods, isActive]);

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

    fetchModsSummaries(activePageIds, { priority: "high", concurrency: 6 })
      .then(async (result) => {
        if (cancelled) return;

        if (!result.success) {
          setError(formatGbApiError(result, "Failed to load saved bookmarks."));
          return;
        }

        setSavedModsCatalog((prev) => {
          const existingCatalog = prev[game.id] || [];
          const seededOrderedMods = mergeBookmarkSummaries(
            currentBookmarkIds,
            existingCatalog,
            result.data || [],
          );
          return { ...prev, [game.id]: seededOrderedMods };
        });
        setLoading(false);

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
    fetchModsSummaries,
    game.id,
    isActive,
    visibleBookmarkIds,
  ]);

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
    const searchTarget = debouncedSearchQuery.toLowerCase();
    const filtered = searchTarget
      ? savedMods.filter((m) =>
          (m._sName || "").toLowerCase().includes(searchTarget),
        )
      : savedMods;

    setTotal(filtered.length);
    setMods(filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE));
  }, [
    activeTab,
    savedModsCatalog,
    game.id,
    debouncedSearchQuery,
    page,
    loading,
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

      addDownload({ id: gbModId, title: fileName || "Mod Library" });

      void (async () => {
        try {
          const result = await window.electronMods.installGbMod({
            importerPath,
            characterName,
            gbModId,
            fileUrl,
            fileName,
            gbFileId,
            fileAddedAt,
            modVersion,
            category,
            gameId: game.id,
          });

          completeDownload(gbModId, result.success, result.error);

          if (!result.success) {
            return;
          }

          await refreshInstalledModsInfo(true);
        } catch (err) {
          completeDownload(
            gbModId,
            false,
            err.message || "Installation failed",
          );
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
  const isSavedView = activeTab === "saved";
  const isFiltering =
    activeTab !== "all" || !!debouncedSearchQuery || !!sort || featuredOnly;
  const showFeaturedHero =
    activeTab === "all" && !debouncedSearchQuery && !featuredOnly;
  const showCharacterFilter = activeTab === "characters";
  const showSortControl = activeTab !== "saved";
  const showFeaturedToggle = activeTab !== "saved";
  const hasActiveRefinements =
    !!searchQuery ||
    !!characterFilter ||
    !!sort ||
    featuredOnly ||
    activeTab !== "all";
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
      ? "Browse"
      : activeTab === "characters"
        ? characterFilter
          ? `${characterFilter} Mods`
          : "Characters"
        : activeTab === "ui"
          ? "Interface"
          : activeTab === "saved"
            ? "Saved"
            : "Misc";
  const description = loading
    ? "Loading mods."
    : activeTab === "saved"
      ? `${Math.max(0, total).toLocaleString()} saved mod${total !== 1 ? "s" : ""} for ${game.name}.`
      : isFiltering
        ? `${Math.max(0, total).toLocaleString()} result${total !== 1 ? "s" : ""} for ${activeSearchLabel || game.name}.`
        : `${Math.max(0, total).toLocaleString()} GameBanana listing${total !== 1 ? "s" : ""} for ${game.name}.`;
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
    setFeaturedOnly(false);
    setPage(1);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader title={title} />
      <section className="ui-panel mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                      "ui-focus-ring inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-4 py-2.5 transition-all",
                      isActive
                        ? "border-primary/30 bg-primary/10 text-primary shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary),transparent_75%)]"
                        : "border-transparent bg-transparent text-text-muted hover:border-border hover:bg-white/4 hover:text-text-primary",
                    )}
                  >
                    <Icon
                      size={16}
                      className={cn(
                        isActive &&
                          "drop-shadow-[0_0_8px_var(--color-primary)]",
                      )}
                    />
                    <span className="text-[12px] font-black uppercase tracking-[0.15em]">
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            {hasActiveRefinements && (
              <Button variant="ghost" onClick={handleResetFilters}>
                Reset
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div
              className="relative w-full xl:max-w-xl 2xl:max-w-2xl"
              ref={searchContainerRef}
            >
              <Input
                icon={Search}
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                  setShowSuggestions(true);
                  setActiveSuggestionIdx(-1);
                }}
                onFocus={() =>
                  suggestions.length > 0 && setShowSuggestions(true)
                }
                onKeyDown={(e) => {
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
                    setSearchQuery(picked);
                    setShowSuggestions(false);
                    setPage(1);
                  } else if (e.key === "Escape") {
                    setShowSuggestions(false);
                  }
                }}
                className="rounded-2xl shadow-inner"
              />

              {/* Autocomplete Dropdown */}
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    key="suggestions"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-surface/95 backdrop-blur-lg shadow-2xl overflow-hidden"
                  >
                    <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5">
                      <Sparkles size={10} className="text-primary opacity-60" />
                      <span className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">
                        Suggestions
                      </span>
                    </div>
                    {suggestions.map((s, i) => (
                      <button
                        key={s}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                          i === activeSuggestionIdx
                            ? "bg-primary/15 text-white"
                            : "text-text-secondary hover:bg-white/5 hover:text-white",
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchQuery(s);
                          setShowSuggestions(false);
                          setPage(1);
                        }}
                        onMouseEnter={() => setActiveSuggestionIdx(i)}
                      >
                        <Search size={12} className="opacity-40 shrink-0" />
                        {s}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              {showCharacterFilter && (
                <div className="w-full shrink-0 sm:w-64">
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
                <div className="w-full shrink-0 sm:w-52">
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

              {showFeaturedToggle && (
                <button
                  type="button"
                  onClick={() => {
                    setFeaturedOnly((v) => !v);
                    setPage(1);
                  }}
                  className={cn(
                    "ui-focus-ring inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-[11px] font-black uppercase tracking-[0.18em] transition-all",
                    featuredOnly
                      ? "border-yellow-500/40 bg-yellow-500/15 text-yellow-400"
                      : "border-white/10 bg-white/5 text-text-muted hover:border-white/20 hover:text-text-primary",
                  )}
                  title="Show only GameBanana staff-featured mods"
                >
                  <Star
                    size={13}
                    className={cn(featuredOnly && "fill-yellow-400")}
                  />
                  Featured
                </button>
              )}
            </div>
          </div>

          {(activeTab === "saved" ||
            (showCharacterFilter && characterFilter) ||
            (showSortControl && sort)) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-white/6 pt-3">
              {activeTab === "saved" && (
                <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                  Saved Collection
                </div>
              )}
              {showCharacterFilter && characterFilter && (
                <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                  {characterFilter}
                </div>
              )}
              {showSortControl && sort && (
                <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                  {SORT_OPTIONS.find((option) => option.value === sort)
                    ?.label || "Latest"}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION: Hero Loading Skeleton ───────────────────────────────── */}
      {showFeaturedHero && (
        <div className="mb-3 flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
            <Rocket size={14} />
            Featured
          </div>
          {featuredMods.length > 1 && (
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
              {currentHeroIndex + 1} / {featuredMods.length}
            </div>
          )}
        </div>
      )}

      {showFeaturedHero && loadingFeatured && (
        <div className="mb-4 w-full">
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
          const featuredEntry = featuredMods[currentHeroIndex];
          const mod = featuredEntry?.mod;

          if (!mod) {
            return null;
          }

          return (
            <div className="mb-5 w-full">
              <div
                className="relative w-full h-[360px] rounded-3xl overflow-hidden border border-white/10 group cursor-pointer bg-[#0a0a0a]"
                onClick={() => {
                  fetchMod(mod._idRow).then((res) => {
                    if (res.success) setInstallTarget(res.data);
                  });
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
                        {featuredEntry.label}
                      </div>
                      <h2 className="text-3xl md:text-[2.6rem] font-black text-white tracking-tighter leading-[1.05] drop-shadow-2xl line-clamp-3">
                        {mod._sName}
                      </h2>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreatorClick(mod._aSubmitter);
                        }}
                        className="flex items-center gap-3 group/creator w-max"
                      >
                        {mod._aSubmitter?._sAvatarUrl ? (
                          <img
                            src={mod._aSubmitter._sAvatarUrl}
                            alt={mod._aSubmitter._sName}
                            className="w-8 h-8 rounded-full object-cover border border-white/20 group-hover/creator:border-primary/60 transition-all"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                            <User size={12} className="text-white/60" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-[0.2em] font-black text-white/40">
                            Creator
                          </span>
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
                    style={{
                      clipPath: "polygon(12% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    }}
                  >
                    {mod.heroImageUrl || mod.thumbnailUrl ? (
                      <img
                        src={mod.heroImageUrl || mod.thumbnailUrl}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                        style={{
                          filter:
                            "contrast(1.05) saturate(1.1) brightness(1.03)",
                          willChange: "transform",
                        }}
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentHeroIndex((prev) =>
                        prev > 0 ? prev - 1 : featuredMods.length - 1,
                      );
                      resetHeroInterval();
                    }}
                    className="text-white/50 hover:text-white transition-colors"
                  >
                    <ChevronLeft size={14} strokeWidth={3} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {featuredMods.map((_, i) => (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentHeroIndex(i);
                          resetHeroInterval();
                        }}
                        className={cn(
                          "rounded-full transition-all duration-300",
                          i === currentHeroIndex
                            ? "w-4 h-1.5 bg-primary"
                            : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60",
                        )}
                      />
                    ))}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentHeroIndex((prev) =>
                        prev < featuredMods.length - 1 ? prev + 1 : 0,
                      );
                      resetHeroInterval();
                    }}
                    className="text-white/50 hover:text-white transition-colors"
                  >
                    <ChevronRight size={14} strokeWidth={3} />
                  </button>
                </div>

                {/* Auto-advance progress bar */}
                {featuredMods.length > 1 && (
                  <div className="absolute bottom-0 left-0 right-0 z-40 h-[3px] bg-white/10">
                    <motion.div
                      key={currentHeroIndex}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 10, ease: "linear" }}
                      style={{ transformOrigin: "left" }}
                      className="h-full w-full bg-primary opacity-80"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* ── SECTION: Mod Cards Grid ───────────────────────────────────────── */}
      <div
        ref={gridTopRef}
        className="min-h-[60vh] relative w-full flex flex-col"
      >
        {/* Rate-limit feedback banner */}
        {apiStatus.isCoolingDown && (
          <div className="mb-3 rounded-xl border border-orange-500/35 bg-orange-500/10 px-4 py-3 flex items-center gap-3 text-orange-200/95 text-[11px] font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              GameBanana is rate-limiting requests. Retrying automatically in
              about{" "}
              <span className="font-black text-orange-300">
                {apiStatus.cooldownSecondsRemaining}s
              </span>
              ...
            </span>
          </div>
        )}

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
            {activeTab === "saved" && currentBookmarkedCreators.length > 0 && (
              <section className="ui-panel mb-5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                    <Bookmark className="text-primary" size={14} />
                    Creators
                  </div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                    {currentBookmarkedCreators.length}
                  </div>
                </div>
                <div className="flex gap-3 overflow-x-auto scroller-hidden pb-2">
                  {currentBookmarkedCreators.map((creator) => {
                    const hydrated = hydratedCreators[creator._idRow];
                    const displayCreator = hydrated ?? creator;
                    const avatarUrl =
                      hydrated?._sHdAvatarUrl ||
                      hydrated?._sAvatarUrl ||
                      creator._sAvatarUrl;
                    const isOnline = hydrated?._bIsOnline ?? false;
                    return (
                      <button
                        key={creator._idRow}
                        onClick={() => handleCreatorClick(displayCreator)}
                        className="ui-focus-ring group/savedcreator min-w-[120px] shrink-0 rounded-[var(--radius-md)] border border-border bg-background px-3 py-3 text-left shadow-card transition-all hover:border-primary/20 hover:bg-white/4"
                      >
                        <div className="relative mx-auto h-14 w-14">
                          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-border bg-surface shadow-surface transition-all group-hover/savedcreator:shadow-[0_0_20px_var(--color-primary)]/20">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={displayCreator._sName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User
                                size={24}
                                className="text-text-muted group-hover/savedcreator:text-text-secondary transition-colors"
                              />
                            )}
                          </div>
                          {/* Online indicator dot */}
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background",
                              isOnline ? "bg-green-500" : "bg-gray-600",
                            )}
                          />
                        </div>
                        <span className="block w-full truncate pt-3 text-center text-sm font-bold text-text-primary transition-colors group-hover/savedcreator:text-primary">
                          {displayCreator._sName}
                        </span>
                        {hydrated?._sUserTitle && (
                          <span className="block w-full truncate text-center text-[10px] text-text-muted">
                            {hydrated._sUserTitle}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
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
                const isInstalled = !!installedInfo;
                let hasUpdate = false;

                if (isInstalled && installedInfo.installedFiles.length > 0) {
                  hasUpdate = installedInfo.installedFiles.some((f) => {
                    // 1. Version string mismatch (if both are provided and not identical)
                    if (
                      f.modVersion &&
                      mod._sVersion &&
                      f.modVersion !== mod._sVersion
                    ) {
                      return true;
                    }

                    // 2. File upload timestamps.
                    // If we have precise file timestamps, check if the mod has any activity
                    // (either an explicit update log OR any modification like adding a new file)
                    // AFTER the file we installed was uploaded.
                    if (f.fileAddedAt != null) {
                      const latestActivity = Math.max(
                        mod._tsDateUpdated || 0,
                        mod._tsDateModified || 0,
                      );
                      return latestActivity > f.fileAddedAt;
                    }

                    // 3. Legacy fallback: wall-clock installedAt with a 5-minute buffer.
                    if (!f.installedAt) return false;
                    const installedDate =
                      new Date(f.installedAt).getTime() / 1000;
                    return (
                      (mod._tsDateUpdated || mod._tsDateModified || 0) >
                      installedDate + 300
                    );
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

            {/* Pagination – bottom */}
            {PaginationBar && <div className="mt-8 pb-8">{PaginationBar}</div>}
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
          isCreatorBookmarked={currentBookmarkedCreators.some(
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
