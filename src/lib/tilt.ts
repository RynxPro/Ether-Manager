/** How far off true a slap can sit, in degrees either way. Small on purpose: sixty cards at the
 * ±1.7° the mockups used is charming for one screen and tiring in a grid you scroll every day.
 * The tilt is seasoning, not the dish — the paper surface and the hard shadow carry the look,
 * and this could go to zero without the style collapsing. */
const MAX_TILT_DEG = 1.4;
const TILT_STEPS = 15;

/** A stable tilt for a given card, derived from whatever identifies it.
 *
 * Derived from the id rather than the grid index for two reasons: a card keeps its own angle
 * when the list is filtered or reordered, so nothing swivels as you type in a search box; and
 * the component never needs to know where it sits, which keeps its parent from passing a
 * position it otherwise has no reason to care about.
 *
 * Deterministic, so it survives a remount — `Math.random()` here would make every card twitch on
 * each render.
 *
 * Shared by `CharacterCard` and `ModCard`. It lived in the former until the latter needed the
 * same angles; two copies of a hash function is exactly the kind of thing that drifts by one
 * constant and leaves two grids tilting differently for no reason anyone chose.
 */
export function tiltFor(id: string | number): number {
  const key = String(id);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const step = Math.abs(hash) % TILT_STEPS;
  const half = (TILT_STEPS - 1) / 2;
  // Rounded because this lands in a CSS custom property that shows up in devtools: the raw
  // division produces values like `-0.19999999999999998deg`, which is correct, renders
  // identically, and looks like a bug to anyone who inspects a card.
  return Math.round(((step - half) / half) * MAX_TILT_DEG * 100) / 100;
}
