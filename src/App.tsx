import { useState } from "react";
import { Bookmark, Compass, LayoutGrid, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookmarksView } from "@/features/browse/BookmarksView";
import { Browse } from "@/features/browse/Browse";
import { ModDetailRoute } from "@/features/browse/ModDetailRoute";
import { CharacterDetail } from "@/features/library/CharacterDetail";
import { Library } from "@/features/library/Library";
import { useCheckAllUpdates, useModsFolder } from "@/features/library/hooks";
import { FirstRunSetup } from "@/features/settings/FirstRunSetup";
import { SettingsPage } from "@/features/settings/SettingsPage";
import type { Character, GbMod } from "@/lib/tauri-commands";

type View = "library" | "browse" | "bookmarks" | "settings";

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutGrid }[] = [
  { id: "library", label: "Library", icon: LayoutGrid },
  { id: "browse", label: "Browse", icon: Compass },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/** Navigation is exactly two levels deep — a sidebar destination, then at most one drill-down
 * (character → its mods, or a browse result → its detail). Both drill-downs are pages rather
 * than dialogs; only short confirmations (add, update, install) stayed modal. */
function App() {
  const { data: modsFolder, isLoading } = useModsFolder();
  const [view, setView] = useState<View>("library");
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedMod, setSelectedMod] = useState<GbMod | null>(null);
  const checkAllUpdates = useCheckAllUpdates();

  function goTo(next: View) {
    setView(next);
    // Leaving a section drops its drill-down, so returning to it lands on the section root
    // rather than wherever you happened to be three clicks deep last time.
    setSelectedMod(null);
    setSelectedCharacter(null);
  }

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
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar p-4">
        <div className="px-2 pt-2 pb-6">
          <h1 className="text-lg font-semibold text-foreground">Ether Manager</h1>
          <p className="text-xs text-muted-foreground">Zenless Zone Zero mods</p>
        </div>

        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <Button
                key={item.id}
                type="button"
                variant={isActive ? "secondary" : "ghost"}
                aria-current={isActive ? "page" : undefined}
                className="justify-start gap-2"
                onClick={() => goTo(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          {checkAllUpdates.isError && (
            <p className="px-2 text-xs text-destructive">Update check failed — try again.</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-start"
            disabled={checkAllUpdates.isPending}
            onClick={() => checkAllUpdates.mutate(true)}
          >
            {checkAllUpdates.isPending ? "Checking…" : "Check for updates"}
          </Button>
        </div>
      </aside>

      {/* No centered max-width container: this is a desktop window, so content fills whatever
          width the user gives it. Individual pages cap themselves only where line length
          actually matters for reading (Settings, the mod description). */}
      <main className="flex-1 overflow-y-auto p-6">
        <div>
          {view === "browse" ? (
            selectedMod ? (
              <ModDetailRoute mod={selectedMod} onBack={() => setSelectedMod(null)} />
            ) : (
              <Browse onSelectMod={setSelectedMod} />
            )
          ) : view === "bookmarks" ? (
            selectedMod ? (
              <ModDetailRoute mod={selectedMod} onBack={() => setSelectedMod(null)} />
            ) : (
              <BookmarksView onSelectMod={setSelectedMod} />
            )
          ) : view === "settings" ? (
            <SettingsPage />
          ) : selectedCharacter ? (
            <CharacterDetail
              character={selectedCharacter}
              onBack={() => setSelectedCharacter(null)}
            />
          ) : (
            <Library onSelectCharacter={setSelectedCharacter} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
