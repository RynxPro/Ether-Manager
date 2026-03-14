import { useState } from "react";
import { FileText, FolderOpen, Check, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import UpdateBadge from "./UpdateBadge";
import SearchableDropdown from "./SearchableDropdown";

export default function ModCard({ mod, gbData, isUnassignedMode, onToggle, onOpenFolder, onAssign, onDelete, characters = [], onClick, hideCategoryTag = false, gameId }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const thumbnailUrl = mod.customThumbnail || gbData?.thumbnailUrl;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl overflow-hidden group transition-all duration-300 relative flex flex-col will-change-transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-(--active-accent)/20 hover:border-(--active-accent)/50",
        onClick ? "cursor-pointer" : "",
        mod.isEnabled
          ? "bg-(--bg-card) border-white/5"
          : "bg-white/2 border-white/5 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
        mod.isEnabled && "border-(--active-accent)/20 shadow-lg shadow-(--active-accent)/5"
      )}
    >
      {/* Thumbnail strip (shown only when GB data available) */}
      {thumbnailUrl ? (
        <div className="relative h-40 w-full shrink-0 overflow-hidden bg-(--bg-base)">
          {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
          
          <img
            src={thumbnailUrl}
            alt={mod.name}
            onLoad={() => setImgLoaded(true)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-all duration-700",
              imgLoaded ? "opacity-100" : "opacity-0"
            )}
            loading="lazy"
            decoding="async"
          />
          
          {/* Status overlay */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
            <div
              className={cn(
                "px-2 py-0.5 rounded-sm text-[9px] font-black tracking-widest uppercase",
                mod.isEnabled
                  ? "bg-(--active-accent) text-black"
                  : "bg-black/80 text-white/50 border border-white/10"
              )}
            >
              {mod.isEnabled ? "Active" : "Disabled"}
            </div>
            {gbData?.hasUpdate ? (
              <UpdateBadge />
            ) : gbData ? (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-green-500/20 text-green-400 border border-green-500/30 text-[9px] font-black uppercase tracking-widest">
                <Check size={10} strokeWidth={3} />
                Latest
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="relative h-40 w-full bg-linear-to-br from-(--bg-input) to-(--bg-card) overflow-hidden shrink-0 flex items-center justify-center">
          <span className="text-5xl font-black text-white/5 select-none uppercase">
            {mod.name?.[0] || "?"}
          </span>
          {/* Status overlay for no-thumbnail cards */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
            <div
              className={cn(
                "px-2 py-0.5 rounded-sm text-[9px] font-black tracking-widest uppercase",
                mod.isEnabled
                  ? "bg-(--active-accent) text-black"
                  : "bg-black/80 text-white/50 border border-white/10"
              )}
            >
              {mod.isEnabled ? "Active" : "Disabled"}
            </div>
            {gbData?.hasUpdate ? (
              <UpdateBadge />
            ) : gbData ? (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-green-500/20 text-green-400 border border-green-500/30 text-[9px] font-black uppercase tracking-widest">
                <Check size={10} strokeWidth={3} />
                Latest
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="p-4 flex flex-col flex-1 bg-(--bg-card) min-h-32">
        <div className="flex-1">
          {mod.category && 
           !hideCategoryTag &&
           !mod.category.toLowerCase().includes("skin") && 
           !mod.category.toLowerCase().includes("character") && (
            <div className="mb-1 flex">
              <span className="px-1.5 py-0.5 rounded-sm bg-white/5 text-(--active-accent) text-[9px] font-black uppercase tracking-widest border border-(--active-accent)/20">
                {mod.category === "User Interface" || mod.category === "UI" ? "UI" 
                 : mod.category === "Other/Misc" || mod.category === "Miscellaneous" ? "MISC" 
                 : mod.category}
              </span>
            </div>
          )}
          <h3
            className={cn(
              "text-sm font-bold leading-tight line-clamp-2 min-h-10 transition-colors",
              mod.isEnabled ? "text-white group-hover:text-(--active-accent)" : "text-gray-500 group-hover:text-white"
            )}
            title={mod.name}
          >
            {mod.name}
          </h3>

          <div className="flex flex-col gap-1 mt-1 mb-4">
            {/* Version / Folder info */}
            <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-white/30 truncate">
              <FileText size={10} className="shrink-0" />
              <span className="truncate">{mod.originalFolderName}</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div
          className="flex items-center justify-between mt-auto pt-3 border-t border-white/5 relative z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {isUnassignedMode ? (
            <div className="flex-1 max-w-[200px]">
              <SearchableDropdown
                items={characters}
                value=""
                onChange={(val) => onAssign(val)}
                placeholder="Assign..."
                gameId={gameId}
                direction="up"
              />
            </div>
          ) : (
            <label className="flex items-center cursor-pointer relative">
              <input
                type="checkbox"
                className="sr-only toggle-checkbox"
                checked={mod.isEnabled}
                onChange={(e) => onToggle(e.target.checked)}
              />
              <div
                className={cn(
                  "toggle-label w-11 h-6 rounded-full transition-colors duration-300 relative",
                  mod.isEnabled ? "bg-(--active-accent)" : "bg-gray-700",
                )}
              >
                <div
                  className={cn(
                    "absolute bg-white w-5 h-5 rounded-full top-[2px] transition-all duration-300 shadow-sm",
                    mod.isEnabled ? "left-[22px]" : "left-[2px]",
                  )}
                ></div>
              </div>
              <span
                className={cn(
                  "ml-3 text-sm font-semibold transition-colors duration-300",
                  mod.isEnabled ? "text-white" : "text-gray-500",
                )}
              >
                {mod.isEnabled ? "ON" : "OFF"}
              </span>
            </label>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onDelete) onDelete(mod);
              }}
              className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-red-400 hover:bg-white/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onOpenFolder}
              title="Open Folder"
              className="flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
