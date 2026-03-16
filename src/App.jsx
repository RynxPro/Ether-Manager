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
    <div className="min-h-screen flex flex-col bg-[var(--background)] relative">
      {/* Background radial gradient corresponding to game color */}
      <div
        className="fixed inset-0 pointer-events-none opacity-5 z-0"
        style={{
          background: `radial-gradient(circle at top, ${game.accentColor} 0%, transparent 60%)`,
        }}
      />

      <Navbar
        games={Object.values(GAME_CONFIG)}
        activeGame={activeGame}
        onSelectGame={handleGameSelect}
        activeView={activeView}
        onSelectView={setActiveView}
        onShowHelp={handleShowHelp}
      />

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-8 py-6 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView + (selectedCharacter ? selectedCharacter.name : "")}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full h-full"
          >
            {activeView === "browse" ? (
              <BrowseView game={game} />
            ) : selectedCharacter ? (
              <ModDetail
                game={game}
                character={selectedCharacter}
                onBack={() => setSelectedCharacter(null)}
              />
            ) : (
              <CharacterGrid
                game={game}
                onSelectCharacter={setSelectedCharacter}
              />
            )}
          </motion.div>
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
