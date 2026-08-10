import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchHotkey } from "@/lib/useSearchHotkey";
import { SLOT_LABELS, type Character, type Mod, type UpdateCheck } from "@/lib/tauri-commands";
import { ModCard } from "./ModCard";
import { useAllMods, useCharacters, useDeleteMod, useToggleMod, useUpdateChecks } from "./hooks";

interface AllModsProps {
  onSelectCharacter: (character: Character) => void;
}

interface CharacterGroup {
  character: Character | null;
  characterId: string;
  label: string;
  mods: Mod[];
}

/** Groups mods under the character they belong to rather than showing one flat list: the same
 * mod name can exist for several characters, so "which character is this under?" is part of
 * identifying it, not decoration. */
function groupByCharacter(mods: Mod[], characters: Character[]): CharacterGroup[] {
  const byId = new Map(characters.map((character) => [character.id, character]));
  const groups = new Map<string, CharacterGroup>();

  for (const mod of mods) {
    let group = groups.get(mod.character_id);
    if (!group) {
      const character = byId.get(mod.character_id) ?? null;
      group = {
        character,
        characterId: mod.character_id,
        // An unknown id shouldn't render as blank — it means the roster changed under a mod
        // that is still installed and still needs to be findable.
        label: character?.name ?? mod.character_id,
        mods: [],
      };
      groups.set(mod.character_id, group);
    }
    group.mods.push(mod);
  }

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Every installed mod in one place, grouped by character and searchable.
 *
 * This is the page that answers "what do I actually have?" and "where did I put that one?" —
 * questions the roster can't answer, because it's organised by character and you search when
 * you've forgotten which character something is filed under. */
export function AllMods({ onSelectCharacter }: AllModsProps) {
  const [query, setQuery] = useState("");
  const searchRef = useSearchHotkey(() => setQuery(""));
  const { data: allMods, isLoading } = useAllMods();
  const { data: characters } = useCharacters();
  const { data: updateChecks } = useUpdateChecks();
  const toggleMod = useToggleMod();
  const deleteMod = useDeleteMod();

  const characterList = characters ?? [];
  const nameById = new Map(characterList.map((character) => [character.id, character.name]));
  const needle = query.trim().toLowerCase();

  // Matches the character's name and the slot as well as the mod's own name: a mod saved as
  // "Red Dress" under Ellen Joe should still be findable by typing "ellen", which is how people
  // actually recall what they installed.
  const matches = (allMods ?? []).filter((mod) => {
    if (!needle) return true;
    const characterName = nameById.get(mod.character_id) ?? mod.character_id;
    return (
      mod.display_name.toLowerCase().includes(needle) ||
      characterName.toLowerCase().includes(needle) ||
      SLOT_LABELS[mod.slot].toLowerCase().includes(needle)
    );
  });

  const updateChecksByModId = new Map<number, UpdateCheck>(
    (updateChecks ?? []).map((check) => [check.mod_id, check]),
  );
  const groups = groupByCharacter(matches, characterList);
  const enabledCount = matches.filter((mod) => mod.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-foreground">All mods</h2>
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your mods…"
          aria-label="Search your installed mods"
          className="w-full sm:max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="max-w-3xl space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {needle ? (
            <>
              No installed mods match “{query.trim()}”.{" "}
              <span className="text-muted-foreground/80">Try Browse to find new ones.</span>
            </>
          ) : (
            <>
              No mods installed yet.{" "}
              <span className="text-muted-foreground/80">
                Head to Browse to install your first one.
              </span>
            </>
          )}
        </p>
      ) : (
        <div className="max-w-3xl space-y-6">
          <p className="text-sm text-muted-foreground">
            {needle
              ? `${matches.length} ${matches.length === 1 ? "mod" : "mods"} matching “${query.trim()}”`
              : `${matches.length} ${matches.length === 1 ? "mod" : "mods"} installed · ${enabledCount} on`}
          </p>

          {groups.map((group) => (
            <section key={group.characterId} className="space-y-2">
              {group.character ? (
                <button
                  type="button"
                  onClick={() => onSelectCharacter(group.character as Character)}
                  className="text-sm font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
                >
                  {group.label}
                </button>
              ) : (
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </h3>
              )}

              <div className="space-y-2">
                {group.mods.map((mod) => {
                  // The toggle/delete mutations are shared across every card here, so their
                  // pending/error state reflects only the most recent call — match it against
                  // this card's own mod id first. Same rule as SlotSection.
                  const isThisModToggling =
                    toggleMod.isPending && toggleMod.variables?.modId === mod.id;
                  const isThisModDeleting = deleteMod.isPending && deleteMod.variables === mod.id;
                  const error =
                    toggleMod.isError && toggleMod.variables?.modId === mod.id
                      ? String(toggleMod.error)
                      : deleteMod.isError && deleteMod.variables === mod.id
                        ? String(deleteMod.error)
                        : undefined;

                  return (
                    <ModCard
                      key={mod.id}
                      mod={mod}
                      updateCheck={updateChecksByModId.get(mod.id)}
                      isToggling={isThisModToggling}
                      isDeleting={isThisModDeleting}
                      error={error}
                      onToggle={(enabled) => toggleMod.mutate({ modId: mod.id, enabled })}
                      onDelete={() => deleteMod.mutate(mod.id)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
