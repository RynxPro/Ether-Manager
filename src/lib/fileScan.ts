import type { GbFile } from "@/lib/tauri-commands";

/** What GameBanana's checks amount to for one file.
 *
 * - `clean` — the archive opened and the virus scan found nothing.
 * - `unscanned` — the archive would not open, so nothing was ever scanned. Not an accusation:
 *   there is no finding here, only an absence of one.
 * - `flagged` — anything else, including a value this app has never seen.
 */
export type ScanVerdict = "clean" | "unscanned" | "flagged";

export interface FileScan {
  verdict: ScanVerdict;
  /** Short label for the row. */
  label: string;
  /** GameBanana's own sentence where they gave one, for the hover. */
  detail: string | null;
}

const PASSED_ANALYSIS = "ok";
const PASSED_AV = "clean";
/** GameBanana's code for "could not open the archive", which is also why the scan never ran. */
const COULD_NOT_OPEN = "extraction_error";
/** The AV field's way of saying the same thing — no result, rather than a bad one. */
const NO_AV_RESULT = "unknown";

/** Reads GameBanana's two checks on an uploaded file into one verdict.
 *
 * Both fields must be positively good for `clean`, so this fails closed: a missing field, a
 * pending scan, or a code released after this was written all land somewhere other than "safe".
 * That matters because the alternative — treating anything-not-recognised as fine — would mean
 * a future GameBanana verdict of "infected" silently rendering as "Clean".
 *
 * `unscanned` is kept separate from `flagged` on purpose. A live survey (2026-08-18, 264 files
 * across 100 ZZZ mods) found `av_result: "unknown"` on exactly the four files that also had
 * `analysis_result: "extraction_error"` and on no others — the scanner could not open those
 * archives, so it never looked inside. Folding that in with a real detection would cry wolf on
 * the common case; leaving it out entirely would claim a check happened that did not. */
export function fileScan(file: GbFile): FileScan {
  const analysis = file.analysis_result;
  const av = file.av_result;
  const detail = file.analysis_result_verbose ?? null;

  if (analysis === PASSED_ANALYSIS && av === PASSED_AV) {
    return { verdict: "clean", label: "Clean", detail };
  }
  if (analysis === COULD_NOT_OPEN || av === NO_AV_RESULT) {
    return { verdict: "unscanned", label: "Not scanned", detail };
  }
  return { verdict: "flagged", label: "Check failed", detail };
}

/** Extensions Windows will run — by double-click, by shell association, or as loaded code.
 *
 * A mod is data: meshes, textures, .ini files. None of it needs to execute, so anything here is
 * a program that arrived inside something that had no reason to contain one. That is worth
 * saying out loud even when it is legitimate, which it sometimes is — a few mods genuinely ship
 * a fixer utility, and this is how you find out before running it rather than after. */
const EXECUTABLE_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "cpl",
  "dll",
  "ps1",
  "vbs",
  "vbe",
  "wsf",
  "wsh",
  "hta",
  "jse",
  "js",
  "jar",
  "reg",
  "lnk",
  "py",
  "sh",
]);

function extensionOf(path: string): string {
  const leaf = path.split(/[\\/]/).pop() ?? path;
  const dot = leaf.lastIndexOf(".");
  return dot === -1 ? "" : leaf.slice(dot + 1).toLowerCase();
}

/** The paths GameBanana flagged that are actually programs.
 *
 * Filtered rather than relayed, because GameBanana's `contains_exe` is a wide net. In a live
 * survey (2026-08-18, 264 files) it fired eight times: once on a real `RabbitFXFixer.exe` and
 * `Restore backups.bat`, once on a file named `patreon.com`, and six times on compiled shader
 * blobs like `res/draw_2d_blur.ps_5_0.8000.bin`. Shader binaries are ordinary mod content, so
 * passing the flag straight through would put a red warning on perfectly normal mods — and a
 * warning that is usually wrong is one people learn to click past, which costs more than it
 * saves on the day it is right.
 *
 * Judging by extension keeps the alarm rare and lets the UI name what tripped it, so a
 * `patreon.com` can be recognised as harmless by the person reading rather than by this code
 * guessing. */
export function executablesIn(file: GbFile): string[] {
  return file.analysis_warnings.filter((path) =>
    EXECUTABLE_EXTENSIONS.has(extensionOf(path)),
  );
}
