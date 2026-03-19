import { useState, useEffect, useCallback } from "react";
import { X, User, LayoutGrid, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BrowseModCard from "./BrowseModCard";
import { cn } from "../lib/utils";

const PER_PAGE = 20;

export default function CreatorProfileModal({
  creator,
  game,
  onClose,
  installedModsInfo,
  bookmarks,
  onToggleBookmark,
  onModClick,
}) {
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchMods = useCallback(async () => {
    if (!game.gbGameId || !creator._idRow) return;
    
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronMods.browseGbMods({
        gbGameId: game.gbGameId,
        submitterId: creator._idRow,
        page,
        perPage: PER_PAGE,
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
  }, [game.gbGameId, creator._idRow, page]);

  useEffect(() => {
    fetchMods();
  }, [fetchMods]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-7xl bg-(--bg-overlay) border border-white/10 rounded-4xl overflow-hidden shadow-2xl flex flex-col h-full max-h-[85vh] relative"
      >
        {/* Header - Creator Info */}
        <div className="flex items-center gap-6 p-8 border-b border-white/5 relative overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-linear-to-r from-(--active-accent)/20 to-transparent opacity-20 pointer-events-none" />
          
          <div className="relative z-10 w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-[0_0_30px_var(--active-accent)]/20">
            {creator._sAvatarUrl ? (
              <img src={creator._sAvatarUrl} alt={creator._sName} className="w-full h-full object-cover" />
            ) : (
              <User size={40} className="text-white/30" />
            )}
          </div>
          
          <div className="relative z-10 flex-1">
            <h2 className="text-3xl font-black text-white tracking-tight">{creator._sName}</h2>
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-sm text-(--active-accent) font-medium px-3 py-1 rounded-full bg-(--active-accent)/10 border border-(--active-accent)/20">
                <LayoutGrid size={14} />
                {total > 0 ? total : "Loading"} Mods
              </span>
              {creator._sProfileUrl && (
                <a 
                  href={creator._sProfileUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
                >
                  <Activity size={14} />
                  View GameBanana Profile
                </a>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all backdrop-blur-md border border-white/5 z-10"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content - Mod Grid */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-3 text-center py-16 bg-white/5 border border-white/5 rounded-2xl border-dashed">
              <p className="text-white font-medium">Could not load mods for {creator._sName}</p>
              <p className="text-(--text-muted) text-sm max-w-sm">{error}</p>
              <button onClick={fetchMods} className="mt-2 px-4 py-2 text-sm rounded-xl bg-(--active-accent) text-black font-semibold hover:brightness-110">
                Retry
              </button>
            </div>
          )}

          {loading && (
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-white/5 border border-white/5 h-56 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && !error && (
            <div className="flex flex-col gap-8">
              <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {mods.map((mod) => {
                  const installedInfo = installedModsInfo[mod._idRow];
                  const isInstalled = !!installedInfo;
                  let hasUpdate = false;
                  
                  if (isInstalled && installedInfo.installedFiles.length > 0) {
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
                      isInstalled={isInstalled}
                      hasUpdate={hasUpdate}
                      onInstall={() => onModClick(mod)}
                      isBookmarked={isBookmarked}
                      onToggleBookmark={() => onToggleBookmark?.(mod)}
                    />
                  );
                })}
              </div>
              
              {mods.length === 0 && (
                <div className="col-span-full py-16 text-center text-gray-500">
                  This creator has no public mods for this game.
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4 pb-4">
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
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
