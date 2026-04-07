import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { StatePanel } from "./ui/StatePanel";

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

  useEffect(() => {
    setLoading(true);
    setError(null);
    try {
      const availableMods = Array.isArray(allMods) ? allMods : [];

      // 1. Identify Scope (Affected Characters)
      const affectedCharacters = new Set(preset.mods.map((m) => m.character));

      // 2. Diff Targeting
      const willEnable = [];
      const willDisable = [];
      const notFound = [];

      // Check which preset mods exist in allMods and need enabling
      for (const pm of preset.mods) {
        // Find by base id (folder name excluding DISABLED_ prefix)
        const exists = availableMods.find(
          (m) =>
            m.id === pm.modId ||
            m.id === pm.originalFolderName.replace(/^DISABLED_/, ""),
        );
        if (!exists) {
          notFound.push(pm);
        } else if (!exists.isEnabled) {
          willEnable.push(exists);
        }
      }

      // Check which currently enabled mods should be disabled
      for (const m of availableMods) {
        if (m.isEnabled && affectedCharacters.has(m.character)) {
          // Is it part of the preset?
          const isPart = preset.mods.find(
            (pm) =>
              pm.modId === m.id ||
              pm.originalFolderName.replace(/^DISABLED_/, "") === m.id,
          );
          if (!isPart) {
            willDisable.push(m);
          }
        }
      }

      setDiff({ willEnable, willDisable, notFound });

      // Fetch GB data for thumbnails asynchronously
      const allChanged = [...willEnable, ...willDisable, ...notFound];
      const gbIds = allChanged.map((m) => m.gamebananaId).filter(Boolean);
      if (gbIds.length > 0) {
        window.electronMods.fetchGbModsBatch(gbIds).then((batch) => {
          if (batch.success && batch.data) {
            const dataMap = {};
            batch.data.forEach((item) => {
              const thumb = item._aPreviewMedia?._aImages?.[0];
              dataMap[item._idRow] = {
                thumbnailUrl: thumb
                  ? `${thumb._sBaseUrl}/${thumb._sFile}`
                  : null,
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
  }, [allMods, preset]);

  const handleApply = async () => {
    setApplying(true);
    try {
      // Form precise instructions for the backend
      const enableList = diff.willEnable.map((m) => m.originalFolderName);
      const disableList = diff.willDisable.map((m) => m.originalFolderName);

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
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">
                Apply Loadout
              </span>
            </div>
            <h2 className="text-2xl font-bold text-text-primary tracking-tight">
              {preset.name}
            </h2>
            <p className="text-text-muted text-xs mt-1">
              Review all changes before applying to disk.
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
              <span className="text-sm font-medium">
                Calculating changes...
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              <AlertTriangle size={18} className="shrink-0" />
              {error}
            </div>
          )}

          {diff && !loading && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DiffSummaryCard
                  label="Enable"
                  value={diff.willEnable.length}
                  tone="emerald"
                />
                <DiffSummaryCard
                  label="Disable"
                  value={diff.willDisable.length}
                  tone="red"
                />
                <DiffSummaryCard
                  label="Missing"
                  value={diff.notFound.length}
                  tone="yellow"
                />
                <DiffSummaryCard
                  label="Total Changes"
                  value={diff.willEnable.length + diff.willDisable.length}
                  tone="neutral"
                />
              </div>

              {/* Will Enable */}
              {diff.willEnable.length > 0 && (
                <Section
                  icon={<CheckCircle size={16} className="text-emerald-400" />}
                  label={`Will Enable (${diff.willEnable.length})`}
                  color="emerald"
                  items={diff.willEnable}
                  gbData={gbData}
                />
              )}

              {/* Will Disable */}
              {diff.willDisable.length > 0 && (
                <Section
                  icon={<XCircle size={16} className="text-red-400" />}
                  label={`Will Disable (${diff.willDisable.length})`}
                  color="red"
                  items={diff.willDisable}
                  gbData={gbData}
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
                    message="All mods in this preset are already in their correct state."
                    tone="success"
                    className="min-h-[12rem]"
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

function Section({ icon, label, color, items, gbData }) {
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
            item.customThumbnail || gbData[item.gamebananaId]?.thumbnailUrl;
          return (
            <div
              key={i}
              className="flex items-center gap-3 p-2 rounded-xl bg-background border border-border"
            >
              <div className="w-12 h-8 rounded-lg overflow-hidden bg-surface border border-border shrink-0 relative">
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
