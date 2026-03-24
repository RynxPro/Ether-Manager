import { cn } from "../lib/utils";
import { User, Monitor, Box } from "lucide-react";
import { motion } from "framer-motion";
import { useState, memo } from "react";
import { useCharacterPortrait } from "../hooks/useCharacterPortrait";

import UpdateBadge from "./UpdateBadge";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 22 } },
};

const CharacterCard = memo(function CharacterCard({ character, game, onClick, hasUpdate = false }) {
  const isUI = character.name === "User Interface";
  const isMisc = character.name === "Miscellaneous";
  const isGlobal = isUI || isMisc;

  const portraitUrl = useCharacterPortrait(character.name, game.id, !isGlobal);
  const [imgLoaded, setImgLoaded] = useState(false);
  const hasMods = character.totalMods > 0;

  return (
    <motion.div
      variants={itemVariants}
      onClick={() => onClick(character)}
      whileHover={{ 
        y: -10, 
        scale: 1.01
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "rounded-2xl overflow-hidden group relative transition-all duration-300",
        "bg-surface border border-border cursor-pointer shadow-card hover:shadow-surface",
        !hasMods && "opacity-40 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
        hasMods && "hover:border-primary/40"
      )}
      style={{ 
        contain: "layout paint"
      }}
    >
      {/* Portrait Area — tall card, image pinned to top */}
      <div className="relative h-60 w-full bg-background overflow-hidden">
        {portraitUrl ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-white/5 animate-pulse" />
            )}
            <img
              src={portraitUrl}
              alt={character.name}
              onLoad={() => setImgLoaded(true)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover object-top transition-all duration-1000",
                imgLoaded ? "opacity-100" : "opacity-0",
                !hasMods && "scale-105 group-hover:scale-100"
              )}
              loading="lazy"
              decoding="async"
            />
            {/* Vignette/Gradient overlay */}
            <div className="absolute inset-0 bg-linear-to-t from-surface via-transparent to-transparent opacity-60" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-surface via-surface/80 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-background to-surface">
            {isUI ? (
              <Monitor size={80} className="text-primary opacity-20" />
            ) : isMisc ? (
              <Box size={80} className="text-primary opacity-20" />
            ) : (
              <User size={64} className="text-white/5" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-surface to-transparent" />
          </div>
        )}

        {/* Mod count badge - only if has mods */}
        {hasMods && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            {hasUpdate && <UpdateBadge className="transition-transform group-hover:scale-110 shadow-surface" />}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-black shadow-[0_0_15px_var(--color-primary)]/30 transition-transform group-hover:scale-110">
              <span className="text-[10px] font-black tracking-tighter">{character.totalMods}</span>
            </div>
          </div>
        )}
      </div>

      {/* Info Area */}
      <div className="px-5 py-5 relative bg-surface z-10">
        <div className="flex items-center gap-2 mb-1.5 opacity-30 group-hover:opacity-100 transition-opacity">
           <div className="w-1 h-3 bg-primary rounded-full shadow-primary/20" />
           <span className="text-[8px] font-black uppercase tracking-[0.2em] text-text-primary">Character Unit</span>
        </div>
        <h3 className={cn(
          "text-base font-bold leading-tight truncate transition-colors tracking-tight",
          hasMods ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
        )}>
          {character.name}
        </h3>
        
        {hasMods ? (
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-primary" />
              <span className="text-[9px] uppercase tracking-widest font-black text-text-secondary">
                {character.totalMods} Total
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]" />
              <span className="text-[9px] uppercase tracking-widest font-black text-text-secondary">
                {character.enabledMods} Active
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[9px] uppercase tracking-[0.2em] font-black text-text-muted mt-3 group-hover:text-text-secondary transition-colors">
            Standby Mode
          </p>
        )}
      </div>
      
      {/* Bloom Effect Ring (External Glow) */}
      <div className="absolute inset-0 rounded-2xl border border-white/0 group-hover:border-primary/20 transition-all pointer-events-none" />
      
      {/* Optimized Box Shadow Hover Layer */}
      <div className="absolute inset-0 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5),0_0_15px_color-mix(in_srgb,var(--color-primary),transparent_80%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[-1]" />
    </motion.div>
  );
});

export default CharacterCard;
