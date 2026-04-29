import { motion } from "framer-motion";
import { Heart, Coffee, Sparkles, Calendar } from "lucide-react";

function formatAmount(amount) {
  if (!amount) return null;
  const num = parseFloat(amount);
  if (isNaN(num)) return null;
  return `$${num.toFixed(2)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function SupporterCard({ supporter, index }) {
  const formattedDate = formatDate(supporter.date);
  const formattedAmount = formatAmount(supporter.amount);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 hover:border-primary/20 hover:bg-primary/[0.04] transition-all duration-300"
    >
      {/* Subtle hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

      <div className="relative z-10 space-y-3">
        {/* Top row: name + amount */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-black text-[14px] text-text-primary leading-tight truncate">
              {supporter.name}
            </h4>
            {formattedDate && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-text-muted">
                <Calendar size={9} />
                {formattedDate}
              </div>
            )}
          </div>

          {formattedAmount && (
            <span className="shrink-0 text-[12px] font-black text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1 leading-none">
              {formattedAmount}
            </span>
          )}
        </div>

        {/* Message */}
        {supporter.message && (
          <p className="text-[12px] text-text-secondary leading-relaxed italic border-l-2 border-white/10 pl-3">
            "{supporter.message}"
          </p>
        )}

        {/* Heart footer */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.05]">
          <Heart size={10} className="text-pink-400 fill-pink-400/50" />
          <span className="text-[10px] text-text-muted font-semibold uppercase tracking-widest">
            Supporter
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function SupportersWall({ supporters, loading, error }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-xl font-black tracking-tight text-white mb-1">Supporters</h3>
          <p className="text-sm text-text-muted">Loading your amazing supporters...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl border border-white/[0.05] bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <Heart className="mx-auto h-8 w-8 text-red-400/50 mb-3" />
        <p className="text-sm font-semibold text-red-400">Could not load supporters</p>
        <p className="text-[11px] text-red-400/60 mt-1 font-mono">{error}</p>
      </div>
    );
  }

  if (!supporters || supporters.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] py-12 text-center">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className="inline-block mb-4"
        >
          <Coffee className="h-10 w-10 text-primary/40" />
        </motion.div>
        <p className="font-bold text-text-secondary">No supporters yet</p>
        <p className="text-sm text-text-muted mt-1">Be the first to support Aether! ☕</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles size={16} className="text-primary" />
          <h3 className="text-xl font-black tracking-tight text-white">Supporters Wall</h3>
          <Sparkles size={16} className="text-primary" />
        </div>
        <p className="text-sm text-text-secondary">
          These amazing people help keep Aether Manager alive 💖
        </p>
        <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-bold text-primary">
          <Heart size={10} className="fill-primary" />
          {supporters.length} {supporters.length === 1 ? "supporter" : "supporters"}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {supporters.map((supporter, index) => (
          <SupporterCard key={supporter.id} supporter={supporter} index={index} />
        ))}
      </div>
    </div>
  );
}
