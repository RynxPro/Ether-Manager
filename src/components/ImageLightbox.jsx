import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

export default function ImageLightbox({ images, currentIndex, onClose, onIndexChange }) {
  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndexChange((currentIndex - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") onIndexChange((currentIndex + 1) % images.length);
    },
    [currentIndex, images.length, onClose, onIndexChange]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    // Prevent body scrolling
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalStyle;
    };
  }, [handleKeyDown]);

  const handleNext = (e) => {
    e.stopPropagation();
    onIndexChange((currentIndex + 1) % images.length);
  };

  const handlePrev = (e) => {
    e.stopPropagation();
    onIndexChange((currentIndex - 1 + images.length) % images.length);
  };

  const lightboxContent = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Close Button */}
        <button
          className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-50"
          onClick={onClose}
        >
          <X size={24} />
        </button>

        {/* Previous Button */}
        {images.length > 1 && (
          <button
            className="absolute left-6 p-4 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors z-50 group"
            onClick={handlePrev}
          >
            <ChevronLeft size={32} className="group-hover:-translate-x-1 transition-transform" />
          </button>
        )}

        {/* Main Image */}
        <div className="relative w-full h-full p-12 flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <AnimatePresence mode="wait">
            <motion.img
              key={currentIndex}
              src={images[currentIndex]}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.2 }}
              className="max-w-full max-h-[80vh] object-contain drop-shadow-2xl rounded-lg"
              alt={`Gallery Image ${currentIndex + 1}`}
            />
          </AnimatePresence>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-[80vw] overflow-x-auto flex gap-2 p-2 bg-black/50 backdrop-blur-md rounded-xl scroller-hidden">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    onIndexChange(i);
                  }}
                  className={cn(
                    "w-16 h-12 shrink-0 rounded-md overflow-hidden border-2 transition-all",
                    i === currentIndex
                      ? "border-primary opacity-100 scale-110"
                      : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <img src={img} className="w-full h-full object-cover" alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Next Button */}
        {images.length > 1 && (
          <button
            className="absolute right-6 p-4 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors z-50 group"
            onClick={handleNext}
          >
            <ChevronRight size={32} className="group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(lightboxContent, document.body);
}
