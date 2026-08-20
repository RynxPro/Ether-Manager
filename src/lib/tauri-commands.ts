import { invoke } from "@tauri-apps/api/core";

/** Matches `fs_ops::MOD_FOLDER_MISSING_PREFIX` on the Rust side — every error string toggling
 * or updating a mod whose folder was deleted/moved outside the app starts with this exact
 * phrase, so the UI can recognize it and offer "Remove from library" instead of just showing
 * the raw message. Keep in sync if the Rust constant ever changes. */
export const MOD_FOLDER_MISSING_PREFIX = "mod folder is missing";

/** `CharacterSkin` is scoped to a real character. `Ui`/`Misc` are scoped to the two
 * library-wide pseudo-characters ("ui"/"misc") instead — see `UI_CHARACTER_ID`/
 * `MISC_CHARACTER_ID`. There's deliberately no per-character UI slot: GameBanana doesn't
 * distinguish a character-specific UI mod from a general one either, so a UI mod always goes in
 * the global `Ui` bucket regardless of which character (if any) it's themed after. Matches the
 * Rust `Slot` enum's default serde representation exactly. */
export type Slot = "CharacterSkin" | "Ui" | "Misc";

/** Sort order for the browse path only — GameBanana's free-text search endpoint ignores sort
 * entirely (confirmed live), so this has no effect while a text query is active. */
export type ModSort = "LatestUpdated" | "Newest" | "MostLiked" | "MostViewed" | "MostDownloaded";

/** Human-readable label for each `Slot` value — the enum values themselves are plain PascalCase
 * identifiers (matching Rust), not meant to be displayed directly. */
export const SLOT_LABELS: Record<Slot, string> = {
  CharacterSkin: "Character Skin",
  Ui: "UI",
  Misc: "Misc",
};

/** `character_id` values for the two library-wide categories that aren't tied to any real
 * character — matches `characters::UI_PSEUDO_CHARACTER_ID`/`MISC_PSEUDO_CHARACTER_ID` on the
 * Rust side. Both are included in `listCharacters()`'s response, appended after the real 60
 * (kept there for Browse's category filter and the install flow's target picker — Library's own
 * grid filters them back out since they're rendered as page-level sections instead of cards). */
export const UI_CHARACTER_ID = "ui";
export const MISC_CHARACTER_ID = "misc";

export interface Character {
  id: string;
  name: string;
  portrait: string | null;
  /** Purpose-made 16:9 art for the character page header, where one exists. Wide, figure to
   * one side, transparent background — so it is placed rather than cropped. Most of the roster
   * has none and falls back to the portrait. */
  banner: string | null;
  gamebanana_category_id: number | null;
}

export interface Mod {
  id: number;
  character_id: string;
  slot: Slot;
  display_name: string;
  /** Where the mod's files are right now, `DISABLED_` prefix and all — so `bundled_thumbnail`
   * resolves against it. Falls back to the un-prefixed path when the folder is missing. */
  folder_path: string;
  /** Whether the game will load this mod. Worked out on each read from which spelling of the
   * folder exists on disk rather than from a stored flag, so it cannot fall out of step with
   * what 3DMigoto actually loads — including when XXMI renames a folder between launches. */
  enabled: boolean;
  /** Neither spelling of the folder exists: deleted or moved outside the app. Tells "off" apart
   * from "gone", which matters because only one of those should offer to remove the mod. */
  files_missing: boolean;
  thumbnail_url: string | null;
  gamebanana_mod_id: number | null;
  gamebanana_file_id: number | null;
  gamebanana_md5: string | null;
  /** Which of the mod's files this is, in words — "Belle Bottom Heavy Nsfw", "Main file".
   * Null for hand-added mods, for mods shipping a single file, for files nothing readable can
   * be said about, and for rows installed before this was recorded. */
  variant_label: string | null;
  /** Card art that came in the archive, as a path relative to `folder_path`. Set only for mods
   * brought in from outside the app — a GameBanana mod has `thumbnail_url` and a server to
   * fetch it from. Relative so refiling a mod cannot leave it pointing at the old folder. */
  bundled_thumbnail: string | null;
  created_at: number;
  updated_at: number;
}

