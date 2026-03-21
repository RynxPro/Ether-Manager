import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Plus, Upload, Package, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { getAllCharacterNames } from "../lib/portraits";
import PresetDetailModal from "../components/PresetDetailModal";
import CreatePresetModal from "../components/CreatePresetModal";
import { Button } from "../components/ui/Button";

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

  // Reset modal state when switching games
  useEffect(() => {
    setShowCreate(false);
    setActivePreset(null);
  }, [game.id]);

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
          <Button
            variant="secondary"
            onClick={handleImport}
            disabled={importing}
            icon={Upload}
          >
            Import
          </Button>
          <Button
            variant="primary"
            onClick={() => setShowCreate(true)}
            icon={Plus}
          >
            New Preset
          </Button>
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
  // Get first 4 thumbnails for the strip
  const thumbs = preset.mods.slice(0, 4).map(mod => {
    if (mod.customThumbnail) return `file://${mod.customThumbnail}`;
    if (gbData?.[mod.gamebananaId]?.thumbnailUrl) return gbData[mod.gamebananaId].thumbnailUrl;
    return null;
  }).filter(Boolean);

  const heroThumb = thumbs[0];

  return (
    <motion.button
      custom={index}
      variants={cardVariants}
      onClick={onClick}
      className="relative rounded-4xl overflow-hidden border border-border hover:border-neutral transition-all duration-500 text-left group h-64 flex flex-col shadow-2xl bg-card"
    >
      {/* Background Hero Image */}
      {heroThumb && (
        <div className="absolute inset-0">
          <img 
            src={heroThumb} 
            alt="" 
            className="w-full h-full object-cover opacity-10 group-hover:opacity-30 transition-all duration-700 blur-[2px] group-hover:blur-0 scale-110 group-hover:scale-100" 
          />
          <div className="absolute inset-0 bg-linear-to-t from-card via-card/60 to-transparent" />
        </div>
      )}

      {/* Hover Radiant Glow */}
      <div 
        className="absolute -inset-20 opacity-0 group-hover:opacity-10 transition-opacity duration-700 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 50%, ${preset.color}, transparent 70%)` }}
      />

      {/* Top Section: Thumbnail Strip */}
      <div className="relative p-6 flex-1">
        <div className="flex -space-x-3 mb-4">
          {thumbs.map((src, i) => (
            <motion.div
              key={i}
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="w-12 h-12 rounded-xl border-2 border-card overflow-hidden shadow-lg relative z-10"
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </motion.div>
          ))}
          {preset.mods.length > thumbs.length && (
            <div className="w-12 h-12 rounded-xl border-2 border-card bg-white/5 backdrop-blur-md flex items-center justify-center text-[10px] font-black text-white/40 shadow-lg relative z-0">
              +{preset.mods.length - thumbs.length}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Info Card */}
      <div className="relative p-6 bg-linear-to-t from-black via-black/40 to-transparent backdrop-blur-xs">
        {/* Accent strip */}
        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: preset.color }} />
        
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.color, boxShadow: `0 0 10px ${preset.color}` }} />
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">{preset.gameId}</span>
        </div>
        
        <h3 className="text-xl font-black text-white tracking-tight leading-tight group-hover:text-(--active-accent) transition-colors duration-300">
          {preset.name}
        </h3>
        
        <div className="mt-4 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-white font-black text-xs leading-none">{preset.mods.length}</span>
                <span className="text-[8px] uppercase font-black tracking-widest text-white/20 mt-1">Mods</span>
              </div>
              <div className="flex flex-col">
                <span className="text-white font-black text-xs leading-none">{new Set(preset.mods.map(m => m.character)).size}</span>
                <span className="text-[8px] uppercase font-black tracking-widest text-white/20 mt-1">Chars</span>
              </div>
           </div>
           
           <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/20 group-hover:text-black group-hover:bg-(--active-accent) group-hover:border-(--active-accent) transition-all duration-500 group-hover:rotate-45">
             <ChevronRight size={16} strokeWidth={3} />
           </div>
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
        <Button onClick={onCreateClick} icon={Plus}>
          Create First Preset
        </Button>
      </div>
    </div>
  );
}
