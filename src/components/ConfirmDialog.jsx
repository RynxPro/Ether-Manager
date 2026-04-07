import { useEffect } from "react";
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
      // Prevent body scroll
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onCancel}
          />

          {/* Dialog */}
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              role="alertdialog"
              aria-modal="true"
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-surface shadow-surface"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-danger/10">
                    <AlertTriangle size={20} className="text-danger" />
                  </div>
                  <h2 className="text-lg font-bold tracking-tight text-text-primary">
                    {title}
                  </h2>
                </div>
                <button
                  onClick={onCancel}
                  className="ui-focus-ring flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/5"
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
        </>
      )}
    </AnimatePresence>
  );
}
