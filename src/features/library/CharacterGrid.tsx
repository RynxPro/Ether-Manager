import { Skeleton } from "@/components/ui/skeleton";
import { POSTER_GRID } from "@/lib/layout";
import {
  MISC_CHARACTER_ID,
  UI_CHARACTER_ID,
  type Character,
  type ModCounts,
} from "@/lib/tauri-commands";
import { CharacterCard } from "./CharacterCard";
import { useCharacters, useModCounts } from "./hooks";

interface CharacterGridProps {
  onSelect: (character: Character) => void;
  /** Filters the roster by character name. Matches characters only — finding a specific mod is
   * the All Mods page's job, not the roster's. */
  query?: string;
}

const NO_MODS: ModCounts = { total: 0, enabled: 0 };

export function CharacterGrid({ onSelect, query = "" }: CharacterGridProps) {
  const { data: characters, isLoading: isLoadingCharacters } = useCharacters();
  const { data: modCounts } = useModCounts();

  if (isLoadingCharacters) {
    return (
      <div className={POSTER_GRID}>
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[3/4] rounded-xl" />
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

  // The whole roster always renders — browsing it is part of the point — but characters you
  // own nothing for sink below the ones you do, so the top of the grid is your actual
  // collection rather than mostly-empty cards. Ties keep the roster's own order.
  const sorted = matching
    .map((character) => ({ character, counts: modCounts?.[character.id] ?? NO_MODS }))
    .sort((a, b) => Number(b.counts.total > 0) - Number(a.counts.total > 0));

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
          onSelect={() => onSelect(character)}
        />
      ))}
    </div>
  );
}
