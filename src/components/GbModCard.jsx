import React, { useState } from "react";
import { Download, Heart, Eye, Check, Bookmark, User } from "lucide-react";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";

import UpdateBadge from "./UpdateBadge";
import { InteractiveCard } from "./ui/InteractiveCard";

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const BrowseModCard = React.memo(function BrowseModCard({
  mod,
  onClick,
  onInstall,
  isInstalled,
  hasUpdate,
  isBookmarked = false,
  onToggleBookmark,
  onCreatorClick
}) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <InteractiveCard
      onClick={() => onClick?.(mod)}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "cursor-pointer flex flex-col relative group overflow-hidden w-full rounded-2xl bg-white/5 hover:bg-white/10 transition-colors",
        isInstalled ? "border border-primary/20" : "border border-white/10"
      )}
    >
      {/* Background Image */}
      <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden bg-background">
        {mod.thumbnailUrl ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse z-0" />}
            <img
              src={mod.thumbnailUrl}
              alt={mod._sName}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 z-0",
                imgLoaded ? "opacity-100" : "opacity-0"
              )}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-background to-surface transition-transform duration-700 group-hover:scale-105 z-0">
            <span className="text-6xl font-black text-white/5 select-none uppercase">
              {mod._sName?.[0] || "?"}
            </span>
          </div>
        )}

        {/* Badges (Top Left) */}
        <div className="absolute top-3 left-3 flex flex-col items-start gap-2 z-20">
           <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleBookmark?.(mod);
              }}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg border group/bookmark",
                isBookmarked
                  ? "bg-primary/20 border-primary/50 text-primary hover:bg-primary/30"
                  : "bg-black/50 border-white/10 text-white/50 hover:bg-white/10 hover:text-white"
              )}
              title={isBookmarked ? "Remove Bookmark" : "Save Bookmark"}
            >
              <Bookmark size={14} strokeWidth={isBookmarked ? 3 : 2} className={cn(
                 "transition-all duration-300",
                 isBookmarked ? "fill-primary" : "group-hover/bookmark:scale-110"
              )} />
           </button>
        </div>

        {/* Badges (Top right) */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
            {isInstalled && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-black border border-primary/30 text-[9px] font-black shadow-lg backdrop-blur-md uppercase tracking-widest">
                <Check size={10} strokeWidth={4} />
                Installed
              </div>
            )}
            {isInstalled && hasUpdate && (
              <UpdateBadge className="scale-90 origin-right shadow-lg backdrop-blur-md" />
            )}
        </div>
      </div>

      {/* Content Area (Bottom pinned) */}
      <div className="flex flex-col flex-1 p-5 relative z-10 w-full">
         <h3
           className="text-sm font-bold text-text-primary line-clamp-2 leading-tight mb-2 transition-colors group-hover:text-primary tracking-tight min-h-10"
           title={mod._sName}
         >
           {mod._sName}
         </h3>

         {/* Creator / Stats Row */}
         <div className="flex items-center justify-between mt-auto mb-4">
            {/* Creator */}
            {mod._aSubmitter ? (
               <button
                 type="button"
                 onClick={(e) => {
                   e.stopPropagation();
                   onCreatorClick?.(mod._aSubmitter);
                 }}
                 className="flex items-center gap-1.5 group/creator hover:bg-white/5 p-1 -ml-1 rounded-lg transition-colors w-fit pr-2"
               >
                 <div className="w-5 h-5 rounded-full overflow-hidden bg-background border border-border shrink-0 flex items-center justify-center">
                   {mod._aSubmitter._sAvatarUrl ? (
                     <img src={mod._aSubmitter._sAvatarUrl} alt={mod._aSubmitter._sName} className="w-full h-full object-cover" />
                   ) : (
                     <User size={10} className="text-text-secondary" />
                   )}
                 </div>
                 <span className="text-[9px] uppercase font-black tracking-[0.2em] text-text-secondary truncate group-hover/creator:text-primary transition-colors">
                   {mod._aSubmitter._sName}
                 </span>
               </button>
             ) : (
               <div className="flex items-center gap-1.5 p-1 -ml-1 h-7">
                 <div className="w-5 h-5 rounded-full overflow-hidden bg-background border border-border shrink-0 flex items-center justify-center">
                   <User size={10} className="text-text-muted" />
                 </div>
                 <p className="text-[9px] uppercase font-black tracking-[0.2em] text-text-muted truncate">
                   Unknown
                 </p>
               </div>
             )}

            {/* Stats (Compact) */}
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-1">
                  <Heart size={10} className="text-text-muted" />
                  <span className="text-[9px] font-black text-text-secondary">{formatCount(mod._nLikeCount)}</span>
               </div>
               {mod._nDownloadCount != null && (
                  <div className="flex items-center gap-1">
                     <Download size={10} className="text-text-muted" />
                     <span className="text-[9px] font-black text-text-secondary">{formatCount(mod._nDownloadCount)}</span>
                  </div>
               )}
            </div>
         </div>

         {/* Install action */}
         <div className="mt-auto pt-4 border-t border-border">
           <button
             onClick={(e) => {
               e.stopPropagation();
               onInstall(mod);
             }}
             disabled={isInstalled}
             className={cn(
               "w-full flex items-center justify-center gap-2 h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group/btn border",
               isInstalled
                 ? "bg-surface text-text-muted cursor-not-allowed border-transparent"
                 : "bg-primary border-primary/50 text-black hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_15px_var(--color-primary)]/20"
             )}
           >
             {isInstalled ? (
               <>
                 <Check size={12} strokeWidth={4} /> Synced
               </>
             ) : (
               <>
                 <Download size={12} strokeWidth={4} className="group-hover/btn:animate-bounce" /> Install
               </>
             )}
           </button>
         </div>
      </div>

      <div className="absolute inset-0 rounded-2xl shadow-inner group-hover:shadow-[inset_0_0_0_1px_var(--color-primary)] opacity-0 group-hover:opacity-40 transition-all pointer-events-none z-30" />
    </InteractiveCard>
  );
});

export default BrowseModCard;