export function listCharacters(): Promise<Character[]> {
  return invoke("list_characters");
}

/** Per-character tallies for the Library grid. `enabled` is a subset of `total`; with v1's
 * one-enabled-mod-per-slot rule it's 0 or 1 for a real character. Characters with no mods at
 * all are simply absent from the map — callers treat a miss as zeroes. */
export interface ModCounts {
  total: number;
  enabled: number;
}

export function listModCounts(): Promise<Record<string, ModCounts>> {
  return invoke("list_mod_counts");
}

export function listModsForCharacter(characterId: string): Promise<Mod[]> {
  return invoke("list_mods_for_character", { characterId });
}

/** Every installed mod across every character — backs Library's search, which filters
 * client-side so it can match on character name (roster JSON, not in the DB) as well as mod
 * name, with no per-keystroke round trip. */
export function listAllMods(): Promise<Mod[]> {
  return invoke("list_all_mods");
}

export function toggleMod(modId: number, enabled: boolean): Promise<void> {
  return invoke("toggle_mod", { modId, enabled });
}

/** Renames a mod in the library. The folder on disk keeps its install-time name — only the
 * label changes. Rejects a blank name. */
export function renameMod(modId: number, displayName: string): Promise<void> {
  return invoke("rename_mod", { modId, displayName });
}

/** Refiles a mod under a different character, or into UI / Misc. Unlike a rename this really
 * moves the folder, because `character_id` is what the library filters on and the layout is what
 * decides where those files belong. */
export function moveMod(modId: number, characterId: string): Promise<Mod> {
  return invoke("move_mod", { modId, characterId });
}

export function deleteMod(modId: number): Promise<void> {
  return invoke("delete_mod", { modId });
}

export function getModsFolder(): Promise<string | null> {
  return invoke("get_mods_folder");
}

/** Whether the folder chosen at first run is still there. Separate from `getModsFolder` because
 * that one answers "what did you pick", which stays true after the drive is unplugged. */
export function isModsFolderLinked(): Promise<boolean> {
  return invoke("is_mods_folder_linked");
}

export function setModsFolder(path: string): Promise<void> {
  return invoke("set_mods_folder", { path });
}

export function pickModsFolder(): Promise<string | null> {
  return invoke("pick_mods_folder");
}

/** One installable mod found inside something the user brought in from outside the app.
 *
 * Field names are snake_case, like `Mod` above, because these cross the bridge as serde structs
 * rather than as command arguments — only the argument names get camelCased. */
export interface ImportCandidate {
  /** Where it sits inside the unpacked tree — `/`-separated, always relative, and empty when
   * the tree's own root is the mod (an archive with no wrapper folder of its own). */
  rel_path: string;
  /** A readable name guessed from the folder holding it. Editable before installing. */
  suggested_name: string;
  /** A picture the archive shipped, relative to the tree in the same way. */
  preview_rel_path: string | null;
}

export interface ImportPlan {
  /** Empty means this does not look like an XXMI mod at all — no `.ini` anywhere in it. */
  candidates: ImportCandidate[];
  /** Null when nothing in the names identified a character, or when two fit equally well. The
   * picker starts empty in that case rather than starting wrong. */
  suggested_character_id: string | null;
}

export interface BegunImport {
  session_id: number;
  /** The name of the file or folder that was picked, for the sheet to show. */
  source_label: string;
  plan: ImportPlan;
}

/** One mod the user confirmed, out of what the plan offered. */
export interface ImportSelection {
  rel_path: string;
  display_name: string;
  character_id: string;
  /** The plan's suggestion, or null to install without card art. */
  preview_rel_path: string | null;
}

