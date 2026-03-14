import { useState, useEffect, useCallback } from "react";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ChevronDown, User, Monitor, Box, LayoutGrid } from "lucide-react";
import BrowseModCard from "../components/BrowseModCard";
import ModDetailModal from "../components/ModDetailModal";
import { getAllCharacterNames } from "../lib/portraits";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";
import SearchableDropdown from "../components/SearchableDropdown";

const TABS = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "characters", label: "Characters", icon: User },
  { id: "ui", label: "User Interface", icon: Monitor },
  { id: "misc", label: "Miscellaneous", icon: Box },
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
  const [importerPath, setImporterPath] = useState(null);

  const [activeTab, setActiveTab] = useState("all");
  const [characterFilter, setCharacterFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load importer path once
  useEffect(() => {
    const loadPath = async () => {
      if (window.electronConfig) {
        const config = await window.electronConfig.getConfig();
        setImporterPath(config[game.id] || null);
      }
    };
    loadPath();
  }, [game.id]);

  // Load already-installed mod IDs from the Mods folder
  useEffect(() => {
    const loadInstalled = async () => {
      if (!importerPath || !window.electronMods) return;
      const allMods = await window.electronMods.getMods(importerPath, getAllCharacterNames());
      const infoMap = {}; // gbId -> { installedFiles: { fileName: string, installedAt: string }[] }
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
    };
    loadInstalled();
  }, [importerPath]);



  // Fetch mods from GameBanana when params change
  const fetchMods = useCallback(async () => {
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
        search: debouncedSearch,
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
  }, [game.gbGameId, page, sort, characterFilter, activeTab, debouncedSearch]);

  useEffect(() => {
    fetchMods();
  }, [fetchMods, debouncedSearch]);

  const handleInstall = async ({ characterName, gbModId, fileUrl, fileName, category }) => {
    if (!importerPath) throw new Error("No importer path configured. Go to Settings first.");
    const result = await window.electronMods.installGbMod({
      importerPath,
      characterName,
      gbModId,
      fileUrl,
      fileName,
      category,
    });
    if (!result.success) throw new Error(result.error || "Installation failed.");
    setInstalledModsInfo((prev) => {
      const current = prev[gbModId] || { installedFiles: [] };
      if (current.installedFiles.find(f => f.fileName === fileName)) return prev;
      return {
        ...prev,
        [gbModId]: { 
          ...current,
          installedFiles: [...current.installedFiles, { fileName, installedAt: new Date().toISOString() }] 
        }
      };
    });
  };

  const totalPages = Math.ceil(total / PER_PAGE);
  const isFiltering = activeTab !== "all" || !!debouncedSearch;
  const activeSearchLabel = [
    activeTab === "ui" ? "User Interface" : activeTab === "misc" ? "Miscellaneous" : characterFilter,
    debouncedSearch
  ].filter(Boolean).join(" + ");

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-1">
            {activeTab === "all" 
              ? "All Mods" 
              : activeTab === "characters" 
                ? (isFiltering ? `${characterFilter} Mods` : "Browse Character Mods")
                : activeTab === "ui" ? "User Interface Mods" : "Miscellaneous Mods"}
          </h1>
          <p className="text-gray-400 text-sm">
            {loading
              ? "Loading..."
              : isFiltering
              ? `${Math.max(0, total).toLocaleString()} result${total !== 1 ? "s" : ""} on GameBanana`
              : `${Math.max(0, total).toLocaleString()} mods on GameBanana`}
          </p>

          {/* Category Tabs */}
          <nav className="flex items-center gap-6 mt-6">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setPage(1); }}
                  className={cn(
                    "group relative pb-2 flex items-center gap-2 transition-all",
                    isActive ? "text-(--active-accent)" : "text-gray-500 hover:text-white"
                  )}
                >
                  <Icon size={16} />
                  <span className="text-sm font-bold uppercase tracking-widest">{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="browseTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-(--active-accent)"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Controls */}
        {/* Controls Container */}
        <div className="flex items-center gap-3 flex-wrap ml-auto self-end">
          {/* Global Search */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search GameBanana..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 bg-(--bg-input) border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-(--active-accent) focus:ring-1 focus:ring-(--active-accent)/20 transition-all"
            />
          </div>

          {/* Sort */}
            <div className="w-48">
              <SearchableDropdown
                items={SORT_OPTIONS}
                value={sort}
                onChange={(val) => { setSort(val); setPage(1); }}
                placeholder="Sort by..."
              />
            </div>

            {/* Character Filter */}
            {activeTab === "characters" && (
              <div className="w-64">
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
          </div>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-12 bg-white/5 border border-white/5 rounded-2xl border-dashed">
          <p className="text-white font-medium">Could not load mods</p>
          <p className="text-gray-400 text-sm max-w-sm">{error}</p>
          <button
            onClick={fetchMods}
            className="mt-2 px-4 py-2 text-sm rounded-xl bg-(--active-accent) text-black font-semibold hover:brightness-110"
          >
            Retry
          </button>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {mods.map((mod) => (
              <BrowseModCard
                key={mod._idRow}
                mod={mod}
                isInstalled={!!installedModsInfo[mod._idRow]}
                onInstall={async () => {
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
                }}
              />
            ))}
            {mods.length === 0 && (
              <div className="col-span-full py-16 text-center text-gray-500">
                {isFiltering ? `No results for "${activeSearchLabel}"` : "No mods found."}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8 pb-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-gray-400">
                Page <span className="text-white font-medium">{page}</span> of{" "}
                <span className="text-white font-medium">{totalPages}</span>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Mod detail modal */}
      {installTarget && (
        <ModDetailModal
          mod={installTarget}
          game={game}
          installedFileInfo={installedModsInfo[installTarget._idRow]}
          onClose={() => setInstallTarget(null)}
          onInstall={handleInstall}
        />
      )}
    </div>
  );
}
