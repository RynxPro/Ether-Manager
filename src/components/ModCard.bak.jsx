import { useState } from "react";
import { FileText, FolderOpen, Check, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import UpdateBadge from "./UpdateBadge";

export default function ModCard({ mod, gbData, isUnassignedMode, onToggle, onOpenFolder, onAssign, onDelete, characters = [], onClick, hideCategoryTag = false }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const thumbnailUrl = mod.customThumbnail || gbData?.thumbnailUrl;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl overflow-hidden group transition-all duration-300 relative flex flex-col will-change-transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-(--active-accent)/20 hover:border-(--active-accent)/50",
        onClick ? "cursor-pointer" : "",
        mod.isEnabled
          ? "bg-[#0f0f1a] border-[#1a1a2e]"
          : "bg-white/2 border-white/5 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
        mod.isEnabled && "border-(--active-accent)/20 shadow-lg shadow-(--active-accent)/5"
      )}
    >
      {/* Thumbnail strip (shown only when GB data available) */}
      {thumbnailUrl ? (
        <div className="relative h-40 w-full shrink-0 overflow-hidden bg-[#0d0d16]">
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
            {gbData?.hasUpdate && (
              <UpdateBadge />
            )}
          </div>
        </div>
      ) : (
        <div className="relative h-40 w-full bg-linear-to-br from-[#1a1a2e] to-[#0f0f1a] overflow-hidden shrink-0 flex items-center justify-center">
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
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="p-4 flex flex-col flex-1 bg-[#0f0f1a] min-h-32">
        <div className="flex-1">
          {mod.category && 
           !hideCategoryTag &&
           mod.category !== "Character Skins" && 
           mod.category !== "NPC Skins" && (
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
              mod.isEnabled ? "text-white" : "text-gray-500 group-hover:text-white"
            )}
            title={mod.name}
          >
            {mod.name}
          </h3>

          <div className="flex flex-col gap-1 mt-auto pb-2">
            {/* Version / Folder info */}
            <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-white/30 truncate">
              <FileText size={10} className="shrink-0" />
              <span className="truncate">{mod.originalFolderName}</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div
          className="flex items-center justify-between mt-3 relative z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {isUnassignedMode ? (
            <select
              onChange={(e) => { if (e.target.value) onAssign(e.target.value); }}
              className="bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-(--active-accent)"
              defaultValue=""
            >
              <option value="" disabled>Assign Character...</option>
              {characters.map(char => (
                <option key={char} value={char}>{char}</option>
              ))}
            </select>
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
