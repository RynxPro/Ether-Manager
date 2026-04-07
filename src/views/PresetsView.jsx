import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Plus, Upload, Package, ChevronRight, Layers3 } from "lucide-react";
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
import { cn } from "../lib/utils";

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
  const totalModsAcrossPresets = presets.reduce(
    (sum, preset) => sum + preset.mods.length,
    0,
  );
  const totalCharactersAcrossPresets = new Set(
    presets.flatMap((preset) => preset.mods.map((mod) => mod.character)),
  ).size;

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
            ? "Loading loadouts."
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
          className="mb-4 mx-2"
        >
          {importFeedback.message}
        </StatusBanner>
      )}

      {!loading && (
        <section className="ui-panel mb-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <SummaryPill label="Loadouts" value={presets.length} />
            <SummaryPill label="Saved Mods" value={totalModsAcrossPresets} />
            <SummaryPill label="Characters" value={totalCharactersAcrossPresets} />
            <SummaryPill
              label="Status"
              value={importerPath ? "Ready" : "Needs Mods Path"}
              tone={importerPath ? "primary" : "warning"}
            />
          </div>
        </section>
      )}

      {/* Content */}
      {loading ? (
        <StateGridSkeleton
          count={6}
          columnsClassName="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5 pb-8"
          itemClassName="aspect-4/3"
        />
      ) : presets.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : (
        <motion.div
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5 pb-8"
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
        <StatusBanner tone="danger" className="mt-6">
          Set your mods folder in Settings before applying presets.
        </StatusBanner>
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
      className="cursor-pointer flex flex-col w-full relative group overflow-hidden rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/30 transition-colors"
    >
      <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden bg-background border-b border-border">
        {thumbs.length > 0 ? (
          <div className={cn("absolute inset-0 grid gap-px", thumbs.length === 1 ? "grid-cols-1" : thumbs.length === 2 ? "grid-cols-2" : thumbs.length === 3 ? "grid-cols-2 grid-rows-2" : "grid-cols-2 grid-rows-2")}>
            {thumbs.map((src, i) => (
              <div key={i} className={cn("relative bg-surface overflow-hidden", thumbs.length === 3 && i === 0 ? "row-span-2 col-span-2 sm:col-span-1" : "")}>
                {src ? (
                  <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/5">
                    <Package size={16} className="text-white/10" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface">
            <Package size={40} className="text-white/5" />
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-5 relative z-10 w-full">
        <h3 className="text-sm font-bold text-text-primary line-clamp-2 leading-tight transition-colors group-hover:text-primary tracking-tight min-h-10">
          {preset.name}
        </h3>

        {preset.description && (
          <p className="mb-4 line-clamp-2 text-xs leading-5 text-text-secondary">
            {preset.description}
          </p>
        )}
        
        <div className="mt-auto mb-4 flex flex-wrap items-center gap-2">
           <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted">
             {preset.mods.length} Mods
           </span>
           <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
             {new Set(preset.mods.map(m => m.character)).size} Characters
           </span>
        </div>

        <div className="mt-auto pt-4 border-t border-white/5">
          <div className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group/btn bg-background border border-border text-text-muted cursor-pointer hover:border-primary/50 hover:text-primary shadow-sm hover:shadow-[0_0_15px_var(--color-primary)]/20">
            Open <ChevronRight size={12} strokeWidth={4} className="group-hover/btn:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </InteractiveCard>
  );
}

function SummaryPill({ label, value, tone = "neutral" }) {
  const toneClass =
    tone === "primary"
      ? "border-primary/20 bg-primary/10 text-primary"
      : tone === "warning"
        ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
        : "border-border bg-background text-text-muted";

  return (
    <div className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${toneClass}`}>
      {label}: <span className="text-text-primary">{value}</span>
    </div>
  );
}

function EmptyState({ onCreateClick }) {
  return (
    <StatePanel
      icon={Package}
      title="No Loadouts Yet"
      message="Create a loadout to save a set of mods."
      action={(
        <Button onClick={onCreateClick} icon={Plus}>
          Create Loadout
        </Button>
      )}
      className="py-20"
    />
  );
}
