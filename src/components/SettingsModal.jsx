import { useState, useEffect } from "react";
import { X, FolderOpen } from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useAppStore } from "../store/useAppStore";

export default function SettingsModal({ onClose, games }) {
  const [config, setConfig] = useState({});
  const [activeTab, setActiveTab] = useState(games[0].id);
  const bumpConfigVersion = useAppStore((state) => state.bumpConfigVersion);

  useEffect(() => {
    // Load config from main process
    if (window.electronConfig) {
      window.electronConfig.getConfig().then((data) => {
        setConfig(data || {});
      });
    }
  }, []);

  const handleChooseFolder = async () => {
    console.log(
      "SettingsModal: handleChooseFolder called. activeTab:",
      activeTab,
    );
    if (window.electronConfig) {
      console.log(
        "SettingsModal: calling window.electronConfig.chooseFolder()",
      );
      try {
        const folderPath = await window.electronConfig.chooseFolder();
        console.log("SettingsModal: received folderPath:", folderPath);
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

  const activeGame = games.find((g) => g.id === activeTab);

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
          className="relative bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden h-[600px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-10 py-6 border-b border-white/10 relative z-10 bg-[#050505]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)]" />
              <h2 className="text-[11px] font-black tracking-[0.3em] uppercase text-white">APP SETTINGS</h2>
            </div>
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
            </div>

            {/* Content Area */}
            <div className="flex-1 p-10 overflow-y-auto bg-[#0a0a0a]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-[12px] uppercase tracking-widest font-black text-white">
                      Importer Path Configuration
                    </h3>
                  </div>

                  <p className="text-xs text-white/50 leading-relaxed mb-6 font-medium">
                    Select the root directory of the <span className="text-white font-bold">{activeGame?.name}</span> launcher. 
                    This should be the parent folder containing the <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm font-mono text-xs">Mods/</code> directory.
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

                  <div className="p-6 bg-[#050505] rounded-xl border border-white/10 relative overflow-hidden shadow-inner">
                    <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                       Console Output Diagram
                    </h4>
                    {config[activeTab] ? (
                      <ul className="text-xs font-mono space-y-2 relative z-10">
                        <li className="text-text-secondary flex items-center gap-2">
                          <span className="opacity-40 text-text-primary leading-none">DIR</span> {config[activeTab]}\
                        </li>
                        <li className="pl-6 text-text-muted border-l border-white/10 ml-2 py-1">
                          <span className="opacity-40 leading-none">DIR</span> Mods\
                        </li>
                        <li className="pl-12 text-primary flex items-center gap-2 border-l border-white/10 ml-2 py-1">
                          <span className="w-1 h-1 rounded-full bg-primary shadow-primary/20" /> Active_Mod_v1\
                        </li>
                        <li className="pl-12 text-white/20 italic border-l border-white/10 ml-2 pt-1">
                          DISABLED_Old_Mod\
                        </li>
                      </ul>
                    ) : (
                      <div className="text-xs text-orange-500 p-4 border border-orange-500/30 rounded-xl bg-orange-500/10 flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_5px_var(--color-orange-500)]/40" />
                        No path configured for this client
                      </div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
