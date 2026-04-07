import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "../../lib/utils";

export default function SidePanel({
  isOpen,
  onClose,
  title,
  children,
  widthClass = "w-full max-w-2xl sm:max-w-3xl",
}) {
  // Prevent background scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200, mass: 0.8 }}
            className={cn(
              "fixed right-0 top-0 bottom-0 z-50 h-full bg-surface shadow-[-10px_0_40px_rgba(0,0,0,0.5)] border-l border-border flex flex-col",
              widthClass
            )}
          >
            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/50 backdrop-blur-md shrink-0">
                <h2 className="text-sm font-bold tracking-widest uppercase text-text-primary">
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full text-text-muted hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            
            {/* Content Body */}
            <div className="flex-1 overflow-y-auto w-full relative custom-scrollbar">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
