import { FilePlus2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/FilterChip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_GRID } from "@/lib/layout";
import { useSearchHotkey } from "@/lib/useSearchHotkey";
import {
  SLOT_LABELS,
  type Character,
  type Mod,
  type UpdateCheck,
} from "@/lib/tauri-commands";
import { ModCard } from "./ModCard";
import {
  useAllMods,
  useCharacters,
  useCheckModUpdateWithConfirmation,
  useDeleteMod,
  useToggleMod,
  useUpdateChecks,
} from "./hooks";
import { PageHeader } from "@/components/PageHeader";

interface AllModsProps {
  onSelectCharacter: (character: Character) => void;
  /** Opens an installed mod's GameBanana page, via App's shared detail route. */
  onOpenModDetail: (mod: Mod) => void;
  /** Opens the file picker and starts an import. Dropping a file on the window does the same
   * thing and is the faster path; this is here for anyone who does not think to drag. */
  onImport: () => void;
}

interface CharacterGroup {
  character: Character | null;
  characterId: string;
  label: string;
  mods: Mod[];
}

/** Counts mods per character, for the filter rail.
 *
 * The same mod name can exist for several characters, so "which character is this under?" is part
 * of identifying a mod rather than decoration — but it used to be answered by laying the page out
 * in a section and a grid per character, which spent 30 grid cells to show 14 cards. This page
 * has a search box and a flat name: it is for finding one mod among many, and grouping fought
 * that. The question is now answered by a rail that costs nothing when it is not in use. */
function groupByCharacter(
  mods: Mod[],
  characters: Character[],
): CharacterGroup[] {
  const byId = new Map(
    characters.map((character) => [character.id, character]),
  );
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

/** Every installed mod in one place, filterable by character and searchable.
 *
 * This is the page that answers "what do I actually have?" and "where did I put that one?" —
 * questions the roster can't answer, because it's organised by character and you search when
 * you've forgotten which character something is filed under. */
export function AllMods({
  onSelectCharacter,
  onOpenModDetail,
  onImport,
}: AllModsProps) {
  const [query, setQuery] = useState("");
  // `null` is every character, which is the resting state — the rail narrows the list rather
  // than being a mode you have to leave.
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(
    null,
  );
  const searchRef = useSearchHotkey(() => setQuery(""));
  const { data: allMods, isLoading } = useAllMods();
  const { data: characters } = useCharacters();
  const { data: updateChecks } = useUpdateChecks();
  const toggleMod = useToggleMod();
  const deleteMod = useDeleteMod();
  const { checkUpdate, confirmedModId, runCheck } =
    useCheckModUpdateWithConfirmation();

  const characterList = characters ?? [];
  const nameById = new Map(
    characterList.map((character) => [character.id, character.name]),
  );
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
  // The rail counts what the search left, so a chip never offers a character with nothing behind
  // it. Selecting one narrows further; the two filters stack rather than replacing each other.
  const shelves = groupByCharacter(matches, characterList);
  const selectedShelf = shelves.find(
    (shelf) => shelf.characterId === selectedCharacter,
  );
  const visible = selectedShelf ? selectedShelf.mods : matches;
  const enabledCount = matches.filter((mod) => mod.enabled).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="All mods"
        subtitle="Everything installed, in one place"
      >
        <Button type="button" variant="outline" size="sm" onClick={onImport}>
          <FilePlus2 className="h-3.5 w-3.5" />
          Import
        </Button>
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your mods…"
          aria-label="Search your installed mods"
          className="w-full sm:w-64"
        />
      </PageHeader>

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
              <span className="text-muted-foreground/80">
                Try Browse to find new ones.
              </span>
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
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {needle
              ? `${matches.length} ${matches.length === 1 ? "mod" : "mods"} matching “${query.trim()}”`
              : `${matches.length} ${matches.length === 1 ? "mod" : "mods"} installed · ${enabledCount} on`}
          </p>

          {/* The characters as a rail rather than as a section and a grid each. Measured on a
              real library — 14 mods across 5 characters — the grouping spent 30 grid cells to
              show 14 cards, and two characters with one mod each took a full six-column row
              apiece. This page has a search box and a flat name: it is for finding one mod among
              many, which grouping fought. Only shown when there is a choice to make. */}
          {shelves.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                label="All"
                count={matches.length}
                isSelected={selectedCharacter === null}
                onClick={() => setSelectedCharacter(null)}
              />
              {shelves.map((shelf) => (
                <FilterChip
                  key={shelf.characterId}
                  label={shelf.label}
                  count={shelf.mods.length}
                  isSelected={selectedCharacter === shelf.characterId}
                  onClick={() =>
                    setSelectedCharacter((current) =>
                      current === shelf.characterId ? null : shelf.characterId,
                    )
                  }
                />
              ))}
              {/* The group headings used to double as a way into a character's page, so that
                  route is kept — moved to where it is unambiguous, beside the character you have
                  actually narrowed to rather than repeated above every section. */}
              {selectedShelf?.character && (
                <button
                  type="button"
                  onClick={() =>
                    onSelectCharacter(selectedShelf.character as Character)
                  }
                  className="ml-1 font-heading text-[10px] uppercase tracking-[0.1em] text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Open {selectedShelf.label}
                </button>
              )}
            </div>
          )}

          <div className={CARD_GRID}>
            {visible.map((mod) => {
              // The toggle/delete mutations are shared across every card here, so their
              // pending/error state reflects only the most recent call — match it against
              // this card's own mod id first. Same rule as SlotSection.
              const isThisModToggling =
                toggleMod.isPending && toggleMod.variables?.modId === mod.id;
              const isThisModDeleting =
                deleteMod.isPending && deleteMod.variables === mod.id;
              const isThisModChecking =
                checkUpdate.isPending && checkUpdate.variables === mod.id;
              const error =
                toggleMod.isError && toggleMod.variables?.modId === mod.id
                  ? String(toggleMod.error)
                  : deleteMod.isError && deleteMod.variables === mod.id
                    ? String(deleteMod.error)
                    : // A failed check was silent: the icon stopped spinning, which is
                      // exactly what success looks like too.
                      checkUpdate.isError && checkUpdate.variables === mod.id
                      ? String(checkUpdate.error)
                      : undefined;

              return (
                <ModCard
                  key={mod.id}
                  mod={mod}
                  updateCheck={updateChecksByModId.get(mod.id)}
                  isToggling={isThisModToggling}
                  isDeleting={isThisModDeleting}
                  isCheckingUpdate={isThisModChecking}
                  isConfirmedUpToDate={confirmedModId === mod.id}
                  error={error}
                  onToggle={(enabled) =>
                    toggleMod.mutate({ modId: mod.id, enabled })
                  }
                  isEditable
                  onDelete={() => deleteMod.mutate(mod.id)}
                  onOpenDetail={
                    mod.gamebanana_mod_id === null
                      ? undefined
                      : () => onOpenModDetail(mod)
                  }
                  onCheckUpdate={() => runCheck(mod.id)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
