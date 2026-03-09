import { useState, useEffect } from "react";
import { GAME_CONFIG } from "./gameConfig";
import Navbar from "./components/Navbar";
import CharacterGrid from "./views/CharacterGrid";
import ModDetail from "./views/ModDetail";

function App() {
  const [activeGame, setActiveGame] = useState("GIMI");
  const [selectedCharacter, setSelectedCharacter] = useState(null);

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
    <div className="min-h-screen flex flex-col titlebar-drag">
      {/* Background radial gradient corresponding to game color */}
      <div
        className="fixed inset-0 pointer-events-none opacity-5"
        style={{
          background: `radial-gradient(circle at top, ${game.accentColor} 0%, transparent 60%)`,
        }}
      />

      <div className="no-drag z-10 w-full h-full flex flex-col flex-1">
        <Navbar
          games={Object.values(GAME_CONFIG)}
          activeGame={activeGame}
          onSelectGame={handleGameSelect}
        />

        <main className="flex-1 w-full max-w-[1400px] mx-auto p-8 relative">
          {selectedCharacter ? (
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
    </div>
  );
}

export default App;
