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
  gamebanana_category_id: number | null;
}

export interface Mod {
  id: number;
  character_id: string;
  slot: Slot;
  display_name: string;
  folder_path: string;
  enabled: boolean;
  thumbnail_path: string | null;
  gamebanana_mod_id: number | null;
  gamebanana_file_id: number | null;
  gamebanana_md5: string | null;
  created_at: number;
  updated_at: number;
}

export interface AddModInput {
  characterId: string;
  slot: Slot;
  displayName: string;
  sourcePath: string;
  thumbnailPath?: string | null;
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

export function addMod(input: AddModInput): Promise<Mod> {
  return invoke("add_mod", {
    characterId: input.characterId,
    slot: input.slot,
    displayName: input.displayName,
    sourcePath: input.sourcePath,
    thumbnailPath: input.thumbnailPath ?? null,
  });
}

export function toggleMod(modId: number, enabled: boolean): Promise<void> {
  return invoke("toggle_mod", { modId, enabled });
}

export function deleteMod(modId: number): Promise<void> {
  return invoke("delete_mod", { modId });
}

export function getModsFolder(): Promise<string | null> {
  return invoke("get_mods_folder");
}

export function setModsFolder(path: string): Promise<void> {
  return invoke("set_mods_folder", { path });
}

export function pickModsFolder(): Promise<string | null> {
  return invoke("pick_mods_folder");
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
  has_content_ratings: boolean;
  initial_visibility: string;
  /** Computed backend-side from `initial_visibility` — see `content_rating::is_mature`. */
  is_mature: boolean;
}

export interface GbFile {
  id: number;
  file_name: string;
  file_size: number;
  date_added: number;
  download_count: number;
  download_url: string;
  md5_checksum: string;
  analysis_result: string | null;
  av_result: string | null;
  description: string | null;
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
  added_at: number;
}

export interface InstallFromGamebananaInput {
  gamebananaModId: number;
  gamebananaFileId: number;
  characterId: string;
  slot: Slot;
  displayName: string;
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

export function listBookmarks(): Promise<Bookmark[]> {
  return invoke("list_bookmarks");
}

export function addBookmark(
  gamebananaModId: number,
  name: string,
  thumbnailUrl: string | null,
): Promise<Bookmark> {
  return invoke("add_bookmark", { gamebananaModId, name, thumbnailUrl });
}

export function removeBookmark(gamebananaModId: number): Promise<void> {
  return invoke("remove_bookmark", { gamebananaModId });
}

/** Downloads, extracts, and files a GameBanana mod — character/slot/display name are assumed
 * already confirmed by the user; this never assigns a slot silently. */
export function installFromGamebanana(input: InstallFromGamebananaInput): Promise<Mod> {
  return invoke("install_from_gamebanana", {
    gamebananaModId: input.gamebananaModId,
    gamebananaFileId: input.gamebananaFileId,
    characterId: input.characterId,
    slot: input.slot,
    displayName: input.displayName,
  });
}

/** Signals the in-flight install (if any) to abort. Emitted progress stops shortly after. */
export function cancelGamebananaInstall(): Promise<void> {
  return invoke("cancel_gamebanana_install");
}

/** Payload of the `gamebanana-install-progress` event emitted during `installFromGamebanana`. */
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
 * untouched. Reuses the same `gamebanana-install-progress` event and
 * `cancelGamebananaInstall` as `installFromGamebanana`. */
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
