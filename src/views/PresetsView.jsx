import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Plus, Upload, Package, ChevronRight } from "lucide-react";
import CreatePresetModal from "../components/CreatePresetModal";
import PresetDetailModal from "../components/PresetDetailModal";
import { Button } from "../components/ui/Button";
import { useAppStore } from "../store/useAppStore";
import PageHeader from "../components/layout/PageHeader";
import { InteractiveCard } from "../components/ui/InteractiveCard";
import {
  StateGridSkeleton,
  StatePanel,
  StatusBanner,
} from "../components/ui/StatePanel";

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] } }),
};

export default function PresetsView() {
  const game = useAppStore((state) => state.activeGame);
  const configVersion = useAppStore((state) => state.configVersion);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importerPath, setImporterPath] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [importing, setImporting] = useState(false);
  const [gbData, setGbData] = useState({});
  const [importFeedback, setImportFeedback] = useState(null);

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
  }, [configVersion, loadPresets]);

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
    setImportFeedback(null);
    try {
      const result = await window.electronMods.importPreset();
      if (result.success && result.preset) {
        const importedGameId = result.preset.gameId || null;
        if (importedGameId && importedGameId !== game.id) {
          setImportFeedback({
            type: "error",
            message: `This preset targets ${importedGameId}, but you are currently on ${game.id}. Switch games before importing it.`,
          });
          return;
        }

        if (!Array.isArray(result.preset.mods)) {
          setImportFeedback({
            type: "error",
            message: "The selected preset file is invalid. Missing mods data.",
          });
          return;
        }

        // Assign a new ID while preserving the preset's actual game scope.
        const imported = {
          ...result.preset,
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          gameId: importedGameId || game.id,
          updatedAt: new Date().toISOString(),
        };
        const saveResult = await window.electronMods.savePreset(imported);
        if (!saveResult.success) {
          throw new Error(saveResult.error || "Failed to save imported preset.");
        }
        setPresets(prev => [imported, ...prev]);
        setImportFeedback({
          type: "success",
          message: `Imported "${imported.name}" successfully.`,
        });
      }
    } catch (err) {
      console.error("Import failed", err);
      setImportFeedback({
        type: "error",
        message: err.message || "Failed to import preset.",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        eyebrow="Presets"
        title="Loadouts"
        description={
          loading
            ? "Loading your saved setups."
            : `${presets.length} preset${presets.length !== 1 ? "s" : ""} available for ${game.name}.`
        }
        actions={
          <>
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
          </>
        }
      />

      {importFeedback && (
        <StatusBanner
          tone={importFeedback.type === "error" ? "danger" : "success"}
          className="mb-6 mx-2"
        >
          {importFeedback.message}
        </StatusBanner>
      )}

      {/* Content */}
      {loading ? (
        <StateGridSkeleton
          count={6}
          columnsClassName="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          itemClassName="h-52"
        />
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
  // Get first 4 thumbnails for the grid
  const thumbs = preset.mods.slice(0, 4).map(mod => {
    if (mod.customThumbnail) return `file://${mod.customThumbnail}`;
    if (gbData?.[mod.gamebananaId]?.thumbnailUrl) return gbData[mod.gamebananaId].thumbnailUrl;
    return null;
  });

  return (
    <InteractiveCard
      custom={index}
      variants={cardVariants}
      onClick={onClick}
      className="cursor-pointer"
    >
      {/* Thumbnail Area (Matches GbModCard h-44) */}
      <div className="relative h-44 w-full bg-background overflow-hidden shrink-0 grid grid-cols-2 gap-px border-b border-border">
        {thumbs.length > 0 ? (
          thumbs.map((src, i) => (
            <div key={i} className="relative bg-surface overflow-hidden">
              {src ? (
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/5">
                  <Package size={16} className="text-white/10" />
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="col-span-2 row-span-2 flex items-center justify-center bg-surface">
            <Package size={40} className="text-white/5" />
          </div>
        )}
        
        {/* Preset Color Badge */}
        <div className="absolute top-4 right-4 z-10">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase tracking-widest text-white shadow-xl">
             <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: preset.color, boxShadow: `0 0 10px ${preset.color}` }} />
             Preset
          </div>
        </div>
        
        {/* Subtle overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent pointer-events-none" />
      </div>

      {/* Info Area (Matches GbModCard min-h-36) */}
      <div className="flex flex-col flex-1 p-5 bg-surface min-h-36 relative z-10">
        <div className="flex items-center gap-2 mb-2 opacity-30 group-hover:opacity-100 transition-opacity">
           <div className="w-1 h-3 rounded-full shadow-[0_0_5px_var(--color-primary)]" style={{ backgroundColor: preset.color || 'var(--color-primary)' }} />
           <span className="text-[8px] font-black uppercase tracking-[0.2em] text-text-primary">PRESET PACKAGE</span>
        </div>

        <h3 className="text-base font-bold text-text-primary line-clamp-2 leading-tight mb-4 transition-colors group-hover:text-primary tracking-tight">
          {preset.name}
        </h3>
        
        <div className="flex items-center gap-6 mb-6">
           <div className="flex flex-col">
             <span className="text-white font-black text-sm leading-none">{preset.mods.length}</span>
             <span className="text-[9px] uppercase font-black tracking-widest text-text-secondary mt-1 opacity-60">Mods</span>
           </div>
           <div className="flex flex-col">
             <span className="text-white font-black text-sm leading-none">{new Set(preset.mods.map(m => m.character)).size}</span>
             <span className="text-[9px] uppercase font-black tracking-widest text-text-secondary mt-1 opacity-60">Chars</span>
           </div>
        </div>

        {/* Action Button (Matches card style) */}
        <div className="mt-auto">
          <div className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-background border border-border text-[10px] font-black text-text-muted uppercase tracking-[0.2em] group-hover:border-primary/30 group-hover:text-primary transition-all duration-300">
            View Details <ChevronRight size={14} strokeWidth={4} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
      
      {/* External Bloom Ring */}
      <div className="absolute inset-0 rounded-2xl border border-white/0 group-hover:border-primary/20 transition-all pointer-events-none z-20" />
      
      {/* Optimized Shadow Layer */}
      <div className="absolute inset-0 rounded-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5),0_0_15px_rgba(255,255,255,0.05)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[-1]" />
    </InteractiveCard>
  );
}

function EmptyState({ onCreateClick }) {
  return (
    <StatePanel
      icon={Package}
      title="No Loadouts Yet"
      message="Create a preset to save and apply groups of mods with a single click."
      action={(
        <Button onClick={onCreateClick} icon={Plus}>
          Create First Preset
        </Button>
      )}
      className="py-20"
    />
  );
}
