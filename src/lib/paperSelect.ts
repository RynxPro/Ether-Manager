/** The shared Select dressing: the app's paper, applied to a shadcn dropdown from the outside.
 *
 * Scoped rather than baked into `components/ui/select.tsx` on purpose. That primitive is
 * generated, is shared with surfaces that have not had the street pass yet, and gets replaced
 * wholesale when the generator is re-run — anything written into it is lost the next time.
 * Passing these through `className` keeps the change ours and keeps the primitive disposable.
 *
 * Two things are worth knowing before using them.
 *
 * `SelectContent` defaults to `position="item-aligned"`, which places the list by aligning the
 * chosen row over the trigger's value node and needs room above and below equal to the whole
 * list. With sixty-odd characters that list is over 1800px and no window has it, so every call
 * site here passes `position="popper"` with a height cap.
 *
 * The highlight covers `focus:` *and* `data-[highlighted]:` because Radix moves DOM focus on a
 * pointer and sets the attribute on a keypress; styling one leaves the other looking untouched.
 */

/** The panel: a slab of card with the app's hard edge and shadow, and its scroll buttons
 * repainted — the primitive gives them `bg-popover`, which stops matching the moment the panel
 * itself is recoloured and shows as a seam at the top and bottom of a long list. */
export const PAPER_SELECT_PANEL =
  "border-2 border-border bg-card shadow-slap-lift ring-0 " +
  "[&_[data-slot=select-scroll-down-button]]:bg-card [&_[data-slot=select-scroll-down-button]]:text-primary " +
  "[&_[data-slot=select-scroll-up-button]]:bg-card [&_[data-slot=select-scroll-up-button]]:text-primary";

/** A row. Signage, because a row you press is a control, and the accent fills the live one the
 * way "chosen" is said everywhere else in this app rather than a grey rounded bar. */
export const PAPER_SELECT_ITEM =
  "rounded-none px-2 py-1.5 pr-8 font-sign text-[16px] uppercase tracking-[0.08em] text-card-foreground " +
  "[&_svg]:text-primary " +
  "focus:bg-primary focus:text-primary-foreground focus:[&_svg]:text-primary-foreground " +
  "data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground " +
  "data-[highlighted]:[&_svg]:text-primary-foreground";

/** A group heading inside the panel, and the caption over a field outside it — the same voice
 * either way, because both are the machine naming a region rather than the app talking. */
export const PAPER_CAPTION =
  "font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground";

/** The trigger, and any other control that should read as paper laid on the wall: no border of
 * its own, the hard shadow instead, signage, and a lift under the cursor. */
export const PAPER_CONTROL =
  // `dark:bg-card` is not redundant. `SelectTrigger` ships `dark:bg-input/30 dark:hover:bg-input/50`,
  // and tailwind-merge only de-duplicates classes in the same variant — a plain `bg-card` and a
  // `dark:bg-input/30` do not conflict, so both survive and the dark one wins at night. Every
  // paper select in the app was quietly wearing the shadcn input tint in Night because of it.
  "border-0 bg-card dark:bg-card font-sign text-[17px] uppercase tracking-[0.1em] " +
  "text-card-foreground shadow-slap transition-[translate] duration-200 " +
  "hover:-translate-y-px hover:bg-card dark:hover:bg-card " +
  "focus-visible:ring-2 focus-visible:ring-primary";
