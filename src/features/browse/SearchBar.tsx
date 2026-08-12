import { ArrowDownWideNarrow, Search as SearchIcon, Users, X } from "lucide-react";
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
  /** Lets Browse point the page-wide Ctrl+F hotkey at this input. */
  inputRef?: React.Ref<HTMLInputElement>;
}

export function SearchBar({
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
  sort,
  onSortChange,
  inputRef,
}: SearchBarProps) {
  const isTextSearchActive = query.trim().length > 0;
  const isCharacterFiltered = categoryId !== null;
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
    // Pinned to the top of the scroll area: the results below run to hundreds of cards, and
    // changing a filter meant scrolling back up to reach the controls. Full-bleed against the
    // page padding so the backing covers the gutters as content passes underneath, and the
    // negative top offset covers the padding above it.
    <div className="sticky -top-6 z-20 -mx-6 border-b-2 border-primary bg-background px-6 pt-6 pb-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Search" className="sm:max-w-sm sm:flex-1">
          {/* Search is the main thing you come to Browse to do, so it reads as the primary
              control rather than the first of three identical boxes: taller, an icon anchoring
              the left, and the accent on focus. */}
          <div className="group/search relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within/search:text-primary" />
            <Input
              ref={inputRef}
              // `type="search"` would add the browser's own clear affordance on top of ours.
              type="text"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search GameBanana mods…"
              aria-label="Search GameBanana mods"
              className="h-10 pr-16 pl-9 focus-visible:border-primary"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              // The page already binds Ctrl+F to this input; saying so is cheaper than
              // expecting anyone to discover it.
              <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 border border-border px-1.5 py-0.5 font-heading text-[10px] tracking-[0.08em] text-muted-foreground/70">
                CTRL F
              </kbd>
            )}
          </div>
        </Field>

        <Field label="Character" className="sm:w-60">
          <Select value={selectedCharacterId} onValueChange={handleCharacterChange}>
            {/* Border goes accent while a filter is applied — with sixty options it should be
                obvious at a glance that results are narrowed, without reading the value. */}
            <SelectTrigger
              className={`h-10 w-full [&>span]:flex [&>span]:items-center [&>span]:gap-2 ${
                isCharacterFiltered ? "border-primary text-foreground" : ""
              }`}
            >
              <SelectValue placeholder="All characters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CHARACTERS_VALUE}>
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  All characters
                </span>
              </SelectItem>
              {/* The portrait carries the recognition here. Sixty names is a wall of text in a
                  app where people know these characters by face long before spelling. */}
              {filterableCharacters.map((character) => (
                <SelectItem key={character.id} value={character.id}>
                  <span className="flex items-center gap-2">
                    {character.portrait ? (
                      <img
                        src={character.portrait}
                        alt=""
                        className="h-5 w-5 shrink-0 object-cover object-top"
                      />
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-secondary font-heading text-[10px] text-muted-foreground">
                        {character.name.charAt(0)}
                      </span>
                    )}
                    {character.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Sort by"
          className="sm:w-52"
          hint={isTextSearchActive ? "Not available while searching" : undefined}
        >
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as ModSort)}
            disabled={isTextSearchActive}
          >
            <SelectTrigger className="h-10 w-full [&>span]:flex [&>span]:items-center [&>span]:gap-2">
              <ArrowDownWideNarrow className="h-4 w-4 shrink-0 text-muted-foreground" />
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
        </Field>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}

/** A labelled control. The values alone ("All characters", "Latest Updated") read as data
 * rather than as filters, so each gets the small uppercase label the rest of the app uses.
 * The hint slot is always rendered so a control gaining or clearing one cannot shift the
 * row's height. */
function Field({ label, children, className, hint }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="font-heading text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
      <span className="h-3 text-[10px] text-muted-foreground/70">{hint}</span>
    </div>
  );
}
