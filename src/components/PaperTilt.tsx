import type { CSSProperties, ReactNode } from "react";

interface PaperTiltProps {
  /** How far off true the sheet sits, in degrees. Keep it under about a degree and a half —
   * see `tiltFor`, which is where the angle usually comes from. */
  tilt: number;
  /** The paper itself: its edge, its stock and its shadow. Defaults to the plain slab every
   * panel in the app is made of. */
  className?: string;
  /** Straighten under the cursor, the way every pressable slap in the app does. Requires the
   * parent to carry Tailwind's `group`. */
  straightensOnHover?: boolean;
  /** Whether the parent keeps a 2px border of its own — see the note below on `-inset-0.5`.
   * True for the app's bordered slabs, which is most of them; false for the borderless slips
   * that are only stock and a shadow, like a notification row. */
  coversParentBorder?: boolean;
  /** Anything printed on the paper rather than laid on top of it — a ticket's torn stub, say.
   * It leans with the sheet, so nothing with words in it belongs here. */
  children?: ReactNode;
}

/** The sheet a slab is printed on: tilted, sitting behind its own content.
 *
 * The whole point is that the *paper* leans and the words do not. Rotating an element rotates
 * its text with it, and a glyph on a rotated baseline cannot be hinted or subpixel-positioned,
 * so tilted type is measurably softer — which is why it used to sharpen the instant a hover
 * straightened the card. That was verified by experiment on the mod page's install tickets:
 * the same glyph at -0.4° and at 0°, and again with the transition removed to rule out layer
 * promotion. The softness comes from the rotation, not from the compositor, and no amount of
 * `will-change` or `backface-visibility` touches it.
 *
 * So the object splits in two. The background, the border and the hard shadow go on this layer
 * and rotate; the content stays upright on the pixel grid. At under a degree nobody reads the
 * baseline — they read the edge — so the lean survives intact and the text comes back sharp.
 * The mod page lost its tilt for a while to that misdiagnosis; this is what buys it back.
 *
 * Only for objects that are mostly type. A card that is mostly picture has to lean as one
 * thing, because a photograph sitting square inside a slanted mount reads as a mistake — so
 * `CharacterCard` and `ModCard` keep rotating whole and pay the softness on their one name.
 *
 * Two rules for the parent, both load-bearing:
 *
 * - `relative isolate`, so this layer's negative z-index stays inside the card instead of
 *   sinking behind the page.
 * - Keep the parent's border as `border-transparent` rather than removing it, so the content
 *   sits exactly where it did while the visible edge moves down here. Dropping it instead
 *   shifts every child by the border's width.
 *
 * `-inset-0.5` rather than `inset-0`, and that is not a nicety. An absolute child is placed
 * against its parent's *padding* box, so `inset-0` would tuck the paper inside that transparent
 * border and quietly shrink the visible card by 4px each way — and anything printed on the
 * paper, like a ticket's stub, would land 2px off the content it is supposed to sit behind.
 * Pulling out by the border's width lines the two boxes up exactly. A parent with no border of
 * its own has no gap to cover, so it passes `coversParentBorder={false}` and the layer sits
 * flush.
 */
export function PaperTilt({
  tilt,
  className = "border-2 border-border bg-card shadow-slap-lift",
  straightensOnHover = false,
  coversParentBorder = true,
  children,
}: PaperTiltProps) {
  return (
    <span
      aria-hidden
      style={{ "--tilt": `${tilt}deg` } as CSSProperties}
      className={`absolute ${coversParentBorder ? "-inset-0.5" : "inset-0"} -z-10 rotate-[var(--tilt)] transition-[rotate,border-color] duration-200 ${
        straightensOnHover ? "group-hover:rotate-0" : ""
      } ${className}`}
    >
      {children}
    </span>
  );
}
