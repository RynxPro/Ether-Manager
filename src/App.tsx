import { useEffect, useRef, useState } from "react";
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
import { TitleBar } from "@/components/TitleBar";
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
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { useCharacters, useModsFolder } from "@/features/library/hooks";
import { FirstRunSetup } from "@/features/settings/FirstRunSetup";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { placeholderGbMod } from "@/lib/placeholderGbMod";
import {
  backfillModThumbnails,
  MISC_CHARACTER_ID,
  UI_CHARACTER_ID,
  type Character,
  type CreatorFeedItem,
  type GbMod,
  type Mod,
} from "@/lib/tauri-commands";

type View =
  "library" | "allmods" | "browse" | "bookmarks" | "downloads" | "settings";

/** One level of drill-down inside a section.
 *
 * A creator frame carries the name as well as the id so the page can title itself before
 * the profile request answers — the mod that led there already knew it. */
type DetailFrame =
  { kind: "mod"; mod: GbMod } | { kind: "creator"; id: number; name: string };

/** Somewhere you can be in the app: which section, which character page inside it, and how far
 * into the mod/creator chain on top of that.
 *
 * One value rather than three pieces of state, because back and forward have to restore all
 * three together or they land you somewhere that never existed — a mod detail belonging to a
 * section you are no longer in. */
interface Location {
  view: View;
  character: Character | null;
  detailStack: DetailFrame[];
}

const HOME: Location = { view: "library", character: null, detailStack: [] };

/** How far back the mouse can reach. Each entry holds a whole `GbMod` for every open detail, so
 * an unbounded trail would keep every mod ever looked at alive for the session. Fifty is well
 * past the point anyone is still retracing a path. */
const MAX_HISTORY = 50;

/** The bottom-right chamfer every card in the app is cut with. The sidebar used to be the one
 * surface that never wore it, which is most of why it read as furniture from a different app. */
const CUT_CORNER = {
  clipPath:
    "polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%)",
};

/** The six destinations, in three groups.
 *
 * Six flat entries claimed all six were the same kind of thing, and they are not: two are what
 * you own, two are somebody else's catalogue, two are the machinery. The grouping is the point
 * of the labels — at six items nobody needs help *finding* Settings, they need telling that
 * Browse and Bookmarks are about a place that is not their disk.
 *
 * Order is unchanged from the flat list, so muscle memory survives. */
