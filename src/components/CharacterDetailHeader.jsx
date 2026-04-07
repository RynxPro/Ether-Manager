import { motion } from "framer-motion";
import { FolderKanban, Plus, EyeOff } from "lucide-react";
import { Button } from "./ui/Button";

export default function CharacterDetailHeader({
  game,
  character,
  mods,
  disablingAll,
  enabledCount,
  disabledCount,
  onImport,
  onDisableAll
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      className="flex h-full flex-col justify-end md:h-auto"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-primary" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">
          {game.name.toUpperCase()} Local Library
        </span>
      </div>
      
      <h1 className="text-5xl font-black tracking-tighter text-white md:text-7xl">
        {character.name}
      </h1>
      
      <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-white/50">
        Review what is enabled, import new folders, and keep this collection consistent without leaving the library.
      </p>

      {/* Inline Stats */}
      <div className="mt-8 flex flex-wrap items-center gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Total</span>
          <span className="text-xl font-black text-white">{mods.length}</span>
        </div>
        <div className="w-px h-8 bg-white/10" />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Active</span>
          <span className="text-xl font-black text-primary">{enabledCount}</span>
        </div>
        <div className="w-px h-8 bg-white/10" />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Stashed</span>
          <span className="text-xl font-black text-white/60">{disabledCount}</span>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button
          onClick={onImport}
          icon={Plus}
          className="bg-primary hover:brightness-110 text-black font-black uppercase tracking-widest text-[11px] rounded-xl px-6"
        >
          Import Mod
        </Button>

        <Button 
          onClick={() => {}} // Usually a folder open or manage action, here kept for layout compatibility
          icon={FolderKanban}
          className="bg-white/5 border border-white/10 text-white hover:bg-white/10 rounded-xl uppercase tracking-widest text-[11px] font-black px-5"
        >
          Managing {character.name}
        </Button>

        {enabledCount > 0 && (
          <Button
            onClick={onDisableAll}
            disabled={disablingAll}
            icon={EyeOff}
            className="bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 rounded-xl uppercase tracking-widest text-[11px] font-black px-5"
          >
            {disablingAll ? "Disabling…" : "Disable All"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
