import { useEffect, useRef, useState } from "react";
import { MISC_CHARACTER_ID, UI_CHARACTER_ID } from "@/lib/tauri-commands";
import { useCharacters } from "./hooks";

/** This control only ever appears inside a dialog, so it stands on `--card` — which means
 * everything you can touch in it has to be `--background` to have an edge at all. */
const ON_PAPER =
  "bg-background text-foreground shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none";

/** The two destinations that are not roster members. Kept out of the search because nobody
 * looks for "Misc" by typing it, and they are where library-wide mods go. */
const PSEUDO_DESTINATIONS = [
  { id: UI_CHARACTER_ID, label: "UI" },
  { id: MISC_CHARACTER_ID, label: "Misc" },
] as const;

interface CharacterPickerProps {
  /** Ties the search box to a caller's `<Label htmlFor>`. */
  id: string;
  /** The staged destination, or null when nothing has been chosen yet — which is how an import
   * starts when the character could not be guessed with confidence. */
  value: string | null;
  onChange: (characterId: string) => void;
  disabled?: boolean;
  /** Where the mod is filed *now*, when there is such a thing. Only changes the word on the
   * selected row — "Current" until you pick something else, then "Selected". An import has no
   * prior filing, so it passes nothing and the row is marked neither way. */
  currentId?: string;
}

/** Choosing which character a mod belongs to, or the two buckets that are not characters.
 *
 * A dropdown of sixty characters is a scroll, not a choice. Typing two letters gets there
 * instead, and UI / Misc stay out of the filter entirely — they are not roster members, and they
 * are common enough destinations to be worth a permanent pair of buttons rather than something
 * to search for.
 *
 * Extracted from the edit dialog when importing needed the same control. Both callers are asking
 * one question — where does this mod go — and a second copy would have drifted from this one the
 * first time either changed. */
export function CharacterPicker({
  id,
  value,
  onChange,
  disabled = false,
  currentId,
}: CharacterPickerProps) {
  const { data: characters } = useCharacters();
  const realCharacters = (characters ?? []).filter(
    (character) => character.id !== UI_CHARACTER_ID && character.id !== MISC_CHARACTER_ID,
  );

  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // The roster is in game order, so the chosen character is usually somewhere below the fold —
  // opening on "Von Lycaon" when the mod is Nicole's asks you to scroll just to learn where you
  // already are. Runs once: after that the scroll position is the user's.
  useEffect(() => {
    // A frame late on purpose: this mounts into a portal that animates in, so on the effect's
    // own tick the list has no layout yet and scrolling it is a no-op.
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      const current = list?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!list || !current) return;
      list.scrollTop = current.offsetTop - list.clientHeight / 2 + current.offsetHeight / 2;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? realCharacters.filter((character) => character.name.toLowerCase().includes(needle))
    : realCharacters;

  return (
    <>
      {/* The sign face, like every other search in the app, on its own plate sunk into the
          card rather than drawn on it. */}
      <input
        id={id}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search characters…"
        aria-label="Search characters"
        disabled={disabled}
        className={`w-full px-2.5 py-2 font-sign text-[17px] uppercase tracking-[0.1em] hover:translate-y-0 ${ON_PAPER}`}
      />

      {/* Chosen is filled with the accent, the way every other choice in the app reads. */}
      <div className="flex gap-1.5">
        {PSEUDO_DESTINATIONS.map(({ id: destinationId, label }) => (
          <button
            key={destinationId}
            type="button"
            disabled={disabled}
            onClick={() => onChange(destinationId)}
            className={`h-9 flex-1 font-sign text-[18px] uppercase tracking-[0.1em] ${
              value === destinationId
                ? "bg-primary text-primary-foreground shadow-slap outline-none transition-[translate,box-shadow] duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:translate-y-0 disabled:opacity-50"
                : ON_PAPER
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Fixed height rather than growing with the results, so the dialog does not jump about as
          you type. Tall enough for six rows, which is where a search stops being a list you scan
          and starts being one you scroll. */}
      <div
        ref={listRef}
        // `relative` so a row's offsetTop is measured against this list rather than against the
        // dialog, which is the nearest positioned ancestor otherwise.
        className="relative h-[168px] overflow-y-auto bg-background shadow-slap"
      >
        {matches.length === 0 ? (
          <p className="px-2.5 py-2 text-[12px] text-muted-foreground">
            No character matches “{query}”.
          </p>
        ) : (
          matches.map((character) => {
            const isSelected = character.id === value;
            return (
              <button
                key={character.id}
                type="button"
                disabled={disabled}
                aria-current={isSelected}
                onClick={() => onChange(character.id)}
                className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left font-sign text-[17px] uppercase tracking-[0.06em] outline-none transition-colors duration-200 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                {character.name}
                {isSelected && currentId !== undefined && (
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    {value === currentId ? "Current" : "Selected"}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
