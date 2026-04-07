import {
  Zap,
  Settings,
  HelpCircle,
  Download,
  Library,
  Globe,
  Database,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SettingsModal from "../SettingsModal";
import { Button } from "../ui/Button";
import { useAppStore } from "../../store/useAppStore";
import { VISIBLE_GAMES } from "../../gameConfig";
import DownloadsPanel from "./DownloadsPanel";

const MENU_ITEMS = [
  { id: "mods", label: "Library", icon: Library },
  { id: "browse", label: "Browse", icon: Globe },
  { id: "presets", label: "Loadouts", icon: Database },
];

export default function Sidebar({ onShowHelp }) {
  const activeGame = useAppStore((state) => state.activeGameId);
  const onSelectGame = useAppStore((state) => state.setActiveGameId);
  const activeView = useAppStore((state) => state.activeView);
  const onSelectView = useAppStore((state) => state.setActiveView);
  const games = VISIBLE_GAMES;
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <aside className="w-64 h-full shrink-0 bg-surface/80 backdrop-blur-2xl border-r border-border flex flex-col z-20 titlebar-drag relative transition-colors duration-300">
        {/* Logo Section */}
        <div className="p-6 pt-10 pb-8 flex items-center gap-3 no-drag group cursor-pointer border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center transition-all duration-300 group-hover:bg-primary/10 group-hover:border-primary/30 group-hover:shadow-[0_0_20px_var(--color-primary)]/20 shadow-surface shrink-0">
            <Zap
              size={20}
              className="text-text-primary fill-text-primary transition-colors duration-300 group-hover:text-primary group-hover:fill-primary"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-white font-black tracking-[0.25em] text-[15px] block leading-none">
              AETHER
            </span>
            <span className="text-[8px] text-white/40 font-black tracking-[0.2em] uppercase mt-1.5 block">
              Mod Manager
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto w-full flex flex-col px-4 py-6 gap-8 no-drag custom-scrollbar">
          {/* Game Switcher */}
          <div className="w-full flex flex-col gap-1">
            <p className="text-[9px] uppercase font-black tracking-[0.2em] text-primary mb-1 px-3">
              Active Workspace
            </p>
            <div className="flex flex-col gap-1">
              {games.map((game) => {
                const isActive = activeGame === game.id;
                return (
                  <button
                    key={game.id}
                    onClick={() => onSelectGame(game.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-300 group relative overflow-hidden",
                      isActive
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-white/5 border border-transparent",
                    )}
                  >
                    <div className="flex items-center gap-3 relative z-10">
                      {game.icon ? (
                        <img
                          src={game.icon}
                          alt={game.name}
                          className={cn(
                            "w-6 h-6 rounded-lg object-cover transition-all duration-300",
                            isActive
                              ? "opacity-100"
                              : "opacity-40 grayscale group-hover:opacity-80 group-hover:grayscale-0",
                          )}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-lg bg-surface border border-white/10 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-black text-white/20">
                            {game.id[0]}
                          </span>
                        </div>
                      )}
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-widest transition-colors",
                          isActive
                            ? "text-primary"
                            : "text-text-muted group-hover:text-text-primary",
                        )}
                      >
                        {game.name || game.id}
                      </span>
                    </div>
                    {isActive && (
                      <motion.div
                        layoutId="activeGameIndicator"
                        className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_var(--color-primary)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Navigation */}
          <div className="w-full flex flex-col gap-1 mt-4">
            <p className="text-[9px] uppercase font-black tracking-[0.2em] text-primary mb-1 px-3">
              Navigation
            </p>
            <div className="flex flex-col gap-1 relative">
              <AnimatePresence>
                {MENU_ITEMS.map((item) => {
                  const isActive = activeView === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectView(item.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 relative group overflow-hidden",
                        isActive
                          ? "text-text-primary"
                          : "text-text-muted hover:text-text-primary hover:bg-white/5",
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeNavBackground"
                          className="absolute inset-0 bg-surface shadow-card border border-border rounded-xl z-0"
                          transition={{
                            type: "spring",
                            bounce: 0.15,
                            duration: 0.5,
                          }}
                        />
                      )}
                      <Icon
                        size={18}
                        className={cn(
                          "relative z-10 transition-colors",
                          isActive
                            ? "text-primary"
                            : "text-text-muted group-hover:text-text-primary",
                        )}
                      />
                      <span className="text-[13px] font-medium tracking-wide relative z-10">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Downloads Queue */}
        <DownloadsPanel />

        {/* Global Action Footer */}
        <div className="p-4 border-t border-border bg-background/50 flex flex-col gap-2 no-drag shrink-0">
          <Button
            variant="ghost"
            onClick={onShowHelp}
            className="w-full flex items-center justify-start gap-3 py-3 px-3 hover:bg-white/5 border border-transparent hover:border-white/10"
          >
            <HelpCircle size={16} className="text-text-muted" />
            <span className="text-[12px] font-medium tracking-tight">
              Documentation
            </span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center justify-start gap-3 py-3 px-3 bg-surface hover:bg-white/10 border-white/5"
          >
            <Settings size={16} className="text-text-muted" />
            <span className="text-[12px] font-medium tracking-tight">
              App Settings
            </span>
          </Button>
        </div>
      </aside>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} games={games} />
      )}
    </>
  );
}
