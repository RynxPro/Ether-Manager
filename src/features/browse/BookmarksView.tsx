import { Bookmark as BookmarkIcon, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EMPTY_SLAB, EmptyState } from "@/components/EmptyState";
import { FilterChip } from "@/components/FilterChip";
import {
  useCharacters,
  useInstalledFromGameBanana,
} from "@/features/library/hooks";
import { BROWSE_GRID } from "@/lib/layout";
import { placeholderGbMod } from "@/lib/placeholderGbMod";
import type { Bookmark, Character, GbMod } from "@/lib/tauri-commands";
import { BookmarkCard } from "./BookmarkCard";
import { CreatorBar } from "./CreatorBar";
import {
  useBackfillBookmarkCharacters,
  useBookmarks,
  useCreatorBookmarks,
  useRemoveBookmark,
} from "./hooks";
import { PageHeader } from "@/components/PageHeader";
import { SectionLabel } from "@/components/SectionLabel";

interface BookmarkGroup {
  characterId: string;
  label: string;
  bookmarks: Bookmark[];
}

/** The shelf for bookmarks whose character is not known — a category the roster has no row for,
 * or one saved before the app recorded it and not yet backfilled. Sorted last, because it is a
 * loose end rather than a category. */
const UNSORTED_ID = "__unsorted__";

/** Counts bookmarks per character, for the filter rail.
 *
 * This used to lay the page out: a section and its own grid per character. Measured on a real
 * shortlist of 23 across 9 characters, that cost 54 grid cells to show 23 cards — 57% of the
 * page was empty, because every group pays for the remainder of its own last row and three
 * characters had exactly one bookmark each. It gets worse as a collection grows, since the waste
 * scales with the number of characters rather than the number of bookmarks.
 *
 * So "who is this for" became a filter instead of a layout. The question is still answerable at
 * a glance — the rail lists every character with a count — but the page only pays for it when
 * the answer is being used. */
function countByCharacter(
  bookmarks: Bookmark[],
  characters: Character[],
): BookmarkGroup[] {
  const byId = new Map(
    characters.map((character) => [character.id, character]),
  );
  const groups = new Map<string, BookmarkGroup>();

  for (const bookmark of bookmarks) {
    const id = bookmark.character_id ?? UNSORTED_ID;
    let group = groups.get(id);
    if (!group) {
      group = {
        characterId: id,
        // An id the roster no longer has still needs to render as something findable.
        label: id === UNSORTED_ID ? "Unsorted" : (byId.get(id)?.name ?? id),
        bookmarks: [],
      };
      groups.set(id, group);
    }
    group.bookmarks.push(bookmark);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.characterId === UNSORTED_ID) return 1;
    if (b.characterId === UNSORTED_ID) return -1;
    return a.label.localeCompare(b.label);
  });
}

interface BookmarksViewProps {
  /** Selecting a bookmark navigates to the shared mod detail page, owned by App. */
  onSelectMod: (mod: GbMod) => void;
  /** Opens a followed creator's page. Same drill-down chain the mod detail uses, so Back
   * comes straight back here. */
  onSelectCreator: (id: number, name: string) => void;
  /** The way out of an empty shortlist. This page tells you to bookmark something in Browse;
   * before this it could not take you there. */
  onGoToBrowse: () => void;
}

/** The shortlist you build while browsing. It shares Browse's grid and card shape rather than
 * the roster's 3:4 posters it used to borrow — these are the same objects as Browse's results,
 * saved, so making them a different size and shape read as a different kind of thing. */
