import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

export default function AppViewShell({
  isActive,
  children,
  zIndex = 20,
  fallbackOffsetClassName = "",
}) {
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: isActive ? 1 : 0,
        y: isActive ? 0 : 15,
        scale: isActive ? 1 : 0.98,
        pointerEvents: isActive ? "auto" : "none",
        zIndex: isActive ? zIndex : 0,
      }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 h-full w-full overflow-y-auto overflow-x-hidden scroller-hidden"
    >
      <div className="mx-auto min-h-full w-full max-w-[1500px] px-6 py-6 sm:px-8 sm:py-8 xl:px-10">
        <Suspense
          fallback={
            <div
              className={`flex h-full w-full items-center justify-center ${fallbackOffsetClassName}`}
            >
              <Loader2
                className="animate-spin text-primary opacity-50"
                size={32}
              />
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    </motion.div>
  );
}
