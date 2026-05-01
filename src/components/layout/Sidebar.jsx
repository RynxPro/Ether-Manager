import {
  Zap,
  Settings,
  HelpCircle,
  Library,
  Globe,
  Database,
  ArrowRight,
  Heart,
  ChevronDown,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "../ui/Button";
import { useAppStore } from "../../store/useAppStore";
import { VISIBLE_GAMES } from "../../gameConfig";
import DownloadsPanel from "./DownloadsPanel";

const MENU_ITEMS = [
  {
    id: "mods",
    label: "Library",
    icon: Library,
  },
  {
    id: "browse",
    label: "Browse",
    icon: Globe,
  },
  {
    id: "presets",
    label: "Presets",
    icon: Database,
  },
];

export default function Sidebar({ onShowHelp }) {
  const activeGame = useAppStore((state) => state.activeGameId);
  const onSelectGame = useAppStore((state) => state.setActiveGameId);
  const activeView = useAppStore((state) => state.activeView);
  const onSelectView = useAppStore((state) => state.setActiveView);
  const games = VISIBLE_GAMES;
  const pushPage = useAppStore((state) => state.pushPage);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  const activeGameData = games.find(g => g.id === activeGame) || games[0];
  return (
    <>
      <aside className="titlebar-drag relative z-20 flex h-full w-72 shrink-0 flex-col rounded-2xl border border-white/[0.07] bg-surface/90 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)] transition-colors duration-300 overflow-hidden">
        <div className="no-drag border-b border-white/5 px-4 pb-6 pt-10 relative z-50">
          <div className="flex items-center gap-3 px-2 mb-6">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-background shadow-card">
              <Zap
                size={16}
                className="fill-text-primary text-text-primary transition-colors duration-300"
              />
            </div>
            <div className="min-w-0">
              <span className="block text-[13px] font-black leading-none tracking-[0.24em] text-white">
                AETHER
              </span>
              <span className="mt-1 block text-[8px] font-black uppercase tracking-[0.22em] text-text-muted">
                Manager
              </span>
            </div>
          </div>

          {/* Workspace Switcher */}
          <div className="relative">
            <button
              onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/4 p-2 transition-all hover:bg-white/8 hover:border-white/20",
                isSwitcherOpen && "border-primary/30 bg-primary/5"
              )}
            >
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 shadow-lg">
                <img
                  src={activeGameData.icon}
                  alt={activeGameData.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted leading-tight">Workspace</p>
                <p className="text-[13px] font-bold text-white truncate leading-tight mt-0.5">{activeGameData.name}</p>
              </div>
              <ChevronDown 
                size={16} 
                className={cn(
                  "text-text-muted transition-transform duration-300 mr-1",
                  isSwitcherOpen && "rotate-180 text-primary"
                )} 
              />
            </button>

            <AnimatePresence>
              {isSwitcherOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60]"
                    onClick={() => setIsSwitcherOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className="absolute left-0 right-0 top-[calc(100%+8px)] z-[70] overflow-hidden rounded-2xl border border-white/20 bg-[#111111] shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.1)] backdrop-blur-3xl p-1.5 flex flex-col gap-1"
                  >
                    {games.map((game) => (
                      <button
                        key={game.id}
                        onClick={() => {
                          onSelectGame(game.id);
                          setIsSwitcherOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg p-2 transition-all",
                          activeGame === game.id
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "hover:bg-white/5 text-text-secondary hover:text-white border border-transparent"
                        )}
                      >
                        <img
                          src={game.icon}
                          alt={game.name}
                          className={cn(
                            "h-7 w-7 rounded-md object-cover border transition-all",
                            activeGame === game.id ? "border-primary/20" : "border-white/10"
                          )}
                        />
                        <span className="text-[12px] font-bold flex-1 text-left">{game.name}</span>
                        {activeGame === game.id && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="no-drag custom-scrollbar flex w-full flex-1 flex-col gap-7 overflow-y-auto px-4 py-6">
          {/* Main Navigation Section */}
          <section className="flex flex-col gap-2">
            <p className="ui-eyebrow px-3">Navigation</p>
            <div className="relative flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {MENU_ITEMS.map((item) => {
                  const isActive = activeView === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectView(item.id)}
                      className={cn(
                        "ui-focus-ring group relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border px-3 py-3.5 text-left transition-all",
                        isActive
                          ? "border-border bg-background/70 text-text-primary shadow-card"
                          : "border-transparent bg-transparent text-text-muted hover:border-border hover:bg-white/4 hover:text-text-primary",
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeNavBackground"
                          className="absolute inset-0 rounded-[inherit] border border-primary/12 bg-white/[0.03]"
                          transition={{
                            type: "spring",
                            bounce: 0.12,
                            duration: 0.45,
                          }}
                        />
                      )}
                      <div
                        className={cn(
                          "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all",
                          isActive
                            ? "border-primary/18 bg-primary/10 text-primary"
                            : "border-white/8 bg-background/60 text-text-muted group-hover:border-white/12 group-hover:text-text-primary",
                        )}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="relative z-10 min-w-0 flex-1">
                        <div className="text-sm font-bold tracking-tight">
                          {item.label}
                        </div>
                      </div>
                      <ArrowRight
                        size={16}
                        className={cn(
                          "relative z-10 shrink-0 transition-all",
                          isActive
                            ? "translate-x-0 text-primary"
                            : "translate-x-[-2px] text-text-muted opacity-0 group-hover:translate-x-0 group-hover:opacity-100",
                        )}
                      />
                    </button>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>

          <DownloadsPanel />
        </div>

        <div className="no-drag border-t border-border bg-background/45 p-4">
          <p className="ui-eyebrow mb-3 px-2">Utilities</p>
          <div className="flex flex-col gap-2">
            <Button
              variant="ghost"
              onClick={() => onSelectView("support")}
              className={cn(
                "w-full justify-start gap-3 border px-3 py-3 hover:bg-white/5 transition-all",
                activeView === "support" 
                  ? "border-pink-500/30 bg-pink-500/10 text-pink-400 hover:border-pink-500/50" 
                  : "border-transparent text-text-muted hover:border-white/10 hover:text-pink-300"
              )}
            >
              <Heart size={16} className={cn("transition-colors", activeView === "support" ? "fill-pink-500/30 text-pink-400" : "")} />
              <span className="text-[12px] font-semibold tracking-tight text-text-primary">
                Support Aether
              </span>
            </Button>

            <Button
              variant="ghost"
              onClick={onShowHelp}
              className="w-full justify-start gap-3 border border-transparent px-3 py-3 hover:border-white/10 hover:bg-white/5"
            >
              <HelpCircle size={16} className="text-text-muted" />
              <span className="text-[12px] font-semibold tracking-tight text-text-primary">
                Documentation
              </span>
            </Button>

            <Button
              variant="ghost"
              onClick={() => pushPage({ id: 'settings', component: 'Settings', props: { games } })}
              className="w-full justify-start gap-3 border border-transparent px-3 py-3 hover:border-white/10 hover:bg-white/5"
            >
              <Settings size={16} className="text-text-muted" />
              <span className="text-[12px] font-semibold tracking-tight text-text-primary">
                App Settings
              </span>
            </Button>
          </div>
        </div>
      </aside>


    </>
  );
}
