import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./ui/Button";
import { motion, AnimatePresence } from "framer-motion";

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  children,
}) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Prevent all scrolling across the app
      document.documentElement.classList.add("stop-scrolling");
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.documentElement.classList.remove("stop-scrolling");
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] isolation-isolate">
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-md"
          onClick={onCancel}
        />
      </AnimatePresence>

      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          role="alertdialog"
          aria-modal="true"
          className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d12] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger/10">
                <AlertTriangle size={20} className="text-danger" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                {title}
              </h2>
            </div>
            <button
              onClick={onCancel}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
              aria-label="Close dialog"
            >
              <X size={16} className="text-text-muted" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 pb-6">
            <p className="mb-6 text-sm leading-6 text-text-secondary">{message}</p>

            {children}

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={onCancel}
                className="px-4 py-2"
              >
                {cancelText}
              </Button>
              <Button
                variant={confirmVariant}
                onClick={onConfirm}
                className="px-4 py-2"
              >
                {confirmText}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>,
    document.body
  );
}
