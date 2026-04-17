import React, { useState } from "react";
import { Download, Heart, Check, Bookmark, User, Star, Tag } from "lucide-react";
import { cn } from "../lib/utils";

import UpdateBadge from "./UpdateBadge";
import { InteractiveCard } from "./ui/InteractiveCard";
import { useAppStore } from "../store/useAppStore";

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// Filter tags to ones worth surfacing (skip generic tool tags)
function usefulTags(tags = []) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => !t.toLowerCase().startsWith("software used:"))
    .slice(0, 2);
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
  const downloadJob = useAppStore((state) => state.downloads.find(d => d.id === mod._idRow));
  const isDownloading = downloadJob?.status === "downloading" || downloadJob?.status === "extracting";

  // Prefer sub-category (character name, e.g. "Miyabi") over root ("Character Skins")
  const categoryLabel =
    mod._aSubCategory?._sName ||
    mod._aRootCategory?._sName ||
    mod._aCategory?._sName ||
    "Mod";

  const tags = usefulTags(mod._aTags);

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

        {/* Badges (Top Left) — bookmark */}
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

        {/* Badges (Top Right) — featured star + installed/update */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
            {mod._bWasFeatured && (
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-500/20 border border-yellow-500/40 backdrop-blur-md shadow-lg"
                title="GameBanana Staff Featured"
              >
                <Star size={12} className="fill-yellow-400 text-yellow-400" />
              </div>
            )}
            {isInstalled && !hasUpdate && (
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

      {/* Content Area */}
      <div className="flex flex-col flex-1 p-5 relative z-10 w-full">
        {/* Category + Version row */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted truncate">
            {categoryLabel}
          </div>
          {mod._sVersion && (
            <div className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-text-muted font-mono">
              {mod._sVersion}
            </div>
          )}
        </div>

        <h3
          className="text-sm font-bold text-text-primary line-clamp-2 leading-tight mb-2 transition-colors group-hover:text-primary tracking-tight min-h-10"
          title={mod._sName}
        >
          {mod._sName}
        </h3>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[9px] font-semibold text-text-muted"
              >
                <Tag size={8} className="opacity-60" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
           {mod._aSubmitter ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreatorClick?.(mod._aSubmitter);
                }}
                className="flex min-w-0 items-center gap-2 rounded-lg transition-colors hover:text-primary"
              >
                <div className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
                  {(mod._aSubmitter._sHdAvatarUrl || mod._aSubmitter._sAvatarUrl) ? (
                    <img src={mod._aSubmitter._sHdAvatarUrl || mod._aSubmitter._sAvatarUrl} alt={mod._aSubmitter._sName} className="w-full h-full object-cover" />
                  ) : (
                    <User size={10} className="text-text-secondary" />
                  )}
                  {mod._aSubmitter._bIsOnline && (
                    <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 border border-background" />
                  )}
                </div>
                <span className="truncate text-[11px] font-semibold text-text-secondary transition-colors group-hover/creator:text-primary">
                  {mod._aSubmitter._sName}
                </span>
              </button>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
                  <User size={10} className="text-text-muted" />
                </div>
                <p className="truncate text-[11px] font-semibold text-text-muted">
                  Unknown
                </p>
              </div>
            )}

           <div className="flex shrink-0 items-center gap-3 text-[10px] font-bold text-text-secondary">
              <div className="flex items-center gap-1">
                 <Heart size={10} className="text-text-muted" />
                 <span>{formatCount(mod._nLikeCount)}</span>
              </div>
              {mod._nDownloadCount != null && (
                 <div className="flex items-center gap-1">
                    <Download size={10} className="text-text-muted" />
                    <span>{formatCount(mod._nDownloadCount)}</span>
                 </div>
              )}
           </div>
        </div>

        {/* Install action */}
        <div className="mt-auto border-t border-border pt-4">
          <button
            disabled={isDownloading}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDownloading) onInstall(mod);
            }}
            className={cn(
              "group/btn relative flex h-9 w-full items-center justify-center gap-2 overflow-hidden rounded-lg border text-[10px] font-black uppercase tracking-[0.2em] transition-all",
              isDownloading
                ? "border-primary/20 bg-primary/10 text-primary cursor-not-allowed"
                : hasUpdate || !isInstalled
                ? "border-primary/50 bg-primary text-black shadow-[0_0_15px_var(--color-primary)]/20 hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98]"
                : "border-border bg-surface text-text-primary hover:border-white/20 hover:bg-white/6"
            )}
          >
            {isDownloading ? (
              <>
                <Download size={12} strokeWidth={4} className="animate-bounce" /> {downloadJob.status === "extracting" ? "Extracting..." : `${downloadJob.percent}%`}
              </>
            ) : hasUpdate ? (
              <>
                <Download size={12} strokeWidth={4} className="group-hover/btn:animate-bounce" /> View Update
              </>
            ) : isInstalled ? (
              <>
                <Check size={12} strokeWidth={4} /> View Details
              </>
            ) : (
              <>
                <Download size={12} strokeWidth={4} className="group-hover/btn:animate-bounce" /> Install
              </>
            )}
          </button>
        </div>
      </div>

      {isDownloading && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 z-40 overflow-hidden">
           <div
             className="h-full bg-primary transition-all duration-300 ease-out"
             style={{ width: `${downloadJob.percent}%` }}
           />
        </div>
      )}

      <div className="absolute inset-0 rounded-2xl shadow-inner group-hover:shadow-[inset_0_0_0_1px_var(--color-primary)] opacity-0 group-hover:opacity-40 transition-all pointer-events-none z-30" />
    </InteractiveCard>
  );
});

export default BrowseModCard;
