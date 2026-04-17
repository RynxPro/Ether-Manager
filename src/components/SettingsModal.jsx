import { useState, useEffect } from "react";
import { X, FolderOpen, EyeOff, Eye, ShieldAlert } from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useAppStore } from "../store/useAppStore";

function normalizeImporterPath(pathValue) {
  return String(pathValue || "")
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

export default function SettingsModal({ onClose, games }) {
  const [config, setConfig] = useState({});
  const [activeTab, setActiveTab] = useState(games[0].id);
  const bumpConfigVersion = useAppStore((state) => state.bumpConfigVersion);
  const showNsfw = useAppStore((state) => state.showNsfw);
  const setShowNsfw = useAppStore((state) => state.setShowNsfw);

  useEffect(() => {
    // Load config from main process
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
        console.error("SettingsModal: Error in chooseFolder:", err);
      }
    } else {
      console.warn("SettingsModal: window.electronConfig is not defined!");
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

  const handleToggleNsfw = async () => {
    const nextVal = !showNsfw;
    setShowNsfw(nextVal);
    if (window.electronConfig) {
      await window.electronConfig.setConfig({ ...config, showNsfw: nextVal });
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
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-drag">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          role="dialog"
          aria-modal="true"
          className="relative bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden h-[600px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-10 py-6 border-b border-white/10 relative z-10 bg-[#050505]">
            <h2 className="text-[11px] font-black tracking-[0.2em] uppercase text-white">Settings</h2>
            <Button
              variant="ghost"
              onClick={onClose}
              icon={X}
              className="text-text-muted hover:text-white hover:bg-white/5 w-8 h-8 p-0 no-drag rounded-xl"
              title="Close settings"
            />
          </div>

          <div className="flex flex-1 overflow-hidden relative z-10">
            {/* Sidebar Tabs */}
            <div className="w-64 border-r border-white/10 p-6 flex flex-col gap-1 overflow-y-auto bg-[#050505]">
              <p className="text-[9px] uppercase font-black tracking-[0.2em] text-white/30 mb-2 px-2">Workspaces</p>
              {games.map((game) => (
                <button
                  key={game.id}
                  onClick={() => setActiveTab(game.id)}
                  className={cn(
                    "group px-4 py-3 rounded-xl text-left transition-all duration-300 relative",
                    activeTab === game.id
                      ? "bg-white/5 text-white"
                      : "text-text-muted hover:bg-white/5 hover:text-white",
                  )}
                >
                  {activeTab === game.id && (
                    <motion.div 
                      layoutId="activeTabInd"
                      className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" 
                    />
                  )}
                  <span className="block text-[11px] font-bold uppercase tracking-widest leading-none">{game.name}</span>
                  <span className="block text-[9px] font-medium opacity-50 mt-1">{game.id.toUpperCase()}</span>
                </button>
              ))}

              <div className="my-3 border-t border-white/6" />
              <p className="text-[9px] uppercase font-black tracking-[0.2em] text-white/30 mb-2 px-2">Preferences</p>
              <button
                onClick={() => setActiveTab("content")}
                className={cn(
                  "group px-4 py-3 rounded-xl text-left transition-all duration-300 relative",
                  activeTab === "content"
                    ? "bg-white/5 text-white"
                    : "text-text-muted hover:bg-white/5 hover:text-white",
                )}
              >
                {activeTab === "content" && (
                  <motion.div layoutId="activeTabInd" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />
                )}
                <span className="block text-[11px] font-bold uppercase tracking-widest leading-none">Content</span>
                <span className="block text-[9px] font-medium opacity-50 mt-1">Filter settings</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-10 overflow-y-auto bg-[#0a0a0a]">
              <AnimatePresence mode="wait">
                {activeTab === "content" ? (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <h3 className="text-[12px] uppercase tracking-widest font-black text-white">Content Filters</h3>
                    </div>

                    <p className="mb-8 text-sm leading-6 text-white/55">
                      Control what content is visible in the Browse tab.
                      Mods flagged as mature on GameBanana will be affected by these settings.
                    </p>

                    {/* NSFW Toggle Row */}
                    <div className="rounded-xl border border-white/10 bg-[#050505] p-5">
                      <div className="flex items-center justify-between gap-6">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
                            showNsfw
                              ? "border-red-500/30 bg-red-500/10 text-red-400"
                              : "border-white/10 bg-white/5 text-text-muted"
                          )}>
                            {showNsfw ? <Eye size={16} /> : <EyeOff size={16} />}
                          </div>
                          <div>
                            <p className="text-[12px] font-bold text-white">Show Mature Content</p>
                            <p className="mt-1 text-[11px] text-white/40 leading-relaxed">
                              When off, NSFW mods are blurred in the browse grid.
                              They can still be revealed by clicking them.
                            </p>
                          </div>
                        </div>

                        {/* Toggle Switch */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={showNsfw}
                          onClick={handleToggleNsfw}
                          className={cn(
                            "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-all duration-300 focus:outline-none",
                            showNsfw
                              ? "border-red-500/60 bg-red-500/20"
                              : "border-white/10 bg-white/5"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none inline-block h-5 w-5 rounded-full shadow-lg transition-transform duration-300",
                              showNsfw
                                ? "translate-x-5 bg-red-400"
                                : "translate-x-0 bg-white/30"
                            )}
                          />
                        </button>
                      </div>

                      {showNsfw && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 overflow-hidden"
                        >
                          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3">
                            <ShieldAlert size={14} className="shrink-0 text-red-400" />
                            <p className="text-[11px] text-red-300/80">
                              Mature content is now visible. This setting is saved across restarts.
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                  <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-[12px] uppercase tracking-widest font-black text-white">
                      Mods Folder
                    </h3>
                  </div>

                  <p className="mb-6 text-sm leading-6 text-white/55">
                    Choose the folder that contains the <code className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">Mods/</code> directory for {activeGame?.name}.
                  </p>

                  <div className="flex gap-3 mb-8">
                    <div className="flex-1 relative group">
                      <Input
                        value={config[activeTab] || ""}
                        onChange={(e) => handleSaveText(e.target.value)}
                        placeholder={`e.g. C:\\Games\\${activeGame?.folderHint}`}
                        className="font-mono bg-[#050505] border-white/10 focus:border-white/30 rounded-xl"
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={handleChooseFolder}
                      icon={FolderOpen}
                      className="no-drag bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white rounded-xl"
                      title="Browse folder"
                    />
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#050505] p-6 shadow-inner">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <div className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
                        {activeGame?.id}
                      </div>
                      <div className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]",
                        config[activeTab]
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-orange-500/20 bg-orange-500/10 text-orange-400"
                      )}>
                        {config[activeTab] ? "Configured" : "Not Set"}
                      </div>
                    </div>

                    {sharedGames.length > 0 && (
                      <div className="mb-4 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                        This path is also used by {sharedGames.map((game) => game.name).join(", ")}.
                        Legacy mods without game metadata may be hidden or scoped to the wrong game until they are re-tagged.
                      </div>
                    )}

                    {config[activeTab] ? (
                      <div className="space-y-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                            Current Path
                          </div>
                          <div className="mt-2 rounded-xl border border-white/6 bg-background px-4 py-3 font-mono text-xs text-text-secondary break-all">
                            {config[activeTab]}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                            Expected Mods Folder
                          </div>
                          <div className="mt-2 rounded-xl border border-white/6 bg-background px-4 py-3 font-mono text-xs text-text-secondary break-all">
                            {config[activeTab]}{config[activeTab].endsWith("\\") || config[activeTab].endsWith("/") ? "" : "/"}Mods
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
                        No path configured for this workspace.
                      </div>
                    )}
                  </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
