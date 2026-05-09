import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";

export default function TopBar() {
  const activeView = useAppStore((state) => state.activeView);
  const pageStack = useAppStore((state) => state.pageStack);
  const popPage = useAppStore((state) => state.popPage);
  const getTitle = () => {
    // 1. Check deep page stack first
    if (pageStack.length > 0) {
      const topPage = pageStack[pageStack.length - 1];
      // Try to get name from props, or fall back to ID or Component name
      return topPage.props?.character?.name || topPage.props?.mod?._sName || topPage.props?.preset?.name || topPage.id || topPage.component;
    }

    // 2. Main Views
    switch (activeView) {
      case 'mods': return 'Library';
      case 'browse': return 'Browse Mods';
      case 'presets': return 'Loadout Presets';
      case 'support': return 'Support Aether';
      default: return 'Aether Manager';
    }
  };

  const canGoBack = pageStack.length > 0;

  return (
    <header className="titlebar-drag h-14 bg-[#09090b] flex items-center px-6 gap-4 shrink-0 relative z-50 select-none">
      <div className="no-drag flex items-center gap-1">
        <button
          onClick={() => window.history.back()}
          className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-colors"
          title="Back"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => window.history.forward()}
          className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-colors"
          title="Forward"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="h-4 w-px bg-white/10 mx-1" />

      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          <motion.h1
            key={getTitle()}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="text-[11px] font-black uppercase tracking-[0.25em] text-white/90 truncate"
          >
            {getTitle()}
          </motion.h1>
        </AnimatePresence>
      </div>

      {/* Spacer for drag region on the right */}
      <div className="w-24 h-full" />
    </header>
  );
}
