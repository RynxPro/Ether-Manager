import { useState, useEffect } from "react";
import { X, FolderOpen } from "lucide-react";
import { cn } from "../lib/utils";

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
    alert("Click detected! Sending request to Electron...");
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
      alert("Error: window.electronConfig is missing!");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-drag">
      <div className="bg-(--bg-overlay) border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex h-[400px]">
          {/* Sidebar Tabs */}
          <div className="w-1/3 border-r border-white/5 p-4 flex flex-col gap-1 overflow-y-auto">
            {games.map((game) => (
              <button
                key={game.id}
                onClick={() => setActiveTab(game.id)}
                className={cn(
                  "px-4 py-3 rounded-lg text-left text-sm font-medium transition-colors",
                  activeTab === game.id
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200",
                )}
                style={{
                  borderLeft:
                    activeTab === game.id
                      ? `3px solid ${game.accentColor}`
                      : "3px solid transparent",
                }}
              >
                {game.name}
                <div className="text-xs text-gray-500 font-normal mt-0.5">
                  {game.id} Importer
                </div>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="w-2/3 p-6">
            <h3 className="text-lg font-medium text-white mb-6">
              Importer Folder Path
            </h3>

            <p className="text-sm text-gray-400 mb-2">
              Select the directory of the{" "}
              {games.find((g) => g.id === activeTab)?.name} launcher (should
              contain the `Mods/` folder).
            </p>

            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={config[activeTab] || ""}
                onChange={(e) => handleSaveText(e.target.value)}
                placeholder={`e.g. C:\\Games\\XXMI\\${games.find((g) => g.id === activeTab)?.folderHint}`}
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--active-accent)] transition-colors"
              />
              <button
                onClick={handleChooseFolder}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg flex items-center justify-center text-white transition-colors no-drag"
                title="Browse folder"
                type="button"
              >
                <FolderOpen size={18} />
              </button>
            </div>

            <div className="p-4 bg-black/40 rounded-lg border border-white/5">
              <h4 className="text-sm font-medium text-gray-200 mb-2">
                Current path structure:
              </h4>
              {config[activeTab] ? (
                <ul className="text-xs text-gray-400 space-y-1 font-mono">
                  <li>{config[activeTab]}\</li>
                  <li className="pl-4">Mods\</li>
                  <li className="pl-8 text-[var(--active-accent)]">
                    ModFolder1\
                  </li>
                  <li className="pl-8 text-gray-500">DISABLED_ModFolder2\</li>
                </ul>
              ) : (
                <div className="text-xs text-orange-400 italic">
                  No path configured
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
