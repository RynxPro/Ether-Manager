import { useState } from "react";
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
import { useModsForCharacter, useUpdateChecks } from "./hooks";

interface LibraryProps {
  onSelectCharacter: (character: Character) => void;
}

/** The Library landing page: the character roster, plus the two library-wide "UI"/"Misc"
 * sections shown directly here (not as cards to click into — they're each just one flat list,
 * unlike a character page which has a portrait/identity worth its own drill-down view).
 *
 * Its search filters the roster by character name only. Finding a specific mod belongs to the
 * All Mods page — keeping the two separate means each search box does exactly one thing. */
export function Library({ onSelectCharacter }: LibraryProps) {
  const [query, setQuery] = useState("");
  const searchRef = useSearchHotkey(() => setQuery(""));
  const { data: uiMods } = useModsForCharacter(UI_CHARACTER_ID);
  const { data: miscMods } = useModsForCharacter(MISC_CHARACTER_ID);
  const { data: updateChecks } = useUpdateChecks();
  const updateChecksByModId = new Map<number, UpdateCheck>(
    (updateChecks ?? []).map((check) => [check.mod_id, check]),
  );

  const isSearching = query.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-foreground">Library</h2>
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a character…"
          aria-label="Find a character"
          className="w-full sm:max-w-xs"
        />
      </div>

      <CharacterGrid onSelect={onSelectCharacter} query={query} />

      {/* Hidden while searching: these are global categories, not characters, so leaving them
          on screen during a character search just adds noise to the result. */}
      {!isSearching && (
        <>
          <SlotSection
            characterId={UI_CHARACTER_ID}
            slot="Ui"
            mods={uiMods ?? []}
            updateChecksByModId={updateChecksByModId}
          />
          <SlotSection
            characterId={MISC_CHARACTER_ID}
            slot="Misc"
            mods={miscMods ?? []}
            updateChecksByModId={updateChecksByModId}
          />
        </>
      )}
    </div>
  );
}
