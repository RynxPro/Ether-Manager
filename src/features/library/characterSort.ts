import type { Character, ModCounts } from "@/lib/tauri-commands";

/** How the roster is ordered on the Library page.
 *
 * `yours` is the default and was the only behaviour before this existed: the whole roster
 * always renders, but characters you own nothing for sink below the ones you do, so the top of
 * the grid is your collection rather than sixty mostly-empty cards. */
export type CharacterSort = "yours" | "most" | "name" | "roster";

export const CHARACTER_SORT_OPTIONS: { value: CharacterSort; label: string }[] = [
  { value: "yours", label: "Yours first" },
  { value: "most", label: "Most mods" },
  { value: "name", label: "Name A–Z" },
  { value: "roster", label: "Roster order" },
];

export interface CharacterRow {
  character: Character;
  counts: ModCounts;
}

/** Orders the roster.
 *
 * Every comparison falls through to the order the rows arrived in, which is the game's own
 * roster order — `Array.prototype.sort` is stable, so returning 0 keeps it. That matters more
 * than it sounds: with sixty characters and most of them at zero mods, a sort that does not
 * settle its ties leaves the empty majority shuffling about between renders.
 *
 * `roster` deliberately does no work rather than sorting by some proxy for the roster. The
 * backend already returns them in that order, and reproducing it here would be a second
 * opinion about something the backend is the authority on. */
export function sortCharacters(rows: CharacterRow[], sort: CharacterSort): CharacterRow[] {
  switch (sort) {
    case "roster":
      return rows;
    case "name":
      return [...rows].sort((a, b) => a.character.name.localeCompare(b.character.name));
    case "most":
      return [...rows].sort((a, b) => b.counts.total - a.counts.total);
    case "yours":
    default:
      return [...rows].sort((a, b) => Number(b.counts.total > 0) - Number(a.counts.total > 0));
  }
}
