import { useEffect, useState } from "react";
import { FilePlus2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchHotkey } from "@/lib/useSearchHotkey";
import {
  MISC_CHARACTER_ID,
  UI_CHARACTER_ID,
  type Character,
  type Mod,
  type UpdateCheck,
} from "@/lib/tauri-commands";
import { CharacterGrid } from "./CharacterGrid";
import { SlotSection } from "./SlotSection";
import {
  useCharacters,
  useCheckAllUpdates,
  useModsForCharacter,
  useUpdateChecks,
} from "./hooks";
import { PageHeader } from "@/components/PageHeader";
import { SignStrip } from "@/components/SignStrip";

/** Says what a completed sweep actually found. Counts rather than a bare "done", because the
 * only outcome that changes the page is an update being available — every other result looks
 * exactly like nothing having happened.
 *
 * "Retired" is counted alongside rather than inside the others, because a mod's standing on
 * GameBanana and whether its files are current are independent facts: something can be both
 * retired and out of date, and reporting only one of those would be reporting the wrong one
 * half the time. */
function summariseUpdateSweep(checks: UpdateCheck[]): string {
  if (checks.length === 0) return "No GameBanana mods to check";

  const available = checks.filter((check) => check.status === "UpdateAvailable").length;
  // An unreachable mod and one whose check errored are the same thing to a reader: the app does
  // not know. Lumping them keeps the line short without claiming more than it can.
  const unknown = checks.filter(
    (check) => check.status === "Unavailable" || check.error !== null,
  ).length;

  // Counted separately from `available` rather than instead of it: the two are independent, and
  // a mod can honestly be both retired and out of date.
  const retired = checks.filter((check) => check.is_obsolete || check.is_withdrawn).length;

  const parts: string[] = [];
  if (available > 0) parts.push(`${available} update${available === 1 ? "" : "s"} available`);
  if (retired > 0) parts.push(`${retired} retired`);
  const settled = checks.length - available - unknown;
  if (settled > 0) parts.push(`${settled} up to date`);
  if (unknown > 0) parts.push(`${unknown} couldn't be checked`);
  return parts.join(" · ");
}

interface LibraryProps {
  onSelectCharacter: (character: Character) => void;
  /** Opens an installed mod's GameBanana page, via App's shared detail route. Reaches the UI
   * and Misc tabs, which are the only mod cards this page renders directly. */
  onOpenModDetail: (mod: Mod) => void;
  /** Opens the file picker and starts an import. Dropping a file on the window does the same
   * thing and is the faster path; this is here for anyone who does not think to drag. */
  onImport: () => void;
  /** A tab to open on, when arriving from somewhere that already knows which one — opening a
   * finished UI or Misc download from the Downloads page. `null` is the ordinary arrival. */
  seedTab?: LibraryTab | null;
  /** Called once the seed has been applied, so it is spent rather than standing. Library
   * unmounts whenever a character page opens; without this, coming back would drag you to the
   * seeded tab again instead of leaving you where you were. */
  onSeedConsumed?: () => void;
}

type LibraryTab = "characters" | "ui" | "misc";

/** The Library landing page. The roster and the two library-wide "UI"/"Misc" categories are
 * sibling tabs rather than one long scroll: at a realistic library size the roster is sixty
 * cards deep, which left both global sections stranded at the bottom of the longest scroll in
 * the app. They stay inside Library because that is what they are — library content that simply
 * is not character-shaped — so the sidebar keeps its five destinations.
 *
 * Search filters the roster by character name only, and so belongs to the Characters tab alone.
 * Finding a specific mod is the All Mods page's job — one search box, one behaviour each. */
