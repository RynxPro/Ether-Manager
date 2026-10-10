import type { GbPreviewImage } from "@/lib/tauri-commands";

/** Which rendering of a GameBanana screenshot to ask for.
 *
 * GameBanana pre-renders two sizes beside the original upload, and the original is routinely a
 * multi-megabyte 2000-to-2500px screenshot. Picking by hand at each call site is what went
 * wrong: five places did it, three of them reached for `file` because it was the only field
 * whose name was obvious, and a 2226px image painted into a 252px card is a nine-times
 * reduction in a single step — which aliases exactly the way the roster portraits did before
 * `scripts/scale-portraits.mjs` existed. It reads as pixelation, and a tilted card makes it
 * worse, because the rotation resamples an already-aliased bitmap.
 *
 * - `small` — 220px on the long edge. Rail cells and anything under about 110px.
 * - `medium` — 530px. **Every card.** Covers a 250px card at 2x, which is what a 150% or 200%
 *   Windows display actually asks for.
 * - `full` — the original upload. Only where the image is genuinely drawn large: the featured
 *   hero band, the gallery, the lightbox.
 */
export type GbImageSize = "small" | "medium" | "full";

/** The URL for one preview image at the size you intend to draw it.
 *
 * Each step falls back *up* the chain rather than down: a missing 220 is better served by the
 * 530 than by nothing, and GameBanana populates neither consistently.
 *
 * Shared rather than copied, for the same reason `tiltFor` is: the bug this replaced was five
 * hand-rolled copies drifting apart, and a sixth copy is how it comes back. */
export function gbImageUrl(image: GbPreviewImage, size: GbImageSize): string {
  const file =
    size === "full"
      ? image.file
      : size === "medium"
        ? (image.file_530 ?? image.file)
        : (image.file_220 ?? image.file_530 ?? image.file);
  return `${image.base_url}/${file}`;
}

/** The first preview image of a mod at the given size, or null when it has none.
 *
 * The shape every card needs: `preview_media.images[0]` guarded, which four call sites were
 * each writing out longhand. */
export function gbThumbnailUrl(
  images: GbPreviewImage[] | undefined,
  size: GbImageSize,
): string | null {
  const image = images?.[0];
  return image ? gbImageUrl(image, size) : null;
}
