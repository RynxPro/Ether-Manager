import { useState, useEffect } from "react";
import { X, FolderOpen } from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function SettingsModal({ onClose, games }) {
  const [config, setConfig] = useState({});
  const [activeTab, setActiveTab] = useState(games[0].id);

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
          window.electronConfig.setConfig(newConfig);
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
      window.electronConfig.setConfig(newConfig);
    }
  };

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
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative bg-(--bg-overlay) border border-white/5 rounded-4xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden h-[600px]"
        >
          {/* Cinematic Background Glow */}
          <div 
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 30% -20%, var(--active-accent) 0%, transparent 60%)`
            }}
          />

          {/* Header */}
          <div className="flex items-center justify-between px-10 py-6 border-b border-white/5 relative z-10">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tighter">SETTINGS</h2>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.3em] mt-1">Configuration & Paths</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-2xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden relative z-10">
            {/* Sidebar Tabs */}
            <div className="w-64 border-r border-white/5 p-6 flex flex-col gap-2 overflow-y-auto bg-black/20 backdrop-blur-md">
              {games.map((game) => (
                <button
                  key={game.id}
                  onClick={() => setActiveTab(game.id)}
                  className={cn(
                    "group px-4 py-3 rounded-2xl text-left transition-all duration-300 relative overflow-hidden",
                    activeTab === game.id
                      ? "bg-white/5 text-white"
                      : "text-white/30 hover:bg-white/2 hover:text-white/60",
                  )}
                >
                  {activeTab === game.id && (
                    <motion.div 
                      layoutId="activeTabGlow"
                      className="absolute inset-y-2 left-0 w-1 rounded-full bg-(--active-accent) shadow-[0_0_10px_var(--active-accent)]" 
                    />
                  )}
                  <span className="block text-sm font-black uppercase tracking-widest">{game.name}</span>
                  <span className="block text-[10px] opacity-40 font-bold mt-0.5">{game.id.toUpperCase()} Client</span>
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 p-10 overflow-y-auto bg-linear-to-b from-transparent to-black/20">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-1 h-6 bg-(--active-accent) rounded-full shadow-[0_0_8px_var(--active-accent)]" />
                    <h3 className="text-xl font-black text-white tracking-tight">
                      Importer Path
                    </h3>
                  </div>

                  <p className="text-sm text-white/50 leading-relaxed mb-6 font-medium">
                    Select the directory of the{" "}
                    <span className="text-white font-bold">{games.find((g) => g.id === activeTab)?.name}</span> launcher. 
                    This should be the parent folder containing the <code className="text-(--active-accent) bg-(--active-accent)/10 px-1.5 py-0.5 rounded-sm font-mono text-xs">Mods/</code> directory.
                  </p>

                  <div className="flex gap-3 mb-8">
                    <div className="flex-1 relative group">
                      <input
                        type="text"
                        value={config[activeTab] || ""}
                        onChange={(e) => handleSaveText(e.target.value)}
                        placeholder={`e.g. C:\\Games\\${games.find((g) => g.id === activeTab)?.folderHint}`}
                        className="w-full bg-white/2 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-(--active-accent)/50 focus:ring-4 focus:ring-(--active-accent)/5 transition-all outline-none font-mono"
                      />
                    </div>
                    <button
                      onClick={handleChooseFolder}
                      className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 no-drag group"
                      title="Browse folder"
                      type="button"
                    >
                      <FolderOpen size={20} className="group-hover:text-(--active-accent) transition-colors" />
                    </button>
                  </div>

                  <div className="p-6 bg-black/40 rounded-3xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-radial-at-br from-(--active-accent)/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <h4 className="text-xs font-black text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                       Structure Preview
                    </h4>
                    {config[activeTab] ? (
                      <ul className="text-xs font-mono space-y-2 relative z-10">
                        <li className="text-white/60 flex items-center gap-2">
                          <span className="opacity-20 text-white leading-none">DIR</span> {config[activeTab]}\
                        </li>
                        <li className="pl-6 text-white/40 border-l border-white/10 ml-2 py-1">
                          <span className="opacity-20 leading-none">DIR</span> Mods\
                        </li>
                        <li className="pl-12 text-(--active-accent) flex items-center gap-2 border-l border-white/10 ml-2 py-1">
                          <span className="w-1 h-1 rounded-full bg-(--active-accent) shadow-[0_0_5px_var(--active-accent)]" /> Active_Mod_v1\
                        </li>
                        <li className="pl-12 text-white/20 italic border-l border-white/10 ml-2 pt-1">
                          DISABLED_Old_Mod\
                        </li>
                      </ul>
                    ) : (
                      <div className="text-xs text-(--color-warning) p-4 border border-(--color-warning)/30 rounded-xl bg-(--color-warning)/10 flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-(--color-warning) animate-pulse shadow-[0_0_5px_var(--color-warning)]" />
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
