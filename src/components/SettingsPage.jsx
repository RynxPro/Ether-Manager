import { useState, useEffect } from "react";
import { FolderOpen, EyeOff, Eye, ShieldAlert, EyeClosed } from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useAppStore } from "../store/useAppStore";
import PageHeader from "./layout/PageHeader";

function normalizeImporterPath(pathValue) {
  return String(pathValue || "")
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

export default function SettingsPage({ games }) {
  const popPage = useAppStore(state => state.popPage);
  const [config, setConfig] = useState({});
  const [activeTab, setActiveTab] = useState(games[0]?.id || "content");
  
  const bumpConfigVersion = useAppStore((state) => state.bumpConfigVersion);
  const nsfwMode = useAppStore((state) => state.nsfwMode);
  const setNsfwMode = useAppStore((state) => state.setNsfwMode);

  useEffect(() => {
    if (window.electronConfig) {
      window.electronConfig.getConfig().then((data) => {
        setConfig(data || {});
      });
    }
  }, []);

  const handleChooseFolder = async () => {
    if (window.electronConfig) {
      try {
        const folderPath = await window.electronConfig.chooseFolder();
        if (folderPath) {
          const newConfig = { ...config, [activeTab]: folderPath };
          setConfig(newConfig);
          const success = await window.electronConfig.setConfig(newConfig);
          if (success) bumpConfigVersion();
        }
      } catch (err) {
        console.error("SettingsPage: Error in chooseFolder:", err);
      }
    }
  };

  const handleSaveText = (val) => {
    const newConfig = { ...config, [activeTab]: val };
    setConfig(newConfig);
    if (window.electronConfig) {
      window.electronConfig.setConfig(newConfig).then((success) => {
        if (success) bumpConfigVersion();
      });
    }
  };

  const handleSetNsfwMode = async (mode) => {
    setNsfwMode(mode);
    if (window.electronConfig) {
      await window.electronConfig.setConfig({ ...config, nsfwMode: mode });
    }
  };

  const activeGame = games.find((g) => g.id === activeTab);
  const activeImporterPath = config[activeTab] || "";
  const normalizedActiveImporterPath = normalizeImporterPath(activeImporterPath);
  const sharedGames = normalizedActiveImporterPath
    ? games.filter(
        (game) =>
          game.id !== activeTab &&
          normalizeImporterPath(config[game.id]) === normalizedActiveImporterPath,
      )
    : [];

  return (
    <div className="w-full h-full bg-background overflow-y-auto custom-scrollbar flex flex-col pt-8 px-8">
      {/* Header */}

      <PageHeader
        title="App Settings"
        description="Configure workspaces and application preferences."
      />

      {/* Main Content Area (2-column layout) */}
      <div className="w-full flex flex-col lg:flex-row gap-12 mt-4 pb-20">
        
        {/* Left Sidebar (Tabs) */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-1">
          <p className="text-[10px] uppercase font-black tracking-[0.2em] text-text-muted mb-3 px-2">Workspaces</p>
          {games.map((game) => (
            <button
              key={game.id}
              onClick={() => setActiveTab(game.id)}
              className={cn(
                "group px-4 py-3 rounded-xl text-left transition-all duration-300 relative",
                activeTab === game.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-text-secondary hover:bg-white/5 hover:text-white border border-transparent",
              )}
            >
              {activeTab === game.id && (
                <motion.div 
                  layoutId="activeSettingsTab"
                  className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" 
                />
              )}
              <span className="block text-[12px] font-bold uppercase tracking-widest leading-none">{game.name}</span>
              <span className="block text-[10px] font-medium opacity-50 mt-1">{game.id.toUpperCase()}</span>
            </button>
          ))}

          <div className="my-6 border-t border-white/5" />
          <p className="text-[10px] uppercase font-black tracking-[0.2em] text-text-muted mb-3 px-2">Preferences</p>
          <button
            onClick={() => setActiveTab("content")}
            className={cn(
              "group px-4 py-3 rounded-xl text-left transition-all duration-300 relative",
              activeTab === "content"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-text-secondary hover:bg-white/5 hover:text-white border border-transparent",
            )}
          >
            {activeTab === "content" && (
              <motion.div layoutId="activeSettingsTab" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />
            )}
            <span className="block text-[12px] font-bold uppercase tracking-widest leading-none">Content Filtering</span>
            <span className="block text-[10px] font-medium opacity-50 mt-1">NSFW and mature content</span>
          </button>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {activeTab === "content" ? (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                <div>
                  <h3 className="text-xl font-black text-white mb-2">Content Filtering</h3>
                  <p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
                    Control what content is visible in the Browse tab. Mods flagged as mature on GameBanana will be affected by these settings.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-black/40 backdrop-blur-xl p-8 flex flex-col gap-6 shadow-xl">
                  <div>
                    <p className="text-sm font-bold text-white mb-1">Mature Content Display</p>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Choose how mods flagged as NSFW on GameBanana are handled in the browse grid.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {[
                      {
                        mode: "blur",
                        icon: EyeOff,
                        label: "Blur Thumbnail",
                        desc: "Thumbnails are blurred. Click a card to reveal individually.",
                        color: "amber",
                      },
                      {
                        mode: "hide",
                        icon: EyeClosed,
                        label: "Completely Hide",
                        desc: "NSFW mods are completely removed from browse results.",
                        color: "red",
                      },
                      {
                        mode: "show",
                        icon: Eye,
                        label: "Show Normally",
                        desc: "All mods display normally with no filtering.",
                        color: "green",
                      },
                    ].map(({ mode, icon: Icon, label, desc, color }) => {
                      const isActive = nsfwMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleSetNsfwMode(mode)}
                          className={cn(
                            "flex items-center gap-5 rounded-2xl border px-5 py-4 text-left transition-all",
                            isActive
                              ? color === "amber"
                                ? "border-amber-500/30 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                                : color === "red"
                                  ? "border-red-500/30 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
                                  : "border-green-500/30 bg-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.1)]"
                              : "border-white/5 bg-black/20 hover:border-white/10 hover:bg-black/40"
                          )}
                        >
                          <div className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors",
                            isActive
                              ? color === "amber"
                                ? "border-amber-500/30 bg-amber-500/20 text-amber-400"
                                : color === "red"
                                  ? "border-red-500/30 bg-red-500/20 text-red-400"
                                  : "border-green-500/30 bg-green-500/20 text-green-400"
                              : "border-white/10 bg-white/5 text-text-muted"
                          )}>
                            <Icon size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm font-bold transition-colors mb-1",
                              isActive ? "text-white" : "text-text-secondary"
                            )}>{label}</p>
                            <p className="text-xs text-text-muted leading-relaxed">{desc}</p>
                          </div>
                          <div className={cn(
                            "h-5 w-5 shrink-0 rounded-full border-2 transition-all",
                            isActive
                              ? color === "amber"
                                ? "border-amber-400 bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                                : color === "red"
                                  ? "border-red-400 bg-red-400 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                                  : "border-green-400 bg-green-400 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                              : "border-white/10"
                          )} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            ) : activeGame ? (
              <motion.div
                key={activeGame.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                <div>
                  <h3 className="text-xl font-black text-white mb-2">{activeGame.name} Workspace</h3>
                  <p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
                    Configure the paths for your Mod Importer for {activeGame.name}. A valid installation path is required to download and install mods.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-black/40 backdrop-blur-xl p-8 flex flex-col gap-6 shadow-xl">
                  {/* Warning if no path */}
                  {!activeImporterPath && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 flex items-start gap-4">
                      <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-bold text-amber-500 mb-1">Missing Importer Path</p>
                        <p className="text-xs text-amber-500/70 leading-relaxed">
                          You must select the folder where the Mod Importer is installed before you can install mods for this game.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <label className="text-sm font-bold text-white">Mod Importer Path</label>
                    <div className="flex gap-3">
                      <Input
                        value={activeImporterPath}
                        onChange={(e) => handleSaveText(e.target.value)}
                        placeholder="e.g. C:\Games\ModImporter"
                        className="flex-1 bg-black/50 border-white/10 focus:border-primary/50"
                      />
                      <Button onClick={handleChooseFolder} variant="secondary" className="gap-2 px-6">
                        <FolderOpen size={16} />
                        Browse
                      </Button>
                    </div>
                    <p className="text-xs text-text-muted">
                      This directory should contain the `3dmigoto` or generic mod importer executable.
                    </p>
                  </div>

                  {sharedGames.length > 0 && (
                    <div className="mt-4 pt-6 border-t border-white/5">
                      <p className="text-xs font-bold text-text-secondary mb-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Also used by:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {sharedGames.map((g) => (
                          <span key={g.id} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-text-secondary">
                            {g.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
