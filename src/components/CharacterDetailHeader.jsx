import { motion } from "framer-motion";
import { Plus, EyeOff } from "lucide-react";
import { cn } from "../lib/utils";

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
      className="flex flex-col justify-end h-full md:h-auto"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-1.5 h-6 bg-primary rounded-full shadow-[0_0_12px_var(--color-primary)]" />
        <span className="text-xs font-black uppercase tracking-[0.3em] text-white/50">
          {game.name}
        </span>
      </div>
      <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-8 drop-shadow-2xl">
        {character.name}
      </h1>

      {/* Button Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Import Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onImport}
          className="flex w-max items-center gap-3 px-8 py-3.5 bg-primary text-black font-black rounded-2xl hover:brightness-110 transition-all shadow-[0_0_20px_var(--color-primary)]/20 uppercase tracking-widest text-xs border border-transparent hover:border-white/50"
        >
          <Plus size={18} strokeWidth={3} />
          Import Mod
        </motion.button>

        {/* Disable All Button — only shown when there are active mods */}
        {mods.some((m) => m.isEnabled) && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onDisableAll}
            disabled={disablingAll}
            className="flex w-max items-center gap-3 px-6 py-3.5 bg-white/5 text-white/70 hover:text-white font-black rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest text-xs border border-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {disablingAll ? (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            ) : (
              <EyeOff size={16} />
            )}
            {disablingAll ? "Disabling…" : "Disable All"}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
