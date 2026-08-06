import { useCharacters } from "@/features/library/hooks";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_CHARACTERS_VALUE = "all";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  categoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
}

export function SearchBar({
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
}: SearchBarProps) {
  const { data: characters } = useCharacters();
  const filterableCharacters = (characters ?? []).filter(
    (character) => character.gamebanana_category_id !== null,
  );
  const selectedCharacterId =
    filterableCharacters.find((character) => character.gamebanana_category_id === categoryId)
      ?.id ?? ALL_CHARACTERS_VALUE;

  const handleCharacterChange = (value: string) => {
    if (value === ALL_CHARACTERS_VALUE) {
      onCategoryChange(null);
      return;
    }
    const character = filterableCharacters.find((c) => c.id === value);
    onCategoryChange(character?.gamebanana_category_id ?? null);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search GameBanana mods…"
        className="sm:max-w-xs"
      />
      <Select value={selectedCharacterId} onValueChange={handleCharacterChange}>
        <SelectTrigger className="sm:w-56">
          <SelectValue placeholder="All characters" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CHARACTERS_VALUE}>All characters</SelectItem>
          {filterableCharacters.map((character) => (
            <SelectItem key={character.id} value={character.id}>
              {character.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
