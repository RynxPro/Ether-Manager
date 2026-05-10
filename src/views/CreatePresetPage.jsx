import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  Search,
  X,
  Zap,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useFetchCache } from "../hooks/useFetchCache";
import { cn } from "../lib/utils";
import { getModClassification, getModDisplayCharacter } from "../lib/modClassification";
import { thumbnailUrlFromGbModItem, thumbFromGbMap } from "../lib/gbThumbMap";
import {
  createPresetModFromLibraryMod,
  createPresetSnapshotFromLibrary,
} from "../lib/presetMatching";

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

export default function CreatePresetPage({ onSaved }) {
  const game = useAppStore((state) => state.activeGame);
  const popPage = useAppStore((state) => state.popPage);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allMods, setAllMods] = useState([]);
  const [selectedModIds, setSelectedModIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [gbData, setGbData] = useState({});
  const [loadingMods, setLoadingMods] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snapshotError, setSnapshotError] = useState(null);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const [hasManualSelectionChanges, setHasManualSelectionChanges] = useState(false);

  const { mods: loadedMods, loadMods } = useLoadGameMods(
    game.id,
    step === 1 || step === 2,
  );
  const { fetchModsBatch } = useFetchCache();

  const hydrateGbData = useCallback(async (mods) => {
    const gbIds = mods.map((mod) => mod.gamebananaId).filter(Boolean);
    if (gbIds.length === 0) return;

    const result = await fetchModsBatch(gbIds, {
      priority: "low",
      concurrency: 2,
    });

    if (result.success && result.data) {
      const dataMap = {};
      result.data.forEach((item) => {
        dataMap[item._idRow] = {
          thumbnailUrl: thumbnailUrlFromGbModItem(item),
        };
      });
      setGbData((prev) => ({ ...prev, ...dataMap }));
    }
  }, [fetchModsBatch]);

  const processMods = useCallback(async () => {
    if (!loadedMods || loadedMods.length === 0) return;
    setLoadingMods(true);
    setAllMods(loadedMods);

    try {
      await hydrateGbData(loadedMods);
    } catch (err) {
      console.error("CreatePresetPage: failed to process mods", err);
    } finally {
      setLoadingMods(false);
    }
  }, [loadedMods, hydrateGbData]);

  useEffect(() => {
    if (step === 2 && loadedMods.length > 0) {
      processMods();
    }
  }, [step, loadedMods, processMods]);

  const applyEnabledSnapshotSelection = useCallback((mods) => {
    const snapshotEntries = createPresetSnapshotFromLibrary(
      mods,
      getModDisplayCharacter,
      { enabledOnly: true },
    );
    const enabledIds = snapshotEntries.map((entry) => entry.modId);
    setSelectedModIds(new Set(enabledIds));
    setSnapshotError(null);
    setHasAutoSelected(true);
    return enabledIds.length;
  }, []);

  useEffect(() => {
    if ((!loadedMods || loadedMods.length === 0) || (hasAutoSelected && hasManualSelectionChanges)) {
      return;
    }

    applyEnabledSnapshotSelection(loadedMods);
  }, [loadedMods, hasAutoSelected, hasManualSelectionChanges, applyEnabledSnapshotSelection]);

  const handleRefreshSnapshot = async () => {
    try {
      const currentMods = loadedMods?.length > 0 ? loadedMods : await loadMods(true);
      const availableMods = Array.isArray(currentMods) ? currentMods : [];
      const snapshotCount = applyEnabledSnapshotSelection(availableMods);
      setHasManualSelectionChanges(false);

      if (snapshotCount === 0) {
        setSnapshotError("No enabled mods found to snapshot.");
      }
    } catch (err) {
      setSnapshotError(err?.message || "Failed to refresh snapshot.");
    }
  };

  const toggleMod = (modId) => {
    setHasManualSelectionChanges(true);
    setSelectedModIds((prev) => {
      const next = new Set(prev);
      next.has(modId) ? next.delete(modId) : next.add(modId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const selectedMods = allMods
        .filter((mod) => selectedModIds.has(mod.id))
        .map((mod) => createPresetModFromLibraryMod(mod, getModDisplayCharacter));

      const preset = {
        id: generateId(),
        name: name.trim(),
        description: description.trim(),
        gameId: game.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mods: selectedMods,
      };

      const result = await window.electronMods.savePreset(preset);
      if (result.success) {
        onSaved?.(preset);
        popPage();
      }
    } catch (err) {
      console.error("Failed to save preset", err);
    } finally {
      setSaving(false);
    }
  };

  const filteredMods = allMods.filter(
    (mod) =>
      mod.name.toLowerCase().includes(search.toLowerCase()) ||
      mod.character.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = filteredMods.reduce((acc, mod) => {
    const groupName = getModClassification(mod).label;
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(mod);
    return acc;
  }, {});

  const selectedMods = allMods.filter((mod) => selectedModIds.has(mod.id));

  return (
    <motion.div className="w-full h-full bg-background flex flex-col relative overflow-hidden">


      <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col items-center">
        <div className="relative w-full shrink-0 border-b border-border bg-[#050505] overflow-hidden p-8 pt-12 pb-12 flex justify-center">
          <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent opacity-50" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary blur-[120px] opacity-10 pointer-events-none rounded-full" />

          <div className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-end gap-8 relative z-10">
            <div className="flex flex-col gap-2 w-full max-w-2xl">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted">
                Step {step} of 2
              </div>
              <h2 className="text-5xl font-black text-white tracking-tighter leading-none">
                {step === 1 ? "New Loadout" : "Pick Mods"}
              </h2>
              <p className="text-base text-text-secondary font-medium leading-relaxed max-w-2xl mt-2">
                {step === 1
                  ? "Start from your current enabled mods, name the loadout, and save it as a reusable state."
                  : "Review the smart snapshot and adjust the exact mods that belong in this loadout."}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {[1, 2].map((s) => (
                <div
                  key={s}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    s === step ? "w-8 bg-primary" : s < step ? "w-4 bg-primary/40" : "w-4 bg-white/10",
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="w-full max-w-5xl px-8 py-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-8"
              >
                <div className="rounded-3xl border border-primary/20 bg-primary/5 p-6 flex gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                    <Camera size={22} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-primary tracking-tight">Smart Snapshot Active</h3>
                    <p className="text-sm text-text-muted mt-2 leading-relaxed">
                      The current snapshot includes <strong>{loadedMods?.filter((m) => m.isEnabled).length || 0} enabled mods</strong>. You can refresh it now or fine-tune the selection on the next step.
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleRefreshSnapshot}
                        className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-primary transition-all hover:bg-primary hover:text-black"
                      >
                        Refresh Snapshot
                      </button>
                      {hasManualSelectionChanges && (
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                          Selection edited manually
                        </span>
                      )}
                    </div>
                    {snapshotError && (
                      <p className="mt-3 text-sm font-medium text-red-400">{snapshotError}</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-3xl border border-white/10 bg-surface/60 p-6">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Loadout Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Tournament Mode"
                      className="mt-3 w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-base font-medium text-text-primary focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 placeholder:text-text-muted transition-all"
                    />

                    <label className="mt-6 block text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional note"
                      rows={4}
                      className="mt-3 w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm font-medium text-text-primary focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 placeholder:text-text-muted transition-all resize-none"
                    />
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/30 p-6 flex flex-col gap-4">
                    <PresetSummary label="Selected Mods" value={selectedModIds.size} />
                    <PresetSummary label="Library Mods" value={loadedMods.length} />
                    <PresetSummary label="Step" value="Naming" />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6"
              >
                <div className="rounded-3xl border border-white/10 bg-surface/60 p-5 flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between sticky top-0 z-10 backdrop-blur-xl">
                  <div className="relative flex-1 max-w-xl">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search mods..."
                      className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-text-primary focus:outline-none focus:border-primary/50 placeholder:text-text-muted transition-all font-medium"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <PresetSummary label="Selected" value={selectedModIds.size} compact />
                    <PresetSummary label="Ready" value={selectedMods.length > 0 ? "Yes" : "No"} compact />
                  </div>
                </div>

                {loadingMods ? (
                  <div className="flex items-center justify-center py-24 gap-3 text-text-muted">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm">Loading mods...</span>
                  </div>
                ) : Object.keys(grouped).length === 0 ? (
                  <div className="py-24 text-center text-sm text-text-muted">No mods found.</div>
                ) : (
                  Object.entries(grouped).map(([groupName, mods]) => (
                    <section key={groupName} className="flex flex-col gap-4">
                      <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/80 shadow-[0_0_8px_var(--color-primary)]" />
                        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-text-muted">
                          {groupName}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        {mods.map((mod) => {
                          const isSelected = selectedModIds.has(mod.id);
                          return (
                            <button
                              key={mod.id}
                              onClick={() => toggleMod(mod.id)}
                              className={cn(
                                "flex items-center gap-4 px-4 py-3 rounded-2xl border transition-all text-left group/row",
                                isSelected
                                  ? "bg-primary/10 border-primary/30"
                                  : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
                              )}
                            >
                              <div className="w-24 h-14 rounded-xl overflow-hidden bg-background border border-white/5 shrink-0 relative">
                                {mod.customThumbnail || thumbFromGbMap(gbData, mod.gamebananaId) ? (
                                  <img
                                    src={
                                      mod.customThumbnail
                                        ? `file://${mod.customThumbnail}`
                                        : thumbFromGbMap(gbData, mod.gamebananaId)
                                    }
                                    alt=""
                                    className="w-full h-full object-cover group-hover/row:scale-110 transition-transform duration-500"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center italic text-[10px] text-white/10 font-black">
                                    NO IMAGE
                                  </div>
                                )}
                                {!mod.isEnabled && (
                                  <div className="absolute inset-0 bg-black/40 backdrop-grayscale-[0.5] flex items-center justify-center">
                                    <span className="text-[8px] font-black uppercase tracking-tighter text-white/40">OFF</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-text-primary truncate group-hover/row:text-primary transition-colors">
                                  {mod.name}
                                </p>
                                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">
                                  {mod.character}
                                </p>
                              </div>
                              <div
                                className={cn(
                                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                                  isSelected
                                    ? "bg-primary border-primary shadow-[0_0_10px_var(--color-primary)]/40"
                                    : "border-white/20 group-hover/row:border-white/40",
                                )}
                              >
                                {isSelected && <Check size={12} strokeWidth={4} className="text-black" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-full border-t border-white/10 bg-background/50 backdrop-blur-xl mt-auto">
          <div className="max-w-5xl mx-auto px-8 py-6 flex items-center justify-between gap-3">
            <button
              onClick={() => (step > 1 ? setStep((s) => s - 1) : popPage())}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-primary hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
            >
              <ChevronLeft size={14} />
              {step === 1 ? "Cancel" : "Back"}
            </button>

            {step < 2 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!name.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-white/10 hover:bg-white/15 text-white disabled:opacity-30 disabled:cursor-not-allowed border border-white/10"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving || selectedMods.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-transparent bg-primary text-black"
              >
                {saving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Zap size={14} strokeWidth={3} /> Save Loadout
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PresetSummary({ label, value, compact = false }) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/30", compact ? "px-4 py-3" : "px-4 py-4")}>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className={cn("mt-2 font-black tracking-tight text-text-primary", compact ? "text-lg" : "text-2xl")}>
        {value}
      </div>
    </div>
  );
}
