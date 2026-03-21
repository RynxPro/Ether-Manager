import React, { useState } from "react";
import { Download, Heart, Eye, Check, Bookmark, User } from "lucide-react";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const BrowseModCard = React.memo(function BrowseModCard({
  mod,
  gameId,
  onClick,
  onInstall,
  isInstalled,
  installedFiles,
  hasUpdate,
  isBookmarked = false,
  onToggleBookmark,
  onCreatorClick
}) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <motion.div
      onClick={() => onClick?.(mod)}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{
        y: -10,
        scale: 1.01
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "rounded-2xl overflow-hidden group relative flex flex-col shadow-card hover:shadow-surface transition-all duration-300",
        "bg-surface border border-border cursor-pointer",
        isInstalled && "border-primary/20"
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-44 w-full bg-surface overflow-hidden shrink-0">
        {mod.thumbnailUrl ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}

            <img
              src={mod.thumbnailUrl}
              alt={mod._sName}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-all duration-1000",
                imgLoaded ? "opacity-100" : "opacity-0"
              )}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-background to-surface">
            <span className="text-6xl font-black text-white/5 select-none uppercase">
              {mod._sName?.[0] || "?"}
            </span>
          </div>
        )}

        {/* Overlays */}
        <div className="absolute inset-0 bg-linear-to-t from-surface to-transparent opacity-60" />

        {/* Bookmark Action */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark?.(mod);
          }}
          className={cn(
            "absolute top-4 left-4 z-20 p-2 rounded-xl backdrop-blur-md transition-all shadow-surface border group/bookmark",
            isBookmarked
              ? "bg-primary/20 border-primary/50 text-primary hover:bg-primary/30"
              : "bg-surface border-border text-text-muted hover:bg-surface/80 hover:text-text-primary hover:border-white/30"
          )}
          title={isBookmarked ? "Remove Bookmark" : "Save Bookmark"}
        >
          <Bookmark size={18} strokeWidth={isBookmarked ? 3 : 2} className={cn(
            "transition-all duration-300",
            isBookmarked ? "fill-primary" : "group-hover/bookmark:scale-110"
          )} />
        </button>

        {/* High-Tech Badges */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
          {isInstalled && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary text-black text-[10px] font-black shadow-lg shadow-primary/20 uppercase tracking-widest transition-transform group-hover:scale-110">
              <Check size={12} strokeWidth={4} />
              Installed
            </div>
          )}
          {isInstalled && hasUpdate && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-update/10 text-update border border-update/20 text-[10px] font-black shadow-[0_0_15px_rgba(250,204,21,0.1)] uppercase tracking-widest backdrop-blur-md">
              Update Available
            </div>
          )}
        </div>
      </div>

      {/* Info Area */}
      <div className="flex flex-col flex-1 p-5 bg-surface min-h-36 relative z-10">
        <div className="flex items-center gap-2 mb-2 opacity-30 group-hover:opacity-100 transition-opacity">
           <div className="w-1 h-3 bg-primary rounded-full shadow-[0_0_5px_var(--color-primary)]" />
           <span className="text-[8px] font-black uppercase tracking-[0.2em] text-text-primary">MOD LISTING</span>
        </div>

        <h3
          className="text-base font-bold text-text-primary line-clamp-2 leading-tight mb-1 min-h-12 transition-colors group-hover:text-primary tracking-tight"
          title={mod._sName}
        >
          {mod._sName}
        </h3>
        <div className="mb-4">
          {mod._aSubmitter ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreatorClick?.(mod._aSubmitter);
              }}
              className="flex items-center gap-2 text-left group/creator hover:bg-white/5 p-1 -ml-1 rounded-lg transition-colors w-fit pr-3"
              title={`View profile for ${mod._aSubmitter._sName}`}
            >
              <div className="w-5 h-5 rounded-full overflow-hidden bg-background border border-border shrink-0 flex items-center justify-center shadow-surface">
                {mod._aSubmitter._sAvatarUrl ? (
                  <img src={mod._aSubmitter._sAvatarUrl} alt={mod._aSubmitter._sName} className="w-full h-full object-cover" />
                ) : (
                  <User size={10} className="text-text-secondary" />
                )}
              </div>
              <span className="text-[9px] uppercase font-black tracking-[0.2em] text-text-secondary truncate group-hover/creator:text-primary transition-colors">
                by {mod._aSubmitter._sName}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 p-1 -ml-1 h-7">
              <div className="w-5 h-5 rounded-full overflow-hidden bg-background border border-border shrink-0 flex items-center justify-center">
                <User size={10} className="text-text-muted" />
              </div>
              <p className="text-[9px] uppercase font-black tracking-[0.2em] text-text-muted truncate">
                by unknown
              </p>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-text-secondary mb-5 mt-auto border-t border-border pt-4">
          <div className="flex items-center gap-1.5 group/stat">
            <Heart size={12} className="text-text-secondary group-hover/stat:text-primary transition-colors" />
            <span className="text-[10px] font-black text-text-muted tracking-tighter group-hover:text-text-primary transition-colors">{formatCount(mod._nLikeCount)}</span>
          </div>
          <div className="flex items-center gap-1.5 group/stat">
            <Eye size={12} className="text-text-secondary group-hover/stat:text-primary transition-colors" />
            <span className="text-[10px] font-black text-text-muted tracking-tighter group-hover:text-text-primary transition-colors">{formatCount(mod._nViewCount)}</span>
          </div>
          {mod._nDownloadCount != null && (
            <div className="flex items-center gap-1.5 group/stat">
              <Download size={12} className="text-text-secondary group-hover/stat:text-primary transition-colors" />
              <span className="text-[10px] font-black text-text-muted tracking-tighter group-hover:text-text-primary transition-colors">{formatCount(mod._nDownloadCount)}</span>
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
            "w-full flex items-center justify-center gap-3 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group/btn",
            isInstalled
              ? "bg-background text-text-muted cursor-not-allowed border border-border"
              : "bg-primary text-black hover:scale-[1.02] active:scale-[0.98] shadow-surface shadow-primary/20"
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
      <div className="absolute inset-0 rounded-2xl border border-white/0 group-hover:border-primary/20 transition-all pointer-events-none z-20" />
      
      {/* Optimized Shadow Layer (animating opacity instead of box-shadow is virtually free for the GPU) */}
      <div className="absolute inset-0 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5),0_0_15px_color-mix(in_srgb,var(--color-primary),transparent_80%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[-1]" />
    </motion.div>
  );
});

export default BrowseModCard;
