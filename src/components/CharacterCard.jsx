import { cn } from "../lib/utils";
import { User, Monitor, Box } from "lucide-react";
import { motion } from "framer-motion";
import { useState, memo } from "react";
import { useCharacterPortrait } from "../hooks/useCharacterPortrait";

import UpdateBadge from "./UpdateBadge";
import { InteractiveCard } from "./ui/InteractiveCard";

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
    <InteractiveCard
      variants={itemVariants}
      onClick={() => onClick(character)}
      className={cn(
        "cursor-pointer",
        !hasMods && "opacity-40 grayscale-[0.5] hover:opacity-100 hover:grayscale-0",
        hasMods && "hover:border-primary/40"
      )}
    >
      <div className="relative h-56 w-full overflow-hidden bg-background">
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
            <div className="absolute bottom-0 left-0 right-0 h-28 bg-linear-to-t from-surface via-surface/80 to-transparent" />
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

        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          {hasUpdate && <UpdateBadge className="transition-transform group-hover:scale-110 shadow-surface" />}
          {hasMods && (
            <div className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-black shadow-[0_0_15px_var(--color-primary)]/30 transition-transform group-hover:scale-110">
              <span className="text-[10px] font-black tracking-tighter">{character.totalMods}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-5 relative bg-surface z-10">
        <h3 className={cn(
          "text-base font-bold leading-tight truncate transition-colors tracking-tight",
          hasMods ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
        )}>
          {character.name}
        </h3>
        
        {hasMods ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted">
              {character.totalMods} Total
            </span>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
              {character.enabledMods} Enabled
            </span>
          </div>
        ) : (
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted transition-colors group-hover:text-text-secondary">
            No mods
          </p>
        )}
      </div>
    </InteractiveCard>
  );
});

export default CharacterCard;