/** The native file picker, filtered to the archives the app can read. Null when dismissed. */
export function pickModArchive(): Promise<string | null> {
  return invoke("pick_mod_archive");
}

/** Unpacks a dropped archive (or reads a dropped folder) somewhere disposable and reports what
 * is inside. Nothing is filed until `commitImport`, and nothing is left behind after
 * `cancelImport` — so opening this costs the user nothing. */
export function beginImport(path: string): Promise<BegunImport> {
  return invoke("begin_import", { path });
}

/** A candidate's preview as a `data:` URL. The image is still in a staging directory the webview
 * cannot reach, so the bytes come across rather than a path. */
export function readImportPreview(sessionId: number, relPath: string): Promise<string> {
  return invoke("read_import_preview", { sessionId, relPath });
}

/** Files the chosen mods into the library. Each one's folder is lifted out on its own, which
 * drops the wrapper folder archives habitually carry. */
export function commitImport(
  sessionId: number,
  selections: ImportSelection[],
): Promise<Mod[]> {
  return invoke("commit_import", { sessionId, selections });
}

/** Throws away everything an unfinished import unpacked. */
export function cancelImport(sessionId: number): Promise<void> {
  return invoke("cancel_import", { sessionId });
}

export interface GbPreviewImage {
  base_url: string;
  file: string;
  file_220: string | null;
  file_530: string | null;
}

export interface GbPreviewMedia {
  images: GbPreviewImage[];
}

export interface GbSubmitter {
  id: number;
  name: string;
  profile_url: string;
  avatar_url: string | null;
}

export interface GbGameRef {
  id: number;
  name: string;
}

/** Category reference on list/search records — no numeric id (see `GbCategoryDetail`). */
export interface GbCategoryRef {
  name: string;
  profile_url: string;
}

/** A mod as it appears in search/browse list results. */
export interface GbMod {
  id: number;
  name: string;
  profile_url: string;
  date_modified: number;
  has_files: boolean;
  tags: string[];
  preview_media: GbPreviewMedia;
  submitter: GbSubmitter;
  game: GbGameRef;
  root_category: GbCategoryRef;
  sub_category: GbCategoryRef | null;
  like_count: number;
  view_count: number;
  post_count: number;
  /** `null` means unknown, not zero. GameBanana's list endpoints never send a download count,
   * so the backend fills this from a separate batched call — if that call fails the number is
   * simply absent, and the card omits the stat rather than showing a fabricated `0`. */
  download_count: number | null;
  has_content_ratings: boolean;
  initial_visibility: string;
  /** Computed backend-side from `initial_visibility` — see `content_rating::is_mature`. */
  is_mature: boolean;
}

/** GameBanana's own ranking windows, in the order the featured banner shows them. These are the
 * API's bucket names, not this app's — it also ranks a `3month` window, deliberately skipped. */
export type FeaturedPeriod = "today" | "week" | "month" | "6month" | "year" | "alltime";

/** A mod that topped one ranking window, with the window it won. A period GameBanana has no
 * entry for is absent rather than padded, so this list can be shorter than six. */
export interface GbFeaturedMod {
  period: FeaturedPeriod;
  record: GbMod;
}

export interface GbFile {
  id: number;
  file_name: string;
  file_size: number;
  date_added: number;
  download_count: number;
  download_url: string;
  md5_checksum: string;
  /** GameBanana's checks on the upload — see `fileScan` for what they mean together. */
  analysis_result: string | null;
  av_result: string | null;
  analysis_result_verbose: string | null;
  /** Paths inside the archive GameBanana's analysis singled out. Empty for most files, and a
   * flag rather than a verdict — see `executablesIn`. */
  analysis_warnings: string[];
  description: string | null;
  /** The uploader's own version label (`"7.7"`), `null` on files that never carried one. */
  version: string | null;
}

/** Category reference on mod detail — unlike `GbCategoryRef`, carries a numeric id. */
export interface GbCategoryDetail {
  id: number;
  name: string;
}

