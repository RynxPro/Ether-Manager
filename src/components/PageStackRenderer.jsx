import { Suspense, lazy } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "../store/useAppStore";

const ModDetailPage     = lazy(() => import('../views/ModDetailPage'));
const CreatorProfilePage = lazy(() => import('../views/CreatorProfilePage'));
const SettingsPage      = lazy(() => import('../views/SettingsPage'));
const PresetDetailPage  = lazy(() => import('../views/PresetDetailPage'));

const PAGE_COMPONENTS = {
  ModDetail: ModDetailPage,
  CreatorProfile: CreatorProfilePage,
  Settings: SettingsPage,
  PresetDetail: PresetDetailPage,
};

// Minimal skeleton shown while the lazy chunk is loading (first time only)
function PageSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-background">
      <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

export default function PageStackRenderer() {
  const pageStack = useAppStore((state) => state.pageStack);

  return (
    <AnimatePresence>
      {pageStack.map((page, index) => {
        const Component = PAGE_COMPONENTS[page.component];
        if (!Component) return null;

        const zIndexOffset = 100 + index * 10;

        // Memory optimization: Only physically paint the top 2 pages in the stack.
        // The others remain in React's tree to preserve state/scroll, but don't consume GPU tile memory.
        const isVisible = index >= pageStack.length - 2;

        return (
          <motion.div
            key={`${page.id}-${index}`}
            style={{ 
              zIndex: zIndexOffset,
              display: isVisible ? 'block' : 'none'
            }}
            className="absolute inset-0 bg-background shadow-[-20px_0_40px_rgba(0,0,0,0.5)] page-stack-container will-change-transform transform-gpu backface-hidden antialiased rounded-2xl overflow-hidden"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <Suspense fallback={<PageSkeleton />}>
              <Component {...page.props} />
            </Suspense>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