const NAV_GROUPS: {
  label: string;
  items: { id: View; label: string; icon: typeof LayoutGrid }[];
}[] = [
  {
    label: "Yours",
    items: [
      { id: "library", label: "Library", icon: LayoutGrid },
      { id: "allmods", label: "All mods", icon: Layers },
    ],
  },
  {
    label: "Discover",
    items: [
      { id: "browse", label: "Browse", icon: Compass },
      { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
    ],
  },
  {
    label: "System",
    items: [
      { id: "downloads", label: "Downloads", icon: Download },
      { id: "settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

/** Navigation is exactly two levels deep — a sidebar destination, then at most one drill-down
 * (character → its mods, or a browse result → its detail). Both drill-downs are pages rather
 * than dialogs; only short confirmations (add, update, install) stayed modal. */
function App() {
  const { data: modsFolder, isLoading } = useModsFolder();
  /** Everywhere you have been, and where in that trail you currently are.
   *
   * A trail rather than a single spot because the mouse's back and forward buttons ask for one:
   * they were dead in the app until now, since navigating was three `setState` calls that threw
   * the previous place away. Each entry is a whole `Location`, so stepping through them cannot
   * produce a combination that was never real.
   *
   * Not persisted. A trail restored from a previous run would offer to go "back" to a page from
   * days ago, which is not what anyone means by back. */
  const [history, setHistory] = useState<Location[]>([HOME]);
  const [cursor, setCursor] = useState(0);
  const here = history[cursor];
  const view = here.view;
  const selectedCharacter = here.character;

  // Read by `goForward`, which needs the trail's current length from inside an event listener
  // registered once. Reading `history` there directly would see whatever it was when the
  // listener was created.
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  /** Moves somewhere new, which discards anything that was ahead — the same thing a browser
   * does when you go back and then follow a different link. */
  function navigate(next: Location) {
    setHistory((past) => {
      const trail = [...past.slice(0, cursor + 1), next];
      return trail.length > MAX_HISTORY
        ? trail.slice(trail.length - MAX_HISTORY)
        : trail;
    });
    setCursor((c) => Math.min(c + 1, MAX_HISTORY - 1));
  }

  function goBack() {
    setCursor((c) => Math.max(0, c - 1));
  }

  function goForward() {
    setCursor((c) => Math.min(historyRef.current.length - 1, c + 1));
  }

  /** What is open on top of the current section, innermost last.
   *
   * This was a single `selectedMod` slot while a drill-down could only ever be one level
   * deep. The creator page broke that: a mod leads to its author, whose mods lead to another
   * mod, whose author may be someone else again. A slot cannot say where Back goes in that
   * chain, and a pair of slots only pushes the same problem one step further out — so the
   * chain itself is the state, and Back pops it.
   *
   * Empty means the section's own root is showing. Cleared when leaving a section. */
  const detailStack = here.detailStack;
  const openDetail = detailStack[detailStack.length - 1] ?? null;

  /** The mouse's fourth and fifth buttons, which every other Windows app treats as back and
   * forward and which did nothing here at all.
   *
   * Handled on `mouseup` so a press that began outside the window does not count, and the two
   * companion events are swallowed because Chromium fires `auxclick` after them and would
   * otherwise try its own history navigation on top of this one. Registered on `window` in the
   * capture phase so it works wherever the pointer happens to be — these buttons are not aimed
   * at anything the way a click is. */
  useEffect(() => {
    const isNavButton = (event: MouseEvent) =>
      event.button === 3 || event.button === 4;

    const onMouseUp = (event: MouseEvent) => {
      if (!isNavButton(event)) return;
      event.preventDefault();
      if (event.button === 3) goBack();
      else goForward();
    };
    const swallow = (event: MouseEvent) => {
      if (isNavButton(event)) event.preventDefault();
    };

    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("mousedown", swallow, true);
    window.addEventListener("auxclick", swallow, true);
    return () => {
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("mousedown", swallow, true);
      window.removeEventListener("auxclick", swallow, true);
    };
    // Registered once for the app's lifetime, and safe to be: `goBack`/`goForward` only ever
    // call `setCursor` with an updater and read the trail through a ref, so neither can close
    // over a stale value.
  }, []);
  /** A GameBanana category for Browse to open on, set when you arrive there from a character
   * page. Held here rather than passed straight down because Browse unmounts whenever you open
   * a result and remounts on the way back — a plain prop would re-apply the character every
   * time and quietly undo whatever filter you had changed to. Browse consumes it once and
   * clears it. */
  const [browseSeedCategoryId, setBrowseSeedCategoryId] = useState<
    number | null
  >(null);
  /** A Library tab to open on, set when arriving from a UI or Misc download. Consumed once for
   * the same reason as `browseSeedCategoryId`: Library unmounts whenever a character page opens
   * and remounts on the way back, so a standing prop would drag you back to the UI tab every
   * time you returned from a character. */
  const [librarySeedTab, setLibrarySeedTab] = useState<"ui" | "misc" | null>(
    null,
  );

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

  /** Opens the mod a notification-bell row names.
   *
   * Goes through Browse rather than opening the detail on top of whichever section happens to
   * be showing: the bell is reachable from every section, and a mod page stacked over Settings
   * or Downloads would leave Back returning somewhere unrelated to what you just clicked.
   *
   * The stored row is enough to start rendering — `placeholderGbMod` fills the rest, and the
   * live fetch replaces it a moment later. `date_added` stands in for `dateModified` because
   * this is a new upload: the two are the same instant until someone edits it. */
  function openFeedItem(item: CreatorFeedItem) {
    setBrowseSeedCategoryId(null);
    navigate({
      view: "browse",
      character: null,
      detailStack: [
        {
          kind: "mod",
          mod: placeholderGbMod({
            gamebananaModId: item.gamebanana_mod_id,
            name: item.mod_name,
            thumbnailUrl: item.thumbnail_url,
            dateModified: item.date_added,
          }),
        },
      ],
    });
  }

  /** Opens a mod, from anywhere — a browse result, a bookmark, a creator's list. Pushes
   * rather than replaces, so Back returns to whatever you were looking at when you clicked. */
  function openMod(mod: GbMod) {
    navigate({ ...here, detailStack: [...detailStack, { kind: "mod", mod }] });
  }

  /** Opens a mod author's page. The name comes from the mod that led here so the heading is
   * right before the profile request answers. */
  function openCreator(id: number, name: string) {
    navigate({
      ...here,
      detailStack: [...detailStack, { kind: "creator", id, name }],
    });
  }

  /** Leaving a drill-down is a step back, not a step somewhere new, so it moves along the trail
   * instead of extending it — otherwise pressing Back on screen and then Back on the mouse would
   * send you forwards into the page you had just left.
   *
   * The fallback covers the one path with no previous entry to return to: a detail opened from
   * the notification bell on a freshly started app. Popping directly still lands on the section
   * root. */
  function closeDetail() {
    if (cursor > 0) goBack();
    else navigate({ ...here, detailStack: detailStack.slice(0, -1) });
  }

  /** Back out of a character's page, by the same reasoning as `closeDetail`. */
  function closeCharacter() {
    if (cursor > 0) goBack();
    else navigate({ ...here, character: null });
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
      <ModDetailRoute
        mod={frame.mod}
        onBack={closeDetail}
        onOpenCreator={openCreator}
      />
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
    // Leaving a section drops its drill-down, so returning to it lands on the section root
    // rather than wherever you happened to be three clicks deep last time.
    navigate({ view: next, character: null, detailStack: [] });
  }

  // The window has no native frame, so the title bar has to be outside whatever the app is
  // currently showing — including the two states that used to return early. A first run that
  // could not be moved off a second monitor, or closed while it waited, would be a trap.
  return (
    <Shell>
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          Loading…
        </div>
      ) : !modsFolder ? (
        <div className="flex-1 overflow-y-auto">
          <FirstRunSetup />
        </div>
      ) : (
        <>
          {/* No wordmark. The title bar says the app's name 32px above this, and repeating it
              here cost 60px to tell you something you had just read. Padding is vertical only —
              the rows run edge to edge so the active block's fill reaches the panel's border,
              which is what makes it read as a marker rather than a floating button. */}
          <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar pb-3 pt-3.5">
            <nav aria-label="Main">
              {NAV_GROUPS.map((group, groupIndex) => (
                <div
                  key={group.label}
                  role="group"
                  aria-labelledby={`nav-group-${group.label}`}
                  className={groupIndex > 0 ? "mt-4" : undefined}
                >
                  {/* The rule runs from the end of the label to the panel edge — a caption with
                      a line trailing off it, the way a bulkhead is stencilled. */}
                  <p
                    id={`nav-group-${group.label}`}
                    className="mb-2 flex items-center gap-2 px-4 font-heading text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50"
                  >
                    {group.label}
                    <span
                      aria-hidden
                      className="h-px flex-1 bg-sidebar-border"
                    />
                  </p>

                  {group.items.map((item, itemIndex) => {
                    const Icon = item.icon;
                    const isActive = view === item.id;
                    const index =
                      NAV_GROUPS.slice(0, groupIndex).reduce(
                        (n, g) => n + g.items.length,
                        0,
                      ) +
                      itemIndex +
                      1;
                    // The active destination takes the full accent rather than a grey fill — in
                    // a near-black shell a subtle tint reads as "slightly different", not "you
                    // are here".
                    return (
                      <div key={item.id}>
                        {/* Between rows inside a group only, never above the first: the group's
                            own caption already divides it from what came before. */}
                        {itemIndex > 0 && (
                          <div
                            aria-hidden
                            className="mx-4 h-px bg-sidebar-border"
                          />
                        )}
                        <button
                          type="button"
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => goTo(item.id)}
                          style={isActive ? CUT_CORNER : undefined}
                          className={`group relative flex h-[38px] w-full items-center gap-2.5 px-4 font-heading text-[13.5px] uppercase tracking-[0.09em] outline-none focus-visible:ring-1 focus-visible:ring-primary ${
                            isActive
                              ? "bg-primary font-semibold text-primary-foreground"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                          }`}
                        >
                          {/* A tick on the leading edge rather than a shifted row: hover must not
                              move the thing being pointed at, or a slow hand chases it. */}
                          {!isActive && (
                            <span
                              aria-hidden
                              className="absolute inset-y-2 left-0 w-[2px] scale-y-0 bg-primary transition-transform group-hover:scale-y-100"
                            />
                          )}
                          {/* The index is decoration with a job: six near-identical rows gain a
                              fixed left-hand column, so the eye has a ruler to run down. */}
                          <span
                            aria-hidden
                            className={`w-3.5 shrink-0 text-left text-[9.5px] tracking-[0.1em] tabular-nums ${
                              isActive
                                ? "text-primary-foreground/45"
                                : "text-muted-foreground/40"
                            }`}
                          >
                            {String(index).padStart(2, "0")}
                          </span>
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-left">
                            {item.label}
                          </span>
                          {/* Only on Downloads, and only while something is actually running — a
                              badge that is always there stops being a signal. On the active item
                              it inverts, so it stays legible against the full accent fill. */}
                          {item.id === "downloads" && activeCount > 0 && (
                            <span
                              className={`shrink-0 px-1.5 py-px font-heading text-[10px] tabular-nums ${
                                isActive
                                  ? "bg-primary-foreground text-primary"
                                  : "bg-primary text-primary-foreground"
                              }`}
                            >
                              {activeCount}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </nav>

            <SidebarFooter
              trailing={<NotificationBell onOpenMod={openFeedItem} />}
            />
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
                  <BookmarksView
                    onSelectMod={openMod}
                    onSelectCreator={openCreator}
                  />
                )
              ) : view === "downloads" ? (
                <DownloadsView
                  onOpenCharacter={(characterId) => {
                    // UI and Misc are categories, not roster members — they have no character page.
                    // `listCharacters` returns them alongside real characters, so opening one blindly
                    // rendered a character page for something that is not a character. Their mods
                    // live in Library's own UI and Misc tabs, which is where this goes instead.
                    if (
                      characterId === UI_CHARACTER_ID ||
                      characterId === MISC_CHARACTER_ID
                    ) {
                      setLibrarySeedTab(characterId);
                      goTo("library");
                      return;
                    }
                    const character = (characters ?? []).find(
                      (c) => c.id === characterId,
                    );
                    if (!character) return;
                    navigate({ view: "library", character, detailStack: [] });
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
                    onBack={closeCharacter}
                    onBrowse={() =>
                      goToBrowse(selectedCharacter.gamebanana_category_id)
                    }
                    onOpenModDetail={openModDetail}
                    onImport={imports.importFromPicker}
                  />
                ) : (
                  <AllMods
                    onSelectCharacter={(character) =>
                      navigate({ ...here, character, detailStack: [] })
                    }
                    onOpenModDetail={openModDetail}
                    onImport={imports.importFromPicker}
                  />
                )
              ) : selectedCharacter ? (
                <CharacterDetail
                  character={selectedCharacter}
                  onBack={closeCharacter}
                  onBrowse={() =>
                    goToBrowse(selectedCharacter.gamebanana_category_id)
                  }
                  onOpenModDetail={openModDetail}
                  onImport={imports.importFromPicker}
                />
              ) : (
                <Library
                  onSelectCharacter={(character) =>
                    navigate({ ...here, character, detailStack: [] })
                  }
                  onOpenModDetail={openModDetail}
                  onImport={imports.importFromPicker}
                  seedTab={librarySeedTab}
                  onSeedConsumed={() => setLibrarySeedTab(null)}
                />
              )}
            </div>
          </main>
        </>
      )}

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
    </Shell>
  );
}

/** The window itself: the title bar, and everything else under it.
 *
 * A column rather than the row the app used to be, because the bar spans the full width above
 * the sidebar as well as the content. `min-h-0` on the lower half is what keeps the row inside
 * it from growing past the window — a flex child defaults to a minimum size of its content, and
 * without this a long mod list would push the layout taller than the screen instead of
 * scrolling inside it. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TitleBar />
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}

export default App;