export interface GbModDetail {
  id: number;
  name: string;
  profile_url: string;
  date_modified: number;
  /** When the mod page first went up — `date_modified` says when it last changed. */
  date_added: number;
  is_nsfw: boolean;
  preview_media: GbPreviewMedia;
  /** Showcase video URLs (YouTube) — separate from `preview_media`'s static screenshots. */
  embedded_media: string[];
  download_count: number;
  view_count: number;
  like_count: number;
  category: GbCategoryDetail;
  submitter: GbSubmitter;
  description: string;
  description_html: string;
  files: GbFile[];
  /** Always `false`/`"show"` in practice — `@gbprofile` never sends these fields (confirmed
   * live). Not authoritative; prefer the `GbMod` list record already passed to the detail
   * dialog as a prop. */
  has_content_ratings: boolean;
  initial_visibility: string;
  is_mature: boolean;
}

export interface GbSearchResult {
  records: GbMod[];
  record_count: number;
  is_complete: boolean;
  /** How many records this page omitted because they're mature and the preference is
   * `"Hide"`. Always `0` under `"Show"`/`"Blur"`. */
  hidden_count: number;
}

export interface Bookmark {
  gamebanana_mod_id: number;
  name: string;
  thumbnail_url: string | null;
  /** Which character (or `"ui"`/`"misc"`) this mod belongs to. `null` while unplaced — a
   * category the roster does not recognise, or a bookmark saved before this was recorded. */
  character_id: string | null;
  added_at: number;
}

export interface EnqueueDownloadInput {
  gamebananaModId: number;
  gamebananaFileId: number;
  /** Copied onto the row rather than looked up later: a download has to stay readable in the
   * history even if the mod is withdrawn from GameBanana afterwards. */
  modName: string;
  fileName: string;
  thumbnailUrl: string | null;
  characterId: string;
  slot: Slot;
  displayName: string;
  /** Set to replace that installed mod's files in place rather than adding a second copy. The
   * download is queued, paused, resumed and cancelled exactly like any other. */
  targetModId?: number;
}

/** `Extracting` is separated from `Downloading` because it is the phase with no progress to
 * report — a large archive sits at 100% for a while, and without a name for that the app looks
 * stalled exactly when it is working hardest.
 *
 * `Paused` is at rest without being over: the row still owns a part-downloaded file, so it stays
 * out of history and keeps counting towards the nav badge. */
export type DownloadStatus =
  | "Queued"
  | "Downloading"
  | "Extracting"
  | "Paused"
  | "Installed"
  | "Failed"
  | "Cancelled";

/** One install the user asked for, kept after it finishes so Downloads has a history. Carries
 * everything needed to run it again, which is what makes Retry work for a download that failed
 * days ago. */
export interface Download {
  id: number;
  gamebanana_mod_id: number;
  gamebanana_file_id: number;
  mod_name: string;
  file_name: string;
  thumbnail_url: string | null;
  character_id: string;
  slot: Slot;
  display_name: string;
  status: DownloadStatus;
  error: string | null;
  /** `null` when the server sent no Content-Length — which GameBanana sometimes doesn't, and is
   * why the progress bar needs an indeterminate mode at all. */
  total_bytes: number | null;
  downloaded_bytes: number;
  /** The HTTP validator the staged bytes were served with, used to check they still belong to the
   * file before resuming from them. Backend bookkeeping — nothing on screen reads it. */
  etag: string | null;
  /** Set when this download replaces that installed mod's files rather than adding a new mod —
   * a reinstall. The queue treats it identically in every other respect. */
  target_mod_id: number | null;
  created_at: number;
  finished_at: number | null;
}

/** Payload of the `download-progress` event. Carries `id` because several downloads can be on
 * the page at once, unlike the older id-less install event. */
export interface DownloadProgressEvent {
  id: number;
  downloaded: number;
  total: number | null;
}

