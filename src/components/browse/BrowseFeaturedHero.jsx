import { ChevronLeft, ChevronRight, Rocket, User } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../lib/utils";

export default function BrowseFeaturedHero({
  show,
  loading,
  featuredMods,
  currentHeroIndex,
  onPrevious,
  onNext,
  onSelectIndex,
  onOpenMod,
  onOpenCreator,
}) {
  if (!show) return null;

  return (
    <>
      <div className="mb-3 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
          <Rocket size={14} />
          Featured
        </div>
        {featuredMods.length > 1 && (
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
            {currentHeroIndex + 1} / {featuredMods.length}
          </div>
        )}
      </div>

      {loading && (
        <div className="mb-4 w-full">
          <div className="w-full h-[360px] rounded-3xl bg-[#0a0a0a] border border-white/10 overflow-hidden relative">
            <div className="absolute left-12 top-1/2 -translate-y-1/2 flex flex-col gap-4">
              <div className="w-24 h-5 bg-white/5 rounded-full animate-pulse" />
              <div className="w-80 h-16 bg-white/10 rounded-2xl animate-pulse" />
              <div className="w-64 h-8 bg-white/5 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {!loading && featuredMods.length > 0 && (() => {
        const featuredEntry = featuredMods[currentHeroIndex];
        const mod = featuredEntry?.mod;

        if (!mod) return null;

        return (
          <div className="mb-5 w-full">
            <div
              className="relative w-full h-[360px] rounded-3xl overflow-hidden border border-white/10 group cursor-pointer bg-[#0a0a0a]"
              onClick={() => onOpenMod(mod)}
            >
              <AnimatePresence initial={false}>
                <motion.div
                  key={mod._idRow + "-bg"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                  className="absolute inset-0 z-0"
                >
                  {mod.thumbnailUrl && (
                    <img
                      src={mod.thumbnailUrl}
                      className="w-full h-full object-cover scale-110 blur-2xl opacity-30 saturate-150"
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="absolute inset-0 z-10 bg-linear-to-r from-black/90 via-black/60 to-black/20" />
              <div className="absolute inset-0 z-10 bg-linear-to-t from-black/60 to-transparent" />

              <AnimatePresence initial={false}>
                <motion.div
                  key={mod._idRow}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="absolute inset-0 z-20 flex items-center"
                >
                  <div className="flex flex-col justify-between h-full px-10 py-10 w-[52%]">
                    <div className="inline-flex items-center gap-1.5 w-max px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-[0.25em]">
                      <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                      {featuredEntry.label}
                    </div>
                    <h2 className="text-3xl md:text-[2.6rem] font-black text-white tracking-tighter leading-[1.05] drop-shadow-2xl line-clamp-3">
                      {mod._sName}
                    </h2>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCreator(mod._aSubmitter);
                      }}
                      className="flex items-center gap-3 group/creator w-max"
                    >
                      {mod._aSubmitter?._sAvatarUrl ? (
                        <img
                          src={mod._aSubmitter._sAvatarUrl}
                          alt={mod._aSubmitter._sName}
                          loading="lazy"
                          decoding="async"
                          className="w-8 h-8 rounded-full object-cover border border-white/20 group-hover/creator:border-primary/60 transition-all"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                          <User size={12} className="text-white/60" />
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-[0.2em] font-black text-white/40">
                          Creator
                        </span>
                        <span className="text-sm font-bold text-white group-hover/creator:text-primary transition-colors leading-tight">
                          {mod._aSubmitter?._sName || "Unknown"}
                        </span>
                      </div>
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence initial={false}>
                <motion.div
                  key={mod._idRow + "-img"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: "easeInOut" }}
                  className="absolute inset-y-0 right-0 w-[58%] z-10"
                  style={{
                    clipPath: "polygon(12% 0%, 100% 0%, 100% 100%, 0% 100%)",
                  }}
                >
                  {mod.heroImageUrl || mod.thumbnailUrl ? (
                    <img
                      src={mod.heroImageUrl || mod.thumbnailUrl}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                      style={{
                        filter: "contrast(1.05) saturate(1.1) brightness(1.03)",
                        willChange: "transform",
                      }}
                      alt={mod._sName}
                      decoding="async"
                      fetchPriority="high"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/5" />
                  )}
                  <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/20 to-transparent pointer-events-none" />
                </motion.div>
              </AnimatePresence>

              <div className="absolute bottom-5 right-8 z-30 flex items-center gap-3 bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrevious();
                  }}
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <ChevronLeft size={14} strokeWidth={3} />
                </button>
                <div className="flex items-center gap-1.5">
                  {featuredMods.map((_, index) => (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectIndex(index);
                      }}
                      className={cn(
                        "rounded-full transition-all duration-300",
                        index === currentHeroIndex
                          ? "w-4 h-1.5 bg-primary"
                          : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60",
                      )}
                    />
                  ))}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNext();
                  }}
                  className="text-white/50 hover:text-white transition-colors"
                >
                  <ChevronRight size={14} strokeWidth={3} />
                </button>
              </div>

              {featuredMods.length > 1 && (
                <div className="absolute bottom-0 left-0 right-0 z-40 h-[3px] bg-white/10">
                  <motion.div
                    key={currentHeroIndex}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 10, ease: "linear" }}
                    style={{ transformOrigin: "left" }}
                    className="h-full w-full bg-primary opacity-80"
                  />
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
