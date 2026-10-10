import { FilePlus2, PackageOpen, Search, SearchX } from "lucide-react";
import { EMPTY_SLAB, EmptyState } from "@/components/EmptyState";
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
  /** The way out of an empty library. The page has always said to head to Browse; now it can
   * take you. */
  onGoToBrowse: () => void;
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
  onGoToBrowse,
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
  const updatesWaiting = matches.filter(
    (mod) => updateChecksByModId.get(mod.id)?.status === "UpdateAvailable",
  ).length;

  // What the page can say about itself in numbers, for the strip under the header. Skips
  // everything while the first read is in flight rather than printing zeroes — a sign reading
  // "0 INSTALLED" for a moment on every open is worse than one that arrives a beat late.
  // Ordered most- to least-changeable, since the strip only shows part of itself at a time.
  const signItems = isLoading
    ? []
    : [
        needle
          ? `${matches.length} OF ${(allMods ?? []).length} MATCH`
          : `${matches.length} INSTALLED`,
        `${enabledCount} ON`,
        updatesWaiting > 0 ? `${updatesWaiting} WAITING` : "NOTHING TO UPDATE",
      ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="All mods"
        // The section name sprayed on the wall behind the title, as every other top-level page
        // does. This page had the band but never the tag, which left it the one destination that
        // arrived quieter than the rest.
        tag="All mods"
        subtitle="Everything installed, in one place"
        // Unpinned, like the Library. Pinning and the wall tag are in tension by design: the tag
        // is deliberately taller than the band it sits in, so a pinned header has to clip it, and
        // a clipped tag is the sprayed word cut in half with a rule under it — which is exactly
        // the old top bar this pass exists to remove. The page is a flat grid with a filter rail
        // rather than a feed, so the title scrolling away costs nothing worth that.
        pinned={false}
      >
        {/* Paper, like every control in the app. Import was shadcn's `outline` variant and the
            search was its default input — a bordered pill and a bordered box, in a language with
            neither. Tilted opposite ways so they read as two placed objects rather than a skewed
            row, and search sits to Import's left in the same order the Library uses, so the two
            pages that carry both controls do not disagree about where they go. */}
        <div className="relative rotate-[0.6deg]">
          {/* The icon is the label. A visible text label is the rule for form fields and the
              right call almost everywhere, but a magnifier in a field is the one convention
              strong enough to stand in for one — and the accessible name is still on the input
              for anyone not looking at it. */}
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-card-foreground/40"
          />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a mod…"
            aria-label="Search your installed mods"
            className="h-[38px] w-60 border-0 bg-card pl-10 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap placeholder:text-card-foreground/40 focus-visible:ring-2 focus-visible:ring-primary md:text-[17px]"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onImport}
          className="h-[38px] rotate-[0.7deg] border-0 bg-card px-4 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 hover:bg-card"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          Import
        </Button>
      </PageHeader>

      {/* The counts moved off the header rail and onto the sign, where the Library keeps its
          own. They are live readings about the page, which is the one thing the strip is for,
          and it leaves the header holding only the two things you can act on. */}
      {/* The aggregates, stated plainly. Each card shows its own state, but how many are on
          and how many are waiting are not countable off a grid of twenty. */}
      {signItems.length > 0 && (
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <span className="text-foreground">{signItems[0]}</span>
          {signItems.slice(1).map((item) => (
            <span key={item}> · {item}</span>
          ))}
        </p>
      )}

      {isLoading ? (
        <div className={CARD_GRID}>
          {/* Card-shaped, and in the grid the cards actually land in. These were full-width 80px
              rows in a narrow column — the shape this page had before it used cards — so the
              layout jumped from a list to a grid the moment the data arrived. */}
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[16/10] w-full" />
          ))}
        </div>
      ) : needle ? (
        <EmptyState
          icon={SearchX}
          title="Nothing matches that"
          say={`No installed mod is called “${query.trim()}”.`}
          action={
            <>
              <button
                type="button"
                onClick={() => setQuery("")}
                className={`${EMPTY_SLAB} bg-background text-foreground`}
              >
                Clear search
              </button>
              <button
                type="button"
                onClick={onGoToBrowse}
                className={`${EMPTY_SLAB} bg-primary text-primary-foreground`}
              >
                Try Browse
              </button>
            </>
          }
        />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Nothing installed yet"
          say="Install one from Browse, or drop an archive anywhere on this window."
          action={
            <>
              <button
                type="button"
                onClick={onImport}
                className={`${EMPTY_SLAB} bg-background text-foreground`}
              >
                Import
              </button>
              <button
                type="button"
                onClick={onGoToBrowse}
                className={`${EMPTY_SLAB} bg-primary text-primary-foreground`}
              >
                Go to Browse
              </button>
            </>
          }
        />
      ) : (
        <div className="space-y-6">
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
                  className="ml-2 inline-flex h-[30px] items-center px-3 font-sign text-[15px] uppercase tracking-[0.1em] text-primary transition-[translate] duration-200 hover:-translate-y-px"
                >
                  Open {selectedShelf.label} →
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
