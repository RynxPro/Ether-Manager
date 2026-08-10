import { MISC_CHARACTER_ID, UI_CHARACTER_ID, type Character, type UpdateCheck } from "@/lib/tauri-commands";
import { CharacterGrid } from "./CharacterGrid";
import { SlotSection } from "./SlotSection";
import { useModsForCharacter, useUpdateChecks } from "./hooks";

interface LibraryProps {
  onSelectCharacter: (character: Character) => void;
}

/** The Library landing page: the character grid, plus the two library-wide "UI"/"Misc"
 * sections shown directly here (not as cards to click into — they're each just one flat list,
 * unlike a character page which has a portrait/identity worth its own drill-down view). */
export function Library({ onSelectCharacter }: LibraryProps) {
  const { data: uiMods } = useModsForCharacter(UI_CHARACTER_ID);
  const { data: miscMods } = useModsForCharacter(MISC_CHARACTER_ID);
  const { data: updateChecks } = useUpdateChecks();
  const updateChecksByModId = new Map<number, UpdateCheck>(
    (updateChecks ?? []).map((check) => [check.mod_id, check]),
  );

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold text-foreground">Library</h2>

      <CharacterGrid onSelect={onSelectCharacter} />
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
    </div>
  );
}
