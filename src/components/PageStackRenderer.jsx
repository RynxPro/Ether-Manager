import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "../store/useAppStore";
import ModDetailPage from "./ModDetailPage";
import CreatorProfilePage from "./CreatorProfilePage";

const PAGE_COMPONENTS = {
  ModDetail: ModDetailPage,
  CreatorProfile: CreatorProfilePage,
};

export default function PageStackRenderer() {
  const pageStack = useAppStore((state) => state.pageStack);

  return (
    <AnimatePresence>
      {pageStack.map((page, index) => {
        const Component = PAGE_COMPONENTS[page.component];
        if (!Component) return null;

        // Ensure higher indices sit on top of lower ones
        const zIndexOffset = 100 + index * 10;

        return (
          <motion.div 
            key={page.id} 
            style={{ zIndex: zIndexOffset }} 
            className="fixed top-0 bottom-0 right-0 left-72 bg-background shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <Component {...page.props} />
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
