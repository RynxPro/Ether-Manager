import { useState, useEffect } from "react";
import { GAME_CONFIG } from "./gameConfig";
import Navbar from "./components/Navbar";
import CharacterGrid from "./views/CharacterGrid";
import ModDetail from "./views/ModDetail";
import BrowseView from "./views/BrowseView";

function App() {
  const [activeGame, setActiveGame] = useState("GIMI");
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [activeView, setActiveView] = useState("mods"); // "mods" | "browse"

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
      />

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-8 py-6 relative z-10">
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
      </main>
    </div>
  );
}

export default App;
