import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  Compass,
  Download,
  Layers,
  LayoutGrid,
  Settings as SettingsIcon,
} from "lucide-react";
import { SidebarFooter } from "@/components/SidebarFooter";
import { Button } from "@/components/ui/button";
import { BookmarksView } from "@/features/browse/BookmarksView";
import { Browse } from "@/features/browse/Browse";
import { CreatorPage } from "@/features/browse/CreatorPage";
import { ModDetailRoute } from "@/features/browse/ModDetailRoute";
import { DownloadsView } from "@/features/downloads/DownloadsView";
import { activeDownloads, useDownloads } from "@/features/downloads/hooks";
import { AllMods } from "@/features/library/AllMods";
import { CharacterDetail } from "@/features/library/CharacterDetail";
import { ImportDropOverlay } from "@/features/library/ImportDropOverlay";
import { ImportModSheet } from "@/features/library/ImportModSheet";
import { Library } from "@/features/library/Library";
import { useModImport } from "@/features/library/useModImport";
import { useCharacters, useModsFolder } from "@/features/library/hooks";
import { FirstRunSetup } from "@/features/settings/FirstRunSetup";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { placeholderGbMod } from "@/lib/placeholderGbMod";
import {
  backfillModThumbnails,
  type Character,
  type GbMod,
  type Mod,
} from "@/lib/tauri-commands";

type View = "library" | "allmods" | "browse" | "bookmarks" | "downloads" | "settings";

/** One level of drill-down inside a section.
 *
 * A creator frame carries the name as well as the id so the page can title itself before
 * the profile request answers — the mod that led there already knew it. */
type DetailFrame =
  | { kind: "mod"; mod: GbMod }
  | { kind: "creator"; id: number; name: string };

