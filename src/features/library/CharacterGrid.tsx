import { Skeleton } from "@/components/ui/skeleton";
import { MISC_CHARACTER_ID, UI_CHARACTER_ID, type Character } from "@/lib/tauri-commands";
import { CharacterCard } from "./CharacterCard";
import { useCharacters, useModCounts } from "./hooks";

interface CharacterGridProps {
  onSelect: (character: Character) => void;
}

export function CharacterGrid({ onSelect }: CharacterGridProps) {
  const { data: characters, isLoading: isLoadingCharacters } = useCharacters();
  const { data: modCounts } = useModCounts();

  if (isLoadingCharacters) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {realCharacters.map((character) => (
        <CharacterCard
          key={character.id}
          character={character}
          modCount={modCounts?.[character.id] ?? 0}
          onSelect={() => onSelect(character)}
        />
      ))}
    </div>
  );
}
