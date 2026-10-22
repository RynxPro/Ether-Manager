import { Skeleton } from "@/components/ui/skeleton";
import { sortCharacters, type CharacterSort } from "./characterSort";
import { POSTER_GRID } from "@/lib/layout";
import {
  MISC_CHARACTER_ID,
  UI_CHARACTER_ID,
  type Character,
  type ModCounts,
} from "@/lib/tauri-commands";
import { useConflictWarnings } from "@/features/settings/hooks";
import { CharacterCard } from "./CharacterCard";
import {
  useAllMods,
  useCharacters,
  useModConflicts,
  useModCounts,
  useUpdateChecks,
} from "./hooks";

interface CharacterGridProps {
  onSelect: (character: Character) => void;
  /** How to order the roster. Owned by `Library`, because the control that sets it lives in
   * the page header beside the search box. */
  sort?: CharacterSort;
  /** Filters the roster by character name. Matches characters only — finding a specific mod is
   * the All Mods page's job, not the roster's. */
  query?: string;
}

const NO_MODS: ModCounts = { total: 0, enabled: 0 };

export function CharacterGrid({ onSelect, query = "", sort = "yours" }: CharacterGridProps) {
  const { data: characters, isLoading: isLoadingCharacters } = useCharacters();
  const { data: modCounts } = useModCounts();
  // Both of these are already in cache when the Library renders — `allMods` backs the search
  // above the grid, and update checks are a cache-only read — so the card's extra detail costs
  // no additional round trip.
  const { data: allMods } = useAllMods();
  const { data: updateChecks } = useUpdateChecks();
  // Read once for the whole roster rather than in each of the sixty cards. Undefined while the
  // first read is in flight counts as on, so the marks do not appear a beat after the grid.
  const { data: conflictWarnings } = useConflictWarnings();
  const showConflictWarning = conflictWarnings !== false;
  // One scan for the roster. Each conflict names the character it belongs to, so the cards need
  // nothing but the set of characters that have one.
  const { data: conflicts } = useModConflicts();
  const charactersInConflict = new Set((conflicts ?? []).map((conflict) => conflict.character_id));

  if (isLoadingCharacters) {
    return (
      <div className={POSTER_GRID}>
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[3/4]" />
        ))}
      </div>
    );
  }

  // UI/Misc are rendered as page-level sections (see Library.tsx), not cards here — filtered
  // back out of listCharacters()'s combined response, which Browse's filter and the install
  // flow's target picker still want them included in.
  const realCharacters = (characters ?? []).filter(
    (character) => character.id !== UI_CHARACTER_ID && character.id !== MISC_CHARACTER_ID,
  );

  const needle = query.trim().toLowerCase();
  const matching = needle
    ? realCharacters.filter((character) => character.name.toLowerCase().includes(needle))
    : realCharacters;

  // The whole roster always renders — browsing it is part of the point — and how it is ordered
  // is the reader's choice now. See `characterSort`; every option settles its ties on the
  // roster's own order.
  const sorted = sortCharacters(
    matching.map((character) => ({ character, counts: modCounts?.[character.id] ?? NO_MODS })),
    sort,
  );

  // v1 enables one mod per slot and every real character has a single slot, so the first
  // enabled mod found is the character's current look. If multi-enable ever lands, this picks
  // one arbitrarily and the card will need a real answer rather than a silent first-wins.
  const enabledModNames = new Map<string, string>();
  for (const mod of allMods ?? []) {
    if (mod.enabled && !enabledModNames.has(mod.character_id)) {
      enabledModNames.set(mod.character_id, mod.display_name);
    }
  }

  const charactersWithUpdate = new Set(
    (updateChecks ?? [])
      .filter((check) => check.status === "UpdateAvailable")
      .map((check) => check.character_id),
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">No character matches “{query.trim()}”.</p>;
  }

  return (
    <div className={POSTER_GRID}>
      {sorted.map(({ character, counts }) => (
        <CharacterCard
          key={character.id}
          character={character}
          counts={counts}
          enabledModName={enabledModNames.get(character.id) ?? null}
          hasUpdate={charactersWithUpdate.has(character.id)}
          showConflictWarning={showConflictWarning}
          hasConflict={charactersInConflict.has(character.id)}
          onSelect={() => onSelect(character)}
        />
      ))}
    </div>
  );
}
