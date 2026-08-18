/** The range the lens-size slider offers.
 *
 * Mirrored in `settings_repo.rs`, which clamps to the same numbers on the way in and out. The
 * duplication is deliberate: this end decides what is worth offering, and that end decides what
 * is safe to render, so a size arriving from a hand-edited database or an older build still
 * lands somewhere sensible rather than producing a lens larger than the frame it magnifies.
 *
 * The ceiling is the size the lens originally shipped at, which read as slightly too large in
 * use — a better maximum than a default. */
export const MAGNIFIER_MIN_SIZE = 72;
export const MAGNIFIER_MAX_SIZE = 168;

/** How much bigger the lens shows what is under it. Preview art is uploaded far larger than the
 * page's 400px frame displays it, so there is real detail behind this rather than an upscale of
 * what is already on screen. */
export const MAGNIFIER_ZOOM = 2.6;
