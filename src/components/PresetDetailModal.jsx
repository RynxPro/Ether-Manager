import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Plus, Search, HelpCircle, Package, ArrowLeft, RefreshCw, X, ChevronDown, Check, Zap, Edit3, Trash2, Loader2, Share2, Copy, Info } from "lucide-react";
import { useLoadGameMods } from "../hooks/useLoadGameMods";
import { useAppStore } from "../store/useAppStore";
import { cn } from "../lib/utils";
import { getAllCharacterNames, getGlobalCategories } from "../lib/portraits";
import ApplyPresetModal from "./ApplyPresetModal";
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

export default function PresetDetailModal({
  preset: initialPreset,
  importerPath,
  onClose,
  onUpdated,
  onSaved,
  onDeleted,
}) {
  const game = useAppStore((state) => state.activeGame);
  const notifyPresetChanged = onUpdated || onSaved;
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
  const [editColor, setEditColor] = useState(preset.color);
  const [editMods, setEditMods] = useState([...preset.mods]);

  // Add mods panel state
  const [showAddPanel, setShowAddPanel] = useState(false);
  // Always load the library in the background to detect missing ghost mods instantly
  const { mods: loadedMods, loading: loadingLibrary, loadMods: forceLoadLibrary } = useLoadGameMods(game.id, true);
  const [allLibraryMods, setAllLibraryMods] = useState([]);
  const [addSearch, setAddSearch] = useState("");

  const loadLibrary = useCallback(async () => {
    if (!loadedMods || loadedMods.length === 0) return;
    setAllLibraryMods(loadedMods);

    // SELF-HEALING: If preset mods are missing gamebananaId, try to find them in the loaded library
    let needsUpdate = false;
    const healedMods = preset.mods.map(pm => {
      if (!pm.gamebananaId || pm.character === "Unassigned") {
        const libraryMod = loadedMods.find(m => m.id === pm.modId);
        if (libraryMod) {
          let updated = { ...pm };
          if (libraryMod.gamebananaId) {
            updated.gamebananaId = libraryMod.gamebananaId;
          }
          if (libraryMod.character !== "Unassigned") {
            updated.character = libraryMod.character;
          }
          needsUpdate = true;
          return updated;
        }
      }
      return pm;
    });

    if (needsUpdate) {
      setEditMods(healedMods);
    }

    // Fetch GB data for thumbnails in the library panel
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
  }, [loadedMods, preset.mods]);

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
          color: editColor,
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
      setEditColor(preset.color);
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
    notifyPresetChanged?.(duped);
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
          className="w-full max-w-5xl bg-surface border border-border rounded-[40px] overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col h-full max-h-[84vh]"
        >
          {/* Hero Header */}
          <div className="relative h-64 shrink-0 overflow-hidden bg-background border-b border-white/5">
            {/* Background Layer: Mod Mosaic */}
            <div className="absolute inset-0 z-0 opacity-60 pointer-events-none overflow-hidden">
              <div className="absolute inset-x-0 inset-y-0 grid grid-cols-3 md:grid-cols-4 gap-4 scale-100 blur-none">
                {displayMods.slice(0, 8).map((m, i) => (
                  <div key={`${m.modId}-${i}`} className="aspect-video rounded-[24px] overflow-hidden border border-white/10 bg-white/5 shadow-2xl">
                    {(m.customThumbnail || gbData[m.gamebananaId]?.thumbnailUrl) ? (
                      <img 
                        src={m.customThumbnail ? `file://${m.customThumbnail}` : gbData[m.gamebananaId]?.thumbnailUrl} 
                        className="w-full h-full object-cover opacity-80 transition-all duration-1000" 
                        alt=""
                      />
                    ) : (
                      <div className="w-full h-full bg-white/2" />
                    )}
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 bg-linear-to-t from-surface via-surface/40 to-transparent" />
              <div className="absolute inset-0 bg-linear-to-r from-surface/40 via-transparent to-surface/40 shadow-inner" />
            </div>

            {/* Accent Glow (Replacing the side line) */}
            <div 
              className="absolute top-0 left-0 right-0 h-1 opacity-50 shadow-[0_5px_40px_var(--color)] animate-pulse" 
              style={{ backgroundColor: preset.color, '--color': preset.color }} 
            />
            <div 
              className="absolute -left-20 -top-20 w-64 h-64 blur-[100px] opacity-20"
              style={{ backgroundColor: preset.color }}
            />

            <div className="absolute inset-0 p-8 flex items-end justify-between gap-8 z-10">
              <div className="flex flex-col gap-2 max-w-2xl">
                <div className="flex items-center gap-3 mb-1">
                  {isEditMode ? (
                     <div className="flex items-center gap-2 bg-black/40 p-2 rounded-2xl border border-white/10 backdrop-blur-md">
                        {ACCENT_COLORS.map(c => (
                           <button
                             key={c.value}
                             onClick={() => setEditColor(c.value)}
                             title={c.label}
                             className={cn(
                               "w-5 h-5 rounded-full transition-all hover:scale-125 border border-white/10",
                               editColor === c.value ? "ring-2 ring-white scale-110 shadow-lg" : "scale-100 opacity-50 hover:opacity-100"
                             )}
                             style={{ backgroundColor: c.value }}
                           />
                        ))}
                     </div>
                  ) : (
                    <div className="w-3 h-3 rounded-full shadow-[0_0_15px_var(--color)]" style={{ backgroundColor: preset.color, '--color': preset.color }} />
                  )}
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary">LOADOUT · {game.id}</span>
                </div>

                {isEditMode ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="text-4xl font-black text-white tracking-tighter bg-transparent border-b-2 border-primary/30 focus:border-primary focus:outline-none pb-2 min-w-0"
                    placeholder="Preset Name"
                  />
                ) : (
                  <h2 className="text-4xl font-black text-white tracking-tighter leading-none">{preset.name}</h2>
                )}

                {isEditMode ? (
                  <input
                    type="text"
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    placeholder="Add a subtle description for this preset..."
                    className="text-sm text-text-secondary bg-transparent border-b border-white/10 focus:border-white/30 focus:outline-none py-2 placeholder:text-white/10 w-full"
                  />
                ) : (
                  preset.description && <p className="text-sm text-text-secondary font-medium leading-relaxed max-w-xl line-clamp-2">{preset.description}</p>
                )}

                <div className="flex items-center gap-5 mt-2">
                  <div className="flex flex-col">
                    <span className="text-white font-black text-xs leading-none">{displayMods.length}</span>
                    <span className="text-[8px] uppercase font-black tracking-widest text-text-secondary mt-1 opacity-60">Total Mods</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white font-black text-xs leading-none">{characters.length}</span>
                    <span className="text-[8px] uppercase font-black tracking-widest text-text-secondary mt-1 opacity-60">Characters</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 items-end shrink-0">
                <div className="flex items-center gap-3">
                  {!isEditMode && (
                    <button
                      onClick={() => setShowApply(true)}
                      className="group flex items-center gap-3 px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl"
                      style={{ backgroundColor: preset.color, color: "#000" }}
                    >
                      <Zap size={15} strokeWidth={3} className="group-hover:animate-pulse" /> Apply Loadout
                    </button>
                  )}
                  <button
                    onClick={handleToggleEdit}
                    disabled={saving}
                    className={cn(
                      "flex items-center gap-3 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all hover:scale-[1.02] active:scale-[0.98]",
                      isEditMode
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-surface/80 border-white/10 text-white hover:bg-surface hover:border-white/20"
                    )}
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : isEditMode ? <><Check size={15} strokeWidth={3} /> Save Changes</> : <><Edit3 size={15} /> Edit</>}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {!isEditMode ? (
                    <>
                      <button onClick={handleDuplicate} title="Duplicate Loadout" className="p-3 bg-surface/80 hover:bg-surface border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-xl group/dupe">
                        <Copy size={18} className="group-hover/dupe:scale-110 transition-transform" />
                      </button>
                      <button onClick={handleExport} disabled={exporting} title="Export Package" className="p-3 bg-surface/80 hover:bg-surface border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all shadow-xl disabled:opacity-50 group/export">
                        {exporting ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} className="group-hover/export:scale-110 transition-transform" />}
                      </button>
                      <button onClick={() => setShowDeleteConfirm(true)} title="Delete Forever" className="p-3 bg-surface/80 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 rounded-2xl text-white/40 hover:text-red-400 transition-all shadow-xl group/delete">
                        <Trash2 size={18} className="group-hover/delete:scale-110 transition-transform" />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setIsEditMode(false); setShowAddPanel(false); }} className="p-3 bg-surface/80 hover:bg-red-500/10 border border-white/10 rounded-2xl text-white/40 hover:text-red-400 transition-all shadow-xl">
                      <X size={18} />
                    </button>
                  )}
                  <button onClick={onClose} className="p-3 bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-red-400 rounded-2xl text-red-500 hover:text-white transition-all shadow-xl">
                    <X size={18} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-6 border-b border-border px-8 shrink-0">
            {["mods", "info"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "py-3.5 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all",
                  activeTab === tab ? "text-text-primary border-primary" : "text-text-muted border-transparent hover:text-text-primary"
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
                
                {(() => {
                  const ghostMods = displayMods.filter(pm => !allLibraryMods.find(m => m.id === pm.modId || m.id === pm.originalFolderName.replace(/^DISABLED_/, "")));
                  if (ghostMods.length > 0 && !isEditMode && allLibraryMods.length > 0) {
                    return (
                      <div className="flex items-center justify-between p-4 mb-6 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-500/80 shadow-inner">
                        <div className="flex items-center gap-3">
                          <AlertTriangle size={18} className="text-yellow-500 shrink-0" />
                          <div className="text-xs">
                            <span className="font-bold text-yellow-500 tracking-tight">Missing Mods Detected</span>
                            <p className="mt-0.5 opacity-80 font-medium leading-tight">{ghostMods.length} mod(s) in this loadout were permanently deleted or renamed.</p>
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
                          className="px-4 py-2 shrink-0 bg-yellow-500/20 hover:bg-yellow-500 text-yellow-500 hover:text-black font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md"
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : "Remove Missing"}
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}

                {displayMods.length === 0 && !showAddPanel ? (
                  <div className="text-center py-20 text-text-muted">
                    <Package size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-black uppercase tracking-wider text-sm">No mods in this preset</p>
                    {isEditMode && (
                      <button onClick={() => setShowAddPanel(true)} className="mt-4 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-all flex items-center gap-2 mx-auto">
                        <Plus size={14} /> Add Mods
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayMods.map((mod) => (
                      <div
                        key={mod.modId}
                        className="relative flex items-center gap-4 p-4 rounded-[20px] bg-background border border-white/5 hover:border-white/20 transition-all duration-300 group shadow-sm hover:shadow-xl"
                      >
                        <div className="w-24 h-14 rounded-xl overflow-hidden bg-surface border border-white/5 shrink-0 relative shadow-inner">
                          {mod.customThumbnail || gbData[mod.gamebananaId]?.thumbnailUrl ? (
                            <img 
                              src={mod.customThumbnail ? `file://${mod.customThumbnail}` : gbData[mod.gamebananaId]?.thumbnailUrl} 
                              alt="" 
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/5 italic text-[10px] text-white/10 font-black tracking-tighter">NO IMAGE</div>
                          )}
                          <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent pointer-events-none" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-black text-white/90 truncate group-hover:text-primary transition-colors tracking-tight leading-tight">{mod.name}</p>
                          <p className="text-[9px] text-text-secondary uppercase tracking-[0.15em] font-black mt-1 opacity-60">{mod.character}</p>
                        </div>
                        {isEditMode && (
                          <button
                            onClick={() => handleRemoveMod(mod.modId)}
                            className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500/10 backdrop-blur-md border border-red-500/30 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-xl z-20"
                          >
                            <X size={12} strokeWidth={3} />
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Add mod button in edit mode */}
                    {isEditMode && (
                      <button
                        onClick={() => setShowAddPanel(p => !p)}
                        className={cn(
                          "group flex flex-col items-center justify-center gap-2 p-4 rounded-[20px] border-2 border-dashed transition-all duration-300 h-[86px]",
                          showAddPanel
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-white/5 text-white/20 hover:border-white/20 hover:text-white/40 hover:bg-white/5"
                        )}
                      >
                        <Plus size={20} strokeWidth={3} className={cn("transition-transform duration-500", showAddPanel ? "rotate-45" : "group-hover:scale-125")} />
                        <span className="text-[10px] font-black uppercase tracking-widest">{showAddPanel ? "Close Panel" : "Add More Mods"}</span>
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
                      className="mt-6"
                    >
                      <div className="rounded-3xl border border-white/10 bg-background/50 backdrop-blur-md overflow-hidden shadow-2xl">
                        <div className="p-5 border-b border-white/5">
                          <div className="relative group">
                            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary group-focus-within:text-primary transition-colors" />
                            <input
                              type="text"
                              value={addSearch}
                              onChange={e => setAddSearch(e.target.value)}
                              placeholder="Search your library for mods to add..."
                              className="w-full pl-11 pr-4 py-3 bg-surface/50 border border-white/5 rounded-2xl text-sm text-white focus:outline-none focus:border-primary/50 placeholder:text-white/10 font-medium transition-all"
                            />
                          </div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-3 flex flex-col gap-1.5">
                          {loadingLibrary ? (
                            <div className="flex flex-col items-center justify-center py-12 text-text-secondary gap-3 opacity-50">
                              <Loader2 size={24} className="animate-spin text-primary" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Indexing Library...</span>
                            </div>
                          ) : availableLibraryMods.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-text-secondary opacity-30 italic">
                               <Package size={24} className="mb-2" />
                               <p className="text-xs font-black uppercase tracking-widest">No matching mods found</p>
                            </div>
                          ) : (
                            availableLibraryMods.map(mod => (
                              <button
                                key={mod.id}
                                onClick={() => handleAddMod(mod)}
                                className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 text-left transition-all group/add border border-transparent hover:border-white/5"
                              >
                                <div className="w-20 h-11 rounded-lg overflow-hidden bg-surface border border-white/10 shrink-0 relative shadow-md">
                                  {mod.customThumbnail || gbData[mod.gamebananaId]?.thumbnailUrl ? (
                                    <img 
                                      src={mod.customThumbnail ? `file://${mod.customThumbnail}` : gbData[mod.gamebananaId]?.thumbnailUrl} 
                                      alt="" 
                                      className="w-full h-full object-cover group-hover/add:scale-110 transition-transform duration-700" 
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-white/5 italic text-[8px] text-white/5 font-black tracking-tighter">PREVIEW</div>
                                  )}
                                  <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] font-black text-white/80 truncate group-hover/add:text-primary transition-colors tracking-tight leading-none">{mod.name}</p>
                                  <p className="text-[9px] text-text-secondary uppercase tracking-widest font-black mt-1 opacity-40">{mod.character}</p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover/add:bg-primary group-hover/add:text-black transition-all">
                                   <Plus size={16} strokeWidth={3} />
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
              <div className="p-10 flex flex-col gap-2">
                <InfoRow label="Title" value={preset.name} />
                <InfoRow label="Game" value={game.name || game.id} />
                <InfoRow label="Total Mods" value={`${preset.mods.length} items`} />
                <InfoRow label="Characters" value={`${characters.length} characters`} />
                <InfoRow label="Created" value={new Date(preset.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })} />
                {preset.updatedAt && <InfoRow label="Last Modified" value={new Date(preset.updatedAt).toLocaleDateString(undefined, { dateStyle: 'long' })} />}
                {preset.description && (
                  <div className="mt-8 p-6 rounded-3xl bg-white/2 border border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary block mb-3 opacity-50">Description</span>
                    <p className="text-sm text-white/70 leading-relaxed font-medium">{preset.description}</p>
                  </div>
                )}
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
    <div className="flex items-start gap-6 py-3 border-b border-white/5 last:border-0">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}
