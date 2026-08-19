use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tauri::State;

use crate::db::{Mod, ModCounts, Slot};
use crate::{fs_ops, AppState};

#[tauri::command]
pub fn list_mods_for_character(
    state: State<AppState>,
    character_id: String,
) -> Result<Vec<Mod>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_mods_for_character(&character_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_all_mods(state: State<AppState>) -> Result<Vec<Mod>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_all_mods().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_mod_counts(state: State<AppState>) -> Result<HashMap<String, ModCounts>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.count_mods_by_character().map_err(|e| e.to_string())
}

pub(crate) fn slugify_display_name(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let trimmed = slug.trim_matches('_');
    if trimmed.is_empty() {
        "mod".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Appends a numeric suffix if `base_name` already exists under `parent`, so two mods
/// with the same display name don't collide on disk.
pub(crate) fn unique_variant_dir(parent: &Path, base_name: &str) -> PathBuf {
    let mut candidate = parent.join(base_name);
    let mut n = 1;
    while candidate.exists() {
        candidate = parent.join(format!("{base_name}_{n}"));
        n += 1;
    }
    candidate
}

/// Renames a mod in the library.
///
/// The installer only ever guesses a name — from the archive's filename, or the uploader's note
/// for it — and a guess needs a way to be wrong. Without this the name accepted at install was
/// permanent short of deleting and reinstalling, which is what drove people to pick apart mod
/// names by hand in the first place.
///
/// Only the label changes: the folder on disk keeps its install-time name. Blank names are
/// refused rather than silently kept, since a card with no name is unusable and the surrounding
/// UI has no notion of an unnamed mod.
#[tauri::command]
pub fn rename_mod(state: State<AppState>, mod_id: i64, display_name: String) -> Result<(), String> {
    let trimmed = display_name.trim();
    if trimmed.is_empty() {
        return Err("a mod needs a name".to_string());
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if db.get_mod(mod_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("mod {mod_id} is no longer in the library"));
    }
    db.set_display_name(mod_id, trimmed)
        .map_err(|e| e.to_string())
}

/// Which slot a character implies. A real character always wears a Character Skin — GameBanana
/// has no per-character subcategory to split further on — and the two pseudo-characters *are*
/// the slot. So the caller picks a destination and the slot follows, rather than being a second
/// question with only one right answer.
pub(crate) fn slot_for(character_id: &str) -> Slot {
    match character_id {
        crate::characters::UI_PSEUDO_CHARACTER_ID => Slot::Ui,
        crate::characters::MISC_PSEUDO_CHARACTER_ID => Slot::Misc,
        _ => Slot::CharacterSkin,
    }
}

pub(crate) fn is_known_character(character_id: &str) -> bool {
    character_id == crate::characters::UI_PSEUDO_CHARACTER_ID
        || character_id == crate::characters::MISC_PSEUDO_CHARACTER_ID
        || crate::characters::all_characters()
            .iter()
            .any(|c| c.id == character_id)
}

/// Refiles a mod under a different character, or into the UI/Misc buckets, moving its folder to
/// match.
///
/// Guessing the destination from a mod's GameBanana category is right often enough to be worth
/// doing at install time and wrong often enough to need undoing — a skin filed under the wrong
/// member of the roster is invisible on the page you go looking for it, and re-downloading it
/// just to re-answer that question is a poor trade.
///
/// The folder really moves, unlike a rename. A mod's location is not a label: `character_id` is
/// what the library filters on and the folder is what the layout says should hold it, so leaving
/// the files behind would put the row and the disk into the disagreement `settle_mod_folders`
/// exists to heal, and it would heal it on the next launch by moving them anyway.
///
/// The destination is checked against the real roster rather than trusted, since it reaches a
/// path. An unknown id would otherwise create a folder for a character that does not exist,
/// holding a mod nothing can ever show.
#[tauri::command]
pub fn move_mod(state: State<AppState>, mod_id: i64, character_id: String) -> Result<Mod, String> {
    if !is_known_character(&character_id) {
        return Err(format!("{character_id} is not a character or category"));
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let m = db
        .get_mod(mod_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("mod {mod_id} is no longer in the library"))?;

    let mods_folder = db
        .get_setting("mods_folder")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "mods folder is not set yet".to_string())?;
    let mods_root = PathBuf::from(mods_folder);

    let slot = slot_for(&character_id);
    let current = PathBuf::from(&m.folder_path);
    let home = fs_ops::ensure_mod_home_dir(&mods_root, &character_id).map_err(|e| e.to_string())?;

    // Already in the right place on disk — a mod filed under the wrong character can still have
    // the right folder, and re-homing a mod to where it already lives should not touch the disk.
    if current.parent() == Some(home.as_path()) {
        db.set_location(mod_id, &character_id, slot, &m.folder_path)
            .map_err(|e| e.to_string())?;
    } else {
        if !current.exists() {
            return Err(format!(
                "{}: {}",
                fs_ops::MOD_FOLDER_MISSING_PREFIX,
                current.display()
            ));
        }
        let leaf = current
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("mod folder {} has an invalid name", current.display()))?;
        // The destination may already hold a folder of this name from a different mod, so the
        // same de-duplication an install uses applies here.
        let dest = unique_variant_dir(&home, leaf);
        fs_ops::move_dir(&current, &dest).map_err(|e| e.to_string())?;
        db.set_location(mod_id, &character_id, slot, &dest.to_string_lossy())
            .map_err(|e| e.to_string())?;
    }

    db.get_mod(mod_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("mod {mod_id} vanished immediately after being moved"))
}

#[tauri::command]
pub fn toggle_mod(state: State<AppState>, mod_id: i64, enabled: bool) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    fs_ops::set_mod_enabled(&db, mod_id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_mod(state: State<AppState>, mod_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let m = db
        .get_mod(mod_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("mod {mod_id} not found"))?;
    fs_ops::delete_mod_files(&m).map_err(|e| e.to_string())?;
    db.delete_mod(mod_id).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn slugify_display_name_handles_spaces_and_punctuation() {
        assert_eq!(slugify_display_name("Pink Dress V2!"), "pink_dress_v2");
        assert_eq!(slugify_display_name("NeonDream"), "neondream");
    }

    #[test]
    fn slugify_display_name_falls_back_when_nothing_alphanumeric_survives() {
        assert_eq!(slugify_display_name("!!!"), "mod");
        assert_eq!(slugify_display_name(""), "mod");
    }

    /// Every installer builds its destination folder name via
    /// `fs_ops::to_disabled_name(&slugify_display_name(...))` — a GameBanana install, a
    /// reinstall, and `commands::import::place_mods`. Pinned here because those all take a
    /// Tauri `State` and are not unit-testable directly, and because getting it wrong means a
    /// folder XXMI treats as active while the app shows the mod as off.
    #[test]
    fn install_folder_naming_produces_an_already_disabled_name() {
        assert_eq!(
            fs_ops::to_disabled_name(&slugify_display_name("Pink Dress V2!")),
            "DISABLED_pink_dress_v2"
        );
    }

    #[test]
    fn unique_variant_dir_avoids_collisions() {
        let root = std::env::temp_dir().join("ether-manager-commands-test-unique-variant");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(root.join("pinkdress")).unwrap();
        fs::create_dir_all(root.join("pinkdress_1")).unwrap();

        let candidate = unique_variant_dir(&root, "pinkdress");
        assert_eq!(candidate, root.join("pinkdress_2"));

        fs::remove_dir_all(&root).unwrap();
    }

}
