import { Zap, Search, Settings } from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";
import SettingsModal from "./SettingsModal";

export default function Navbar({ games, activeGame, onSelectGame, activeView, onSelectView }) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <nav className="w-full h-[60px] shrink-0 bg-[#0d0d15]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 pl-20 z-20 titlebar-drag sticky top-0">
        {/* Logo */}
        <div className="flex items-center gap-2 w-48 no-drag">
          <Zap size={20} className="text-white fill-white" />
          <span className="text-white font-bold tracking-widest text-lg">
            AETHER
          </span>
        </div>

        {/* Game Tabs */}
        <div className="flex items-center gap-2 no-drag">
          {games.map((game) => {
            const isActive = activeGame === game.id;
            return (
              <button
                key={game.id}
                onClick={() => onSelectGame(game.id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300",
                  isActive
                    ? "nav-pill-active"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5",
                )}
              >
                [{game.id}]
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 w-48 no-drag">
          {/* My Mods / Browse toggle */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-0.5">
            <button
              onClick={() => onSelectView("mods")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200",
                activeView === "mods"
                  ? "bg-[var(--active-accent)] text-black"
                  : "text-gray-400 hover:text-white"
              )}
            >
              My Mods
            </button>
            <button
              onClick={() => onSelectView("browse")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200",
                activeView === "browse"
                  ? "bg-[var(--active-accent)] text-black"
                  : "text-gray-400 hover:text-white"
              )}
            >
              Browse
            </button>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </nav>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} games={games} />
      )}
    </>
  );
}
