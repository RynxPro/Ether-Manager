import type { CSSProperties } from "react";
import { tiltFor } from "@/lib/tilt";

interface FilterChipProps {
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}

/** One entry in a character filter rail.
 *
 * Shared by Bookmarks and All mods, which had the same problem and now use the same answer:
 * grouping by character cost a section and a grid each, so every character paid for the remainder
 * of its own last row and a character with one item paid for a whole row. Both pages spent over
 * half their layout on empty cells. The characters became a filter instead, which answers the
 * same question — who is this for — without the page paying for the answer when it is not in use.
 *
 * Every chip is paper. That is the departure from the Library's tabs, which are paper only when
 * chosen and bare wall otherwise, and it is deliberate: a tab row has three entries and reads
 * fine as one object among two absences, but this rail carries every character you own — a dozen
 * or more — and a dozen unstyled words on bare concrete read as a sentence that wrapped, not as a
 * row of things you can press. Giving them all a surface makes them all obviously controls.
 *
 * The accent then does the one job it has everywhere else in the app: it marks the live one. So
 * the chosen chip is filled rather than merely raised — the same treatment the sidebar gives the
 * section you are in — and the rest sit there as plain board. Colour marks the selection, the
 * surface marks that it is pressable, and neither is doing the other's work.
 *
 * The outline this used to draw was the wrong material twice over: a border doing the job a
 * surface should do, and the accent spent on drawing a box rather than on saying which one is on.
 *
 * Signage for the label and the machine face for the count, because that is what they are — the
 * chip is a control, the number beside it is a tally. It was set entirely in the display face
 * before, which left the whole rail with no voice contrast in it at all. One step down from the
 * tab row in size, since tabs choose a section and these only narrow what is already on screen.
 *
 * The tilt comes from the label, through the same hash the cards use, so no two neighbours lean
 * the same way and a chip keeps its angle as the rail is filtered and re-sorted. A single shared
 * angle would have read as one skewed row rather than a dozen separately placed things.
 *
 * `aria-pressed` rather than link semantics: it narrows what is already there rather than
 * navigating anywhere. */
export function FilterChip({ label, count, isSelected, onClick }: FilterChipProps) {
  const style = { "--tilt": `${tiltFor(label)}deg` } as CSSProperties;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onClick}
      style={style}
      className={`inline-flex h-[30px] rotate-[var(--tilt)] items-center gap-2 px-3 font-sign text-[15px] uppercase tracking-[0.1em] shadow-slap transition-[rotate,translate] duration-200 hover:-translate-y-px hover:rotate-0 ${
        isSelected
          ? "bg-primary text-primary-foreground"
          : "bg-card text-card-foreground/70 hover:text-card-foreground"
      }`}
    >
      {label}
      <span className="font-mono text-[12px] font-bold tabular-nums opacity-60">{count}</span>
    </button>
  );
}
