import { motion } from "framer-motion";
import { FolderKanban, Plus, EyeOff } from "lucide-react";
import { Button } from "./ui/Button";

export default function CharacterDetailHeader({
  game,
  character,
  mods,
  disablingAll,
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
      <div className="mb-3 flex items-center gap-3">
        <div className="h-6 w-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--color-primary)]" />
        <span className="text-xs font-black uppercase tracking-[0.3em] text-text-muted">
          {game.name} Local Manager
        </span>
      </div>
      <h1 className="text-4xl font-black tracking-tighter text-text-primary md:text-6xl">
        {character.name}
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-text-secondary md:text-base">
        Review what is enabled, import new folders, and keep this collection consistent without leaving the library.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
          {mods.length} installed
        </div>
        {mods.some((mod) => mod.isEnabled) && (
          <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
            {mods.filter((mod) => mod.isEnabled).length} active now
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          onClick={onImport}
          icon={Plus}
        >
          Import Mod
        </Button>

        <Button variant="secondary" icon={FolderKanban}>
          Managing {character.name}
        </Button>

        {mods.some((m) => m.isEnabled) && (
          <Button
            variant="secondary"
            onClick={onDisableAll}
            disabled={disablingAll}
            icon={EyeOff}
          >
            {disablingAll ? "Disabling…" : "Disable All"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
