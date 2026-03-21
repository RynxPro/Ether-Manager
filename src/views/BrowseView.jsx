import { useState, useEffect, useCallback } from "react";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, User, Monitor, Box, LayoutGrid, Rocket, Download, Bookmark } from "lucide-react";
import BrowseModCard from "../components/BrowseModCard";
import ModDetailModal from "../components/ModDetailModal";
import CreatorProfileModal from "../components/CreatorProfileModal";
import { getAllCharacterNames } from "../lib/portraits";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import SearchableDropdown from "../components/SearchableDropdown";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useDebounce } from "../hooks/useDebounce";

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

export default function BrowseView({ game }) {
  const [mods, setMods] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [installedModsInfo, setInstalledModsInfo] = useState({}); // gbId -> { installedFile }
  const [installTarget, setInstallTarget] = useState(null);
  const [activeCreatorProfile, setActiveCreatorProfile] = useState(null);
  const [importerPath, setImporterPath] = useState(null);

  const [activeTab, setActiveTab] = useState("all");
  const [characterFilter, setCharacterFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  const [bookmarks, setBookmarks] = useState({});
  const [bookmarkedCreators, setBookmarkedCreators] = useState([]);

  const [featuredMods, setFeaturedMods] = useState([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  // Fetch Featured Mods (simulate Today/Week/Month/Year/All Time with Top 5)
  useEffect(() => {
    const fetchFeatured = async () => {
      if (!game.gbGameId) return;
      setLoadingFeatured(true);
      try {
        const result = await window.electronMods.browseGbMods({
          gbGameId: game.gbGameId,
          page: 1,
          perPage: 5,
          sort: "likes",
          context: "",
          search: "",
        });
        if (result.success) {
          setFeaturedMods(result.records);
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
        setImporterPath(config[game.id] || null);
        setBookmarks(config.bookmarks || {});
        setBookmarkedCreators(config.bookmarkedCreators || []);
      }
    };
    loadConfigAndPath();
  }, [game.id]);

  const handleToggleBookmark = useCallback((mod) => {
    setBookmarks(prev => {
      const gameBookmarks = prev[game.id] || [];
      const index = gameBookmarks.findIndex(m => m._idRow === mod._idRow);
      let newGameBookmarks;
      if (index >= 0) {
        newGameBookmarks = [
          ...gameBookmarks.slice(0, index),
          ...gameBookmarks.slice(index + 1)
        ];
      } else {
        newGameBookmarks = [mod, ...gameBookmarks]; // Add new at top
      }
      const newBookmarks = { ...prev, [game.id]: newGameBookmarks };
      if (window.electronConfig) {
        window.electronConfig.setConfig({ bookmarks: newBookmarks });
      }
      return newBookmarks;
    });
  }, [game.id]);

  const handleToggleCreatorBookmark = useCallback((creator) => {
    setBookmarkedCreators(prev => {
      const index = prev.findIndex(c => c._idRow === creator._idRow);
      let newList;
      if (index >= 0) {
        newList = [
          ...prev.slice(0, index),
          ...prev.slice(index + 1)
        ];
      } else {
        newList = [creator, ...prev];
      }
      if (window.electronConfig) {
        window.electronConfig.setConfig({ bookmarkedCreators: newList });
      }
      return newList;
    });
  }, []);

  const refreshInstalledModsInfo = useCallback(async () => {
    if (!importerPath || !window.electronMods) return;
    const allMods = await window.electronMods.getMods(importerPath, getAllCharacterNames(game.id), game.id);
    const infoMap = {};
    allMods.forEach((m) => {
      if (m.gamebananaId != null) {
        if (!infoMap[m.gamebananaId]) {
          infoMap[m.gamebananaId] = { installedFiles: [] };
        }
        if (m.installedFile) {
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
  }, [importerPath, game.id]);

  useEffect(() => {
    refreshInstalledModsInfo();
  }, [refreshInstalledModsInfo]);



  // Fetch mods from GameBanana when params change (API Tabs ONLY)
  const fetchMods = useCallback(async () => {
    if (activeTab === "saved") return;

    if (!game.gbGameId) {
      setError("GameBanana integration is not yet available for this game.");
      return;
    }
    setLoading(true);
    setError(null);

    const categoryTarget = activeTab === "all" ? "" : activeTab === "ui" ? "UI" : activeTab === "misc" ? "Misc" : characterFilter;

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
  }, [game.gbGameId, page, sort, characterFilter, activeTab, debouncedSearchQuery]);

  // Trigger API fetch for non-saved tabs
  useEffect(() => {
    if (activeTab !== "saved") {
      fetchMods();
    } else {
      setLoading(false); // Instantly ensure no skeletons when switching to saved tab
    }
  }, [fetchMods, activeTab, debouncedSearchQuery]);

  // Handle local Saved tab filtering
  useEffect(() => {
    if (activeTab === "saved") {
      setLoading(false); // Instantly ensure no skeletons
      const savedMods = bookmarks[game.id] || [];
      const searchTarget = debouncedSearchQuery.toLowerCase();
      const filtered = searchTarget 
        ? savedMods.filter(m => m._sName.toLowerCase().includes(searchTarget))
        : savedMods;
      
      setTotal(filtered.length);
      setMods(filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE));
    }
  }, [activeTab, bookmarks, game.id, debouncedSearchQuery, page]);

  const handleInstall = useCallback(async ({ characterName, gbModId, fileUrl, fileName, category }) => {
    if (!importerPath) throw new Error("No importer path configured. Go to Settings first.");
    const result = await window.electronMods.installGbMod({
      importerPath,
      characterName,
      gbModId,
      fileUrl,
      fileName,
      category,
      gameId: game.id,
    });
    if (!result.success) throw new Error(result.error || "Installation failed.");
    await refreshInstalledModsInfo();
  }, [importerPath, game.id, refreshInstalledModsInfo]);

  const handleCardInstall = useCallback(async (mod, fileUrl, fileName, category) => {
    try {
      await handleInstall({
        characterName: "N/A",
        gbModId: mod._idRow,
        fileUrl,
        fileName,
        category
      });
    } catch (err) {
      setError(err.message);
    }
  }, [handleInstall]);

  const handleCreatorClick = useCallback((submitter) => {
    setActiveCreatorProfile(submitter);
    setInstallTarget(null); // Close the mod detail modal if it's currently open
  }, []);

  const handleCardInstallClick = useCallback(async (mod) => {
    try {
      const result = await window.electronMods.fetchGbMod(mod._idRow);
      if (result.success && result.data) {
        setInstallTarget(result.data);
      } else {
        setError("Failed to fetch mod details.");
      }
    } catch {
      setError("Failed to fetch mod details.");
    }
  }, []);

  const totalPages = Math.ceil(total / PER_PAGE);
  const isFiltering = activeTab !== "all" || !!debouncedSearchQuery;
  const activeSearchLabel = [
    activeTab === "ui" ? "User Interface" : activeTab === "misc" ? "Miscellaneous" : characterFilter,
    debouncedSearchQuery
  ].filter(Boolean).join(" + ");

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      
      {/* Header Title */}
      <div className="mb-6 w-full px-2">
        <h1 className="text-4xl md:text-[2.75rem] font-black text-white mb-2 tracking-tighter drop-shadow-xl">
          {activeTab === "all" 
            ? "All Mods" 
            : activeTab === "characters" 
              ? (isFiltering ? `${characterFilter} Mods` : "Browse Character Mods")
              : activeTab === "ui" 
                ? "User Interface Mods" 
                : activeTab === "saved"
                  ? "Saved Mods"
                  : "Miscellaneous Mods"}
        </h1>
        <p className="text-(--text-muted) font-medium">
          {loading
            ? "Loading..."
            : activeTab === "saved"
            ? `${Math.max(0, total).toLocaleString()} mod${total !== 1 ? "s" : ""} in your saved list`
            : isFiltering
            ? `${Math.max(0, total).toLocaleString()} result${total !== 1 ? "s" : ""} on GameBanana`
            : `${Math.max(0, total).toLocaleString()} mods on GameBanana`}
        </p>
      </div>

      {/* Featured Hero Loading Skeleton to strictly prevent layout shifting & bouncing frames */}
      {activeTab === "all" && !debouncedSearchQuery && loadingFeatured && (
        <div className="mb-4 w-full">
          <div className="flex items-center gap-2 mb-4 px-2 opacity-50">
            <Rocket className="text-(--text-muted)" size={20} />
            <div className="w-32 h-6 bg-white/10 rounded-xl animate-pulse" />
          </div>
          <div className="w-full h-[400px] rounded-[2.5rem] bg-[rgba(255,255,255,0.02)] border border-white/5 overflow-hidden relative group">
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
      {!loadingFeatured && featuredMods.length > 0 && activeTab === "all" && !debouncedSearchQuery && (() => {
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
            <div className="flex items-center gap-2 mb-4 px-2">
              <Rocket className="text-(--active-accent)" size={20} />
              <h2 className="text-xl font-black text-white uppercase tracking-widest">Hall of Fame</h2>
            </div>
            
            <div className="relative w-full h-[400px] rounded-[2.5rem] bg-card border border-border shadow-2xl overflow-hidden flex group">
              {/* High-Tech Grid Pattern */}
              <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} 
              />
              
              {/* Epic Ambient Glow */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-(--active-accent) rounded-full blur-[150px] opacity-10 pointer-events-none transition-colors duration-1000" />

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
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-(--active-accent)/10 text-(--active-accent) border border-(--active-accent)/20 text-[10px] font-black uppercase tracking-widest mb-6 w-max shadow-lg">
                      <span className="w-1.5 h-1.5 rounded-full bg-(--active-accent) animate-pulse shadow-[0_0_10px_var(--active-accent)]" />
                      {tf.label}
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center">
                      <h2 className="text-5xl md:text-[3.5rem] font-black text-white tracking-tighter drop-shadow-2xl leading-[1.05] line-clamp-3">
                        {mod._sName}
                      </h2>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap mt-6">
                      <button 
                        onClick={() => handleCreatorClick(mod._aSubmitter)}
                        className="flex items-center gap-4 text-white text-base font-black bg-white/5 border border-white/10 hover:bg-white/10 hover:border-(--active-accent)/30 transition-all px-6 py-3.5 rounded-3xl group/creator"
                      >
                        {mod._aSubmitter?._sAvatarUrl ? (
                          <img src={mod._aSubmitter._sAvatarUrl} alt={mod._aSubmitter._sName} className="w-10 h-10 rounded-full object-cover shadow-xl border-2 border-white/10 group-hover/creator:border-(--active-accent)/50 transition-all" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border-2 border-white/10 group-hover/creator:border-(--active-accent)/50 transition-all">
                            <User size={24} className="text-(--active-accent)" />
                          </div>
                        )}
                        <span className="tracking-tight group-hover/creator:text-(--active-accent) transition-colors">
                          {mod._aSubmitter?._sName}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* RIGHT: Image Showcase Card */}
                  <div className="w-[45%] relative z-20 flex items-center justify-center pr-12 pl-4">
                    <div 
                      className="relative w-full aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] cursor-pointer group/card"
                      onClick={() => {
                        window.electronMods.fetchGbMod(mod._idRow).then(res => {
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
                        <div className="w-14 h-14 rounded-full bg-(--active-accent) flex items-center justify-center text-black shadow-[0_0_30px_var(--active-accent)] scale-90 group-hover/card:scale-100 transition-transform duration-300 ease-out">
                          <Download size={24} strokeWidth={3} className="ml-0.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Bottom Right Pill Navigator */}
              <div className="absolute bottom-6 right-12 z-30 flex items-center gap-5 bg-black/60 backdrop-blur-xl border border-white/10 px-5 py-2.5 rounded-full shadow-2xl">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentHeroIndex((prev) => (prev > 0 ? prev - 1 : featuredMods.length - 1));
                  }}
                  className="text-(--text-muted) hover:text-white hover:-translate-x-0.5 transition-all outline-none"
                >
                  <ChevronLeft size={20} strokeWidth={3} />
                </button>
                <div className="text-[11px] font-black text-(--text-muted) tracking-[0.2em] uppercase select-none">
                  <span className="text-white mx-1">{currentHeroIndex + 1}</span> / <span className="mx-1">{featuredMods.length}</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentHeroIndex((prev) => (prev < featuredMods.length - 1 ? prev + 1 : 0));
                  }}
                  className="text-(--text-muted) hover:text-white hover:translate-x-0.5 transition-all outline-none"
                >
                  <ChevronRight size={20} strokeWidth={3} />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Category Tabs */}
      <div className="flex items-center gap-6 border-b border-white/5 w-full mt-4 mb-6 relative">
        <nav className="flex items-center gap-8 -mb-px">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setPage(1); }}
                className={cn(
                  "group relative pb-4 flex items-center gap-2 transition-all",
                  isActive ? "text-(--active-accent)" : "text-(--text-muted) hover:text-white"
                )}
              >
                <Icon size={16} className={cn(isActive && "drop-shadow-[0_0_8px_var(--active-accent)]")} />
                <span className="text-[13px] font-black uppercase tracking-[0.15em]">{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="browseTab"
                    className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-(--active-accent) shadow-[0_-2px_10px_var(--active-accent)]"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 w-full z-20 relative">
        {/* Global Search */}
        <div className="w-full sm:max-w-md xl:max-w-lg shrink">
          <Input
            icon={Search}
            placeholder="Search GameBanana..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="backdrop-blur-md shadow-inner rounded-2xl"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap relative z-30">
          {/* Character Filter */}
          {activeTab === "characters" && (
            <div className="w-48 sm:w-64 shrink-0">
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

          {/* Sort Dropdown */}
          <div className="w-40 sm:w-48 shrink-0">
            <SearchableDropdown
              items={SORT_OPTIONS}
              value={sort}
              onChange={(val) => { setSort(val); setPage(1); }}
              placeholder="Sort by..."
            />
          </div>
        </div>
      </div>

      {/* Content wrapper with guaranteed min-height to prevent layout jumping */}
      <div className="min-h-[60vh] relative w-full flex flex-col">
        {/* Error state */}
        {error && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-12 bg-white/5 border border-white/5 rounded-2xl border-dashed">
          <p className="text-white font-medium">Could not load mods</p>
          <p className="text-(--text-muted) text-sm max-w-sm">{error}</p>
          <Button onClick={fetchMods} size="sm" className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: PER_PAGE }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white/5 border border-white/5 h-56 animate-pulse" />
          ))}
        </div>
      )}

      {/* Mod grid */}
      {!loading && !error && (
        <>
          {/* Saved Creators Section */}
          {activeTab === "saved" && bookmarkedCreators.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Bookmark className="text-(--active-accent)" size={20} /> Saved Creators
              </h3>
              <div className="flex gap-4 overflow-x-auto scroller-hidden pb-4">
                {bookmarkedCreators.map((creator) => (
                  <button
                    key={creator._idRow}
                    onClick={() => handleCreatorClick(creator)}
                    className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all min-w-[120px] group/savedcreator shrink-0"
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10 border border-white/5 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.05)] group-hover/savedcreator:shadow-[0_0_20px_var(--active-accent)]/20 transition-all">
                      {creator._sAvatarUrl ? (
                        <img src={creator._sAvatarUrl} alt={creator._sName} className="w-full h-full object-cover" />
                      ) : (
                        <User size={24} className="text-white/30 group-hover/savedcreator:text-white/50 transition-colors" />
                      )}
                    </div>
                    <span className="text-sm font-bold text-white text-center w-full truncate group-hover/savedcreator:text-(--active-accent) transition-colors">
                      {creator._sName}
                    </span>
                  </button>
                ))}
              </div>
              <div className="w-full h-px bg-white/10 my-6" />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {mods.map((mod) => {
              const installedInfo = installedModsInfo[mod._idRow];
              const isInstalled = !!installedInfo;
              let hasUpdate = false;
              
              if (isInstalled && installedInfo.installedFiles.length > 0) {
                // If ANY installed file from this mod is older than the GB record's last update
                hasUpdate = installedInfo.installedFiles.some(f => {
                  if (!f.installedAt) return false;
                  const installedDate = new Date(f.installedAt).getTime() / 1000;
                  return mod._tsDateUpdated > installedDate + 60;
                });
              }
              const isBookmarked = (bookmarks[game.id] || []).some(m => m._idRow === mod._idRow);

              return (
                <BrowseModCard
                  key={mod._idRow}
                  mod={mod}
                  gameId={game.id}
                  isInstalled={isInstalled}
                  installedFiles={installedInfo?.installedFiles}
                  hasUpdate={hasUpdate}
                  isBookmarked={isBookmarked}
                  onClick={handleCardInstallClick}
                  onInstall={handleCardInstall}
                  onToggleBookmark={() => handleToggleBookmark(mod)}
                  onCreatorClick={handleCreatorClick}
                />
              );
            })}
            {mods.length === 0 && (
              <div className="col-span-full py-16 text-center text-gray-500">
                {isFiltering ? `No results for "${activeSearchLabel}"` : "No mods found."}
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
              <span className="text-sm text-gray-400">
                Page <span className="text-white font-medium">{page}</span> of{" "}
                <span className="text-white font-medium">{totalPages}</span>
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
          bookmarks={bookmarks}
          onToggleBookmark={handleToggleBookmark}
          isCreatorBookmarked={bookmarkedCreators.some(c => c._idRow === activeCreatorProfile._idRow)}
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
          isBookmarked={(bookmarks[game.id] || []).some(m => m._idRow === installTarget._idRow)}
          onToggleBookmark={() => handleToggleBookmark(installTarget)}
          onCreatorClick={handleCreatorClick}
        />
      )}
    </div>
  );
}
