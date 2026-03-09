import { FileText, FolderOpen } from "lucide-react";
import { cn } from "../lib/utils";

export default function ModCard({ mod, onToggle, onOpenFolder }) {
  return (
    <div
      className={cn(
        "relative rounded-xl border p-5 transition-all duration-300 flex flex-col justify-between h-[180px]",
        mod.isEnabled
          ? "bg-[#0f0f1a] border-[var(--active-accent)]/30 shadow-[0_4px_24px_-8px_var(--active-accent)]"
          : "bg-white/[0.02] border-white/5 opacity-60 grayscale-[0.5]",
      )}
    >
      {/* Top section */}
      <div>
        <div className="flex items-start justify-between mb-2">
          <h3
            className="text-xl font-bold text-white line-clamp-2 pr-4"
            title={mod.name}
          >
            {mod.name}
          </h3>
          <div
            className={cn(
              "px-2.5 py-1 rounded-sm text-[10px] font-bold tracking-wider shrink-0",
              mod.isEnabled
                ? "bg-[var(--active-accent)]/20 text-[var(--active-accent)] border border-[var(--active-accent)]/30"
                : "bg-white/10 text-gray-400 border border-white/5",
            )}
          >
            {mod.isEnabled ? "ENABLED" : "DISABLED"}
          </div>
        </div>

        <div className="flex items-center text-sm text-gray-400 mt-2">
          <FileText size={14} className="mr-1.5 opacity-70" />
          {mod.iniCount} INI file{mod.iniCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Bottom section (Actions) */}
      <div className="flex items-center justify-between mt-4">
        {/* Toggle Switch */}
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

        {/* Open Folder Button */}
        <button
          onClick={onOpenFolder}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <FolderOpen size={16} />
          <span>Folder</span>
        </button>
      </div>
    </div>
  );
}
