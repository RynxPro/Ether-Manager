import { cn } from "../lib/utils";
import { User } from "lucide-react";
import { getCharacterPortrait } from "../lib/portraits";
import { motion } from "framer-motion";
import { useState } from "react";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 22 } },
};

export default function CharacterCard({ character, onClick }) {
  const portraitUrl = getCharacterPortrait(character.name);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <motion.div
      variants={itemVariants}
      onClick={onClick}
      className={cn(
        "rounded-2xl overflow-hidden cursor-pointer group transition-transform duration-200",
        "hover:-translate-y-1 hover:shadow-2xl hover:shadow-[var(--active-accent)]/20",
        "will-change-transform bg-[#0f0f1a] border border-white/5",
      )}
      style={{ contain: "layout paint" }}
    >
      {/* Portrait Area — tall card, image pinned to top */}
      <div className="relative h-52 w-full bg-[#0f0f1a] overflow-hidden">
        {portraitUrl ? (
          <>
            {/* Low-fi placeholder shimmer while image loads */}
            {!imgLoaded && (
              <div className="absolute inset-0 bg-white/5 animate-pulse" />
            )}
            <img
              src={portraitUrl}
              alt={character.name}
              onLoad={() => setImgLoaded(true)}
              className={cn(
                "absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500",
                imgLoaded ? "opacity-100" : "opacity-0",
              )}
              loading="lazy"
              decoding="async"
            />
            {/* Bottom vignette so text is readable */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0f0f1a] to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <User size={64} className="text-white/10" />
          </div>
        )}

        {/* Mod count badge */}
        <div className="absolute top-3 right-3 z-10 min-w-[24px] h-6 px-2 rounded-full text-xs font-bold text-white bg-black/60 backdrop-blur-sm border border-white/15 flex items-center justify-center group-hover:bg-[var(--active-accent)] group-hover:text-black group-hover:border-transparent transition-colors">
          {character.totalMods}
        </div>
      </div>

      {/* Info Area */}
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-white leading-tight truncate">
          {character.name}
        </h3>
        <p className="text-xs text-[var(--active-accent)]/80 mt-0.5 font-medium">
          {character.totalMods} mods
          {character.totalMods > 0 ? ` · ${character.enabledMods} enabled` : ""}
        </p>
      </div>
    </motion.div>
  );
}
