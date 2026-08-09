import { useCharacters } from "@/features/library/hooks";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModSort } from "@/lib/tauri-commands";

const ALL_CHARACTERS_VALUE = "all";

const SORT_OPTIONS: { value: ModSort; label: string }[] = [
  { value: "LatestUpdated", label: "Latest Updated" },
  { value: "Newest", label: "Newest" },
  { value: "MostLiked", label: "Most Liked" },
  { value: "MostViewed", label: "Most Viewed" },
  { value: "MostDownloaded", label: "Most Downloaded" },
];

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  categoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
  sort: ModSort;
  onSortChange: (sort: ModSort) => void;
}

export function SearchBar({
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
  sort,
  onSortChange,
}: SearchBarProps) {
  const isTextSearchActive = query.trim().length > 0;
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
      <div className="flex flex-col gap-1">
        <Select
          value={sort}
          onValueChange={(value) => onSortChange(value as ModSort)}
          disabled={isTextSearchActive}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isTextSearchActive && (
          <p className="text-xs text-muted-foreground">Sort isn't available while searching.</p>
        )}
      </div>
    </div>
  );
}
