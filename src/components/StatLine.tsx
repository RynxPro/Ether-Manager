interface StatLineProps {
  /** Already-formatted readings, most important first — the first one is emphasised. */
  items: string[];
  /** True where the figures change while the page is open, so a screen reader hears the new
   * total rather than only the one that was there when the page loaded. */
  isLive?: boolean;
}

/** What a page can say about itself in numbers, on a slip of paper.
 *
 * Loose text did not work here. Both pages that carry this put it in the band directly under
 * the page title, which is where the sprayed wall tag lives, and small grey type laid over
 * two-hundred-pixel graffiti reads as something dropped on the page rather than as a reading.
 * On paper it is an object on the wall like everything else, and the spray goes behind it.
 *
 * Courier because these are counts, and the one job Courier has in this app is whatever the
 * machine measured. The leading figure takes the card's own foreground so there is something
 * to land on; the rest stay quiet. */
export function StatLine({ items, isLive = false }: StatLineProps) {
  if (items.length === 0) return null;
  const [first, ...rest] = items;

  return (
    <p
      role={isLive ? "status" : undefined}
      aria-live={isLive ? "polite" : undefined}
      className="inline-flex h-[30px] -rotate-[0.4deg] items-center bg-card px-3 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground shadow-slap"
    >
      <span className="text-card-foreground">{first}</span>
      {rest.map((item) => (
        <span key={item}>{" · "}{item}</span>
      ))}
    </p>
  );
}
