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
      className={cn(
        "relative rounded-xl overflow-hidden border transition-all duration-300 flex flex-col group will-change-transform hover:-translate-y-1 hover:border-[var(--active-accent)]/50 hover:shadow-xl hover:shadow-[var(--active-accent)]/10",
        "bg-[#0f0f1a] border-white/8"
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-36 w-full bg-white/5 overflow-hidden shrink-0">
        {mod.thumbnailUrl ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
            <img
              src={mod.thumbnailUrl}
              alt={mod._sName}
              onLoad={() => setImgLoaded(true)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
                imgLoaded ? "opacity-100" : "opacity-0"
              )}
              loading="lazy"
              decoding="async"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-white/5 select-none">
              {mod._sName?.[0]?.toUpperCase() || "?"}
            </span>
          </div>
        )}
        {/* Already installed indicator */}
        {isInstalled && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-bold">
            <Check size={10} />
            Installed
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-4">
        <h3
          className="text-sm font-semibold text-white line-clamp-2 leading-snug mb-1 min-h-[2.5rem]"
          title={mod._sName}
        >
          {mod._sName}
        </h3>
        <p className="text-xs text-gray-500 mb-4 truncate">
          by {mod._aSubmitter?._sName || "Unknown"}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-gray-500 text-xs mb-4 mt-auto">
          <span className="flex items-center gap-1">
            <Heart size={11} /> {formatCount(mod._nLikeCount)}
          </span>
          <span className="flex items-center gap-1">
            <Eye size={11} /> {formatCount(mod._nViewCount)}
          </span>
          {mod._nDownloadCount != null && (
            <span className="flex items-center gap-1">
              <Download size={11} /> {formatCount(mod._nDownloadCount)}
            </span>
          )}
        </div>

        {/* Install button */}
        <button
          onClick={onInstall}
          disabled={isInstalled}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all",
            isInstalled
              ? "bg-white/5 text-gray-500 cursor-not-allowed"
              : "bg-[var(--active-accent)] text-black hover:brightness-110 active:brightness-90"
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
