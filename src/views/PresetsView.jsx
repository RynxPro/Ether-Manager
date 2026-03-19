import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Plus, Upload, Package, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { getAllCharacterNames } from "../lib/portraits";
import PresetDetailModal from "../components/PresetDetailModal";
import CreatePresetModal from "../components/CreatePresetModal";

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] } }),
};

export default function PresetsView({ game }) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importerPath, setImporterPath] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [importing, setImporting] = useState(false);
  const [gbData, setGbData] = useState({});

  const loadPresets = useCallback(async () => {
    setLoading(true);
    try {
      const [config, data] = await Promise.all([
        window.electronConfig.getConfig(),
        window.electronMods.getPresets(game.id),
      ]);
      setImporterPath(config[game.id] || null);
      setPresets(data || []);

      // Fetch GB data for thumbnails in the grid
      const allModIds = [...new Set(data.flatMap(p => p.mods).map(m => m.gamebananaId).filter(Boolean))];
      if (allModIds.length > 0) {
        const result = await window.electronMods.fetchGbModsBatch(allModIds);
        if (result.success && result.data) {
          const dataMap = {};
          result.data.forEach(item => {
            const thumb = item._aPreviewMedia?._aImages?.[0];
            dataMap[item._idRow] = {
              thumbnailUrl: thumb ? `${thumb._sBaseUrl}/${thumb._sFile}` : null
            };
          });
          setGbData(dataMap);
        }
      }
    } catch (err) {
      console.error("PresetsView: load error", err);
    } finally {
      setLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handlePresetSaved = (preset) => {
    setPresets(prev => {
      const idx = prev.findIndex(p => p.id === preset.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = preset;
        return next;
      }
      return [preset, ...prev];
    });
  };

  const handlePresetDeleted = (presetId) => {
    setPresets(prev => prev.filter(p => p.id !== presetId));
    setActivePreset(null);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await window.electronMods.importPreset();
      if (result.success && result.preset) {
        // Assign new ID and match to current game
        const imported = {
          ...result.preset,
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          gameId: game.id,
          updatedAt: new Date().toISOString(),
        };
        await window.electronMods.savePreset(imported);
        setPresets(prev => [imported, ...prev]);
      }
    } catch (err) {
      console.error("Import failed", err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="mb-8 w-full px-2 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-[2.75rem] font-black text-white mb-2 tracking-tighter drop-shadow-xl">Loadouts</h1>
          <p className="text-(--text-muted) font-medium">
            {loading ? "Loading..." : `${presets.length} preset${presets.length !== 1 ? "s" : ""} for ${game.id}`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-all disabled:opacity-50"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Import
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all bg-(--active-accent) text-black hover:brightness-110 shadow-[0_0_20px_var(--active-accent)]/30"
          >
            <Plus size={14} strokeWidth={3} />
            New Preset
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 rounded-3xl bg-white/5 border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : presets.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          initial="hidden"
          animate="show"
        >
          {presets.map((preset, i) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              index={i}
              onClick={() => setActivePreset(preset)}
              gbData={gbData}
            />
          ))}
        </motion.div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreate && importerPath && (
          <CreatePresetModal
            game={game}
            importerPath={importerPath}
            onClose={() => setShowCreate(false)}
            onSaved={(preset) => {
              handlePresetSaved(preset);
              setShowCreate(false);
            }}
          />
        )}
        {activePreset && importerPath && (
          <PresetDetailModal
            key={activePreset.id}
            preset={activePreset}
            game={game}
            importerPath={importerPath}
            onClose={() => setActivePreset(null)}
            onUpdated={(updated) => {
              handlePresetSaved(updated);
              setActivePreset(updated);
            }}
            onDeleted={handlePresetDeleted}
          />
        )}
      </AnimatePresence>

      {/* No importer path warning */}
      {!loading && !importerPath && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-black uppercase tracking-widest shadow-lg">
          ⚠ Set your mods folder in Settings to apply presets
        </div>
      )}
    </div>
  );
}

function PresetCard({ preset, index, onClick, gbData }) {
  // Find the first mod that has a thumbnail (local path or GB ID in our map)
  const heroThumb = preset.mods.reduce((acc, mod) => {
    if (acc) return acc;
    if (mod.customThumbnail) return { type: "local", src: `file://${mod.customThumbnail}` };
    if (gbData?.[mod.gamebananaId]?.thumbnailUrl) return { type: "remote", src: gbData[mod.gamebananaId].thumbnailUrl };
    return null;
  }, null);

  return (
    <motion.button
      custom={index}
      variants={cardVariants}
      onClick={onClick}
      className="relative rounded-3xl overflow-hidden border border-white/5 hover:border-white/15 transition-all duration-300 text-left group h-52 flex flex-col"
      style={{ background: `linear-gradient(145deg, ${preset.color}15 0%, #0a0a0f 70%)` }}
    >
      {/* Background image */}
      {heroThumb && (
        <div className="absolute inset-0">
          <img 
            src={heroThumb.src} 
            alt="" 
            className="w-full h-full object-cover opacity-10 group-hover:opacity-25 transition-opacity duration-500 scale-105 group-hover:scale-100" 
          />
          <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />
        </div>
      )}

      {/* Accent left border */}
      <div className="absolute left-0 inset-y-0 w-0.5 rounded-r-full transition-all group-hover:w-1" style={{ backgroundColor: preset.color }} />

      {/* Apply hover button */}
      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest" style={{ backgroundColor: preset.color + "dd", color: "#000" }}>
          <Zap size={10} strokeWidth={3} />
          View
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-0 p-5 flex flex-col justify-end">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: preset.color, boxShadow: `0 0 8px ${preset.color}80` }} />
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">{preset.gameId}</span>
        </div>
        <h3 className="text-lg font-black text-white tracking-tight leading-tight mb-1.5">{preset.name}</h3>
        {preset.description && (
          <p className="text-xs text-white/40 mb-3 line-clamp-1">{preset.description}</p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">
              <span className="text-white/70">{preset.mods.length}</span> mods
            </span>
            <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">
              <span className="text-white/70">{new Set(preset.mods.map(m => m.character)).size}</span> chars
            </span>
          </div>
          <ChevronRight size={14} className="text-white/20 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </motion.button>
  );
}

function EmptyState({ onCreateClick }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20">
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Package size={36} className="text-white/20" />
        </div>
        <div
          className="absolute -inset-3 rounded-4xl blur-2xl opacity-20 pointer-events-none"
          style={{ background: "var(--active-accent)" }}
        />
      </div>
      <div className="text-center">
        <h2 className="text-2xl font-black text-white tracking-tight mb-2">No Loadouts Yet</h2>
        <p className="text-(--text-muted) max-w-sm text-sm">
          Create a preset to save and apply groups of mods with a single click.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onCreateClick}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-(--active-accent) text-black hover:brightness-110 transition-all shadow-[0_0_25px_var(--active-accent)]/30"
        >
          <Plus size={14} strokeWidth={3} /> Create First Preset
        </button>
      </div>
    </div>
  );
}
