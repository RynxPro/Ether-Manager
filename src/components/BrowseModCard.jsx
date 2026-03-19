import { useState, memo } from "react";
import { Download, Heart, Eye, Check, Bookmark } from "lucide-react";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const BrowseModCard = memo(function BrowseModCard({ mod, isInstalled, hasUpdate, onInstall, isBookmarked = false, onToggleBookmark }) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <motion.div
      onClick={() => onInstall(mod)}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ 
        y: -10, 
        scale: 1.01
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "rounded-3xl overflow-hidden group relative flex flex-col shadow-2xl transition-all duration-300",
        "bg-(--bg-card) border border-white/5 cursor-pointer",
        isInstalled && "border-(--active-accent)/20"
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-44 w-full bg-[#0d0d16] overflow-hidden shrink-0">
        {mod.thumbnailUrl ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
            
            <img
              src={mod.thumbnailUrl}
              alt={mod._sName}
              onLoad={() => setImgLoaded(true)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-all duration-1000",
                imgLoaded ? "opacity-100" : "opacity-0"
              )}
              loading="lazy"
              decoding="async"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-(--bg-input) to-(--bg-card)">
            <span className="text-6xl font-black text-white/5 select-none uppercase">
              {mod._sName?.[0] || "?"}
            </span>
          </div>
        )}
        
        {/* Overlays */}
        <div className="absolute inset-0 bg-linear-to-t from-(--bg-card) to-transparent opacity-60" />
        
        {/* Bookmark Action */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark?.(mod);
          }}
          className={cn(
            "absolute top-4 left-4 z-20 p-2 rounded-2xl backdrop-blur-md transition-all shadow-2xl border group/bookmark",
            isBookmarked 
              ? "bg-(--active-accent)/20 border-(--active-accent)/50 text-(--active-accent) hover:bg-(--active-accent)/30" 
              : "bg-black/40 border-white/10 text-white/50 hover:bg-black/70 hover:text-white hover:border-white/30"
          )}
          title={isBookmarked ? "Remove Bookmark" : "Save Bookmark"}
        >
          <Bookmark size={18} strokeWidth={isBookmarked ? 3 : 2} className={cn(
            "transition-all duration-300",
            isBookmarked ? "fill-(--active-accent)" : "group-hover/bookmark:scale-110"
          )} />
        </button>

        {/* High-Tech Badges */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
          {isInstalled && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-(--active-accent) text-black text-[10px] font-black shadow-lg shadow-(--active-accent)/20 uppercase tracking-widest transition-transform group-hover:scale-110">
              <Check size={12} strokeWidth={4} />
              Installed
            </div>
          )}
          {isInstalled && hasUpdate && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-(--active-accent)/10 text-(--active-accent) border border-(--active-accent)/20 text-[10px] font-black shadow-[0_0_15px_var(--active-accent)]/20 uppercase tracking-widest">
              Update Available
            </div>
          )}
        </div>
      </div>

      {/* Info Area */}
      <div className="flex flex-col flex-1 p-5 bg-(--bg-card) min-h-36 relative z-10">
        <div className="flex items-center gap-2 mb-2 opacity-30 group-hover:opacity-100 transition-opacity">
           <div className="w-1 h-3 bg-(--active-accent) rounded-full shadow-[0_0_5px_var(--active-accent)]" />
           <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white">MOD LISTING</span>
        </div>
        
        <h3
          className="text-base font-black text-white line-clamp-2 leading-tight mb-1 min-h-12 transition-colors group-hover:text-(--active-accent) tracking-tight"
          title={mod._sName}
        >
          {mod._sName}
        </h3>
        <p className="text-[9px] uppercase font-black tracking-[0.2em] text-white/20 mb-4 truncate group-hover:text-white/40 transition-colors">
          BY {mod._aSubmitter?._sName || "UNKNOWN"}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-white/20 mb-5 mt-auto border-t border-white/5 pt-4">
          <div className="flex items-center gap-1.5 group/stat">
            <Heart size={12} className="text-white/30 group-hover/stat:text-(--active-accent) transition-colors" />
            <span className="text-[10px] font-black text-white/40 tracking-tighter group-hover:text-white transition-colors">{formatCount(mod._nLikeCount)}</span>
          </div>
          <div className="flex items-center gap-1.5 group/stat">
            <Eye size={12} className="text-white/30 group-hover/stat:text-(--active-accent) transition-colors" />
            <span className="text-[10px] font-black text-white/40 tracking-tighter group-hover:text-white transition-colors">{formatCount(mod._nViewCount)}</span>
          </div>
          {mod._nDownloadCount != null && (
            <div className="flex items-center gap-1.5 group/stat">
              <Download size={12} className="text-white/30 group-hover/stat:text-(--active-accent) transition-colors" />
              <span className="text-[10px] font-black text-white/40 tracking-tighter group-hover:text-white transition-colors">{formatCount(mod._nDownloadCount)}</span>
            </div>
          )}
        </div>

        {/* Install Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInstall(mod);
          }}
          disabled={isInstalled}
          className={cn(
            "w-full flex items-center justify-center gap-3 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group/btn",
            isInstalled
              ? "bg-white/5 text-white/10 cursor-not-allowed border border-white/5"
              : "bg-(--active-accent) text-black hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-(--active-accent)/20"
          )}
        >
          {isInstalled ? (
            <>
              <Check size={14} strokeWidth={4} /> Synced
            </>
          ) : (
            <>
              <Download size={14} strokeWidth={4} className="group-hover/btn:animate-bounce" /> Install Mod
            </>
          )}
        </button>
      </div>
      
      {/* External Bloom Ring */}
      <div className="absolute inset-0 rounded-3xl border border-white/0 group-hover:border-(--active-accent)/20 transition-all pointer-events-none z-20" />
      
      {/* Optimized Shadow Layer (animating opacity instead of box-shadow is virtually free for the GPU) */}
      <div className="absolute inset-0 rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5),0_0_15px_color-mix(in_srgb,var(--active-accent),transparent_80%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[-1]" />
    </motion.div>
  );
});

export default BrowseModCard;
