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
 * Small uppercase Bahnschrift is the label style, so a chip reads as a label before it reads as a
 * control. The accent marks only the selected one, which is the job it already has everywhere
 * else. `aria-pressed` rather than link semantics: it narrows what is already on screen rather
 * than navigating anywhere. */
export function FilterChip({ label, count, isSelected, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onClick}
      className={`flex items-center gap-1.5 border px-2 py-1 font-heading text-[10px] uppercase tracking-[0.1em] transition-all ${
        isSelected
          ? "border-primary text-primary"
          : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
      }`}
    >
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}
