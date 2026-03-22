import { motion } from "framer-motion";

export default function CharacterDetailStats({ enabledCount, disabledCount, totalCount }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="hidden md:flex items-stretch gap-4"
    >
      {/* Stat Box 1: Status */}
      <div className="flex flex-col gap-2 p-4 bg-black/40 backdrop-blur-xl rounded-4xl border border-white/10 shadow-2xl min-w-[180px]">
        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]" />
            <span className="text-xs font-bold text-white tracking-widest uppercase">
              Active
            </span>
          </div>
          <span className="text-sm font-black text-white">
            {enabledCount}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <span className="text-xs font-bold text-text-muted tracking-widest uppercase">
              Stashed
            </span>
          </div>
          <span className="text-sm font-black text-white/60">
            {disabledCount}
          </span>
        </div>
      </div>

      {/* Stat Box 2: Total */}
      <div className="flex flex-col items-center justify-center px-8 bg-black/40 backdrop-blur-xl rounded-4xl border border-white/10 shadow-2xl min-w-[160px]">
        <span className="text-[10px] font-black tracking-[0.2em] text-text-muted uppercase mb-1">
          Total Mods
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black text-white leading-none tracking-tighter">
            {totalCount}
          </span>
          <span className="text-xs font-bold text-white/20 uppercase tracking-[0.2em]">
            Installed
          </span>
        </div>
      </div>
    </motion.div>
  );
}
