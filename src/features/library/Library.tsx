import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchHotkey } from "@/lib/useSearchHotkey";
import {
  MISC_CHARACTER_ID,
  UI_CHARACTER_ID,
  type Character,
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

interface LibraryProps {
  onSelectCharacter: (character: Character) => void;
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
export function Library({ onSelectCharacter }: LibraryProps) {
  const [tab, setTab] = useState<LibraryTab>("characters");
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-foreground">Library</h2>
        {tab === "characters" && (
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a character…"
            aria-label="Find a character"
            className="w-full sm:max-w-xs"
          />
        )}
      </div>

      {/* The rule belongs to the row, not the tablist: the update button shares the line but is
          not a tab, and putting it inside the `tablist` would have it announced as one. */}
      <div className="flex items-end justify-between gap-4 border-b border-border">
        <div className="flex gap-1" role="tablist" aria-label="Library sections">
          {tabs.map((item) => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(item.id)}
                className={`-mb-px border-b-2 px-4 py-2 font-heading text-sm font-semibold uppercase tracking-[0.1em] transition-colors ${
                  isActive
                    ? "border-b-primary text-primary"
                    : "border-b-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                {item.count !== null && (
                  <span className="ml-2 text-xs font-normal opacity-70">{item.count}</span>
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
          {checkAllUpdates.isError && <span className="text-xs text-destructive">Check failed</span>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
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

      {tab === "characters" && <CharacterGrid onSelect={onSelectCharacter} query={query} />}

      {tab === "ui" && (
        <SlotSection
          characterId={UI_CHARACTER_ID}
          slot="Ui"
          mods={uiMods ?? []}
          updateChecksByModId={updateChecksByModId}
        />
      )}

      {tab === "misc" && (
        <SlotSection
          characterId={MISC_CHARACTER_ID}
          slot="Misc"
          mods={miscMods ?? []}
          updateChecksByModId={updateChecksByModId}
        />
      )}
    </div>
  );
}
