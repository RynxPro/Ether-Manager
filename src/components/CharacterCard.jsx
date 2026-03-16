import { cn } from "../lib/utils";
import { User, Monitor, Box } from "lucide-react";
import { getCharacterPortrait } from "../lib/portraits";
import { motion } from "framer-motion";
import { useState } from "react";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 22 } },
};

export default function CharacterCard({ character, game, onClick }) {
  const isUI = character.name === "User Interface";
  const isMisc = character.name === "Miscellaneous";
  const isGlobal = isUI || isMisc;

  const portraitUrl = isGlobal ? null : getCharacterPortrait(character.name, game.id);
  const [imgLoaded, setImgLoaded] = useState(false);
  const hasMods = character.totalMods > 0;

  return (
    <motion.div
      variants={itemVariants}
      onClick={onClick}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "rounded-2xl overflow-hidden group relative",
        "bg-(--bg-card) border border-white/5 cursor-pointer shadow-lg shadow-black/20",
        !hasMods && "opacity-40 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
        hasMods && "border-(--active-accent)/20 shadow-(--active-accent)/5"
      )}
      style={{ contain: "layout paint" }}
    >
      {/* Portrait Area — tall card, image pinned to top */}
      <div className="relative h-56 w-full bg-(--bg-base) overflow-hidden">
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
                "absolute inset-0 w-full h-full object-cover object-top transition-all duration-700",
                imgLoaded ? "opacity-100" : "opacity-0",
                !hasMods && "scale-105 group-hover:scale-100"
              )}
              loading="lazy"
            />
            {/* Vignette/Gradient overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-(--bg-card) via-(--bg-card)/60 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-(--bg-input) to-(--bg-card)">
            {isUI ? (
              <Monitor size={80} className="text-(--active-accent) opacity-20" />
            ) : isMisc ? (
              <Box size={80} className="text-(--active-accent) opacity-20" />
            ) : (
              <User size={64} className="text-white/5" />
            )}
          </div>
        )}

        {/* Mod count badge - only if has mods */}
        {hasMods && (
          <div className="absolute top-3 right-3 z-10 min-w-[24px] h-6 px-2 rounded-full text-[10px] font-black text-black bg-(--active-accent) shadow-lg shadow-(--active-accent)/20 flex items-center justify-center transition-transform group-hover:scale-110">
            {character.totalMods}
          </div>
        )}
      </div>

      {/* Info Area */}
      <div className="px-4 py-4 relative bg-(--bg-card)">
        <h3 className={cn(
          "text-sm font-bold leading-tight truncate transition-colors",
          hasMods ? "text-white" : "text-gray-500 group-hover:text-white"
        )}>
          {character.name}
        </h3>
        
        {hasMods ? (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-(--active-accent)">
              {character.totalMods} MODS
            </span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-white/40">
              {character.enabledMods} ACTIVE
            </span>
          </div>
        ) : (
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-600 mt-1">
            No Mods
          </p>
        )}
      </div>
    </motion.div>
  );
}