const NAV_ITEMS: { id: View; label: string; icon: typeof LayoutGrid }[] = [
  { id: "library", label: "Library", icon: LayoutGrid },
  { id: "allmods", label: "All mods", icon: Layers },
  { id: "browse", label: "Browse", icon: Compass },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/** Navigation is exactly two levels deep — a sidebar destination, then at most one drill-down
 * (character → its mods, or a browse result → its detail). Both drill-downs are pages rather
 * than dialogs; only short confirmations (add, update, install) stayed modal. */
function App() {
  const { data: modsFolder, isLoading } = useModsFolder();
  const [view, setView] = useState<View>("library");
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  /** What is open on top of the current section, innermost last.
   *
   * This was a single `selectedMod` slot while a drill-down could only ever be one level
   * deep. The creator page broke that: a mod leads to its author, whose mods lead to another
   * mod, whose author may be someone else again. A slot cannot say where Back goes in that
   * chain, and a pair of slots only pushes the same problem one step further out — so the
   * chain itself is the state, and Back pops it.
   *
   * Empty means the section's own root is showing. Cleared when leaving a section. */
  const [detailStack, setDetailStack] = useState<DetailFrame[]>([]);
  const openDetail = detailStack[detailStack.length - 1] ?? null;
  /** A GameBanana category for Browse to open on, set when you arrive there from a character
   * page. Held here rather than passed straight down because Browse unmounts whenever you open
   * a result and remounts on the way back — a plain prop would re-apply the character every
   * time and quietly undo whatever filter you had changed to. Browse consumes it once and
   * clears it. */
  const [browseSeedCategoryId, setBrowseSeedCategoryId] = useState<number | null>(null);

  /** The character whose page an import was started from, if it was started from one.
   *
   * The page you are looking at is context. Importing from Nicole's page means Nicole, and the
   * app knew that before it went looking for clues in the folder name — so a guess is only worth
   * making when there is nothing to know. Dropping a file works everywhere as it did; where it
   * lands just says more.
   *
   * Deliberately narrow: `selectedCharacter` is left standing underneath a mod detail and while
   * browsing (see the routing note below), and neither of those is a character page. */
  const seededCharacterId =
    detailStack.length === 0 && (view === "library" || view === "allmods")
      ? (selectedCharacter?.id ?? null)
      : null;
  // At the shell, because dropping a mod has to work on whichever page you happen to be on —
  // and because one listener and one sheet is the only arrangement where two drops cannot
  // fight over the same dialog.
  const imports = useModImport();
  const queryClient = useQueryClient();
  // Mounted at the shell rather than on the Downloads page, for two reasons: the nav badge has
  // to be right wherever you are, and this hook carries the `downloads-changed` listener that
  // refreshes the library when an install finishes — which must work when Downloads was never
  // opened, since nothing awaits an install anymore.
  const { data: downloads } = useDownloads();
  const activeCount = activeDownloads(downloads).length;
  // Downloads store a character id; the library page needs the whole record to open it.
  const { data: characters } = useCharacters();

  // Mods installed before the installer stored preview URLs have none, and nothing else would
  // ever give them one. The command only touches rows that are actually missing a preview, so
  // it costs nothing on the launches after it has done its work.
  useEffect(() => {
    backfillModThumbnails()
      .then((filled) => {
        if (filled > 0) {
          queryClient.invalidateQueries({ queryKey: ["mods"] });
          queryClient.invalidateQueries({ queryKey: ["allMods"] });
        }
      })
      .catch(() => {
        // Worst case the cards keep showing "No preview" — never worth interrupting anyone over.
      });
  }, [queryClient]);

  /** Opens an installed mod's GameBanana page without leaving the section you are in. The
   * detail route is shared with Browse rather than duplicated, so a mod looks the same whether
   * you reached it by browsing or by owning it — and Back returns you here, not to Browse. */
  function openModDetail(mod: Mod) {
    if (mod.gamebanana_mod_id === null) return;
    openMod(
      placeholderGbMod({
        gamebananaModId: mod.gamebanana_mod_id,
        name: mod.display_name,
        thumbnailUrl: mod.thumbnail_url,
        dateModified: mod.updated_at,
      }),
    );
  }

  /** Opens a mod, from anywhere — a browse result, a bookmark, a creator's list. Pushes
   * rather than replaces, so Back returns to whatever you were looking at when you clicked. */
  function openMod(mod: GbMod) {
    setDetailStack((stack) => [...stack, { kind: "mod", mod }]);
  }

  /** Opens a mod author's page. The name comes from the mod that led here so the heading is
   * right before the profile request answers. */
  function openCreator(id: number, name: string) {
    setDetailStack((stack) => [...stack, { kind: "creator", id, name }]);
  }

  function closeDetail() {
    setDetailStack((stack) => stack.slice(0, -1));
  }

  /** The open drill-down, whichever kind it is. Written once rather than per section: all
   * five sections share one detail chain, and Back must behave identically in each. */
  function renderDetail(frame: DetailFrame) {
    if (frame.kind === "creator") {
      return (
        <CreatorPage
          key={`creator-${frame.id}`}
          creatorId={frame.id}
          fallbackName={frame.name}
          onBack={closeDetail}
          onSelectMod={openMod}
        />
      );
    }
    return (
      <ModDetailRoute mod={frame.mod} onBack={closeDetail} onOpenCreator={openCreator} />
    );
  }

  /** Browse, optionally already narrowed to a character. "Browse for more" on a character page
   * means more mods for that character, and the app knows which one — arriving at an unfiltered
   * feed of every ZZZ mod made you set the filter it could have set for you. */
  function goToBrowse(seedCategoryId: number | null) {
    setBrowseSeedCategoryId(seedCategoryId);
    goTo("browse");
  }

  function goTo(next: View) {
    setView(next);
    // Leaving a section drops its drill-down, so returning to it lands on the section root
    // rather than wherever you happened to be three clicks deep last time.
    setDetailStack([]);
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
          <h1 className="font-heading text-lg font-bold uppercase tracking-[0.08em] text-primary">
            Ether Manager
          </h1>
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/70">
            Zenless Zone Zero mods
          </p>
        </div>

        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            // The active destination takes the full accent rather than a grey fill — in a
            // near-black shell a subtle tint reads as "slightly different", not "you are here".
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                aria-current={isActive ? "page" : undefined}
                className={`justify-start gap-2 font-heading text-sm uppercase tracking-[0.08em] ${
                  isActive
                    ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    : "text-sidebar-foreground hover:text-foreground"
                }`}
                onClick={() => goTo(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {/* Only on Downloads, and only while something is actually running — a badge
                    that is always there stops being a signal. On the active item it inverts, so
                    it stays legible against the full accent fill. */}
                {item.id === "downloads" && activeCount > 0 && (
                  <span
                    className={`ml-auto px-1.5 py-px font-heading text-[10px] tabular-nums ${
                      isActive
                        ? "bg-primary-foreground text-primary"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {activeCount}
                  </span>
                )}
              </Button>
            );
          })}
        </nav>

        <SidebarFooter />
      </aside>

      {/* No centered max-width container: this is a desktop window, so content fills whatever
          width the user gives it. Individual pages cap themselves only where line length
          actually matters for reading (Settings, the mod description). */}
      <main className="flex-1 overflow-y-auto p-6">
        <div>
          {view === "browse" ? (
            openDetail ? (
              renderDetail(openDetail)
            ) : (
              <Browse
                onSelectMod={openMod}
                seedCategoryId={browseSeedCategoryId}
                onSeedConsumed={() => setBrowseSeedCategoryId(null)}
              />
            )
          ) : view === "bookmarks" ? (
            openDetail ? (
              renderDetail(openDetail)
            ) : (
              <BookmarksView onSelectMod={openMod} />
            )
          ) : view === "downloads" ? (
            <DownloadsView
              onOpenCharacter={(characterId) => {
                const character = (characters ?? []).find((c) => c.id === characterId);
                if (!character) return;
                setView("library");
                setSelectedCharacter(character);
              }}
            />
          ) : view === "settings" ? (
            <SettingsPage />
          ) : openDetail ? (
            // Library, All mods and the character page all reach the same detail chain. It is
            // rendered inside whichever of them you were in rather than by switching to Browse,
            // so Back lands where you started — including on the character page, since
            // `selectedCharacter` is left standing underneath.
            renderDetail(openDetail)
          ) : view === "allmods" ? (
            // Drilling into a character from All mods lands on the character page, same as
            // from the roster — so this branch falls through to the shared detail below.
            selectedCharacter ? (
              <CharacterDetail
                character={selectedCharacter}
                onBack={() => setSelectedCharacter(null)}
                onBrowse={() =>
                  goToBrowse(selectedCharacter.gamebanana_category_id)
                }
                onOpenModDetail={openModDetail}
                onImport={imports.importFromPicker}
              />
            ) : (
              <AllMods
                onSelectCharacter={setSelectedCharacter}
                onOpenModDetail={openModDetail}
                onImport={imports.importFromPicker}
              />
            )
          ) : selectedCharacter ? (
            <CharacterDetail
              character={selectedCharacter}
              onBack={() => setSelectedCharacter(null)}
              onBrowse={() => goToBrowse(selectedCharacter.gamebanana_category_id)}
              onOpenModDetail={openModDetail}
              onImport={imports.importFromPicker}
            />
          ) : (
            <Library
              onSelectCharacter={setSelectedCharacter}
              onOpenModDetail={openModDetail}
              onImport={imports.importFromPicker}
            />
          )}
        </div>
      </main>

      <ImportDropOverlay
        isDragging={imports.isDragging}
        isBeginning={imports.isBeginning}
        error={imports.error}
        onDismissError={imports.dismissError}
      />
      {imports.begun && (
        <ImportModSheet
          begun={imports.begun}
          seededCharacterId={seededCharacterId}
          onOpenChange={() => imports.closeSheet()}
        />
      )}
    </div>
  );
}

export default App;
