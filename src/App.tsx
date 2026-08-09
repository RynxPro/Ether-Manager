import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Browse } from "@/features/browse/Browse";
import { CharacterDetail } from "@/features/library/CharacterDetail";
import { CharacterGrid } from "@/features/library/CharacterGrid";
import { useCheckAllUpdates, useModsFolder } from "@/features/library/hooks";
import { FirstRunSetup } from "@/features/settings/FirstRunSetup";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import type { Character } from "@/lib/tauri-commands";

type View = "library" | "browse";

function App() {
  const { data: modsFolder, isLoading } = useModsFolder();
  const [view, setView] = useState<View>("library");
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const checkAllUpdates = useCheckAllUpdates();

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
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Ether Manager</h1>
            <p className="text-sm text-muted-foreground">Zenless Zone Zero mod library</p>
          </div>

          <div className="flex items-center gap-3">
            <SettingsDialog />

            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={checkAllUpdates.isPending}
                onClick={() => checkAllUpdates.mutate(true)}
              >
                {checkAllUpdates.isPending ? "Checking…" : "Check for updates"}
              </Button>
              {checkAllUpdates.isError && (
                <p className="text-xs text-destructive">Update check failed — try again.</p>
              )}
            </div>

            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              <Button
                type="button"
                variant={view === "library" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("library")}
              >
                Library
              </Button>
              <Button
                type="button"
                variant={view === "browse" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("browse")}
              >
                Browse
              </Button>
            </div>
          </div>
        </header>

        {view === "browse" ? (
          <Browse />
        ) : selectedCharacter ? (
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
