import { useState } from "react";
import { Download, Heart, Eye, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";

function formatCount(n) {
  if (!n) return "0";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function BrowseModCard({ mod, isInstalled, hasUpdate, onInstall }) {
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <motion.div
      onClick={onInstall}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "rounded-2xl overflow-hidden group relative flex flex-col shadow-lg shadow-black/20",
        "bg-(--bg-card) border border-white/5 cursor-pointer"
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
          <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-(--bg-input) to-(--bg-card)">
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
        {isInstalled && hasUpdate && (
          <div className="absolute top-12 right-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500 text-black text-[10px] font-black shadow-lg shadow-yellow-500/20 uppercase tracking-widest animate-pulse">
            Update
          </div>
        )}
      </div>

      {/* Info Area */}
      <div className="flex flex-col flex-1 p-4 bg-(--bg-card) min-h-32">
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
    </motion.div>
  );
}
