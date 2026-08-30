interface SignStripProps {
  /** Short readings, already formatted. Joined with a separator here so every strip in the app
   * punctuates identically and no caller has to remember which character to use.
   *
   * Order them most- to least-changeable: the strip only ever shows part of itself at once, and
   * the first item is the one on screen when the page opens. */
  items: string[];
}

/** A cheap LED sign bolted to the wall, carrying whatever the page can say about itself in
 * numbers.
 *
 * The one lit object in either theme, and deliberately the only scrolling thing on a screen. It
 * exists to reconcile a contradiction in the design: everything else here is a physical surface —
 * paper, board, tape, spray — but the app genuinely has live readings that change while you look
 * at them, and printed board cannot say "2 updates waiting". A shop sign screwed to a wall is the
 * one object that is both, so it is the shape the live data takes.
 *
 * The dot mask is what stops it reading as a text box with a glow: real LED signage is a grid of
 * lamps, and at this size the grid is the whole tell.
 *
 * It scrolls, and that is a decision that was made twice. The argument against was real — at this
 * window width the readings fit without moving, it is the only permanently animated thing on
 * screen, and you cannot read a moving readout at a glance. The argument for won anyway: motion
 * is what separates a lit sign from a black rectangle with text in it, and losing it made the
 * strip read as a disabled input. The counts are all stated elsewhere on the page, so nothing
 * here has to be readable at a glance in the first place.
 *
 * Content repeats so the -50% wrap lands on an identical frame and the loop has no seam. Stops
 * entirely under `prefers-reduced-motion` — the one thing running forever has to answer to that.
 *
 * `aria-hidden` because every number here is stated in full elsewhere on the page — this is
 * atmosphere carrying a summary, not the only place the counts exist. */
export function SignStrip({ items }: SignStripProps) {
  const line = `${items.join("  /  ")}  /  `;

  return (
    <div
      aria-hidden
      className="relative h-[37px] overflow-hidden bg-sign shadow-[inset_0_0_0_2px_rgb(0_0_0/0.55),0_3px_0_rgb(0_0_0/0.25)]"
    >
      <span className="edge-ticker-x absolute whitespace-nowrap font-sign text-[20px] leading-[37px] tracking-[0.26em] text-sign-foreground [text-shadow:var(--sign-glow)]">
        {line.repeat(6)}
      </span>
      {/* The lamp grid. Above the text, below the screws. */}
      <span className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(rgb(0_0_0/0.5)_0.9px,transparent_1px)] bg-[length:3px_3px]" />
      {/* Four screws — the detail that makes it an object fixed to a surface rather than a panel
          drawn on one. Remove them and it reads as a div again. */}
      <span className="pointer-events-none absolute left-1.5 top-1.5 z-20 h-1 w-1 rounded-full bg-white/25" />
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-20 h-1 w-1 rounded-full bg-white/25" />
      <span className="pointer-events-none absolute right-1.5 top-1.5 z-20 h-1 w-1 rounded-full bg-white/25" />
      <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 h-1 w-1 rounded-full bg-white/25" />
    </div>
  );
}
