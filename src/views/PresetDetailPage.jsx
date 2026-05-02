import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Plus, Search, Package, X, Check, Zap, Edit3, Trash2, Loader2, Share2, Copy, ArrowLeft } from "lucide-react";
import { useLoadGameMods } from '../hooks/useLoadGameMods';
import { cn } from '../lib/utils';
import ApplyPresetModal from '../components/modals/ApplyPresetModal';
import { useAppStore } from '../store/useAppStore';
import { getModDisplayCharacter } from '../lib/modClassification';
import {
  createPresetModFromLibraryMod,
  getMissingPresetMods,
  reconcilePresetModsWithLibrary,
} from "../lib/presetMatching";
import {
  thumbFromGbMap,
  isGbThumbResolved,
  thumbnailUrlFromGbModItem,
} from "../lib/gbThumbMap";
import { useFetchCache } from '../hooks/useFetchCache';

export default function PresetDetailPage({
  preset: initialPreset,
  initialGbData = {},
  importerPath,
  onUpdated,
  onSaved,
  onDeleted,
}) {
  const game = useAppStore((state) => state.activeGame);
  const popPage = useAppStore(state => state.popPage);
  const clearPages = useAppStore(state => state.clearPages);
  const notifyPresetChanged = onUpdated || onSaved;
  
  const [preset, setPreset] = useState(initialPreset);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState("mods");
  const [showApply, setShowApply] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [gbData, setGbData] = useState(() => ({ ...initialGbData }));
  const { fetchModsBatch } = useFetchCache();

  // Edit mode state
  const [editName, setEditName] = useState(preset.name);
  const [editDescription, setEditDescription] = useState(preset.description || "");
  const [editMods, setEditMods] = useState([...preset.mods]);

  // Add mods panel state
  const [showAddPanel, setShowAddPanel] = useState(false);
  // Always load the library in the background to detect missing ghost mods instantly
  const { mods: loadedMods, loading: loadingLibrary } = useLoadGameMods(game.id, true);
  const [allLibraryMods, setAllLibraryMods] = useState([]);
  const [addSearch, setAddSearch] = useState("");
  const isEditModeRef = useRef(isEditMode);
  isEditModeRef.current = isEditMode;

  useEffect(() => {
    const libraryMods = Array.isArray(loadedMods) ? loadedMods : [];
    setAllLibraryMods(libraryMods);

    if (libraryMods.length === 0) {
      return;
    }

    // Reconcile preset entries with the live library so matching rules stay
    // centralized instead of each modal healing fields differently.
    setPreset((currentPreset) => {
      const reconciled = reconcilePresetModsWithLibrary(
        currentPreset.mods,
        libraryMods,
        getModDisplayCharacter,
      );

      if (!reconciled.changed) {
        return currentPreset;
      }
      return {
        ...currentPreset,
        mods: reconciled.mods,
      };
    });

    setEditMods((prevEdit) => {
      if (!isEditModeRef.current) {
        return prevEdit;
      }
      const libraryModsInner = Array.isArray(loadedMods) ? loadedMods : [];
      const reconciled = reconcilePresetModsWithLibrary(
        prevEdit,
        libraryModsInner,
        getModDisplayCharacter,
      );
      return reconciled.changed ? reconciled.mods : prevEdit;
    });
  }, [loadedMods]);

  const gbIdsNeeded = useMemo(() => {
    const presetIds = preset.mods.map((m) => m.gamebananaId).filter(Boolean);
    const libIds = (Array.isArray(loadedMods) ? loadedMods : [])
      .map((m) => m.gamebananaId)
      .filter(Boolean);
    return [...new Set([...presetIds, ...libIds])].map(Number).filter((n) => n > 0);
  }, [preset.mods, loadedMods]);

  /** IDs we still need to fetch thumbs for (depends on gbData so we recompute after merges) */
  const gbThumbFetchKey = useMemo(() => {
    const missing = gbIdsNeeded.filter((id) => !isGbThumbResolved(gbData, id));
    return missing.sort((a, b) => a - b).join(",");
  }, [gbIdsNeeded, gbData]);

  useEffect(() => {
    if (!gbThumbFetchKey) return;

    const missing = gbThumbFetchKey
      .split(",")
      .map((s) => Number(s))
      .filter((n) => n > 0);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const result = await fetchModsBatch(missing, {
        priority: "low",
        concurrency: 2,
      });
      if (cancelled || !result.success || !result.data) return;
      const dataMap = {};
      result.data.forEach((item) => {
        dataMap[item._idRow] = {
          thumbnailUrl: thumbnailUrlFromGbModItem(item),
        };
      });
      setGbData((prev) => {
        const next = { ...prev, ...dataMap };
        // Prevent refetch loops when GB omits a mod or returns null thumb — mark id as loaded.
        for (const id of missing) {
          if (next[id] == null && next[String(id)] == null) {
            next[id] = { thumbnailUrl: null };
          }
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchModsBatch, gbThumbFetchKey]);

  const handleToggleEdit = async () => {
    if (isEditMode) {
      // Save changes
      setSaving(true);
      try {
        const updated = {
          ...preset,
          name: editName.trim() || preset.name,
          description: editDescription.trim(),
          mods: editMods,
          updatedAt: new Date().toISOString(),
        };
        await window.electronMods.savePreset(updated);
        setPreset(updated);
        notifyPresetChanged?.(updated);
        setIsEditMode(false);
        setShowAddPanel(false);
      } finally {
        setSaving(false);
      }
    } else {
      // Enter edit mode
      setEditName(preset.name);
      setEditDescription(preset.description || "");
      setEditMods([...preset.mods]);
      setIsEditMode(true);
    }
  };

  const handleRemoveMod = (modId) => {
    setEditMods(prev => prev.filter(m => m.modId !== modId));
  };

  const handleAddMod = (mod) => {
    const already = editMods.find(m => m.modId === mod.id);
    if (already) return;
    setEditMods((prev) => [
      ...prev,
      createPresetModFromLibraryMod(mod, getModDisplayCharacter),
    ]);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await window.electronMods.deletePreset(game.id, preset.id);
      onDeleted?.(preset.id);
      popPage();
    } finally {
      setDeleting(false);
    }
  };


  const handleDuplicate = async () => {
    const duped = {
      ...preset,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      name: `${preset.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await window.electronMods.savePreset(duped);
    notifyPresetChanged?.(duped);
    popPage();
  };

  // Library mods not yet in preset
  const availableLibraryMods = allLibraryMods.filter(
    m => !editMods.find(em => em.modId === m.id)
  ).filter(
    m => !addSearch || m.name.toLowerCase().includes(addSearch.toLowerCase()) || m.character.toLowerCase().includes(addSearch.toLowerCase())
  );

  const displayMods = isEditMode ? editMods : preset.mods;
  const characters = [...new Set(displayMods.map(m => m.character))];
  const missingMods = getMissingPresetMods(displayMods, allLibraryMods);
  const missingCount = missingMods.length;

  return (
    <>
      <motion.div className="w-full h-full bg-background flex flex-col relative overflow-hidden">
        {/* Navigation Buttons */}
        <div className="absolute top-6 left-6 z-50 flex items-center gap-2">
          <button
            onClick={popPage}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 border border-white/10 hover:bg-black/80 text-white backdrop-blur-md transition-all shadow-lg group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold tracking-wider uppercase text-[11px]">Back</span>
          </button>
          <button
            onClick={clearPages}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-black/50 border border-white/10 hover:bg-black/80 hover:text-white/50 text-white backdrop-blur-md transition-all shadow-lg"
            title="Return to Browse"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col items-center">
          {/* Header Area */}
          <div className="relative w-full shrink-0 border-b border-border bg-[#050505] overflow-hidden p-8 pt-24 pb-12 flex justify-center">
            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent opacity-50" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary blur-[120px] opacity-10 pointer-events-none rounded-full" />

            <div className="w-full max-w-5xl flex flex-col md:flex-row justify-between items-end gap-8 relative z-10">
              <div className="flex flex-col gap-2 w-full max-w-2xl">
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="text-5xl font-black text-white tracking-tighter bg-transparent border-b-2 border-primary/30 focus:border-primary focus:outline-none pb-2 min-w-0"
                      placeholder="Preset Name"
                    />
                  ) : (
                    <h2 className="text-5xl font-black text-white tracking-tighter leading-none">{preset.name}</h2>
                  )}

                  {isEditMode ? (
                    <input
                      type="text"
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      placeholder="Add a subtle description for this preset..."
                      className="text-base text-text-secondary bg-transparent border-b border-white/10 focus:border-white/30 focus:outline-none py-2 placeholder:text-white/10 w-full mt-2"
                    />
                  ) : (
                    preset.description && <p className="text-base text-text-secondary font-medium leading-relaxed max-w-2xl line-clamp-2 mt-2">{preset.description}</p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="rounded-full border border-white/10 bg-white/6 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-white/65">
                      {displayMods.length} Mods
                    </div>
                    <div className="rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-primary">
                      {characters.length} Characters
                    </div>
                    {missingCount > 0 && (
                      <div className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-yellow-400">
                        {missingCount} Missing
                      </div>
                    )}
                  </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 items-end shrink-0">
                <div className="flex items-center gap-3">
                  {!isEditMode && (
                    <button
                      onClick={() => setShowApply(true)}
                      className="group flex items-center gap-3 px-8 py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl bg-primary text-black"
                    >
                      <Zap size={18} strokeWidth={3} className="group-hover:animate-pulse" /> Apply Loadout
                    </button>
                  )}
                  <button
                    onClick={handleToggleEdit}
                    disabled={saving}
                    className={cn(
                      "flex items-center gap-3 px-6 py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest border transition-all hover:scale-[1.02] active:scale-[0.98]",
                      isEditMode
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-surface/80 border-white/10 text-white hover:bg-surface hover:border-white/20"
                    )}
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : isEditMode ? <><Check size={18} strokeWidth={3} /> Save Changes</> : <><Edit3 size={18} /> Edit</>}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {!isEditMode ? (
                    <>
                      <button onClick={handleDuplicate} title="Duplicate Loadout" className="p-4 bg-surface/80 hover:bg-surface border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-xl group/dupe">
                        <Copy size={20} className="group-hover/dupe:scale-110 transition-transform" />
                      </button>
                      <button onClick={() => setShowDeleteConfirm(true)} title="Delete Forever" className="p-4 bg-surface/80 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 rounded-2xl text-white/40 hover:text-red-400 transition-all shadow-xl group/delete">
                        <Trash2 size={20} className="group-hover/delete:scale-110 transition-transform" />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setIsEditMode(false); setShowAddPanel(false); }} title="Cancel Editing" className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-xl flex items-center gap-2">
                      <X size={20} /> <span className="text-xs font-bold uppercase tracking-widest">Cancel</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-5xl px-8">
            {/* Tabs */}
            <div className="flex items-center gap-8 border-b border-border shrink-0 mt-6 mb-8">
              {["mods", "info"].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                    activeTab === tab ? "text-text-primary border-primary" : "text-text-muted border-transparent hover:text-text-primary"
                  )}
                >
                  {tab === "mods" ? `Contents (${displayMods.length})` : "Details"}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="w-full pb-20">
              {activeTab === "mods" && (
                <div>
                  {(() => {
                    const ghostMods = missingMods;
                    if (ghostMods.length > 0 && !isEditMode && allLibraryMods.length > 0) {
                      return (
                        <div className="flex items-center justify-between p-6 mb-8 rounded-[24px] bg-[#110d00] border-2 border-yellow-500/50 text-yellow-500/80 shadow-inner">
                          <div className="flex items-center gap-6">
                            <div className="p-4 rounded-2xl bg-yellow-500/20 text-yellow-500">
                               <AlertTriangle size={24} strokeWidth={2.5} />
                            </div>
                            <div className="text-sm">
                              <span className="font-bold text-yellow-500 tracking-tight uppercase">Missing Mods Detected</span>
                              <p className="mt-1 font-medium leading-relaxed text-yellow-500/80">{ghostMods.length} mod(s) in this loadout were permanently deleted or renamed from your library.</p>
                            </div>
                          </div>
                          <button 
                            onClick={async () => {
                              const cleaned = preset.mods.filter(pm => !ghostMods.find(g => g.modId === pm.modId));
                              const updated = { ...preset, mods: cleaned, updatedAt: new Date().toISOString() };
                              setSaving(true);
                              try {
                                await window.electronMods.savePreset(updated);
                                setPreset(updated);
                                notifyPresetChanged?.(updated);
                              } finally {
                                setSaving(false);
                              }
                            }}
                            className="px-6 py-3 shrink-0 bg-yellow-500/20 hover:bg-yellow-500 text-yellow-500 hover:text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
                          >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : "Remove Missing"}
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {displayMods.length === 0 && !showAddPanel ? (
                    <div className="text-center py-32 text-text-muted">
                      <Package size={48} className="mx-auto mb-6 opacity-30" />
                      <p className="font-black uppercase tracking-widest text-lg">No mods in this preset</p>
                      {isEditMode && (
                        <button onClick={() => setShowAddPanel(true)} className="mt-8 px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-all flex items-center gap-2 mx-auto">
                          <Plus size={16} /> Add Mods
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {displayMods.map((mod) => (
                        <div
                          key={mod.modId}
                          className="relative flex items-center gap-4 p-4 rounded-[20px] bg-surface border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all duration-300 group shadow-sm"
                        >
                          <div className="w-24 h-16 rounded-xl overflow-hidden bg-background border border-white/5 shrink-0 relative shadow-inner">
                            {mod.customThumbnail || thumbFromGbMap(gbData, mod.gamebananaId) ? (
                              <img 
                                src={mod.customThumbnail ? `file://${mod.customThumbnail}` : thumbFromGbMap(gbData, mod.gamebananaId)} 
                                alt="" 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-white/5 italic text-[10px] text-white/10 font-black tracking-tighter">NO IMAGE</div>
                            )}
                            <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent pointer-events-none" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-white/90 truncate group-hover:text-primary transition-colors tracking-tight leading-tight">{mod.name}</p>
                            <p className="text-[10px] text-text-secondary uppercase tracking-widest font-black mt-1.5 opacity-60">{mod.character}</p>
                          </div>
                          {isEditMode && (
                            <button
                              onClick={() => handleRemoveMod(mod.modId)}
                              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-red-500/10 backdrop-blur-md border border-red-500/30 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-xl z-20"
                            >
                              <X size={14} strokeWidth={3} />
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Add mod button in edit mode */}
                      {isEditMode && (
                        <button
                          onClick={() => setShowAddPanel(p => !p)}
                          className={cn(
                            "group flex flex-col items-center justify-center gap-3 p-4 rounded-[20px] border-2 border-dashed transition-all duration-300 min-h-[96px]",
                            showAddPanel
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-white/5 text-white/20 hover:border-white/20 hover:text-white/40 hover:bg-white/5"
                          )}
                        >
                          <Plus size={24} strokeWidth={3} className={cn("transition-transform duration-500", showAddPanel ? "rotate-45" : "group-hover:scale-125")} />
                          <span className="text-[11px] font-black uppercase tracking-widest">{showAddPanel ? "Close Panel" : "Add More Mods"}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Add Mods Panel */}
                  <AnimatePresence>
                    {showAddPanel && isEditMode && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="mt-8"
                      >
                        <div className="rounded-[32px] border border-white/10 bg-surface backdrop-blur-md overflow-hidden shadow-2xl">
                          <div className="p-6 border-b border-white/5 bg-background">
                            <div className="relative group">
                              <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-primary transition-colors" />
                              <input
                                type="text"
                                value={addSearch}
                                onChange={e => setAddSearch(e.target.value)}
                                placeholder="Search your library for mods to add..."
                                className="w-full pl-14 pr-6 py-4 bg-white/5 border border-white/5 rounded-2xl text-base text-white focus:outline-none focus:border-primary/50 placeholder:text-white/20 font-medium transition-all"
                              />
                            </div>
                          </div>
                          <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2">
                            {loadingLibrary ? (
                              <div className="flex flex-col items-center justify-center py-20 text-text-secondary gap-4 opacity-50">
                                <Loader2 size={32} className="animate-spin text-primary" />
                                <span className="text-[11px] font-black uppercase tracking-widest">Indexing Library...</span>
                              </div>
                            ) : availableLibraryMods.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-20 text-text-secondary opacity-30 italic">
                                 <Package size={32} className="mb-4" />
                                 <p className="text-sm font-black uppercase tracking-widest">No matching mods found</p>
                              </div>
                            ) : (
                              availableLibraryMods.map(mod => (
                                <button
                                  key={mod.id}
                                  onClick={() => handleAddMod(mod)}
                                  className="flex items-center gap-5 px-5 py-4 rounded-2xl hover:bg-white/5 text-left transition-all group/add border border-transparent hover:border-white/5"
                                >
                                  <div className="w-24 h-16 rounded-xl overflow-hidden bg-background border border-white/10 shrink-0 relative shadow-md">
                                    {mod.customThumbnail || thumbFromGbMap(gbData, mod.gamebananaId) ? (
                                      <img 
                                        src={mod.customThumbnail ? `file://${mod.customThumbnail}` : thumbFromGbMap(gbData, mod.gamebananaId)} 
                                        alt="" 
                                        className="w-full h-full object-cover group-hover/add:scale-110 transition-transform duration-700" 
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-white/5 italic text-[10px] text-white/5 font-black tracking-tighter">PREVIEW</div>
                                    )}
                                    <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-base font-black text-white/80 truncate group-hover/add:text-primary transition-colors tracking-tight leading-none">{mod.name}</p>
                                    <p className="text-[10px] text-text-secondary uppercase tracking-widest font-black mt-2 opacity-60">{mod.character}</p>
                                  </div>
                                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/30 group-hover/add:bg-primary group-hover/add:text-black transition-all">
                                     <Plus size={20} strokeWidth={3} />
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {activeTab === "info" && (
                <div className="bg-surface rounded-3xl p-8 flex flex-col gap-4 border border-white/5">
                  <InfoRow label="Title" value={preset.name} />
                  <InfoRow label="Game" value={game.name || game.id} />
                  <InfoRow label="Total Mods" value={`${preset.mods.length} items`} />
                  <InfoRow label="Characters" value={`${characters.length} characters`} />
                  <InfoRow label="Created" value={new Date(preset.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })} />
                  {preset.updatedAt && <InfoRow label="Last Modified" value={new Date(preset.updatedAt).toLocaleDateString(undefined, { dateStyle: 'long' })} />}
                  {preset.description && (
                    <div className="mt-8 pt-8 border-t border-white/5">
                      <span className="text-xs font-black uppercase tracking-widest text-text-secondary block mb-4 opacity-50">Description</span>
                      <p className="text-base text-white/70 leading-relaxed font-medium max-w-3xl">{preset.description}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-surface border border-white/10 rounded-[32px] p-10 max-w-sm w-full mx-4 shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
            >
              <div className="flex flex-col items-center text-center">
                <div className="p-4 rounded-3xl bg-red-500/10 border border-red-500/20 mb-6 shadow-xl">
                  <AlertTriangle size={32} className="text-red-500" strokeWidth={2.5} />
                </div>
                <h3 className="text-2xl font-black text-white tracking-tighter mb-3">Delete Preset?</h3>
                <p className="text-text-secondary text-sm font-medium leading-relaxed mb-8">
                  The preset <span className="text-white font-bold">"{preset.name}"</span> will be permanently removed. Your installed mods will not be affected.
                </p>
              </div>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] bg-red-500 text-white hover:bg-red-400 border border-red-400/50 transition-all shadow-xl disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Permanently Delete"}
                </button>
                <button 
                  onClick={() => setShowDeleteConfirm(false)} 
                  className="w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                >
                  Keep Preset
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Apply Modal */}
      <AnimatePresence>
        {showApply && (
          <ApplyPresetModal
            preset={preset}
            importerPath={importerPath}
            onClose={() => setShowApply(false)}
            onApplied={() => {
              setShowApply(false);
              notifyPresetChanged?.(preset);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start gap-8 py-4 border-b border-white/5 last:border-0">
      <span className="text-[11px] font-black uppercase tracking-widest text-text-muted w-32 shrink-0 pt-1">{label}</span>
      <span className="text-base font-medium text-white">{value}</span>
    </div>
  );
}