export function BookmarksView({
  onGoToBrowse,
  onSelectMod,
  onSelectCreator,
}: BookmarksViewProps) {
  const { data: bookmarks, isLoading } = useBookmarks();
  const { data: creators } = useCreatorBookmarks();
  const removeBookmark = useRemoveBookmark();
  // Confirmed here and not on the bookmark toggles in Browse or on a mod's page. There the
  // control shows its own state and answers immediately, so a mis-click is visible and undone
  // with a second click. Here it is a removal from a list you curated, and the mod it points at
  // may be hard to find again — one is a switch, the other is throwing something away.
  const [pendingRemoval, setPendingRemoval] = useState<Bookmark | null>(null);
  const [query, setQuery] = useState("");
  // `null` is "every character", which is the resting state — the rail narrows the shortlist
  // rather than being a mode you have to leave. `UNSORTED_ID` selects the loose ends.
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(
    null,
  );
  const { data: characters } = useCharacters();
  // Reads the same allMods cache the library pages use, so installing something marks it here
  // without a second source of truth to keep in step.
  const installed = useInstalledFromGameBanana();
  const backfill = useBackfillBookmarkCharacters();
  const hasUnplaced =
    bookmarks?.some((bookmark) => bookmark.character_id === null) ?? false;

  // Bookmarks saved before the character was recorded have none, and would sit under "Unsorted"
  // forever. Run once per visit: it is a no-op the moment they all have one, and asking for it
  // here rather than at startup keeps a cost nobody has asked for off the launch path.
  useEffect(() => {
    if (hasUnplaced) backfill.mutate();
    // Keyed on the flag rather than the array, which is a new object on every refetch and would
    // otherwise have this re-run on its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnplaced]);

  const needle = query.trim().toLowerCase();
  const nameById = new Map(
    (characters ?? []).map((character) => [character.id, character.name]),
  );
  const matches = (bookmarks ?? []).filter((bookmark) => {
    if (!needle) return true;
    const characterName = bookmark.character_id
      ? (nameById.get(bookmark.character_id) ?? bookmark.character_id)
      : "unsorted";
    return (
      bookmark.name.toLowerCase().includes(needle) ||
      characterName.toLowerCase().includes(needle)
    );
  });
  // The rail counts what the search left, so a chip never offers a character with nothing behind
  // it. Selecting one narrows further; the two filters stack rather than replacing each other.
  const shelves = countByCharacter(matches, characters ?? []);
  const visible =
    selectedCharacter === null
      ? matches
      : matches.filter(
          (bookmark) =>
            (bookmark.character_id ?? UNSORTED_ID) === selectedCharacter,
        );
  const count = bookmarks?.length ?? 0;
  /** The roster's name for a bookmark's character, or nothing when it has none. The rail already
   * does this to build its chips; the card needs the same answer, so it comes from one place. */
  const labelForCharacter = (characterId: string | null) =>
    characterId ? (nameById.get(characterId) ?? characterId) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bookmarks"
        // The app's own word for what kind of page this is, sprayed on the wall behind the
        // title. Every other page has one.
        tag="Saved"
        subtitle="Saved from Browse"
        // Unpinned, like every other page that has had the street pass. The tag is the reason:
        // it is deliberately taller than the band it sits in, so a pinned header has to clip it
        // and the sprayed word gets cut off against a rule. A shortlist is also a page you
        // scroll to the end of rather than one you get lost in, so there is nothing a bar needs
        // to keep telling you.
        pinned={false}
      >
        {!isLoading && count > 0 && (
          <>
            {/* Paper, not the shadcn `Input`: that primitive is a bordered box with a soft
                focus ring, which is the wrong material on a wall. The sign face, because a
                search box is a control and that is the face every control in this app wears —
                it was the one search in the app set in the machine face instead.

                No count beside it: the ruled label under the creator rail already states what
                is saved, and a second copy pinned to the header was noise in the one place the
                page should be quiet. */}
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your bookmarks…"
              aria-label="Search your bookmarks"
              className="h-10 w-full border-0 bg-card px-3 font-sign text-[17px] uppercase tracking-[0.1em] text-card-foreground shadow-slap outline-none placeholder:text-card-foreground/40 focus-visible:ring-2 focus-visible:ring-primary sm:w-64"
            />
          </>
        )}
      </PageHeader>

      {/* Above the mod list and outside every branch below it, because following creators and
          saving mods are independent — an empty shortlist with four creators in it is a real
          state, and the bar would vanish if it lived inside the list's success case.
          CreatorBar renders nothing when you follow nobody. */}
      <CreatorBar creators={creators ?? []} onSelectCreator={onSelectCreator} />

      {isLoading ? (
        <div className={BROWSE_GRID}>
          {Array.from({ length: 8 }).map((_, index) => (
            // Card-shaped, not a bare square: a placeholder that is not the shape of the thing
            // it stands in for makes the layout jump the moment the data arrives.
            <div
              key={index}
              className="animate-pulse border-2 border-border bg-card p-[5px] pb-0 shadow-slap-lift"
            >
              <div className="aspect-[4/3] w-full bg-art" />
              <div className="px-1 pb-3 pt-2">
                <div className="h-[39px] bg-art" />
                <div className="mt-1.5 h-3 w-2/3 bg-art" />
              </div>
            </div>
          ))}
        </div>
      ) : count === 0 ? (
        <EmptyState
          icon={BookmarkIcon}
          title="Nothing saved yet"
          say="Bookmark anything in Browse and it waits for you here."
          action={
            <button
              type="button"
              onClick={onGoToBrowse}
              className={`${EMPTY_SLAB} bg-primary text-primary-foreground`}
            >
              Go to Browse
            </button>
          }
        />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing matches"
          say={`No saved mod is called “${query.trim()}”.`}
          action={
            <button
              type="button"
              onClick={() => setQuery("")}
              className={`${EMPTY_SLAB} bg-background text-foreground`}
            >
              Clear search
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* The mods get the same ruled label the creator rail above them has, so the page
              reads as two named regions rather than one named band and then a grid that starts
              without warning. The right-hand slot is where the count beside the search box
              went: it belongs over the thing it is counting. */}
          <SectionLabel
            left="Saved mods"
            right={
              needle
                ? `${matches.length} of ${count} match`
                : `${count} saved`
            }
          />

          {/* The characters, as a rail rather than as nine headings with nine grids under them.
              Only shown once there is a choice to make: with everything saved for one character,
              a filter that can only be on or all is noise. */}
          {shelves.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
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
                  count={shelf.bookmarks.length}
                  isSelected={selectedCharacter === shelf.characterId}
                  // Clicking the selected one clears it, so the rail never traps you in a
                  // character you have to hunt for "All" to escape.
                  onClick={() =>
                    setSelectedCharacter((current) =>
                      current === shelf.characterId ? null : shelf.characterId,
                    )
                  }
                />
              ))}
            </div>
          )}

          <div className={BROWSE_GRID}>
            {visible.map((bookmark) => (
              <BookmarkCard
                key={bookmark.gamebanana_mod_id}
                bookmark={bookmark}
                installedCount={
                  installed.countByModId.get(bookmark.gamebanana_mod_id) ?? 0
                }
                characterLabel={labelForCharacter(bookmark.character_id)}
                onSelect={() =>
                  onSelectMod(
                    placeholderGbMod({
                      gamebananaModId: bookmark.gamebanana_mod_id,
                      name: bookmark.name,
                      thumbnailUrl: bookmark.thumbnail_url,
                      dateModified: bookmark.added_at,
                    }),
                  )
                }
                onRemove={() => setPendingRemoval(bookmark)}
              />
            ))}
          </div>
        </div>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Remove · bookmark"
          description={
            <>
              <span className="text-foreground">{pendingRemoval.name}</span>{" "}
              leaves your bookmarks. Nothing is installed or deleted — you can
              bookmark it again from Browse.
            </>
          }
          confirmLabel="Remove"
          isPending={removeBookmark.isPending}
          onConfirm={() => {
            removeBookmark.mutate(pendingRemoval.gamebanana_mod_id);
            setPendingRemoval(null);
          }}
          onOpenChange={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}
