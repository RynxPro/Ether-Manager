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
      whileHover={{ 
        y: -10, 
        scale: 1.01,
        boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5), 0 0 10px color-mix(in srgb, var(--active-accent), transparent 80%)"
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "rounded-3xl overflow-hidden group relative flex flex-col shadow-2xl transition-all duration-300",
        "bg-(--bg-card) border border-white/5 cursor-pointer",
        isInstalled && "border-(--active-accent)/20"
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-44 w-full bg-[#0d0d16] overflow-hidden shrink-0">
        {mod.thumbnailUrl ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-white/5 animate-pulse" />}
            
            <img
              src={mod.thumbnailUrl}
              alt={mod._sName}
              onLoad={() => setImgLoaded(true)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-all duration-1000",
                imgLoaded ? "opacity-100" : "opacity-0"
              )}
              loading="lazy"
              decoding="async"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-(--bg-input) to-(--bg-card)">
            <span className="text-6xl font-black text-white/5 select-none uppercase">
              {mod._sName?.[0] || "?"}
            </span>
          </div>
        )}
        
        {/* Overlays */}
        <div className="absolute inset-0 bg-linear-to-t from-(--bg-card) to-transparent opacity-60" />
        
        {/* High-Tech Badges */}
        <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
          {isInstalled && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-(--active-accent) text-black text-[10px] font-black shadow-lg shadow-(--active-accent)/20 uppercase tracking-widest transition-transform group-hover:scale-110">
              <Check size={12} strokeWidth={4} />
              Installed
            </div>
          )}
          {isInstalled && hasUpdate && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-400 text-black text-[10px] font-black shadow-lg shadow-yellow-400/30 uppercase tracking-widest animate-pulse">
              Update Available
            </div>
          )}
        </div>
      </div>

      {/* Info Area */}
      <div className="flex flex-col flex-1 p-5 bg-(--bg-card) min-h-36 relative z-10">
        <div className="flex items-center gap-2 mb-2 opacity-30 group-hover:opacity-100 transition-opacity">
           <div className="w-1 h-3 bg-(--active-accent) rounded-full shadow-[0_0_5px_var(--active-accent)]" />
           <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white">MOD LISTING</span>
        </div>
        
        <h3
          className="text-base font-black text-white line-clamp-2 leading-tight mb-1 min-h-12 transition-colors group-hover:text-(--active-accent) tracking-tight"
          title={mod._sName}
        >
          {mod._sName}
        </h3>
        <p className="text-[9px] uppercase font-black tracking-[0.2em] text-white/20 mb-4 truncate group-hover:text-white/40 transition-colors">
          BY {mod._aSubmitter?._sName || "UNKNOWN"}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-white/20 mb-5 mt-auto border-t border-white/5 pt-4">
          <div className="flex items-center gap-1.5 group/stat">
            <Heart size={12} className="text-red-500/40 group-hover/stat:text-red-500 transition-colors" />
            <span className="text-[10px] font-black text-white/40 tracking-tighter group-hover:text-white transition-colors">{formatCount(mod._nLikeCount)}</span>
          </div>
          <div className="flex items-center gap-1.5 group/stat">
            <Eye size={12} className="text-blue-500/40 group-hover/stat:text-blue-500 transition-colors" />
            <span className="text-[10px] font-black text-white/40 tracking-tighter group-hover:text-white transition-colors">{formatCount(mod._nViewCount)}</span>
          </div>
          {mod._nDownloadCount != null && (
            <div className="flex items-center gap-1.5 group/stat">
              <Download size={12} className="text-green-500/40 group-hover/stat:text-green-500 transition-colors" />
              <span className="text-[10px] font-black text-white/40 tracking-tighter group-hover:text-white transition-colors">{formatCount(mod._nDownloadCount)}</span>
            </div>
          )}
        </div>

        {/* Install Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInstall();
          }}
          disabled={isInstalled}
          className={cn(
            "w-full flex items-center justify-center gap-3 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group/btn",
            isInstalled
              ? "bg-white/5 text-white/10 cursor-not-allowed border border-white/5"
              : "bg-(--active-accent) text-black hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-(--active-accent)/20"
          )}
        >
          {isInstalled ? (
            <>
              <Check size={14} strokeWidth={4} /> Synced
            </>
          ) : (
            <>
              <Download size={14} strokeWidth={4} className="group-hover/btn:animate-bounce" /> Install Mod
            </>
          )}
        </button>
      </div>
      
      {/* External Bloom Ring */}
      <div className="absolute inset-0 rounded-3xl border border-white/0 group-hover:border-(--active-accent)/20 transition-all pointer-events-none" />
    </motion.div>
  );
}