/** Payload of `download-phase`, emitted once when a download starts unpacking. */
export interface DownloadPhaseEvent {
  id: number;
}

/** Browses ZZZ mods. With `query`, free-text searches (ignores `sort`); otherwise browses
 * `categoryId` (or all ZZZ mods if null) ordered by `sort`. */
export function searchGamebananaMods(
  query: string | null,
  categoryId: number | null,
  sort: ModSort,
  page: number,
): Promise<GbSearchResult> {
  return invoke("search_gamebanana_mods", { query, categoryId, sort, page });
}

export function getGamebananaModDetail(modId: number): Promise<GbModDetail> {
  return invoke("get_gamebanana_mod_detail", { modId });
}

export function getFeaturedMods(): Promise<GbFeaturedMod[]> {
  return invoke("get_featured_mods");
}

export type ApiHealth = "Good" | "Fair" | "Poor";

export interface ApiStatus {
  health: ApiHealth;
  /** Null only when the probe never completed — the one reading with no number behind it. */
  latency_ms: number | null;
}

/** Times a real browse request. Covers browsing and search only: mod files come from separate
 * hosts whose speed varies per node, so no single figure honestly describes both. Never
 * rejects — an unreachable API is a reading, not a failure. */
export function checkGamebananaApi(): Promise<ApiStatus> {
  return invoke("check_gamebanana_api");
}

export function listBookmarks(): Promise<Bookmark[]> {
  return invoke("list_bookmarks");
}

export function addBookmark(
  gamebananaModId: number,
  name: string,
  thumbnailUrl: string | null,
  /** The mod's most specific GameBanana category, so Bookmarks can shelve it beside the right
   * character. Rust resolves the name; pass `null` where the screen does not know it. */
  categoryName: string | null,
): Promise<Bookmark> {
  return invoke("add_bookmark", { gamebananaModId, name, thumbnailUrl, categoryName });
}

/** Works out the character for bookmarks saved before it was recorded. One GameBanana request
 * per unplaced bookmark, and a no-op once they all have one. Returns how many it placed. */
export function backfillBookmarkCharacters(): Promise<number> {
  return invoke("backfill_bookmark_characters");
}

export function removeBookmark(gamebananaModId: number): Promise<void> {
  return invoke("remove_bookmark", { gamebananaModId });
}

/** Downloads, extracts, and files a GameBanana mod — character/slot/display name are assumed
 * already confirmed by the user; this never assigns a slot silently.
 *
 * Resolves as soon as the download is recorded, not when the mod is installed — the work is
 * owned by the queue in Rust from that point on, which is what lets the dialog close without
 * abandoning it. Watch the download's row for the outcome. */
export function enqueueDownload(input: EnqueueDownloadInput): Promise<Download> {
  return invoke("enqueue_download", {
    gamebananaModId: input.gamebananaModId,
    gamebananaFileId: input.gamebananaFileId,
    modName: input.modName,
    fileName: input.fileName,
    thumbnailUrl: input.thumbnailUrl,
    characterId: input.characterId,
    slot: input.slot,
    displayName: input.displayName,
    targetModId: input.targetModId ?? null,
  });
}

export function listDownloads(): Promise<Download[]> {
  return invoke("list_downloads");
}

/** Stops a download whether it is running or still waiting its turn, and discards what it
 * fetched. Use `pauseDownload` to stop one you mean to finish later. */
export function cancelDownload(id: number): Promise<void> {
  return invoke("cancel_download", { id });
}

/** Stops a download but keeps its bytes on disk, so resuming asks the server only for the rest. */
export function pauseDownload(id: number): Promise<void> {
  return invoke("pause_download", { id });
}

/** Puts a paused download back to work at the back of the queue, continuing where it stopped. */
export function resumeDownload(id: number): Promise<void> {
  return invoke("resume_download", { id });
}

/** Runs a finished download again on the same row. Everything needed was stored when it was
 * queued, so this works for one that failed days ago. */
