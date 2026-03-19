import { useState, memo } from "react";
import { FileText, FolderOpen, Check, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import UpdateBadge from "./UpdateBadge";
import SearchableDropdown from "./SearchableDropdown";
import { motion } from "framer-motion";

const ModCard = memo(function ModCard({ mod, gbData, isUnassignedMode, onToggle, onOpenFolder, onAssign, onDelete, characters = [], onClick, hideCategoryTag = false, gameId }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const thumbnailUrl = mod.customThumbnail || gbData?.thumbnailUrl;

  return (
    <motion.div
      onClick={() => onClick && onClick(mod)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ 
        y: -8, 
        scale: 1.01
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "rounded-3xl overflow-hidden group relative transition-all duration-300 flex flex-col shadow-2xl",
        onClick ? "cursor-pointer" : "",
        mod.isEnabled
          ? "bg-(--bg-card) border border-white/5"
          : "bg-white/2 border border-white/5 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
        mod.isEnabled && "border-(--active-accent)/20"
      )}
    >
      {/* Thumbnail strip (shown only when GB data available) */}
      {thumbnailUrl ? (
        <div className="relative h-44 w-full shrink-0 overflow-hidden bg-(--bg-base)">
          {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
          
          <img
            src={thumbnailUrl}
            alt={mod.name}
            onLoad={() => setImgLoaded(true)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-all duration-1000",
              imgLoaded ? "opacity-100" : "opacity-0"
            )}
            loading="lazy"
            decoding="async"
          />
          
          {/* Status overlay */}
          <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
            <div
              className={cn(
                "px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase shadow-lg",
                mod.isEnabled
                  ? "bg-(--active-accent) text-black shadow-(--active-accent)/20"
                  : "bg-black/80 text-white/50 border border-white/10"
              )}
            >
              {mod.isEnabled ? "Active" : "Disabled"}
            </div>
            {gbData?.hasUpdate ? (
              <UpdateBadge />
            ) : gbData ? (
              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-(--color-success)/10 text-(--color-success) border border-(--color-success)/20 text-[9px] font-black uppercase tracking-widest backdrop-blur-md shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                <Check size={10} strokeWidth={4} />
                Latest
              </div>
            ) : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-(--bg-card) to-transparent" />
        </div>
      ) : (
        <div className="relative h-44 w-full bg-linear-to-br from-(--bg-input) to-(--bg-card) overflow-hidden shrink-0 flex items-center justify-center">
          <span className="text-6xl font-black text-white/5 select-none uppercase">
            {mod.name?.[0] || "?"}
          </span>
          {/* Status overlay for no-thumbnail cards */}
          <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
            <div
              className={cn(
                "px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase shadow-lg",
                mod.isEnabled
                  ? "bg-(--active-accent) text-black shadow-(--active-accent)/20"
                  : "bg-black/80 text-white/50 border border-white/10"
              )}
            >
              {mod.isEnabled ? "Active" : "Disabled"}
            </div>
            {gbData?.hasUpdate ? (
              <UpdateBadge />
            ) : gbData ? (
              <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-(--color-success)/10 text-(--color-success) border border-(--color-success)/20 text-[9px] font-black uppercase tracking-widest backdrop-blur-md shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                <Check size={10} strokeWidth={4} />
                Latest
              </div>
            ) : null}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-(--bg-card) to-transparent" />
        </div>
      )}

      {/* Info Section */}
      <div className="p-5 flex flex-col flex-1 bg-(--bg-card) min-h-36 relative z-10">
        <div className="flex-1">
          {mod.category && 
           !hideCategoryTag &&
           !mod.category.toLowerCase().includes("skin") && 
           !mod.category.toLowerCase().includes("character") && (
            <div className="mb-2 flex">
              <span className="px-2 py-0.5 rounded-full bg-white/5 text-(--active-accent) text-[9px] font-black uppercase tracking-widest border border-(--active-accent)/20">
                {mod.category === "User Interface" || mod.category === "UI" ? "UI" 
                 : mod.category === "Other/Misc" || mod.category === "Miscellaneous" ? "MISC" 
                 : mod.category}
              </span>
            </div>
          )}
          <h3
            className={cn(
              "text-base font-black leading-tight line-clamp-2 min-h-12 transition-colors tracking-tight",
              mod.isEnabled ? "text-white group-hover:text-(--active-accent)" : "text-(--text-muted) group-hover:text-white"
            )}
            title={mod.name}
          >
            {mod.name}
          </h3>

          <div className="flex flex-col gap-1 mt-2 mb-4">
            {/* Version / Folder info */}
            <div className="flex items-center gap-2 text-[9px] uppercase font-bold tracking-widest text-(--text-muted) truncate group-hover:text-(--text-body) transition-colors">
              <FileText size={10} className="shrink-0" />
              <span className="truncate">{mod.originalFolderName}</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div
          className="flex items-center justify-between mt-auto pt-4 border-t border-white/5 relative z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {isUnassignedMode ? (
            <div className="flex-1 max-w-[200px]">
              <SearchableDropdown
                items={characters}
                value=""
                onChange={(val) => onAssign(val)}
                placeholder="Assign To..."
                gameId={gameId}
                direction="up"
              />
            </div>
          ) : (
            <label className="flex items-center cursor-pointer relative group/toggle">
              <input
                type="checkbox"
                className="sr-only toggle-checkbox"
                checked={mod.isEnabled}
                onChange={(e) => onToggle(mod, e.target.checked)}
              />
              <div
                className={cn(
                  "toggle-label w-12 h-6 rounded-full transition-all duration-500 relative shadow-inner",
                  mod.isEnabled 
                    ? "bg-(--active-accent) shadow-[0_0_15px_var(--active-accent)]/20" 
                    : "bg-white/5 border border-white/10",
                )}
              >
                <div
                  className={cn(
                    "absolute w-4 h-4 rounded-full top-1 transition-all duration-500 shadow-xl",
                    mod.isEnabled 
                      ? "left-7 bg-black" 
                      : "left-1 bg-white/20 group-hover/toggle:bg-white/40",
                  )}
                ></div>
              </div>
              <span
                className={cn(
                  "ml-3 text-[10px] font-black uppercase tracking-widest transition-colors duration-300",
                  mod.isEnabled ? "text-white" : "text-(--text-muted)",
                )}
              >
                {mod.isEnabled ? "Active" : "Off"}
              </span>
            </label>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onDelete) onDelete(mod);
              }}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/0 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all hover:scale-110 active:scale-95"
              title="Delete Mod"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenFolder) onOpenFolder(mod);
              }}
              title="Open Folder"
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/0 text-(--text-muted) hover:text-white hover:bg-white/5 transition-all hover:scale-110 active:scale-95"
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Bloom Effect Ring */}
      <div className="absolute inset-0 rounded-3xl border border-white/0 group-hover:border-(--active-accent)/20 transition-all pointer-events-none" />
      
      {/* Optimized Box Shadow Hover Layer */}
      <div className="absolute inset-0 rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5),0_0_15px_color-mix(in_srgb,var(--active-accent),transparent_85%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[-1]" />
    </motion.div>
  );
});

export default ModCard;
