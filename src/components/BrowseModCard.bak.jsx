import { useState } from "react";
import { Download, Heart, Eye, Check } from "lucide-react";
import { cn } from "../lib/utils";

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function BrowseModCard({ mod, isInstalled, onInstall }) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      onClick={onInstall}
      className={cn(
        "rounded-2xl overflow-hidden group transition-all duration-300 relative flex flex-col will-change-transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-(--active-accent)/20 hover:border-(--active-accent)/50",
        "bg-[#0f0f1a] border-[#1a1a2e] cursor-pointer"
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-40 w-full bg-[#0d0d16] overflow-hidden shrink-0">
        {mod.thumbnailUrl ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
            
            <img
              src={mod.thumbnailUrl}
              alt={mod._sName}
              onLoad={() => setImgLoaded(true)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-all duration-700",
                imgLoaded ? "opacity-100" : "opacity-0"
              )}
              loading="lazy"
              decoding="async"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-[#1a1a2e] to-[#0f0f1a]">
            <span className="text-5xl font-black text-white/5 select-none uppercase">
              {mod._sName?.[0] || "?"}
            </span>
          </div>
        )}
        {/* Already installed indicator */}
        {isInstalled && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500 text-black text-[10px] font-black shadow-lg shadow-green-500/20 uppercase tracking-widest">
            <Check size={12} strokeWidth={3} />
            Installed
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="flex flex-col flex-1 p-4 bg-[#0f0f1a] min-h-32">
        <h3
          className="text-sm font-bold text-white line-clamp-2 leading-tight mb-1 min-h-10 transition-colors group-hover:text-(--active-accent)"
          title={mod._sName}
        >
          {mod._sName}
        </h3>
        <p className="text-[10px] uppercase font-bold tracking-widest text-white/30 mb-4 truncate">
          BY {mod._aSubmitter?._sName || "UNKNOWN"}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-white/50 mb-4 mt-auto border-t border-white/5 pt-3">
          <div className="flex items-center gap-1">
            <Heart size={10} className="text-red-500/70" />
            <span className="text-[10px] font-bold text-white tracking-tighter">{formatCount(mod._nLikeCount)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Eye size={10} className="text-blue-500/70" />
            <span className="text-[10px] font-bold text-white tracking-tighter">{formatCount(mod._nViewCount)}</span>
          </div>
          {mod._nDownloadCount != null && (
            <div className="flex items-center gap-1">
              <Download size={10} className="text-green-500/70" />
              <span className="text-[10px] font-bold text-white tracking-tighter">{formatCount(mod._nDownloadCount)}</span>
            </div>
          )}
        </div>

        {/* Install Button */}
        <button
          onClick={onInstall}
          disabled={isInstalled}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
            isInstalled
              ? "bg-white/5 text-gray-600 cursor-not-allowed"
              : "bg-(--active-accent) text-black hover:brightness-110 active:brightness-90 shadow-lg shadow-(--active-accent)/10"
          )}
        >
          {isInstalled ? (
            <>
              <Check size={14} /> Installed
            </>
          ) : (
            <>
              <Download size={14} /> Install
            </>
          )}
        </button>
      </div>
    </div>
  );
}
