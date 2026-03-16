import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  Settings, 
  Search, 
  Library, 
  CheckCircle2,
  Rocket
} from "lucide-react";
import { cn } from "../lib/utils";

const STEPS = [
  {
    title: "Welcome to Aether",
    description: "Your ultimate hub for managing and discovering mods. Let's get you set up in less than a minute.",
    icon: Sparkles,
    color: "from-blue-500 to-cyan-400",
  },
  {
    title: "Configure Paths",
    description: "Head to Settings to link your Game folders. This allows Aether to install and toggle mods automatically.",
    icon: Settings,
    color: "from-purple-500 to-pink-500",
  },
  {
    title: "Browse & Discover",
    description: "Explore the Browse tab to find thousands of mods from GameBanana. Install with a single click.",
    icon: Search,
    color: "from-orange-500 to-yellow-500",
  },
  {
    title: "Manage Your Library",
    description: "The My Mods tab shows your collection. Profiles are grouped by character for easy management.",
    icon: Library,
    color: "from-green-500 to-emerald-500",
  },
  {
    title: "You're All Set!",
    description: "You're ready to transform your gaming experience. Happy modding!",
    icon: Rocket,
    color: "from-blue-600 to-indigo-600",
  }
];

export default function OnboardingModal({ isOpen, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const Icon = step.icon;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg bg-(--bg-overlay) border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/50"
        >
          {/* Header/Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/30 hover:text-white transition-colors z-10"
          >
            <X size={20} />
          </button>

          {/* Visual Area */}
          <div className={cn("h-48 flex items-center justify-center bg-linear-to-br transition-all duration-500", step.color)}>
             <motion.div
               key={currentStep}
               initial={{ scale: 0.5, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               transition={{ type: "spring", damping: 12 }}
             >
                <Icon size={80} className="text-white drop-shadow-lg" />
             </motion.div>
          </div>

          <div className="p-8">
            <div className="text-center mb-8">
              <motion.h2 
                key={`title-${currentStep}`}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-2xl font-bold text-white mb-3"
              >
                {step.title}
              </motion.h2>
              <motion.p 
                key={`desc-${currentStep}`}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-white/60 leading-relaxed"
              >
                {step.description}
              </motion.p>
            </div>

            {/* Progress Dots */}
            <div className="flex justify-center gap-2 mb-8">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === currentStep ? "w-8 bg-white" : "w-1.5 bg-white/10"
                  )}
                />
              ))}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={prevStep}
                disabled={currentStep === 0}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-bold transition-all",
                  currentStep === 0 ? "opacity-0 pointer-events-none" : "text-white/40 hover:text-white"
                )}
              >
                <ChevronLeft size={18} />
                Back
              </button>

              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-black uppercase text-xs tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-white/5"
              >
                {currentStep === STEPS.length - 1 ? "Get Started" : "Continue"}
                {currentStep !== STEPS.length - 1 && <ChevronRight size={18} />}
                {currentStep === STEPS.length - 1 && <CheckCircle2 size={18} />}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
