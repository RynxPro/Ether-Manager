import { Zap, Search, Settings, HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";
import { motion } from "framer-motion";
import SettingsModal from "./SettingsModal";
import { Button } from "./ui/Button";
import { useAppStore } from "../store/useAppStore";
import { VISIBLE_GAMES } from "../gameConfig";

export default function Navbar({ onShowHelp }) {
  const activeGame = useAppStore((state) => state.activeGameId);
  const onSelectGame = useAppStore((state) => state.setActiveGameId);
  const activeView = useAppStore((state) => state.activeView);
  const onSelectView = useAppStore((state) => state.setActiveView);
  const games = VISIBLE_GAMES;
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <nav className="w-full h-[70px] shrink-0 bg-surface/80 backdrop-blur-2xl border-b border-border flex items-center justify-between px-8 pl-24 z-20 titlebar-drag sticky top-0 transition-colors duration-300">
        {/* Logo */}
        <div className="flex items-center gap-3 w-[450px] no-drag group cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center transition-all duration-300 group-hover:bg-primary/10 group-hover:border-primary/30 group-hover:shadow-[0_0_20px_var(--color-primary)]/20 shadow-surface">
            <Zap size={22} className="text-text-primary fill-text-primary transition-colors duration-300 group-hover:text-primary group-hover:fill-primary" />
          </div>
          <div>
            <span className="text-white font-black tracking-[0.3em] text-lg block leading-none">AETHER</span>
            <span className="text-[9px] text-white/30 font-black tracking-[0.2em] uppercase mt-1 block">Mod Manager</span>
          </div>
        </div>

        {/* Game Tabs */}
        <div className="flex items-center gap-1.5 no-drag bg-background p-1.5 rounded-2xl border border-border shadow-inner">
          {games.map((game) => {
            const isActive = activeGame === game.id;
            return (
              <button
                key={game.id}
                onClick={() => onSelectGame(game.id)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 relative overflow-hidden",
                  isActive
                    ? "text-text-primary bg-surface shadow-card"
                    : "text-text-muted hover:text-text-primary hover:bg-white/5",
                )}
              >
                {isActive && (
                  <motion.div 
                    layoutId="navbarGameGlow"
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)]" 
                  />
                )}
                {game.id}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-6 w-[450px] no-drag">
          {/* Navigation Toggle — 3 equal columns */}
          <div className="grid grid-cols-3 bg-background border border-border rounded-xl p-1 relative shadow-inner overflow-hidden min-w-[280px]">
            <motion.div
              layout
              transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
              className="absolute h-[calc(100%-8px)] rounded-lg bg-surface z-0 shadow-card border border-border top-[4px]"
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
                  "py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 relative z-10 w-full flex items-center justify-center no-drag",
                  activeView === id ? "text-text-primary" : "text-text-muted hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 border-l border-white/10 pl-5">
            <Button
              variant="ghost"
              onClick={onShowHelp}
              icon={HelpCircle}
              className="text-white/30 hover:text-white w-10 h-10 p-0 hover:bg-white/5"
              title="Show Guide"
            />
            <Button
              variant="ghost"
              onClick={() => setShowSettings(true)}
              icon={Settings}
              className="text-white/30 hover:text-white w-10 h-10 p-0 hover:bg-white/5"
              title="Settings"
            />
          </div>
        </div>
      </nav>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} games={games} />
      )}
    </>
  );
}
