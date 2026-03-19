import { Zap, Search, Settings, HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";
import { motion } from "framer-motion";
import SettingsModal from "./SettingsModal";

export default function Navbar({ games, activeGame, onSelectGame, activeView, onSelectView, onShowHelp }) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <nav className="w-full h-[70px] shrink-0 bg-(--bg-surface)/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-8 pl-24 z-20 titlebar-drag sticky top-0">
        {/* Logo */}
        <div className="flex items-center gap-3 w-[450px] no-drag group">
          <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center transition-all group-hover:bg-(--active-accent)/20 group-hover:border-(--active-accent)/40 group-hover:shadow-[0_0_20px_var(--active-accent)]/20 shadow-2xl">
            <Zap size={22} className="text-white fill-white transition-colors group-hover:text-(--active-accent) group-hover:fill-(--active-accent)" />
          </div>
          <div>
            <span className="text-white font-black tracking-[0.3em] text-lg block leading-none">AETHER</span>
            <span className="text-[9px] text-white/30 font-black tracking-[0.2em] uppercase mt-1 block">Mod Manager</span>
          </div>
        </div>

        {/* Game Tabs */}
        <div className="flex items-center gap-1.5 no-drag bg-white/5 p-1.5 rounded-3xl border border-white/5">
          {games.map((game) => {
            const isActive = activeGame === game.id;
            return (
              <button
                key={game.id}
                onClick={() => onSelectGame(game.id)}
                className={cn(
                  "px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 relative overflow-hidden",
                  isActive
                    ? "text-white bg-white/10 shadow-lg"
                    : "text-white/30 hover:text-white/60 hover:bg-white/2",
                )}
              >
                {isActive && (
                  <motion.div 
                    layoutId="navbarGameGlow"
                    className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-(--active-accent) shadow-[0_0_10px_var(--active-accent)]" 
                  />
                )}
                {game.id}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-5 w-[450px] no-drag">
          {/* Navigation Toggle */}
          {/* Navigation Toggle — 3 equal columns */}
          <div className="grid grid-cols-3 bg-black/40 border border-white/5 rounded-2xl p-1 relative shadow-inner overflow-hidden min-w-[280px]">
            <motion.div
              layout
              transition={{ type: "spring", bounce: 0.15, duration: 0.6 }}
              className="absolute h-[calc(100%-8px)] rounded-xl bg-(--active-accent) z-0 shadow-[0_0_20px_var(--active-accent)]/40 top-[4px]"
              style={{
                width: "calc(33.333% - 2.67px)",
                left: activeView === "mods" ? "4px" : activeView === "browse" ? "33.333%" : "calc(66.666% + 1.33px)",
              }}
            />
            {[
              { id: "mods", label: "Library" },
              { id: "browse", label: "Browse" },
              { id: "presets", label: "Loadouts" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onSelectView(id)}
                className={cn(
                  "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors duration-300 relative z-10 w-full flex items-center justify-center no-drag",
                  activeView === id ? "text-black" : "text-white/30 hover:text-white/60"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 border-l border-white/10 pl-5">
            <button
              onClick={onShowHelp}
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all hover:scale-110 active:scale-95"
              title="Show Guide"
            >
              <HelpCircle size={20} />
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all hover:scale-110 active:scale-95"
              title="Settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </nav>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} games={games} />
      )}
    </>
  );
}
