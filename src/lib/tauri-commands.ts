import { invoke } from "@tauri-apps/api/core";

export type Slot = "Outfit" | "Weapon" | "Hair" | "Other";

export const SLOTS: Slot[] = ["Outfit", "Weapon", "Hair", "Other"];

export interface Character {
  id: string;
  name: string;
  portrait: string | null;
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
