import { MISC_CHARACTER_ID, UI_CHARACTER_ID } from "./tauri-commands";

/** Where a character's art lives, worked out from their id rather than stored anywhere.
 *
 * The roster used to carry both paths as strings — a hundred and twenty of them — and a Rust
 * test asserted each was exactly `"/characters/" + id + ".webp"`, which is the clearest possible
 * sign the field was holding nothing. Adding art meant naming the file, dropping it in, *and*
 * editing `zzz_characters.json`, and because that JSON is compiled into the binary, rebuilding.
 * Now it is the first two.
 *
 * It also fixes something that could not be fixed per-character. A character discovered on
 * GameBanana has no roster row, so there was nowhere to record their art and no file could ever
 * be picked up: they drew their initial permanently, and shipping a release was the only cure —
 * precisely what discovering them was meant to avoid. Derived paths find their art the moment it
 * exists.
 *
 * The cost is that nothing here knows whether the file is actually there. That question has one
 * honest authority, the file itself, and the backend cannot consult it either: `public/` is
 * bundled into the frontend, not readable from Rust at runtime. So a caller asks for the path,
 * renders it, and on `onError` falls back to the character's initial — which was already the
 * designed representation of a character without art, not a placeholder standing in for one. */

/** The two library pseudo-categories. Not characters, so no art is ever coming, and asking for
 * `/characters/ui.webp` would mean one guaranteed failed request every time a filter or grid
 * lists them. They are the only ids that can be answered without looking. */
const WITHOUT_ART: ReadonlySet<string> = new Set([UI_CHARACTER_ID, MISC_CHARACTER_ID]);

/** The 3:4 portrait: a transparent cutout of the whole standing figure, 480×640. */
export function portraitFor(characterId: string): string | null {
  return WITHOUT_ART.has(characterId) ? null : `/characters/${characterId}.webp`;
}

/** The wide header banner: 810px tall, figure composed to one side, transparent background.
 *
 * Falling back to the portrait is deliberately not done here. What to show instead is the page's
 * decision, and `CharacterDetail` makes a considered one — it blurs the portrait across the full
 * width and feathers a scaled copy in from the right, which is a layout judgement this file has
 * no business holding an opinion about. */
export function bannerFor(characterId: string): string | null {
  return WITHOUT_ART.has(characterId) ? null : `/banners/${characterId}.webp`;
}
