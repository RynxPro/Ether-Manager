import { cn } from "../lib/utils";
import { User } from "lucide-react";
import { getCharacterPortrait } from "../lib/portraits";
import { motion } from "framer-motion";
import { useState } from "react";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 22 } },
};

export default function CharacterCard({ character, game, onClick }) {
  const portraitUrl = getCharacterPortrait(character.name, game.id);
  const [imgLoaded, setImgLoaded] = useState(false);
  const hasMods = character.totalMods > 0;

  return (
    <motion.div
      variants={itemVariants}
      onClick={hasMods || character.name === "Unassigned" ? onClick : undefined}
      className={cn(
        "rounded-2xl overflow-hidden group transition-all duration-300 relative",
        "bg-[#0f0f1a] border border-white/5",
        hasMods || character.name === "Unassigned"
          ? "cursor-pointer hover:-translate-y-1 hover:shadow-2xl hover:shadow-(--active-accent)/20 hover:border-(--active-accent)/50"
          : "opacity-40 grayscale-[0.5] hover:opacity-100 hover:grayscale-0 hover:border-white/20 transition-all duration-500",
        hasMods && "border-(--active-accent)/20 shadow-lg shadow-(--active-accent)/5"
      )}
      style={{ contain: "layout paint" }}
    >
      {/* Portrait Area — tall card, image pinned to top */}
      <div className="relative h-56 w-full bg-[#0d0d16] overflow-hidden">
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
            {/* Bottom vignette */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0f0f1a] via-[#0f0f1a]/60 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <User size={64} className="text-white/5" />
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
      <div className="px-4 py-4 relative bg-[#0f0f1a]">
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
