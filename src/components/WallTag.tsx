interface WallTagProps {
  /** The section's own name. Never user content: a mod title is arbitrary length and would
   * either overflow the window or shrink to nothing, and the tag exists to say which room you
   * are standing in — which is always something the app named, not something someone typed. */
  word: string;
}

/** The section name sprayed on the wall behind the page.
 *
 * Decoration that happens to do a job: it says where you are without spending a row of chrome
 * saying it, the way a tag on a shutter tells you whose block you are on. Hidden from assistive
 * tech because the heading directly above already says the same word, and announcing it twice
 * would make every page open by repeating itself.
 *
 * Lives inside `PageHeader`'s band rather than in the page body, and that placement is the whole
 * design of it. In the body it scrolled away under the header, whose opaque `bg-background`
 * painted straight over it — so the tag was visible, then covered, then gone. Inside the band it
 * becomes the title's backdrop: it holds still while the page scrolls beneath, exactly like a tag
 * on a wall with posters moving past it.
 *
 * Sits at `z-0`, not a negative z-index: an earlier attempt used `-z-10` and vanished entirely,
 * because negative z puts it behind the shell's own background fill rather than behind the page
 * content. Pointer events are off, so it can never intercept a click. */
export function WallTag({ word }: WallTagProps) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-0 top-4 z-0 select-none whitespace-nowrap font-hand text-[148px] leading-[0.82] text-primary opacity-[0.13]"
    >
      {word}
    </span>
  );
}
