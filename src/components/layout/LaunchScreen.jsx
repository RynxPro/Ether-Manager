import { motion } from "framer-motion";

const AetherLogo = ({ className }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="aether-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818CF8" /> {/* Indigo-400 */}
        <stop offset="50%" stopColor="#C084FC" /> {/* Purple-400 */}
        <stop offset="100%" stopColor="#E879F9" /> {/* Fuchsia-400 */}
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    
    {/* Outer hexagonal orbit */}
    <motion.path
      d="M50 5 L89 27.5 L89 72.5 L50 95 L11 72.5 L11 27.5 Z"
      stroke="url(#aether-grad)"
      strokeWidth="1"
      strokeOpacity="0.3"
      initial={{ pathLength: 0, rotate: 0 }}
      animate={{ pathLength: 1, rotate: 360 }}
      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
    />

    {/* The stylized 'A' */}
    <motion.path
      d="M50 20 L75 80 H60 L50 55 L40 80 H25 L50 20 Z"
      fill="url(#aether-grad)"
      filter="url(#glow)"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
    />
    
    {/* Inner detail line */}
    <motion.path
      d="M42 65 H58"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ delay: 0.8, duration: 0.5 }}
    />
  </svg>
);

const LaunchScreen = ({ status = "Initializing..." }) => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
    >
      {/* Deep background gradient */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#020202]" />
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(circle at 50% 50%, #4F46E5 0%, transparent 70%)`
          }}
        />
        {/* Animated grain/noise */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <filter id="n" x="0" y="0">
              <feTurbulence type="fractalNoise" baseFrequency="0.65" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#n)" />
          </svg>
        </div>
      </div>

      {/* Center Content */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="relative h-32 w-32">
          {/* Pulsing glow behind logo */}
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.3, 0.1]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="absolute inset-[-40px] rounded-full bg-indigo-500 blur-3xl"
          />
          <AetherLogo className="h-full w-full" />
        </div>

        <div className="flex flex-col items-center gap-3">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-2xl font-black uppercase tracking-[0.4em] text-white"
          >
            Aether<span className="text-indigo-400">Manager</span>
          </motion.h1>
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="text-[10px] uppercase tracking-[0.25em] font-black text-indigo-400/60 transition-all">
              {status}
            </div>
            
            {/* Progress Bar */}
            <div className="w-48 h-[2px] bg-white/5 rounded-full overflow-hidden relative">
              <motion.div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to right, transparent, #818CF8, transparent)",
                }}
                animate={{
                  x: ["-100%", "100%"],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-12 flex flex-col items-center gap-1.5"
      >
        <span className="text-[9px] uppercase tracking-[0.3em] font-bold text-white/40">Powered by GameBanana API v11</span>
        <div className="h-4 w-[1px] bg-white/20" />
      </motion.div>
    </motion.div>
  );
};

export default LaunchScreen;
