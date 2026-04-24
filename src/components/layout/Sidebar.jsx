import {
  Zap,
  Settings,
  HelpCircle,
  Library,
  Globe,
  Database,
  ArrowRight,
  Heart,
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
  return (
    <>
      <aside className="titlebar-drag relative z-20 flex h-full w-72 shrink-0 flex-col border-r border-border bg-surface/82 backdrop-blur-2xl transition-colors duration-300">
        <div className="no-drag border-b border-white/5 px-6 pb-5 pt-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-background shadow-card">
              <Zap
                size={20}
                className="fill-text-primary text-text-primary transition-colors duration-300"
              />
            </div>
            <div className="min-w-0">
              <span className="block text-[15px] font-black leading-none tracking-[0.24em] text-white">
                AETHER
              </span>
              <span className="mt-1 block text-[9px] font-black uppercase tracking-[0.22em] text-text-muted">
                Mod Manager
              </span>
            </div>
          </div>
        </div>

        <div className="no-drag custom-scrollbar flex w-full flex-1 flex-col gap-7 overflow-y-auto px-4 py-6">
          <section className="flex flex-col gap-2">
            <p className="ui-eyebrow px-3">Workspace</p>
            <div className="flex flex-col gap-2">
              {games.map((game) => {
                const isActive = activeGame === game.id;
                return (
                  <button
                    key={game.id}
                    onClick={() => onSelectGame(game.id)}
                    className={cn(
                      "ui-focus-ring group relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border px-3 py-3 text-left transition-all",
                      isActive
                        ? "border-primary/20 bg-primary/10 shadow-interactive"
                        : "border-transparent bg-transparent hover:border-border hover:bg-white/4",
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeGameRail"
                        className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-primary shadow-[0_0_10px_var(--color-primary)]"
                      />
                    )}
                    {game.icon ? (
                      <img
                        src={game.icon}
                        alt={game.name}
                        className={cn(
                          "h-8 w-8 rounded-xl border object-cover transition-all duration-300",
                          isActive
                            ? "border-primary/20 opacity-100"
                            : "border-white/8 opacity-50 grayscale group-hover:opacity-90 group-hover:grayscale-0",
                        )}
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-background">
                        <span className="text-[10px] font-black text-white/30">
                          {game.id[0]}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "truncate text-[11px] font-black uppercase tracking-[0.16em]",
                          isActive
                            ? "text-primary"
                            : "text-text-primary group-hover:text-white",
                        )}
                      >
                        {game.name || game.id}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition-colors",
                        isActive
                          ? "border-primary/20 bg-primary/12 text-primary"
                          : "border-white/8 text-text-muted group-hover:border-white/12 group-hover:text-text-secondary",
                      )}
                    >
                      {isActive ? "Active" : "Open"}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <p className="ui-eyebrow px-3">Sections</p>
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
