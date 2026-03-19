import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Edit3, Check, Plus, Trash2, Search, Loader2, Share2, Copy, AlertTriangle, Info, Package } from "lucide-react";
import { cn } from "../lib/utils";
import { getAllCharacterNames } from "../lib/portraits";
import ApplyPresetModal from "./ApplyPresetModal";

export default function PresetDetailModal({ preset: initialPreset, game, importerPath, onClose, onUpdated, onDeleted }) {
  const [preset, setPreset] = useState(initialPreset);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState("mods");
  const [showApply, setShowApply] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [gbData, setGbData] = useState({});

  // Edit mode state
  const [editName, setEditName] = useState(preset.name);
  const [editDescription, setEditDescription] = useState(preset.description || "");
  const [editMods, setEditMods] = useState([...preset.mods]);

  // Add mods panel state
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [allLibraryMods, setAllLibraryMods] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  const loadLibrary = useCallback(async () => {
    if (!importerPath) return;
    setLoadingLibrary(true);
    try {
      const mods = await window.electronMods.getMods(
        importerPath,
        getAllCharacterNames(game.id),
        game.id
      );
      setAllLibraryMods(mods);

      // SELF-HEALING: If preset mods are missing gamebananaId, try to find them in the loaded library
      let needsUpdate = false;
      const healedMods = preset.mods.map(pm => {
        if (!pm.gamebananaId) {
          const libraryMod = mods.find(m => m.id === pm.modId);
          if (libraryMod?.gamebananaId) {
            needsUpdate = true;
            return { ...pm, gamebananaId: libraryMod.gamebananaId };
          }
        }
        return pm;
      });

      if (needsUpdate) {
        const updatedPreset = { ...preset, mods: healedMods };
        setPreset(updatedPreset);
        // We don't auto-save to disk here to avoid silent mutations, 
        // but the UI will now have the IDs needed for thumbnails.
      }

      // Fetch GB data for thumbnails in the library panel
      const gbIds = mods.map(m => m.gamebananaId).filter(Boolean);
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
    } catch (e) {
      console.error("PresetDetailModal: failed to load library", e);
    } finally {
      setLoadingLibrary(false);
    }
  }, [importerPath, game.id, preset]);

  // Initial load: check if we need to self-heal (if any mod is missing GB ID)
  useEffect(() => {
    const hasMissingIds = preset.mods.some(m => !m.gamebananaId);
    if (hasMissingIds) {
      loadLibrary();
    }
  }, []); // Only on mount

  // Fetch GB data for mods ALREADY in the preset
  useEffect(() => {
    const fetchPresetGbData = async () => {
      const gbIds = preset.mods.map(m => m.gamebananaId).filter(Boolean);
      if (gbIds.length === 0) return;
      
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
    };
    fetchPresetGbData();
  }, [preset.mods]);

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
        onUpdated?.(updated);
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
      loadLibrary();
    }
  };

  const handleRemoveMod = (modId) => {
    setEditMods(prev => prev.filter(m => m.modId !== modId));
  };

  const handleAddMod = (mod) => {
    const already = editMods.find(m => m.modId === mod.id);
    if (already) return;
    setEditMods(prev => [...prev, {
      modId: mod.id,
      originalFolderName: mod.originalFolderName,
      character: mod.character,
      name: mod.name,
      gamebananaId: mod.gamebananaId || null,
      customThumbnail: mod.customThumbnail || null,
    }]);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await window.electronMods.deletePreset(game.id, preset.id);
      onDeleted?.(preset.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await window.electronMods.exportPreset(preset);
    } finally {
      setExporting(false);
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
    onUpdated?.(duped);
    onClose();
  };

  // Library mods not yet in preset
  const availableLibraryMods = allLibraryMods.filter(
    m => !editMods.find(em => em.modId === m.id)
  ).filter(
    m => !addSearch || m.name.toLowerCase().includes(addSearch.toLowerCase()) || m.character.toLowerCase().includes(addSearch.toLowerCase())
  );

  const displayMods = isEditMode ? editMods : preset.mods;
  const characters = [...new Set(displayMods.map(m => m.character))];

  // Hero image: first mod with a thumbnail
  const heroImage = preset.mods.find(m => m.customThumbnail)?.customThumbnail;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-6 sm:p-12"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 35 }}
          animate={{ scale: 1, opacity: 1, y: 35 }}
          className="w-full max-w-5xl bg-(--bg-base) border border-white/10 rounded-[40px] overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col h-full max-h-[84vh]"
        >
          {/* Hero Header */}
          <div className="relative h-40 shrink-0 overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0">
              {heroImage ? (
                <>
                  <img src={`file://${heroImage}`} alt="" className="w-full h-full object-cover scale-110 blur-2xl opacity-30" />
                  <div className="absolute inset-0 bg-linear-to-t from-(--bg-base) via-(--bg-base)/60 to-transparent" />
                </>
              ) : (
                <div className="w-full h-full" style={{ background: `radial-gradient(ellipse at 30% 50%, ${preset.color}25, transparent 70%)` }} />
              )}
              {/* Accent left border glow */}
              <div className="absolute left-0 inset-y-0 w-1" style={{ backgroundColor: preset.color }} />
            </div>

            <div className="absolute inset-0 p-6 flex items-center justify-between gap-6 z-10">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.color, boxShadow: `0 0 12px ${preset.color}80` }} />
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-(--text-muted)">Loadout · {game.id}</span>
                </div>
                {isEditMode ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="text-3xl font-black text-white tracking-tight bg-transparent border-b border-white/30 focus:border-(--active-accent) focus:outline-none pb-1 min-w-0"
                  />
                ) : (
                  <h2 className="text-3xl font-black text-white tracking-tight">{preset.name}</h2>
                )}
                {isEditMode ? (
                  <input
                    type="text"
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    placeholder="Add a description..."
                    className="text-sm text-(--text-muted) bg-transparent border-b border-white/10 focus:border-white/30 focus:outline-none pb-0.5 placeholder:text-white/20 w-full max-w-md"
                  />
                ) : (
                  preset.description && <p className="text-sm text-(--text-muted)">{preset.description}</p>
                )}
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs font-black text-white/40 uppercase tracking-wider">{displayMods.length} mods</span>
                  <span className="text-white/20">·</span>
                  <span className="text-xs font-black text-white/40 uppercase tracking-wider">{characters.length} characters</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 items-end shrink-0">
                <div className="flex items-center gap-2">
                  {!isEditMode && (
                    <button
                      onClick={() => setShowApply(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all"
                      style={{ backgroundColor: preset.color, color: "#000", borderColor: "transparent" }}
                    >
                      <Zap size={13} strokeWidth={3} /> Apply
                    </button>
                  )}
                  <button
                    onClick={handleToggleEdit}
                    disabled={saving}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                      isEditMode
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : isEditMode ? <><Check size={13} strokeWidth={3} /> Save</> : <><Edit3 size={13} /> Edit</>}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {!isEditMode && (
                    <>
                      <button onClick={handleDuplicate} title="Duplicate" className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white transition-all">
                        <Copy size={16} />
                      </button>
                      <button onClick={handleExport} disabled={exporting} title="Export" className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white transition-all disabled:opacity-50">
                        {exporting ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(true)} title="Delete" className="p-2.5 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl text-white/40 hover:text-red-400 transition-all">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  {isEditMode && (
                    <button onClick={() => { setIsEditMode(false); setShowAddPanel(false); }} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white transition-all">
                      <X size={16} />
                    </button>
                  )}
                  <button onClick={onClose} className="p-2.5 bg-white/5 hover:bg-black text-white/40 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-xl transition-all">
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-6 border-b border-white/5 px-8 shrink-0">
            {["mods", "info"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "py-3.5 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all",
                  activeTab === tab ? "text-white border-(--active-accent)" : "text-(--text-muted) border-transparent hover:text-white"
                )}
              >
                {tab === "mods" ? `Mods (${displayMods.length})` : "Info"}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {activeTab === "mods" && (
              <div className="p-6">
                {displayMods.length === 0 && !showAddPanel ? (
                  <div className="text-center py-20 text-(--text-muted)">
                    <Package size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-black uppercase tracking-wider text-sm">No mods in this preset</p>
                    {isEditMode && (
                      <button onClick={() => setShowAddPanel(true)} className="mt-4 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-all flex items-center gap-2 mx-auto">
                        <Plus size={14} /> Add Mods
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {displayMods.map((mod) => (
                      <div
                        key={mod.modId}
                        className="relative flex items-center gap-3 p-3 rounded-2xl bg-white/3 border border-white/5 hover:border-white/10 transition-all group"
                      >
                        <div className="w-20 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0 relative">
                          {mod.customThumbnail || gbData[mod.gamebananaId]?.thumbnailUrl ? (
                            <img 
                              src={mod.customThumbnail ? `file://${mod.customThumbnail}` : gbData[mod.gamebananaId]?.thumbnailUrl} 
                              alt="" 
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center italic text-[9px] text-white/10 font-black">NO IMG</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate group-hover:text-(--active-accent) transition-colors">{mod.name}</p>
                          <p className="text-[10px] text-(--text-muted) uppercase tracking-wider font-medium">{mod.character}</p>
                        </div>
                        {isEditMode && (
                          <button
                            onClick={() => handleRemoveMod(mod.modId)}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/40"
                          >
                            <X size={10} strokeWidth={3} />
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Add mod button in edit mode */}
                    {isEditMode && (
                      <button
                        onClick={() => setShowAddPanel(p => !p)}
                        className={cn(
                          "flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed transition-all text-xs font-black uppercase tracking-widest h-[70px]",
                          showAddPanel
                            ? "border-(--active-accent)/40 text-(--active-accent) bg-(--active-accent)/5"
                            : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/60"
                        )}
                      >
                        <Plus size={16} />
                        {showAddPanel ? "Hide Panel" : "Add Mods"}
                      </button>
                    )}
                  </div>
                )}

                {/* Add Mods Panel */}
                <AnimatePresence>
                  {showAddPanel && isEditMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 20 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                        <div className="p-4 border-b border-white/5">
                          <div className="relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                            <input
                              type="text"
                              value={addSearch}
                              onChange={e => setAddSearch(e.target.value)}
                              placeholder="Search library..."
                              className="w-full pl-8 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-(--active-accent)/50 placeholder:text-white/20 font-medium transition-all"
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-1">
                          {loadingLibrary ? (
                            <div className="flex items-center justify-center py-8 text-(--text-muted) gap-2">
                              <Loader2 size={16} className="animate-spin" />
                              <span className="text-xs">Loading mods...</span>
                            </div>
                          ) : availableLibraryMods.length === 0 ? (
                            <p className="text-center text-(--text-muted) py-6 text-xs">No mods available to add.</p>
                          ) : (
                            availableLibraryMods.map(mod => (
                              <button
                                key={mod.id}
                                onClick={() => handleAddMod(mod)}
                                className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-white/5 text-left transition-all group/add"
                              >
                                <div className="w-16 h-10 rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0 relative">
                                  {mod.customThumbnail || gbData[mod.gamebananaId]?.thumbnailUrl ? (
                                    <img 
                                      src={mod.customThumbnail ? `file://${mod.customThumbnail}` : gbData[mod.gamebananaId]?.thumbnailUrl} 
                                      alt="" 
                                      className="w-full h-full object-cover group-hover/add:scale-110 transition-transform duration-500" 
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center italic text-[8px] text-white/10 font-black">NO IMG</div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-white truncate group-hover/add:text-(--active-accent) transition-colors">{mod.name}</p>
                                  <p className="text-[9px] text-(--text-muted)">{mod.character}</p>
                                </div>
                                <Plus size={14} className="text-white/20 group-hover/add:text-(--active-accent) transition-colors shrink-0" />
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
              <div className="p-8 flex flex-col gap-6">
                <InfoRow label="Game" value={game.name || game.id} />
                <InfoRow label="Total Mods" value={`${preset.mods.length}`} />
                <InfoRow label="Characters Covered" value={`${characters.length}`} />
                <InfoRow label="Created" value={new Date(preset.createdAt).toLocaleDateString()} />
                {preset.updatedAt && <InfoRow label="Last Modified" value={new Date(preset.updatedAt).toLocaleDateString()} />}
                {preset.description && <InfoRow label="Description" value={preset.description} />}
              </div>
            )}
          </div>
        </motion.div>

        {/* Delete Confirmation */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-(--bg-base) border border-red-500/20 rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertTriangle size={20} className="text-red-400" />
                  </div>
                  <h3 className="text-lg font-black text-white">Delete Preset?</h3>
                </div>
                <p className="text-(--text-muted) text-sm mb-6">
                  <span className="text-white font-semibold">"{preset.name}"</span> will be permanently deleted. This won't affect your installed mods.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all">
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white bg-red-500/80 hover:bg-red-500 border border-red-500/50 transition-all disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Apply Modal */}
      <AnimatePresence>
        {showApply && (
          <ApplyPresetModal
            preset={preset}
            importerPath={importerPath}
            onClose={() => setShowApply(false)}
            onApplied={() => {
              setShowApply(false);
              onUpdated?.(preset);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start gap-6 py-3 border-b border-white/5 last:border-0">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-(--text-muted) w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}
