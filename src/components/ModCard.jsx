import { useState } from "react";
import { FileText, FolderOpen, Check } from "lucide-react";
import { cn } from "../lib/utils";
import UpdateBadge from "./UpdateBadge";

export default function ModCard({ mod, gbData, isUnassignedMode, onToggle, onOpenFolder, onAssign, characters = [], onClick }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const thumbnailUrl = mod.customThumbnail || gbData?.thumbnailUrl;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-xl border transition-all duration-300 flex flex-col group will-change-transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-[var(--active-accent)]/20 hover:border-[var(--active-accent)]/50 overflow-hidden",
        onClick && "cursor-pointer",
        mod.isEnabled
          ? "bg-[#0f0f1a] border-white/10"
          : "bg-white/[0.02] border-white/5 opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
      )}
    >
      {/* Thumbnail strip (shown only when GB data available) */}
      {thumbnailUrl ? (
        <div className="relative h-36 w-full shrink-0 overflow-hidden bg-white/5">
          {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
          <img
            src={thumbnailUrl}
            alt={mod.name}
            onLoad={() => setImgLoaded(true)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
              imgLoaded ? "opacity-100" : "opacity-0"
            )}
            loading="lazy"
            decoding="async"
          />
          {/* Status overlay */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <div
              className={cn(
                "px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-wider",
                mod.isEnabled
                  ? "bg-[var(--active-accent)]/90 text-black"
                  : "bg-black/70 text-gray-300"
              )}
            >
              {mod.isEnabled ? "ENABLED" : "DISABLED"}
            </div>
            {gbData?.hasUpdate ? (
              <UpdateBadge />
            ) : gbData ? (
              <div className="px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-wider bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                <Check size={10} />
                LATEST
              </div>
            ) : null}
        </div>
      </div>
      ) : (
        <div className="relative h-36 w-full bg-white/5 overflow-hidden shrink-0 flex items-center justify-center">
          <span className="text-4xl font-bold text-white/5 select-none uppercase">
            {mod.name?.[0] || "?"}
          </span>
          {/* Status overlay for no-thumbnail cards */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <div
              className={cn(
                "px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-wider",
                mod.isEnabled
                  ? "bg-[var(--active-accent)]/90 text-black"
                  : "bg-black/70 text-gray-300"
              )}
            >
              {mod.isEnabled ? "ENABLED" : "DISABLED"}
            </div>
            {gbData?.hasUpdate ? (
              <UpdateBadge />
            ) : gbData ? (
              <div className="px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-wider bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                <Check size={10} />
                LATEST
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1 justify-between">
        {/* Top section */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3
              className="text-sm font-semibold text-white line-clamp-2 leading-tight min-h-[2.5rem]"
              title={mod.name}
            >
              {mod.name}
            </h3>
            {/* Status indicators for no-thumbnail cards */}
            {!thumbnailUrl && (
              <div className="flex flex-col items-end gap-1 shrink-0">
                {gbData?.hasUpdate ? (
                  <UpdateBadge />
                ) : gbData ? (
                  <div className="px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-wider bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1">
                    <Check size={10} />
                    LATEST
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center text-xs text-gray-500">
            <FileText size={12} className="mr-1.5 opacity-70" />
            {mod.iniCount} INI file{mod.iniCount !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Bottom section (actions) */}
        <div 
          className="flex items-center justify-between mt-3 relative z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {isUnassignedMode ? (
            <select
              onChange={(e) => { if (e.target.value) onAssign(e.target.value); }}
              className="bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-[var(--active-accent)] bg-[#0a0a0f]"
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
                  mod.isEnabled ? "bg-[var(--active-accent)]" : "bg-gray-700",
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

          <button
            onClick={onOpenFolder}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors uppercase tracking-wider"
          >
            <FolderOpen size={12} />
            Folder
          </button>
        </div>
      </div>
    </div>
  );
}
