/** The name of a region, with an optional fact about it on the right.
 *
 * A ruled caption rather than a loose line of small text. Both pages that tried the loose
 * version put it in the band under the page title, which is where the sprayed wall tag lives —
 * nine-pixel grey type laid over two-hundred-pixel graffiti reads as something dropped there,
 * not as a label. The rule is what turns it back into structure. */
interface SectionLabelProps {
  left: string;
  right?: string;
  /** True where the right-hand reading changes while the page is open, so a screen reader
   * hears the new total rather than only the one that was there on load. */
  isLive?: boolean;
}

/** A ruled label rather than a heading. The page already has one title; these name bands
 * within it, so they take a caption size rather than a title’s weight. */
export function SectionLabel({ left, right, isLive = false }: SectionLabelProps) {
  return (
    <div
      role={isLive ? "status" : undefined}
      aria-live={isLive ? "polite" : undefined}
      className="mb-3 flex items-center justify-between border-b-2 border-border pb-1.5 font-sign text-[15px] uppercase tracking-[0.16em] text-muted-foreground"
    >
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  );
}
