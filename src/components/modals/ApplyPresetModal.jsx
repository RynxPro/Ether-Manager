import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  X,
  Check,
  Layers,
  Shield,
  Globe,
} from "lucide-react";
import { cn } from '../../lib/utils';
import { thumbnailUrlFromGbModItem, thumbFromGbMap } from '../../lib/gbThumbMap';
import { useLoadGameMods } from '../../hooks/useLoadGameMods';
import { useFetchCache } from '../../hooks/useFetchCache';
import { useAppStore } from '../../store/useAppStore';
import { StatePanel } from '../ui/StatePanel';
import {
  buildPresetDiff,
} from "../../lib/presetMatching";

export default function ApplyPresetModal({
  preset,
  importerPath,
  onClose,
  onApplied,
}) {
  const game = useAppStore((state) => state.activeGame);
  const { mods: allMods, loadMods } = useLoadGameMods(game.id);
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [gbData, setGbData] = useState({});
  const { fetchModsBatch } = useFetchCache();
  
  const [applyMode, setApplyMode] = useState("scoped");
  const [selectedToEnable, setSelectedToEnable] = useState(new Set());
  const [selectedToDisable, setSelectedToDisable] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    try {
      const availableMods = Array.isArray(allMods) ? allMods : [];
      const nextDiff = buildPresetDiff(preset.mods, availableMods, applyMode);
      setDiff(nextDiff);
      
      setSelectedToEnable(prev => {
        const next = new Set(prev);
        nextDiff.willEnable.forEach(m => next.add(m.id));
        return next;
      });
      setSelectedToDisable(prev => {
        const next = new Set(prev);
        nextDiff.willDisable.forEach(m => next.add(m.id));
        return next;
      });

      // Fetch GB data for thumbnails asynchronously
      const allChanged = [
        ...nextDiff.willEnable,
        ...nextDiff.willDisable,
        ...nextDiff.notFound,
      ];
      const gbIds = allChanged.map((m) => m.gamebananaId).filter(Boolean);
      if (gbIds.length > 0) {
        fetchModsBatch(gbIds, { priority: "low", concurrency: 2 }).then((batch) => {
          if (batch.success && batch.data) {
            const dataMap = {};
            batch.data.forEach((item) => {
              dataMap[item._idRow] = {
                thumbnailUrl: thumbnailUrlFromGbModItem(item),
              };
            });
            setGbData(dataMap);
          }
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [allMods, fetchModsBatch, preset, applyMode]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const enableList = diff.willEnable.filter(m => selectedToEnable.has(m.id)).map((m) => m.originalFolderName);
      const disableList = diff.willDisable.filter(m => selectedToDisable.has(m.id)).map((m) => m.originalFolderName);

      const result = await window.electronMods.executePresetDiff({
        importerPath,
        enableList,
        disableList,
      });

      if (result.success) {
        await loadMods(true); // Force global cache invalidation
        onApplied?.();
        onClose();
      } else {
        setError(result.error || "Failed to apply preset.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-70 flex items-center justify-center bg-black/90 backdrop-blur-sm p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-surface border border-border rounded-3xl overflow-hidden shadow-surface"
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-border flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-text-primary tracking-tight">
              {preset.name}
            </h2>
            <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
              Apply Loadout
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/30 hover:text-white rounded-xl hover:bg-white/5 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-text-muted">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-medium">Calculating changes…</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm mb-6">
              <AlertTriangle size={18} className="shrink-0" />
              {error}
            </div>
          )}

          {diff && !loading && (
            <div className="flex flex-col gap-6">
              {/* Mode Selection */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-black/40 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Apply Mode</span>
                </div>
                <div className="flex bg-background border border-white/5 p-1 rounded-xl">
                  <button 
                    onClick={() => setApplyMode("global")} 
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all", 
                      applyMode === "global" ? "bg-primary text-black shadow-md" : "text-white/40 hover:text-white"
                    )}
                  >
                    <Globe size={14} strokeWidth={2.5} /> Global
                  </button>
                  <button 
                    onClick={() => setApplyMode("scoped")} 
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all", 
                      applyMode === "scoped" ? "bg-primary text-black shadow-md" : "text-white/40 hover:text-white"
                    )}
                  >
                    <Shield size={14} strokeWidth={2.5} /> Scoped
                  </button>
                  <button 
                    onClick={() => setApplyMode("layered")} 
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black tracking-widest uppercase rounded-lg transition-all", 
                      applyMode === "layered" ? "bg-primary text-black shadow-md" : "text-white/40 hover:text-white"
                    )}
                  >
                    <Layers size={14} strokeWidth={2.5} /> Layered
                  </button>
                </div>
                <p className="text-xs font-medium text-text-secondary leading-relaxed px-1 min-h-[32px]">
                  {applyMode === "global" && "Global Strict Mode will disable ALL active mods in your entire library that are not in this preset. A true clean slate."}
                  {applyMode === "scoped" && "Character Scoped Mode will only disable active mods for the characters this preset actively touches. UI and Audio are ignored unless explicitly in the preset."}
                  {applyMode === "layered" && "Layered Mode will only enable the preset's mods and leave all your other active mods entirely untouched."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DiffSummaryCard
                  label="Enable"
                  value={diff.willEnable.length}
                  tone="emerald"
                />
                <DiffSummaryCard
                  label={applyMode === "layered" ? "Disable (Skipped)" : "Disable"}
                  value={diff.willDisable.length}
                  tone={applyMode === "layered" ? "neutral" : "red"}
                />
                <DiffSummaryCard
                  label="Missing"
                  value={diff.notFound.length}
                  tone="yellow"
                />
                <DiffSummaryCard
                  label="Changes"
                  value={diff.willEnable.length + diff.willDisable.length}
                  tone="neutral"
                />
              </div>

              {/* Will Enable */}
              {diff.willEnable.length > 0 && (
                <Section
                  icon={<CheckCircle size={16} className="text-emerald-400" />}
                  label={`Will Enable (${diff.willEnable.filter(m => selectedToEnable.has(m.id)).length} / ${diff.willEnable.length})`}
                  color="emerald"
                  items={diff.willEnable}
                  gbData={gbData}
                  selectedIds={selectedToEnable}
                  onToggle={(id) => setSelectedToEnable(prev => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  })}
                />
              )}

              {/* Will Disable */}
              {diff.willDisable.length > 0 && applyMode !== "layered" && (
                <Section
                  icon={<XCircle size={16} className="text-red-400" />}
                  label={`Will Disable (${diff.willDisable.filter(m => selectedToDisable.has(m.id)).length} / ${diff.willDisable.length})`}
                  color="red"
                  items={diff.willDisable}
                  gbData={gbData}
                  selectedIds={selectedToDisable}
                  onToggle={(id) => setSelectedToDisable(prev => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  })}
                />
              )}

              {/* Not Found */}
              {diff.notFound.length > 0 && (
                <Section
                  icon={<AlertTriangle size={16} className="text-yellow-400" />}
                  label={`Not Found on Disk (${diff.notFound.length})`}
                  color="yellow"
                  items={diff.notFound}
                  gbData={gbData}
                />
              )}

              {/* No changes */}
              {diff.willEnable.length === 0 &&
                diff.willDisable.length === 0 &&
                diff.notFound.length === 0 && (
                  <StatePanel
                    icon={CheckCircle}
                    title="No changes needed"
                    message="This loadout already matches your library."
                    tone="success"
                    className="min-h-48"
                  />
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4 flex items-center justify-end gap-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={loading || applying || !!error}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border shadow-lg",
              "bg-primary text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {applying ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Applying...
              </>
            ) : (
              <>
                <Zap size={14} strokeWidth={3} /> Apply Loadout
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DiffSummaryCard({ label, value, tone }) {
  const toneClass = {
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
    red: "border-red-500/20 bg-red-500/10 text-red-400",
    yellow: "border-yellow-500/20 bg-yellow-500/10 text-yellow-400",
    neutral: "border-border bg-background text-text-muted",
  };

  return (
    <div className={cn("rounded-2xl border p-4 shadow-card", toneClass[tone])}>
      <div className="text-[10px] font-black uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-text-primary">
        {value}
      </div>
    </div>
  );
}

function Section({ icon, label, color, items, gbData, selectedIds, onToggle }) {
  const colorMap = {
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    red: "bg-red-500/10 border-red-500/20 text-red-400",
    yellow: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
  };
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl border w-max text-[10px] font-black uppercase tracking-widest",
          colorMap[color],
        )}
      >
        {icon}
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => {
          const thumb =
            item.customThumbnail || thumbFromGbMap(gbData, item.gamebananaId);
          const isSelected = selectedIds ? selectedIds.has(item.id) : false;
          const isMissing = color === "yellow";
          return (
            <div
              key={i}
              onClick={() => onToggle && onToggle(item.id)}
              className={cn(
                "flex items-center gap-3 p-2 rounded-xl border transition-all",
                !isMissing && "cursor-pointer group/item",
                !isMissing && isSelected 
                  ? "bg-primary/10 border-primary/30 hover:border-primary/50" 
                  : "bg-background border-border hover:bg-white/5 hover:border-white/10",
                !isSelected && !isMissing && "opacity-60 hover:opacity-100"
              )}
            >
              {!isMissing && (
                <div className={cn(
                  "w-5 h-5 ml-2 rounded flex items-center justify-center shrink-0 transition-colors border",
                  isSelected ? "bg-primary border-primary" : "border-white/20 group-hover/item:border-white/40"
                )}>
                  {isSelected && <Check size={12} strokeWidth={4} className="text-black" />}
                </div>
              )}
              <div className="w-12 h-8 rounded-lg overflow-hidden bg-surface border border-border shrink-0 relative ml-1">
                {thumb ? (
                  <img
                    src={
                      item.customThumbnail
                        ? `file://${item.customThumbnail}`
                        : thumb
                    }
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[7px] text-white/10 font-black">
                    NO IMG
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-text-primary truncate">
                  {item.name || item.baseName || item.originalFolderName}
                </p>
                <p className="text-[9px] text-text-muted uppercase tracking-wider font-medium">
                  {item.character || "Misc"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
