import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, ChevronRight, ChevronLeft, Zap, Palette, Check, Loader2, Camera } from "lucide-react";
import { cn } from "../lib/utils";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { getModClassification, getModDisplayCharacter } from "../lib/modClassification";

const ACCENT_COLORS = [
  { label: "Violet", value: "#7c3aed" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Emerald", value: "#10b981" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Orange", value: "#f97316" },
  { label: "Pink", value: "#ec4899" },
  { label: "Lime", value: "#84cc16" },
  { label: "White", value: "#e2e8f0" },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function CreatePresetModal({ onClose, onSaved }) {
  const game = useAppStore((state) => state.activeGame);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(ACCENT_COLORS[0].value);
  const { mods: loadedMods } = useLoadGameMods(game.id, step === 2 || step === 1 /* Always load to allow quick snapshots */);
  const [allMods, setAllMods] = useState([]);
  const [selectedModIds, setSelectedModIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [loadingMods, setLoadingMods] = useState(false);
  const [gbData, setGbData] = useState({});
  const [saving, setSaving] = useState(false);

  // Load all installed mods (wrapper for fetching GB thumbnails)
  const processMods = useCallback(async () => {
    if (!loadedMods || loadedMods.length === 0) return;
    setLoadingMods(true);
    setAllMods(loadedMods);

    try {
      // Fetch GB data for thumbnails
      const gbIds = loadedMods.map(m => m.gamebananaId).filter(Boolean);
      if (gbIds.length > 0) {
        const result = await window.electronMods.fetchGbModsBatch(gbIds);
        if (result.success && result.data) {
          const dataMap = {};
          result.data.forEach(item => {
            const thumb = item._aPreviewMedia?._aImages?.[0];
            dataMap[item._idRow] = {
              thumbnailUrl: thumb ? `${thumb._sBaseUrl}/${thumb._sFile}` : null
            };
          });
          setGbData(prev => ({ ...prev, ...dataMap }));
        }
      }
    } catch (err) {
      console.error("CreatePresetModal: failed to process mods", err);
    } finally {
      setLoadingMods(false);
    }
  }, [loadedMods]);

  useEffect(() => {
    if (step === 2 && loadedMods.length > 0) {
      processMods();
    }
  }, [step, loadedMods, processMods]);

  // Snapshot: auto-select all currently-enabled mods
  const handleSnapshot = async () => {
    if (!loadedMods || loadedMods.length === 0) return;
    setLoadingMods(true);
    setAllMods(loadedMods);
    const enabledIds = new Set(loadedMods.filter(m => m.isEnabled).map(m => m.id));
    setSelectedModIds(enabledIds);

    try {
      // Fetch GB data for thumbnails
      const gbIds = loadedMods.map(m => m.gamebananaId).filter(Boolean);
      if (gbIds.length > 0) {
        const result = await window.electronMods.fetchGbModsBatch(gbIds);
        if (result.success && result.data) {
          const dataMap = {};
          result.data.forEach(item => {
            const thumb = item._aPreviewMedia?._aImages?.[0];
            dataMap[item._idRow] = {
              thumbnailUrl: thumb ? `${thumb._sBaseUrl}/${thumb._sFile}` : null
            };
          });
          setGbData(prev => ({ ...prev, ...dataMap }));
        }
      }
    } catch (error) {
       console.error("Snapshot error:", error);
    } finally {
      setLoadingMods(false);
      setStep(2);
    }
  };

  const toggleMod = (modId) => {
    setSelectedModIds(prev => {
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
        .filter(m => selectedModIds.has(m.id))
        .map(m => ({
          modId: m.id,
          originalFolderName: m.originalFolderName,
          character: getModDisplayCharacter(m),
          category: m.category || null,
          name: m.name,
          gamebananaId: m.gamebananaId || null,
          customThumbnail: m.customThumbnail || null,
        }));

      const preset = {
        id: generateId(),
        name: name.trim(),
        description: description.trim(),
        gameId: game.id,
        color,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mods: selectedMods,
      };

      const result = await window.electronMods.savePreset(preset);
      if (result.success) {
        onSaved?.(preset);
        onClose();
      }
    } catch (err) {
      console.error("Failed to save preset", err);
    } finally {
      setSaving(false);
    }
  };

  const filteredMods = allMods.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.character.toLowerCase().includes(search.toLowerCase())
  );

  // Group by character / category
  const grouped = filteredMods.reduce((acc, mod) => {
    const groupName = getModClassification(mod).label;

    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(mod);
    return acc;
  }, {});

  const selectedMods = allMods.filter(m => selectedModIds.has(m.id));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 backdrop-blur-sm p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-surface border border-border rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.7)] flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-border flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Palette size={14} className="text-primary" />
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-text-muted">
                New Loadout — Step {step} of 3
              </span>
            </div>
            <h2 className="text-xl font-bold text-text-primary tracking-tight">
              {step === 1 ? "Style Your Preset" : step === 2 ? "Pick Mods" : "Review & Save"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Step Pills */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    s === step ? "w-6 bg-primary" : s < step ? "w-3 bg-primary/40" : "w-3 bg-white/10"
                  )}
                />
              ))}
            </div>
            <button onClick={onClose} className="p-2 text-white/30 hover:text-white rounded-xl hover:bg-white/5 transition-all">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 flex flex-col gap-6"
              >
                {/* Snapshot CTA */}
                <button
                  onClick={handleSnapshot}
                  disabled={loadingMods}
                  className="flex items-center gap-3 p-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left group"
                >
                  {loadingMods ? (
                    <Loader2 size={20} className="text-primary animate-spin shrink-0" />
                  ) : (
                    <Camera size={20} className="text-primary shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-bold text-primary uppercase tracking-wide">
                      Snapshot Current Loadout
                    </p>
                    <p className="text-xs text-text-muted mt-0.5 font-medium">
                      Auto-select all currently active mods and skip to review
                    </p>
                  </div>
                  <ChevronRight size={16} className="ml-auto text-primary/50 group-hover:text-primary transition-colors" />
                </button>

                <div className="w-full h-px bg-white/5 flex items-center justify-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-text-muted bg-surface px-3">or build manually</span>
                </div>

                {/* Name */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Preset Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Tournament Mode"
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium text-text-primary focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 placeholder:text-text-muted transition-all"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What is this preset for?"
                    rows={2}
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium text-text-primary focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 placeholder:text-text-muted transition-all resize-none"
                  />
                </div>

                {/* Color */}
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-muted)">Accent Color</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ACCENT_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setColor(c.value)}
                        title={c.label}
                        className={cn(
                          "w-8 h-8 rounded-full transition-all border-2",
                          color === c.value ? "scale-125 border-white shadow-lg" : "border-transparent opacity-70 hover:opacity-100 hover:scale-110"
                        )}
                        style={{ backgroundColor: c.value, boxShadow: color === c.value ? `0 0 12px ${c.value}80` : undefined }}
                      />
                    ))}
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
                className="flex flex-col"
              >
                {/* Search + counter */}
                <div className="px-8 py-4 border-b border-border sticky top-0 bg-surface z-10 flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search mods..."
                      className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:border-primary/50 placeholder:text-text-muted transition-all font-medium"
                    />
                  </div>
                  <span className="text-xs font-black text-primary whitespace-nowrap">
                    {selectedModIds.size} selected
                  </span>
                </div>

                <div className="p-6 flex flex-col gap-4">
                  {loadingMods ? (
                    <div className="flex items-center justify-center py-16 gap-3 text-(--text-muted)">
                      <Loader2 size={20} className="animate-spin" />
                      <span className="text-sm">Loading mods...</span>
                    </div>
                  ) : Object.keys(grouped).length === 0 ? (
                    <p className="text-center text-(--text-muted) py-16 text-sm">No mods found.</p>
                  ) : (
                    Object.entries(grouped).map(([char, mods]) => (
                      <div key={char}>
                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-(--text-muted) mb-2 px-2">{char}</p>
                        <div className="flex flex-col gap-1">
                          {mods.map(mod => {
                            const isSelected = selectedModIds.has(mod.id);
                            return (
                                <button
                                  key={mod.id}
                                  onClick={() => toggleMod(mod.id)}
                                  className={cn(
                                    "flex items-center gap-4 px-4 py-3 rounded-2xl border transition-all text-left group/row",
                                    isSelected
                                      ? "bg-primary/10 border-primary/30"
                                      : "bg-background border-border hover:bg-white/5 hover:border-white/20"
                                  )}
                                >
                                  {/* Thumbnail */}
                                  <div className="w-24 h-14 rounded-xl overflow-hidden bg-background border border-border shrink-0 relative">
                                    {mod.customThumbnail || gbData[mod.gamebananaId]?.thumbnailUrl ? (
                                      <img 
                                        src={mod.customThumbnail ? `file://${mod.customThumbnail}` : gbData[mod.gamebananaId]?.thumbnailUrl} 
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
                                    <p className="text-sm font-bold text-text-primary truncate group-hover/row:text-primary transition-colors">{mod.name}</p>
                                    <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">{mod.character}</p>
                                  </div>
                                  <div className={cn(
                                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                                    isSelected ? "bg-primary border-primary shadow-[0_0_10px_var(--color-primary)]/40" : "border-white/20 group-hover/row:border-white/40"
                                  )}>
                                    {isSelected && <Check size={12} strokeWidth={4} className="text-black" />}
                                  </div>
                                </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 flex flex-col gap-6"
              >
                {/* Preview Card */}
                <div
                  className="relative rounded-3xl overflow-hidden p-6 border"
                  style={{ borderColor: color + "40", background: `linear-gradient(135deg, ${color}15, transparent)` }}
                >
                  <div className="absolute top-0 left-0 w-1 h-full rounded-l-3xl" style={{ backgroundColor: color }} />
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}80` }} />
                    <h3 className="text-2xl font-bold text-text-primary tracking-tight">{name || "Untitled Preset"}</h3>
                  </div>
                  {description && <p className="text-text-muted text-sm mb-4">{description}</p>}
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-black text-white/60 uppercase tracking-wider">
                      {selectedMods.length} mod{selectedMods.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs font-black text-white/60 uppercase tracking-wider">
                      {new Set(selectedMods.map(m => m.character)).size} characters
                    </span>
                    <span className="text-xs font-black text-white/60 uppercase tracking-wider">
                      {game.id}
                    </span>
                  </div>
                </div>

                {/* Mod List summary */}
                {selectedMods.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {selectedMods.map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-xs text-white/60 font-mono px-2">
                        <span className="text-white/20">•</span>
                        <span className="truncate">{m.name}</span>
                        <span className="text-white/30 shrink-0">({m.character})</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4 flex items-center justify-between gap-3 border-t border-border shrink-0">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-primary hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
          >
            <ChevronLeft size={14} />
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !name.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-white/10 hover:bg-white/15 text-white disabled:opacity-30 disabled:cursor-not-allowed border border-white/10"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || selectedMods.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed border border-transparent"
              style={{ backgroundColor: color, color: "#000" }}
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving...</>
              ) : (
                <><Zap size={14} strokeWidth={3} /> Save Preset</>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
