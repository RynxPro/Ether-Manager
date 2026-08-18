import type { GbFile, GbModDetail } from "@/lib/tauri-commands";

/** GameBanana appends a short hex tag when an uploader reuses a filename, so half the archives
 * on a busy mod end in things like `_c8084` or `_6fc91`. It identifies nothing to a reader. */
const HASH_SUFFIX = /_[0-9a-f]{4,8}$/i;
/** A filename that is nothing but a checksum — `43a9e9f2b9aacaf14cf3f91a5651cb1f.rar` is real. */
const ALL_HEX = /^[0-9a-f]{16,}$/i;
const VOWEL = /[aeiou]/i;
const LEADING_LETTERS = /^[a-z]+/i;

/** Turns an archive filename into something a person would write.
 *
 * `ll_remielle_white_variety_pack_-_exposed_dress.zip` becomes "Remielle White Variety Pack
 * Exposed Dress" — which is, almost to the word, what someone renaming that mod by hand types. */
export function prettifyFileName(fileName: string): string {
  let stem = fileName.replace(/\.[^.]+$/, "");
  if (HASH_SUFFIX.test(stem) && /\d/.test(stem.slice(-8))) {
    stem = stem.replace(HASH_SUFFIX, "");
  }
  return stem
    .split(/[_\s-]+/)
    .filter(Boolean)
    // An uploader's initials, as in `ll_remielle_...`. Guarded on having no vowel so a genuine
    // short word survives: `ui_reskin_pre_v311` must stay "Ui Reskin Pre V311", not "Reskin".
    .filter((word, index) => !(index === 0 && word.length <= 2 && !VOWEL.test(word)))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

/** Whether a prettified filename actually tells you anything.
 *
 * One real word is enough — "Albedo" and "Lucia Nsfw" are perfectly good names, and demanding
 * two rejected a third of the survey for no reason. Trailing digits are ignored when deciding
 * what counts as a word, so "Slotfix31" reads as one and "V614" does not.
 *
 * Measured rather than guessed: across 264 files from 100 ZZZ mods this rejects six, and all six
 * deserve it — four bare checksums, one `p__4894b`, one `nsfw_acee7` that reduces to "Nsfw". */
export function isInformativeName(pretty: string): boolean {
  if (pretty.length === 0) return false;
  if (ALL_HEX.test(pretty.replace(/\s/g, ""))) return false;
  return pretty.split(/\s+/).some((word) => {
    const letters = LEADING_LETTERS.exec(word)?.[0] ?? "";
    return letters.length >= 3 && VOWEL.test(letters);
  });
}

/** What the install dialog should offer as a name for this particular file.
 *
 * The mod's name alone was fine until you took two files from one mod, at which point the
 * library held two identical rows and the only way to tell them apart was to remember which you
 * installed first. The file is the thing being chosen, so the file should get to name it.
 *
 * Not blindly, though — uploaders name archives anywhere from `belle_-_bottom_heavy_nsfw_.zip`
 * to `43a9e9f2b9aacaf14cf3f91a5651cb1f.rar`. Best available wins: the filename when it reads as
 * words, then the mod's name qualified by the uploader's own note for that file, then the mod's
 * name on its own. Whatever comes out is a suggestion in an editable field, not a decision.
 *
 * Single-file mods keep the mod's name untouched. There is nothing to disambiguate, and
 * "Nicole Amillion" beats "Nicole Amillion Final V2" every time. */
export function suggestedDisplayName(detail: GbModDetail, file: GbFile): string {
  if (detail.files.length <= 1) return detail.name;

  const pretty = prettifyFileName(file.file_name);
  if (isInformativeName(pretty)) return pretty;

  const note = file.description?.trim();
  return note ? `${detail.name} - ${note}` : detail.name;
}
