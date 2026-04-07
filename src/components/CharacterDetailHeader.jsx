import { motion } from "framer-motion";
import { Plus, EyeOff } from "lucide-react";
import { Button } from "./ui/Button";

export default function CharacterDetailHeader({
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
      <h1 className="text-5xl font-black tracking-tighter text-white md:text-6xl">
        {character.name}
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/65">
          {mods.length} Total
        </div>
        <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
          {enabledCount} Enabled
        </div>
        {disabledCount > 0 && (
          <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white/65">
            {disabledCount} Disabled
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button
          onClick={onImport}
          icon={Plus}
          className="rounded-xl px-6 text-[11px] font-black uppercase tracking-widest text-black hover:brightness-110"
        >
          Import Mod
        </Button>

        {enabledCount > 0 && (
          <Button
            onClick={onDisableAll}
            disabled={disablingAll}
            icon={EyeOff}
            className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 text-[11px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/20"
          >
            {disablingAll ? "Disabling…" : "Disable All"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