export function retryDownload(id: number): Promise<void> {
  return invoke("retry_download", { id });
}

/** Deletes installed/failed/cancelled rows, leaving anything still running or queued. */
export function clearFinishedDownloads(): Promise<number> {
  return invoke("clear_finished_downloads");
}

/** Fills in preview URLs for mods installed before the installer stored them. Idempotent and
 * free once every eligible mod has one, so it is safe to run on every launch. Resolves to the
 * number of mods filled. */
export function backfillModThumbnails(): Promise<number> {
  return invoke("backfill_mod_thumbnails");
}

/** Signals the in-flight install (if any) to abort. Emitted progress stops shortly after. */
export function cancelGamebananaInstall(): Promise<void> {
  return invoke("cancel_gamebanana_install");
}

/** Payload of the `gamebanana-install-progress` event, emitted during `updateInstalledMod`.
 * Installs have their own per-row `download-progress` event — see `DownloadProgressEvent`. */
export interface InstallProgress {
  downloaded: number;
  total: number | null;
}

export type UpdateStatus = "UpToDate" | "UpdateAvailable" | "Unavailable";
export type UpdateReason = "FileReplaced" | "FileChanged";

/** A cached update-check result for one installed mod (see `checkModUpdate`/`listUpdateChecks`). */
export interface UpdateCheck {
  mod_id: number;
  character_id: string;
  status: UpdateStatus;
  reason: UpdateReason | null;
  suggested_file_id: number | null;
  suggested_file_name: string | null;
  is_ambiguous: boolean;
  error: string | null;
  checked_at: number;
}

/** Payload of the `update-check-progress` event emitted during `checkAllModUpdates`. */
export interface UpdateCheckProgress {
  done: number;
  total: number;
}

/** Re-checks one mod against GameBanana right now and returns the refreshed cached result. */
export function checkModUpdate(modId: number): Promise<UpdateCheck> {
  return invoke("check_mod_update", { modId });
}

/** Checks every GameBanana-installed mod. `force: false` skips mods checked within the last
 * hour (used for the automatic launch check); `force: true` always re-checks everything (used
 * by the manual "Check for updates" button). */
export function checkAllModUpdates(force: boolean): Promise<UpdateCheck[]> {
  return invoke("check_all_mod_updates", { force });
}

/** Cache read only — never touches the network. */
export function listUpdateChecks(): Promise<UpdateCheck[]> {
  return invoke("list_update_checks");
}

/** Downloads `gamebananaFileId` and swaps it into the mod's existing folder in place —
 * `folder_path`, `enabled` state, `display_name`, `character_id`, and `slot` are all left
 * untouched. The last flow still using the `gamebanana-install-progress` event and
 * `cancelGamebananaInstall`; installs go through the download queue instead. */
export function updateInstalledMod(modId: number, gamebananaFileId: number): Promise<Mod> {
  return invoke("update_installed_mod", { modId, gamebananaFileId });
}

export type MatureVisibility = "Show" | "Blur" | "Hide";

/** No stored preference (fresh install, or any pre-Milestone-4 database) resolves to `"Blur"`
 * — see `content_rating::MatureVisibility::DEFAULT` for why. */
export function getMatureContentVisibility(): Promise<MatureVisibility> {
  return invoke("get_mature_content_visibility");
}

export function setMatureContentVisibility(value: MatureVisibility): Promise<void> {
  return invoke("set_mature_content_visibility", { value });
}

/** How the mod detail page's preview magnifier behaves. Read together because the size means
 * nothing while it is off, and Rust clamps the size on both read and write. */
export interface MagnifierSettings {
  enabled: boolean;
  /** Side of the square lens in CSS pixels. */
  size: number;
}

export function getMagnifierSettings(): Promise<MagnifierSettings> {
  return invoke("get_magnifier_settings");
}

export function setMagnifierSettings(value: MagnifierSettings): Promise<void> {
  return invoke("set_magnifier_settings", { value });
}
