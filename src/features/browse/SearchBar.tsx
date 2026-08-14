import { ArrowDownWideNarrow, Layers, Search as SearchIcon, Users, X } from "lucide-react";
import { useCharacters } from "@/features/library/hooks";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MISC_CHARACTER_ID, UI_CHARACTER_ID, type ModSort } from "@/lib/tauri-commands";
import { SORT_OPTIONS } from "./sortOptions";

const ALL_CHARACTERS_VALUE = "all";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  categoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
  sort: ModSort;
  onSortChange: (sort: ModSort) => void;
  /** Lets Browse point the page-wide Ctrl+F hotkey at this input. */
  inputRef?: React.Ref<HTMLInputElement>;
  /** The pinned bar's version: one short row, no labels. The labels earn their place in the
   * header, where the controls are first met and their values ("All characters") read as data
   * rather than as filters. In a bar that appears mid-scroll you already know what they are,
   * and the height they cost is height taken from the results. */
  compact?: boolean;
}

export function SearchBar({
  query,
  onQueryChange,
  categoryId,
  onCategoryChange,
  sort,
  onSortChange,
  inputRef,
  compact = false,
}: SearchBarProps) {
  // `min-h` as well as `h`, because the select trigger sets its own height through
  // `data-[size=default]:h-8`. That is an attribute selector, so it outranks a plain `h-10`
  // utility and quietly won — the two dropdowns have been 32px next to a 40px search field.
  // `min-height` is a different property, so it settles the matter without a specificity fight.
  const controlHeight = compact ? "h-9 min-h-9" : "h-10 min-h-10";
  const isTextSearchActive = query.trim().length > 0;
  const isCharacterFiltered = categoryId !== null;
  const { data: characters } = useCharacters();
  const filterableCharacters = (characters ?? []).filter(
    (character) => character.gamebanana_category_id !== null,
  );
  // `listCharacters` returns the roster plus the two library-wide categories in one list, the
  // same as the install flow's target picker uses. Here they want separating, because one group
  // is browsed by face and the other is two fixed choices.
  const isGlobalCategory = (id: string) => id === UI_CHARACTER_ID || id === MISC_CHARACTER_ID;
  const globalCategories = filterableCharacters.filter((character) =>
    isGlobalCategory(character.id),
  );
  const rosterCharacters = filterableCharacters.filter(
    (character) => !isGlobalCategory(character.id),
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
    // The controls sit inside Browse's header block now, which supplies the framing and the
    // accent rule that closes it. They no longer pin themselves to the top of the scroll area:
    // a sticky element cannot escape a bordered parent without tearing it, and the header is
    // far too tall to pin whole.
    <div
      className={
        compact ? "flex flex-1 items-center gap-2" : "flex flex-col gap-3 sm:flex-row sm:items-end"
      }
    >
        <Field label="Search" className="sm:max-w-sm sm:flex-1" compact={compact}>
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
              className={`${controlHeight} pr-16 pl-9 focus-visible:border-primary`}
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

        <Field label="Character" className={compact ? "w-52" : "sm:w-60"} compact={compact}>
          <Select value={selectedCharacterId} onValueChange={handleCharacterChange}>
            {/* Border goes accent while a filter is applied — with sixty options it should be
                obvious at a glance that results are narrowed, without reading the value. */}
            <SelectTrigger
              className={`${controlHeight} w-full [&>span]:flex [&>span]:items-center [&>span]:gap-2 ${
                isCharacterFiltered ? "border-primary text-foreground" : ""
              }`}
            >
              <SelectValue placeholder="All characters" />
            </SelectTrigger>
            {/* `popper` rather than the default `item-aligned`, which centres the panel on the
                selected row and sets an inline `max-height: 100%` — that inline value beats any
                class, so with sixty-odd options the list grew as tall as the app and stopped
                reading as a dropdown at all. Anchored under the trigger, the cap applies and it
                scrolls within itself. */}
            <SelectContent position="popper" className="max-h-80">
              <SelectItem value={ALL_CHARACTERS_VALUE}>
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  All characters
                </span>
              </SelectItem>

              {/* UI and Misc are not roster members, and there are only two of them, so they sit
                  with the other whole-library choice at the top. Ordered in among sixty
                  characters they were stranded at the bottom of a long scroll. */}
              {globalCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    {category.name}
                  </span>
                </SelectItem>
              ))}

              <SelectSeparator />

              {/* The portrait carries the recognition here. Sixty names is a wall of text in a
                  app where people know these characters by face long before spelling. */}
              {rosterCharacters.map((character) => (
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
          className={compact ? "w-44" : "sm:w-52"}
          compact={compact}
          hint={isTextSearchActive ? "Not available while searching" : undefined}
        >
          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as ModSort)}
            disabled={isTextSearchActive}
          >
            <SelectTrigger
              className={`${controlHeight} w-full [&>span]:flex [&>span]:items-center [&>span]:gap-2`}
            >
              <ArrowDownWideNarrow className="h-4 w-4 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            {/* Matched to the character dropdown beside it: two adjacent controls opening in
                different places — one under the trigger, one over it — reads as a glitch. */}
            <SelectContent position="popper">
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
  compact?: boolean;
}

/** A labelled control. The values alone ("All characters", "Latest Updated") read as data
 * rather than as filters, so each gets the small uppercase label the rest of the app uses.
 * The hint slot is always rendered so a control gaining or clearing one cannot shift the
 * row's height. */
function Field({ label, children, className, hint, compact = false }: FieldProps) {
  // In the pinned bar the label and the hint slot are dropped and the control carries the label
  // itself, so the whole bar is one control tall. `title` keeps the naming for a pointer, and
  // each control already has its own `aria-label`, so nothing is lost to a screen reader.
  if (compact) {
    return (
      <div className={className} title={hint ? `${label} — ${hint}` : label}>
        {children}
      </div>
    );
  }

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
