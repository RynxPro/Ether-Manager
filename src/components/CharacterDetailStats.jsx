import { motion } from "framer-motion";

export default function CharacterDetailStats({ enabledCount, disabledCount, totalCount }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="grid grid-cols-3 gap-3 md:min-w-[420px]"
    >
      <div className="rounded-[var(--radius-md)] border border-primary/20 bg-primary/10 p-4 shadow-card">
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
          Active
        </div>
        <div className="mt-3 text-3xl font-black tracking-tight text-text-primary">
          {enabledCount}
        </div>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-secondary">
          Enabled mods
        </p>
      </div>

      <div className="rounded-[var(--radius-md)] border border-border bg-background/90 p-4 shadow-card">
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
          Stashed
        </div>
        <div className="mt-3 text-3xl font-black tracking-tight text-text-primary">
          {disabledCount}
        </div>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-secondary">
          Disabled mods
        </p>
      </div>

      <div className="rounded-[var(--radius-md)] border border-border bg-background/90 p-4 shadow-card">
        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
          Total
        </div>
        <div className="mt-3 text-3xl font-black tracking-tight text-text-primary">
          {totalCount}
        </div>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-secondary">
          Installed folders
        </p>
      </div>
    </motion.div>
  );
}
