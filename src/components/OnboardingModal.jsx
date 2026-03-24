import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, 
  ChevronRight, 
  ChevronLeft, 
  Settings, 
  Search, 
  Library, 
  CheckCircle2,
  Rocket
} from "lucide-react";
import { cn } from "../lib/utils";
import { useCharacterPortrait } from "../hooks/useCharacterPortrait";

const STEPS = [
  {
    title: "Welcome to Aether",
    description: "Your ultimate hub for managing and discovering mods. Let's get you set up in less than a minute.",
    icon: Rocket,
    portrait: "Ellen Joe",
    game: "zzmi"
  },
  {
    title: "Configure Paths",
    description: "Head to Settings to link your Game folders. This allows Aether to install and toggle mods automatically.",
    icon: Settings,
    portrait: "Jane Doe",
    game: "zzmi"
  },
  {
    title: "Browse & Discover",
    description: "Explore the Browse tab to find thousands of mods from GameBanana. Install with a single click.",
    icon: Search,
    portrait: "Jiyan",
    game: "wwmi"
  },
  {
    title: "Manage Your Library",
    description: "The My Mods tab shows your collection. Profiles are grouped by character for easy management.",
    icon: Library,
    portrait: "Raiden Shogun",
    game: "gimi"
  },
  {
    title: "You're All Set!",
    description: "You're ready to transform your gaming experience. Happy modding!",
    icon: CheckCircle2,
    portrait: "Furina",
    game: "gimi"
  }
];

export default function OnboardingModal({ isOpen, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = STEPS[currentStep];
  const Icon = step.icon;
  const portraitUrl = useCharacterPortrait(step.portrait, step.game);

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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg bg-surface border border-border rounded-[32px] overflow-hidden shadow-2xl"
        >
          {/* Visual Area: Cinematic Background */}
          <div className="h-64 relative overflow-hidden flex items-center justify-center">
            {/* Background Image (Blurred) */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                {portraitUrl ? (
                  <img 
                    src={portraitUrl} 
                    className="w-full h-full object-cover opacity-20 blur-2xl scale-125" 
                    alt=""
                  />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-indigo-500/20 to-purple-500/20" />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-surface via-surface/40 to-transparent" />
              </motion.div>
            </AnimatePresence>

            {/* Glowing Accent */}
            <div className="absolute inset-0 bg-radial-at-center from-primary/20 to-transparent" />

            {/* Floating Icon */}
            <motion.div
              key={`icon-${currentStep}`}
              initial={{ scale: 0.5, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", damping: 15 }}
              className="relative z-10 w-24 h-24 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-3xl flex items-center justify-center shadow-2xl"
            >
              <Icon size={48} className="text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]" />
            </motion.div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all z-20"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-10">
            <div className="text-center mb-10">
              <motion.div
                key={`title-container-${currentStep}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center justify-center gap-2 mb-3">
                   <div className="w-1 h-4 bg-primary rounded-full shadow-primary/20" />
                   <span className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted/50">Getting Started</span>
                </div>
                <h2 className="text-3xl font-bold text-text-primary mb-4 tracking-tighter">
                  {step.title}
                </h2>
              </motion.div>
              
              <motion.p 
                key={`desc-${currentStep}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-text-secondary leading-relaxed font-medium"
              >
                {step.description}
              </motion.p>
            </div>

            {/* Progress Dots */}
            <div className="flex justify-center gap-2 mb-10">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 rounded-full transition-all duration-500",
                    i === currentStep ? "w-10 bg-primary shadow-primary/20" : "w-1.5 bg-white/10"
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
                  "flex items-center gap-2 px-4 py-2 text-sm font-black uppercase tracking-widest transition-all",
                  currentStep === 0 ? "opacity-0 pointer-events-none" : "text-white/30 hover:text-white"
                )}
              >
                <ChevronLeft size={18} />
                Back
              </button>

              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-8 py-4 bg-primary text-black rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-primary/20"
              >
                {currentStep === STEPS.length - 1 ? "Finish" : "Continue"}
                {currentStep !== STEPS.length - 1 ? <ChevronRight size={18} strokeWidth={3} /> : <CheckCircle2 size={18} strokeWidth={3} />}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
