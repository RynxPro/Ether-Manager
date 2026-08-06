import { useState } from "react";
import { CharacterDetail } from "@/features/library/CharacterDetail";
import { CharacterGrid } from "@/features/library/CharacterGrid";
import { useModsFolder } from "@/features/library/hooks";
import { FirstRunSetup } from "@/features/settings/FirstRunSetup";
import type { Character } from "@/lib/tauri-commands";

function App() {
  const { data: modsFolder, isLoading } = useModsFolder();
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!modsFolder) {
    return <FirstRunSetup />;
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-foreground">Ether Manager</h1>
          <p className="text-sm text-muted-foreground">Zenless Zone Zero mod library</p>
        </header>

        {selectedCharacter ? (
          <CharacterDetail
            character={selectedCharacter}
            onBack={() => setSelectedCharacter(null)}
          />
        ) : (
          <CharacterGrid onSelect={setSelectedCharacter} />
        )}
      </div>
    </main>
  );
}

export default App;
