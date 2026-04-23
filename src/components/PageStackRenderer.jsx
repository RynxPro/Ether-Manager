import { AnimatePresence } from "framer-motion";
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
          <div key={page.id} style={{ zIndex: zIndexOffset }} className="fixed top-0 bottom-0 right-0 left-72">
            <Component {...page.props} />
          </div>
        );
      })}
    </AnimatePresence>
  );
}