export function Library({
  onSelectCharacter,
  onOpenModDetail,
  onImport,
  seedTab = null,
  onSeedConsumed,
}: LibraryProps) {
  const [tab, setTab] = useState<LibraryTab>(seedTab ?? "characters");
  // Spent on mount, not on every render: the state above already carries it, and leaving it
  // standing would re-select the tab every time you came back from a character page. Running
  // twice under StrictMode is harmless — clearing an already-cleared seed changes nothing.
  useEffect(() => {
    if (seedTab) onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only, by design
  }, []);
  const [query, setQuery] = useState("");
  const searchRef = useSearchHotkey(() => setQuery(""));
  const { data: characters } = useCharacters();
  const { data: uiMods } = useModsForCharacter(UI_CHARACTER_ID);
  const { data: miscMods } = useModsForCharacter(MISC_CHARACTER_ID);
  const { data: updateChecks } = useUpdateChecks();
  const checkAllUpdates = useCheckAllUpdates();
  const updateChecksByModId = new Map<number, UpdateCheck>(
    (updateChecks ?? []).map((check) => [check.mod_id, check]),
  );

  // `listCharacters` returns 62: the 60 real characters plus the `ui`/`misc` pseudo-characters
  // that exist for wire compatibility. They have their own tabs now, so counting them here
  // would both double-count them and disagree with the 60 cards the grid actually renders.
  const characterCount =
    characters?.filter((c) => c.id !== UI_CHARACTER_ID && c.id !== MISC_CHARACTER_ID).length ??
    null;

  // Counts ride on the tab labels so an empty Misc is visible without opening it.
  const tabs: { id: LibraryTab; label: string; count: number | null }[] = [
    { id: "characters", label: "Characters", count: characterCount },
    { id: "ui", label: "UI", count: uiMods?.length ?? null },
    { id: "misc", label: "Misc", count: miscMods?.length ?? null },
  ];

  // Built only from what this page already knows, and skipping anything still loading rather
  // than printing a zero — a sign that reads "0 CHARACTERS" for a moment on every open is worse
  // than one that arrives a beat late. Same `UpdateAvailable` predicate the sweep summary uses.
  const updatesWaiting = (updateChecks ?? []).filter(
    (check) => check.status === "UpdateAvailable",
  ).length;
  const signItems = [
    characterCount === null ? null : `${characterCount} CHARACTERS`,
    updatesWaiting > 0 ? `${updatesWaiting} UPDATES WAITING` : "NOTHING TO UPDATE",
    uiMods === undefined ? null : `${uiMods.length} UI`,
    miscMods === undefined ? null : `${miscMods.length} MISC`,
  ].filter((item): item is string => item !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library"
        tag="Library"
        subtitle="Your roster and what it is wearing"
        pinned={false}
      >
        <Button
          type="button"
          size="sm"
          onClick={onImport}
          // Paper stuck on the wall, like everything else you can press. The shadcn outline
          // variant is dropped rather than recoloured: an outline is a border doing the job a
          // surface should do here, and the two read as different kinds of object side by side.
          className="h-[38px] rotate-[0.7deg] border-0 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 hover:bg-card"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          Import
        </Button>
      </PageHeader>

      <SignStrip items={signItems} />

      {/* The rule is gone: it was separating the tabs from the grid, and the tabs are objects now
          rather than a row of text, so they separate themselves. What is left is a plain flex row,
          which is all it ever needed to be — the update button shares the line but is not a tab,
          and putting it inside the `tablist` would have it announced as one. */}
      <div className="relative flex items-end justify-between gap-4">
        <div className="flex gap-2" role="tablist" aria-label="Library sections">
          {tabs.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(item.id)}
                // Paper when selected, bare wall when not — the same rule the cards and the nav
                // follow, so "chosen" looks identical everywhere in the app. The selected one is
                // the only tab with a surface, which is a louder signal than a coloured underline
                // and costs no extra colour to say.
                // Same object as a nav sign, so the same scale and height — they were 21px against
                // the nav's 19px, which is the kind of near-miss that reads as sloppiness rather
                // than hierarchy. The row's controls sit two steps down at 17px, and that gap is
                // the hierarchy.
                className={`inline-flex h-[38px] items-center px-4 font-sign text-[19px] uppercase tracking-[0.1em] transition-[rotate,translate] duration-200 ${
                  isActive
                    ? "-rotate-[0.8deg] bg-card text-card-foreground shadow-slap"
                    : "text-muted-foreground hover:-translate-y-px hover:text-foreground"
                }`}
              >
                {item.label}
                {item.count !== null && (
                  <span className="ml-2 font-mono text-[15px] font-bold opacity-55">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Shares the rail rather than sitting beside the title, but acts on every installed
            mod regardless of which tab is open — hence the neutral label and the gap between it
            and the tabs. It cannot go with the search above, which only renders on Characters,
            because this has to stay reachable from all three. */}
        <div className="flex items-center gap-3 pb-1.5">
          {/* Moved down from the header band, where it sat beside Import as though the two were
              the same kind of control. They are not: Import acts on the library, this filters the
              list directly below it — and it only exists on the Characters tab, so it belongs to
              the tab row rather than to the page.

              Styled as paper, like every other thing here you can touch. It was the last shadcn
              default left on the page: a rounded, bordered box in a language with no rounded
              boxes. */}
          {tab === "characters" && (
            // Tilted the opposite way to the active tab at the far end of the row, so the two ends
            // lean apart rather than in parallel — parallel tilts read as a skewed layout, opposed
            // ones read as separately placed objects.
            <div className="relative rotate-[0.6deg]">
              {/* The icon is the label. A visible text label is the rule for form fields, and the
                  right call almost everywhere — but a magnifier in a field is the one convention
                  strong enough to stand in for one, and the accessible name is still on the input
                  itself for anyone not looking at it. */}
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-card-foreground/40"
              />
              <Input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a character…"
                aria-label="Find a character"
                className="h-[38px] w-60 border-0 bg-card pl-10 font-sign text-[17px] md:text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap placeholder:text-card-foreground/40 focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          )}
          {/* A sweep that finds nothing changes nothing on screen, which is indistinguishable
              from the button not having worked — and finding nothing is the usual outcome. The
              result stays until the next check rather than fading, because it is a fact about
              the library, not a notification. */}
          {checkAllUpdates.isError ? (
            <span className="text-xs text-destructive">Check failed — try again</span>
          ) : checkAllUpdates.data ? (
            <span className="text-xs text-muted-foreground">
              {summariseUpdateSweep(checkAllUpdates.data)}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            // Paper, like the search beside it and Import above — the shadcn `ghost` variant left
            // it as bare text in a row of objects, which read as an unfinished link rather than a
            // control. Deliberately quieter than Import though: that starts something, this only
            // asks a question, and a grid of equally loud buttons has no hierarchy in it.
            className="h-[38px] -rotate-[0.5deg] border-0 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground/70 shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 hover:bg-card hover:text-card-foreground"
            disabled={checkAllUpdates.isPending}
            onClick={() => checkAllUpdates.mutate(true)}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${checkAllUpdates.isPending ? "animate-spin" : ""}`}
            />
            {checkAllUpdates.isPending ? "Checking…" : "Check for updates"}
          </Button>
        </div>
      </div>

      {/* One wrapper for all three tab bodies rather than `relative` on each component's root:
          the reason is the wall tag behind them, which is this page's business and not something
          `CharacterGrid` or `SlotSection` should have to know about to render correctly. */}
      <div className="relative">
        {tab === "characters" && <CharacterGrid onSelect={onSelectCharacter} query={query} />}

        {tab === "ui" && (
          <SlotSection
            mods={uiMods ?? []}
            updateChecksByModId={updateChecksByModId}
            onOpenModDetail={onOpenModDetail}
          />
        )}

        {tab === "misc" && (
          <SlotSection
            mods={miscMods ?? []}
            updateChecksByModId={updateChecksByModId}
            onOpenModDetail={onOpenModDetail}
          />
        )}
      </div>
    </div>
  );
}
