import { useState, useEffect, useCallback } from "react";
import { X, User, LayoutGrid, ChevronLeft, ChevronRight, Activity, Bookmark, Check, ExternalLink, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import GbModCard from "./GbModCard";
import { cn } from "../lib/utils";

const PER_PAGE = 20;

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export default function CreatorProfileModal({
  creator,
  game,
  onClose,
  installedModsInfo,
  bookmarks,
  onToggleBookmark,
  isCreatorBookmarked,
  onToggleCreatorBookmark,
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
  const heroImage = mods.length > 0 ? mods[0].thumbnailUrl : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 sm:p-12 overflow-hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 35 }}
        className="w-full max-w-7xl bg-surface border border-border rounded-[40px] overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col h-full max-h-[84vh] relative"
      >
        {/* Immersive Hero Header */}
        <div className="relative h-44 shrink-0 overflow-hidden">
          {/* Background Layer (Blurred Image) */}
          <div className="absolute inset-0">
             {heroImage ? (
                <div className="relative w-full h-full">
                  <img src={heroImage} alt="" className="w-full h-full object-cover scale-110 blur-2xl opacity-40" />
                  <div className="absolute inset-0 bg-linear-to-t from-surface via-surface/60 to-transparent" />
                  <div className="absolute inset-0 bg-linear-to-r from-surface via-transparent to-transparent opacity-80" />
                </div>
             ) : (
                <div className="w-full h-full bg-linear-to-br from-primary/20 via-transparent to-transparent opacity-50" />
             )}
          </div>

          <div className="absolute inset-0 p-6 flex items-center justify-between gap-6 z-10">
            <div className="flex items-center gap-5">
              {/* Creator Avatar with Premium Border */}
              <div className="relative w-20 h-20 group">
                 <div className="absolute inset-0 rounded-full bg-primary blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" />
                 <div className="relative w-full h-full rounded-full border border-border p-1 bg-surface shadow-2xl overflow-hidden">
                    {creator._sAvatarUrl ? (
                      <img 
                        src={creator._sAvatarUrl} 
                        alt={creator._sName} 
                        className="w-full h-full rounded-full object-cover" 
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center">
                        <User size={30} className="text-white/20" />
                      </div>
                    )}
                 </div>
              </div>

              {/* Identity & Global Stats */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-black text-white tracking-tighter uppercase drop-shadow-2xl">{creator._sName}</h2>
                </div>
                
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Portfolio</span>
                    <span className="text-lg font-black text-white">{total > 0 ? total : "—"} <span className="text-[10px] font-medium opacity-40 uppercase tracking-widest">Mods</span></span>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Current Game</span>
                    <span className="text-lg font-black text-white">{game.name}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col gap-2.5 items-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCreatorBookmark?.(creator);
                }}
                className={cn(
                  "flex items-center gap-2.5 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-xl relative overflow-hidden group/btn",
                  isCreatorBookmarked 
                    ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20" 
                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                )}
              >
                {isCreatorBookmarked ? (
                  <>
                    <Check size={14} strokeWidth={4} />
                    Saved
                  </>
                ) : (
                  <>
                    <Bookmark size={14} strokeWidth={2.5} />
                    Follow
                  </>
                )}
              </button>

              <div className="flex items-center gap-2.5">
                 {creator._sProfileUrl && (
                    <a 
                      href={creator._sProfileUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/50 hover:text-white transition-all shadow-lg group/link"
                      title="View GameBanana Profile"
                    >
                      <ExternalLink size={18} className="group-hover/link:scale-110 transition-transform" />
                    </a>
                 )}
                 <button
                    onClick={onClose}
                    className="p-2.5 bg-white/5 hover:bg-black text-white/50 hover:text-red-500 border border-white/10 hover:border-red-500/30 rounded-xl transition-all shadow-lg"
                 >
                    <X size={18} />
                 </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex flex-col min-h-0 bg-linear-to-b from-surface to-black/40">
           {/* Section Label */}
           <div className="px-10 py-5 border-b border-border flex items-center justify-between shrink-0">
             <div className="flex items-center gap-3">
                <LayoutGrid size={14} className="text-primary" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">Public Release Catalog</h3>
             </div>
             
             {totalPages > 1 && (
                <div className="flex items-center gap-4 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="text-white/50 hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[9px] font-black tracking-widest uppercase text-white/40">
                    Page <span className="text-white">{page}</span> / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="text-white/50 hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
             )}
           </div>

           <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="rounded-3xl bg-white/5 border border-white/5 h-64 animate-pulse shadow-inner" />
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                  <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-500">
                    <Globe size={32} />
                  </div>
                  <div>
                    <h4 className="text-white font-black uppercase tracking-widest text-base">Network Interruption</h4>
                    <p className="text-text-muted max-w-sm mt-1 text-xs">{error}</p>
                  </div>
                  <button onClick={fetchMods} className="px-5 py-2 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-xl hover:scale-105 transition-transform active:scale-95">
                    Retry Sync
                  </button>
                </div>
              ) : (
                <motion.div 
                  variants={containerVariants}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8"
                >
                  {mods.map((mod) => {
                    const installedInfo = installedModsInfo[mod._idRow];
                    const isInstalled = !!installedInfo;
                    let hasUpdate = false;
                    
                    if (isInstalled && installedInfo.installedFiles.length > 0) {
                      hasUpdate = installedInfo.installedFiles.some(f => {
                        if (!f.installedAt) return false;
                        const installedDate = new Date(f.installedAt).getTime() / 1000;
                        return mod._tsDateUpdated > installedDate + 300; // Consistent with CharacterGrid
                      });
                    }
                    
                    const isBookmarked = (bookmarks[game.id] || []).some(m => m._idRow === mod._idRow);

                    return (
                      <GbModCard
                        key={mod._idRow}
                        mod={mod}
                        isInstalled={isInstalled}
                        hasUpdate={hasUpdate}
                        onClick={onModClick}
                        onInstall={onModClick}
                        isBookmarked={isBookmarked}
                        onToggleBookmark={() => onToggleBookmark?.(mod)}
                      />
                    );
                  })}
                  
                  {mods.length === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <div className="text-3xl opacity-20 mb-3 uppercase font-black tracking-tighter">Empty</div>
                      <p className="text-text-muted uppercase tracking-widest font-black text-[10px]">No public data for {game.name}</p>
                    </div>
                  )}
                </motion.div>
              )}
           </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
