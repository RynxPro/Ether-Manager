import { useState, useEffect } from "react";
import { GAME_CONFIG } from "./gameConfig";
import Navbar from "./components/Navbar";
import CharacterGrid from "./views/CharacterGrid";
import ModDetail from "./views/ModDetail";
import BrowseView from "./views/BrowseView";
import OnboardingModal from "./components/OnboardingModal";
import { motion, AnimatePresence } from "framer-motion";

function App() {
  const [activeGame, setActiveGame] = useState("GIMI");
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [activeView, setActiveView] = useState("mods"); // "mods" | "browse"
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      if (window.electronConfig) {
        const config = await window.electronConfig.getConfig();
        if (!config.hasSeenOnboarding) {
          setShowOnboarding(true);
        }
      }
    }
    checkOnboarding();
  }, []);

  // Update accent color variable when game changes
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--active-accent",
      GAME_CONFIG[activeGame].accentColor,
    );
  }, [activeGame]);

  const handleGameSelect = (gameId) => {
    setActiveGame(gameId);
    setSelectedCharacter(null); // Reset detail view when switching games
  };

  const handleCloseOnboarding = async () => {
    setShowOnboarding(false);
    if (window.electronConfig) {
      await window.electronConfig.setConfig({ hasSeenOnboarding: true });
    }
  };

  const handleShowHelp = () => {
    setShowOnboarding(true);
  };

  const game = GAME_CONFIG[activeGame];

  return (
    <div className="h-screen w-screen flex flex-col bg-(--bg-base) relative overflow-hidden">
      {/* Background radial gradient corresponding to game color */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(circle at 50% -20%, var(--active-accent) 0%, transparent 60%)`,
          opacity: 0.1
        }}
      />
      
      {/* Dynamic Texture/Depth Layer */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03] mix-blend-overlay">
        <svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%'>
          <filter id='n' x='0' y='0'>
            <feTurbulence type='fractalNoise' baseFrequency='0.65' stitchTiles='stitch'/>
          </filter>
          <rect width='100%' height='100%' filter='url(#n)'/>
        </svg>
      </div>

      <Navbar
        games={Object.values(GAME_CONFIG)}
        activeGame={activeGame}
        onSelectGame={handleGameSelect}
        activeView={activeView}
        onSelectView={setActiveView}
        onShowHelp={handleShowHelp}
      />

      <main className="flex-1 w-full relative z-10 overflow-hidden">
        
        {/* BROWSE VIEW VIEWPORT */}
        <motion.div
          initial={false}
          animate={{ 
            opacity: activeView === "browse" ? 1 : 0,
            y: activeView === "browse" ? 0 : 15,
            scale: activeView === "browse" ? 1 : 0.98,
            pointerEvents: activeView === "browse" ? "auto" : "none",
            zIndex: activeView === "browse" ? 20 : 0
          }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden scroller-hidden"
        >
          <div className="w-full max-w-[1500px] mx-auto px-10 py-8 min-h-full">
            <BrowseView game={game} />
          </div>
        </motion.div>

        {/* LIBRARY ALL CHARACTERS VIEWPORT */}
        <motion.div
          initial={false}
          animate={{ 
            opacity: activeView === "mods" && !selectedCharacter ? 1 : 0,
            y: activeView === "mods" && !selectedCharacter ? 0 : 15,
            scale: activeView === "mods" && !selectedCharacter ? 1 : 0.98,
            pointerEvents: activeView === "mods" && !selectedCharacter ? "auto" : "none",
            zIndex: activeView === "mods" && !selectedCharacter ? 20 : 0
          }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden scroller-hidden"
        >
          <div className="w-full max-w-[1500px] mx-auto px-10 py-8 min-h-full">
            <CharacterGrid game={game} onSelectCharacter={setSelectedCharacter} />
          </div>
        </motion.div>

        {/* MOD DETAIL VIEWPORT (conditionally rendered to save memory when inactive) */}
        <AnimatePresence>
          {activeView === "mods" && selectedCharacter && (
            <motion.div
              key="mod-detail"
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 1.02 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden scroller-hidden"
              style={{ zIndex: 30 }}
            >
              <div className="w-full max-w-[1500px] mx-auto px-10 py-8 min-h-full">
                <ModDetail 
                  game={game} 
                  character={selectedCharacter} 
                  onBack={() => setSelectedCharacter(null)} 
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
      <OnboardingModal 
        isOpen={showOnboarding} 
        onClose={handleCloseOnboarding} 
      />
    </div>
  );
}

export default App;
