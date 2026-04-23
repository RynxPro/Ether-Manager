import { motion } from "framer-motion";
import PageHeader from "../components/layout/PageHeader";
import { Heart, Coffee, Sparkles } from "lucide-react";
import kofiSymbol from "../assets/kofi_brandasset/kofi_symbol.svg";
import kofiButtonBlue from "../assets/kofi_brandasset/support_me_on_kofi_blue.png";

export default function SupportView() {
  const handleSupportClick = () => {
    if (window.electronConfig && window.electronConfig.openExternal) {
      window.electronConfig.openExternal("https://ko-fi.com/wassimladj");
    } else {
      window.open("https://ko-fi.com/wassimladj", "_blank");
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">
      <PageHeader
        title="Support Aether"
        icon={<Heart className="text-pink-500 fill-pink-500/20" size={24} />}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="max-w-2xl mx-auto flex flex-col items-center text-center justify-center min-h-[60vh] space-y-8">
          
          <motion.div
            initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
            className="relative"
          >
            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="relative z-10"
            >
              <img 
                src={kofiSymbol} 
                alt="Ko-fi Cup" 
                className="w-32 h-32 drop-shadow-2xl"
              />
              
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 1], y: [0, -20, -40], x: [0, 10, -10] }}
                transition={{ repeat: Infinity, duration: 2, delay: 0.2, ease: "easeOut" }}
                className="absolute -top-4 right-4 text-pink-400"
              >
                <Sparkles size={20} />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 1], y: [0, -30, -50], x: [0, -15, 5] }}
                transition={{ repeat: Infinity, duration: 2.5, delay: 1, ease: "easeOut" }}
                className="absolute -top-2 left-2 text-amber-300"
              >
                <Sparkles size={16} />
              </motion.div>
            </motion.div>
            
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0.5, 0.2] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-pink-500/20 blur-3xl rounded-full z-0"
            />
          </motion.div>

          <div className="space-y-4">
            <motion.h2 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-3xl font-black tracking-tight text-white"
            >
              Thank you for using <span className="text-primary">Aether Manager!</span>
            </motion.h2>
            
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-text-secondary leading-relaxed max-w-xl mx-auto space-y-4 text-[15px]"
            >
              <p>
                Building Aether Manager has been a labor of love, fueled by a passion for gaming and the incredible modding community. 
                My goal has always been to provide the smoothest, most beautiful experience for managing your favorite mods.
              </p>
              <p>
                If this app has brought joy to your gaming sessions and you'd like to show some love, 
                you can support its continuous development by grabbing me a coffee! It helps keep the creative energy flowing and motivates me to keep adding awesome new features.
              </p>
              <p className="font-semibold text-text-primary">
                Your support means the world to me. Stay awesome! 💖
              </p>
            </motion.div>
          </div>

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 400, damping: 10 }}
            onClick={handleSupportClick}
            className="group relative inline-flex mt-4 cursor-pointer focus:outline-none"
          >
            <div className="absolute inset-0 bg-blue-500/30 blur-xl rounded-full group-hover:bg-blue-400/50 transition-colors duration-300" />
            <img 
              src={kofiButtonBlue} 
              alt="Support me on Ko-fi" 
              className="h-[46px] relative z-10 drop-shadow-md"
            />
          </motion.button>

        </div>
      </div>
    </div>
  );
}
