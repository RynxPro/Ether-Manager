import { invoke } from "@tauri-apps/api/core";

export type Slot = "Outfit" | "Weapon" | "Hair" | "Other";

export const SLOTS: Slot[] = ["Outfit", "Weapon", "Hair", "Other"];

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

export function listModCounts(): Promise<Record<string, number>> {
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
  download_count: number;
  view_count: number;
  like_count: number;
  category: GbCategoryDetail;
  submitter: GbSubmitter;
  description: string;
  description_html: string;
  files: GbFile[];
}

export interface GbSearchResult {
  records: GbMod[];
  record_count: number;
  is_complete: boolean;
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

/** Browses ZZZ mods. With `query`, free-text searches; otherwise browses `categoryId` (or all ZZZ mods if null). */
export function searchGamebananaMods(
  query: string | null,
  categoryId: number | null,
  page: number,
): Promise<GbSearchResult> {
  return invoke("search_gamebanana_mods", { query, categoryId, page });
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
